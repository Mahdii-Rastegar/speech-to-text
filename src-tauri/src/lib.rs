mod audio;
mod cloud;
mod engine;
mod history;
mod models;
mod secrets;

use cloud::{CloudError, CloudResponse, Method, Provider};
use engine::{Engine, EngineError, EngineInfo, SystemInfo, Transcript};
use history::History;
use models::{Downloads, ModelError, ModelStatus, Progress};
use tauri::ipc::{Channel, InvokeBody, Request, Response};
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, State};

// The commands below block while the engine or the disk works, so they are marked `async`
// to run off the main thread and keep the window responsive.

/// Are the local engine and this model's file in place?
#[tauri::command(async)]
fn local_engine_check(model: String) -> Result<(), EngineError> {
    engine::check(&model)
}

/// Loads the model now, so the first transcription does not wait for it.
#[tauri::command(async)]
fn local_engine_warm(engine: State<'_, Engine>, model: String) -> Result<EngineInfo, EngineError> {
    engine.warm(&model)
}

/// Turns a recording into text. The body is binary: see `engine::split_payload`.
#[tauri::command(async)]
fn local_engine_transcribe(engine: State<'_, Engine>, request: Request<'_>) -> Result<Transcript, EngineError> {
    let InvokeBody::Raw(payload) = request.body() else {
        return Err(EngineError::bad_request("expected a binary payload"));
    };
    engine.transcribe(payload)
}

/// The models the app offers, and which of them are on the disk.
#[tauri::command(async)]
fn models_list() -> Vec<ModelStatus> {
    models::list()
}

/// Fetches a model file, reporting how far it is. Returns when the file is in place.
#[tauri::command(async)]
fn model_download(downloads: State<'_, Downloads>, id: String, on_progress: Channel<Progress>) -> Result<(), ModelError> {
    downloads.download(&id, &|progress| {
        // Nobody listening anymore is no reason to stop the download.
        let _ = on_progress.send(progress);
    })
}

/// Stops a download. What has arrived stays, and the next attempt carries on from it.
#[tauri::command(async)]
fn model_download_cancel(downloads: State<'_, Downloads>, id: String) {
    downloads.cancel(&id);
}

#[tauri::command(async)]
fn model_delete(engine: State<'_, Engine>, downloads: State<'_, Downloads>, id: String) -> Result<(), ModelError> {
    downloads.cancel(&id);
    // The download lets go of its file within one read.
    let patience = Instant::now() + Duration::from_secs(5);
    while downloads.is_running(&id) && Instant::now() < patience {
        std::thread::sleep(Duration::from_millis(50));
    }
    engine.release(&id);
    models::delete(&id)
}

/// What this computer has for the local engine to run on.
#[tauri::command(async)]
fn system_info() -> SystemInfo {
    engine::system_info()
}

/// Decodes an audio file the web view could not read. The body is the file
/// itself; the answer is its sound as 32-bit float samples, 16 kHz mono.
#[tauri::command(async)]
fn audio_decode(request: Request<'_>) -> Result<Response, String> {
    let InvokeBody::Raw(file) = request.body() else {
        return Err("expected a binary payload".into());
    };
    let samples = audio::decode(file.clone())?;
    Ok(Response::new(samples.iter().flat_map(|sample| sample.to_le_bytes()).collect::<Vec<u8>>()))
}

/// Every stored session as JSON text, newest first.
#[tauri::command(async)]
fn history_list(history: State<'_, History>) -> Result<Vec<String>, String> {
    history.list()
}

/// Stores a session, replacing the one with the same id.
#[tauri::command(async)]
fn history_save(history: State<'_, History>, id: String, created_at: String, body: String) -> Result<(), String> {
    history.save(&id, &created_at, &body)
}

#[tauri::command(async)]
fn history_delete(history: State<'_, History>, id: String) -> Result<(), String> {
    history.delete(&id)
}

#[tauri::command(async)]
fn history_clear(history: State<'_, History>) -> Result<(), String> {
    history.clear()
}

/// Is a key stored for this cloud service? The key itself never goes to the interface.
#[tauri::command(async)]
fn secret_exists(provider: Provider) -> Result<bool, String> {
    secrets::exists(provider.name())
}

#[tauri::command(async)]
fn secret_set(provider: Provider, key: String) -> Result<(), String> {
    secrets::set(provider.name(), &key)
}

#[tauri::command(async)]
fn secret_delete(provider: Provider) -> Result<(), String> {
    secrets::delete(provider.name())
}

/// Asks a cloud service something, with the stored key attached on this side.
#[tauri::command(async)]
fn cloud_request(provider: Provider, method: Method, path: String, body: Option<String>) -> Result<CloudResponse, CloudError> {
    cloud::request(provider, method, &path, body.as_deref())
}

/// Keeps the web view's own files (settings, permissions) in the app's data
/// folder instead of the user profile, so the app can be carried around whole.
/// Left alone when that folder cannot be written to.
fn keep_webview_data_with_the_app() {
    const VARIABLE: &str = "WEBVIEW2_USER_DATA_FOLDER";
    if std::env::var_os(VARIABLE).is_some() {
        return;
    }
    let Ok(dir) = history::data_dir().map(|dir| dir.join("webview")) else { return };
    if std::fs::create_dir_all(&dir).is_ok() {
        std::env::set_var(VARIABLE, dir);
    }
}

pub fn run() {
    keep_webview_data_with_the_app();
    tauri::Builder::default()
        .manage(Engine::default())
        .manage(Downloads::default())
        .manage(History::default())
        .invoke_handler(tauri::generate_handler![
            local_engine_check,
            local_engine_warm,
            local_engine_transcribe,
            models_list,
            model_download,
            model_download_cancel,
            model_delete,
            system_info,
            audio_decode,
            history_list,
            history_save,
            history_delete,
            history_clear,
            secret_exists,
            secret_set,
            secret_delete,
            cloud_request
        ])
        .build(tauri::generate_context!())
        .expect("failed to start the application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Engine>().shutdown();
            }
        });
}
