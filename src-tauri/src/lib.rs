mod engine;

use engine::{Engine, EngineError, EngineInfo, Transcript};
use tauri::ipc::{InvokeBody, Request};
use tauri::{Manager, RunEvent, State};

// The commands below block while the engine works, so they are marked `async`
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

pub fn run() {
    tauri::Builder::default()
        .manage(Engine::default())
        .invoke_handler(tauri::generate_handler![
            local_engine_check,
            local_engine_warm,
            local_engine_transcribe
        ])
        .build(tauri::generate_context!())
        .expect("failed to start the application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Engine>().shutdown();
            }
        });
}
