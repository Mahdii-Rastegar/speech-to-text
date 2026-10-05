mod audio;
mod engine;
mod history;

use engine::{Engine, EngineError, EngineInfo, Transcript};
use history::History;
use tauri::ipc::{InvokeBody, Request, Response};
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

pub fn run() {
    tauri::Builder::default()
        .manage(Engine::default())
        .manage(History::default())
        .invoke_handler(tauri::generate_handler![
            local_engine_check,
            local_engine_warm,
            local_engine_transcribe,
            audio_decode,
            history_list,
            history_save,
            history_delete,
            history_clear
        ])
        .build(tauri::generate_context!())
        .expect("failed to start the application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Engine>().shutdown();
            }
        });
}
