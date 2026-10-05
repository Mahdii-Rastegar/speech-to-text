//! The local speech-to-text engine.
//!
//! whisper.cpp's own server runs as a child process that listens on this
//! machine only (127.0.0.1, a port picked at start). It loads the model once
//! and keeps it in memory, so every recording after the first is transcribed
//! without the loading delay. Audio travels app -> child over the loopback
//! interface and never leaves the computer.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const SERVER_EXE: &str = "whisper-server.exe";
/// Where the engine's files may sit, relative to a search root.
const ENGINE_DIRS: [&str; 2] = ["engine", "bench/tools/whisper-cpp/Release"];
const MODEL_DIRS: [&str; 2] = ["models", "models/ggml"];

/// Folder overrides. `STT_CUDA_DLL_DIR` names a folder with the cuBLAS
/// libraries when they are not beside the engine; without them the engine
/// still works, on the CPU.
const ENGINE_DIR_VAR: &str = "STT_ENGINE_DIR";
const MODELS_DIR_VAR: &str = "STT_MODELS_DIR";
const CUDA_DIR_VAR: &str = "STT_CUDA_DLL_DIR";

/// The audio the app sends: 16 kHz, mono, 16-bit.
const SAMPLE_RATE: u32 = 16_000;
/// Generous: the first start after a download reads the whole model from a cold disk,
/// often while an antivirus is still looking at the new files.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(240);
const LOG_LINES_KEPT: usize = 30;
/// The engine's line that says the model went to the graphics card.
const GPU_MARKER: &str = "whisper_backend_init_gpu: using";

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    EngineMissing,
    ModelMissing,
    EngineFailed,
    BadRequest,
}

/// What the interface receives when a command fails.
#[derive(Debug, Serialize)]
pub struct EngineError {
    kind: ErrorKind,
    detail: String,
}

impl EngineError {
    fn new(kind: ErrorKind, detail: impl Into<String>) -> Self {
        Self { kind, detail: detail.into() }
    }

    pub fn bad_request(detail: impl Into<String>) -> Self {
        Self::new(ErrorKind::BadRequest, detail)
    }

    fn failed(detail: impl Into<String>) -> Self {
        Self::new(ErrorKind::EngineFailed, detail)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    /// The model runs on the graphics card rather than the CPU.
    pub gpu: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    text: String,
    start_ms: u64,
    end_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    segments: Vec<Segment>,
    gpu: bool,
    /// Time spent recognizing, without loading the model.
    elapsed_ms: u64,
}

/// Sent by the interface in front of the audio bytes.
#[derive(Debug, Deserialize)]
struct RequestHeader {
    model: String,
    language: String,
    #[serde(default)]
    prompt: String,
}

#[derive(Deserialize)]
struct ServerReply {
    error: Option<String>,
    /// Everything that was said, one line per sentence the engine made out.
    #[serde(default)]
    text: String,
}

// --------------------------------------------------------------------------
// Finding the engine and the model
// --------------------------------------------------------------------------

fn model_file(model: &str) -> Option<&'static str> {
    crate::models::spec(model).map(|spec| spec.file)
}

/// The folder of the executable. Development builds also look in the folders
/// above it, which is where the project keeps the engine and the models.
fn search_roots() -> Vec<PathBuf> {
    let levels = if cfg!(debug_assertions) { 5 } else { 1 };
    let Ok(exe) = std::env::current_exe() else { return Vec::new() };
    exe.ancestors().skip(1).take(levels).map(Path::to_path_buf).collect()
}

fn find(override_var: &str, sub_dirs: &[&str], file: &str) -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os(override_var) {
        let path = PathBuf::from(dir).join(file);
        return path.is_file().then_some(path);
    }
    search_roots()
        .iter()
        .flat_map(|root| sub_dirs.iter().map(move |dir| root.join(dir).join(file)))
        .find(|path| path.is_file())
}

/// A model file, wherever the app looks for models.
pub fn find_model(file: &str) -> Option<PathBuf> {
    find(MODELS_DIR_VAR, &MODEL_DIRS, file)
}

/// Where a downloaded model goes: the models folder that is already there,
/// or a new one beside the executable.
pub fn models_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os(MODELS_DIR_VAR) {
        return Some(PathBuf::from(dir));
    }
    let roots = search_roots();
    let existing = roots.iter().map(|root| root.join(MODEL_DIRS[0])).find(|dir| dir.is_dir());
    existing.or_else(|| roots.first().map(|root| root.join(MODEL_DIRS[0])))
}

/// What this computer offers the engine.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    /// Logical processors.
    cores: usize,
    /// An NVIDIA graphics driver is installed.
    nvidia: bool,
    /// The engine's own graphics-card libraries are in place.
    gpu_pack: bool,
}

pub fn system_info() -> SystemInfo {
    let system_dir = std::env::var_os("SystemRoot").map(|root| PathBuf::from(root).join("System32"));
    let nvidia = system_dir.is_some_and(|dir| dir.join("nvcuda.dll").is_file());
    let engine_dir =
        find(ENGINE_DIR_VAR, &ENGINE_DIRS, SERVER_EXE).and_then(|server| server.parent().map(Path::to_path_buf));
    let gpu_pack = engine_dir.is_some_and(|dir| {
        let cuda_dir = std::env::var_os(CUDA_DIR_VAR).map(PathBuf::from);
        let has =
            |file: &str| dir.join(file).is_file() || cuda_dir.as_ref().is_some_and(|cuda| cuda.join(file).is_file());
        dir.join("ggml-cuda.dll").is_file() && has("cublas64_11.dll") && has("cublasLt64_11.dll")
    });
    SystemInfo { cores: std::thread::available_parallelism().map_or(1, usize::from), nvidia, gpu_pack }
}

struct Paths {
    server: PathBuf,
    model: PathBuf,
}

fn locate(model: &str) -> Result<Paths, EngineError> {
    let file = model_file(model)
        .ok_or_else(|| EngineError::new(ErrorKind::ModelMissing, format!("unknown model: {model}")))?;
    let server = find(ENGINE_DIR_VAR, &ENGINE_DIRS, SERVER_EXE)
        .ok_or_else(|| EngineError::new(ErrorKind::EngineMissing, format!("{SERVER_EXE} not found")))?;
    let model = find(MODELS_DIR_VAR, &MODEL_DIRS, file)
        .ok_or_else(|| EngineError::new(ErrorKind::ModelMissing, format!("{file} not found")))?;
    Ok(Paths { server, model })
}

/// Tells whether the engine and the model file are in place, without starting anything.
pub fn check(model: &str) -> Result<(), EngineError> {
    locate(model).map(|_| ())
}

// --------------------------------------------------------------------------
// The child process
// --------------------------------------------------------------------------

struct Running {
    child: Child,
    port: u16,
    model: String,
    gpu: Arc<AtomicBool>,
    log: Arc<Mutex<VecDeque<String>>>,
    _job: Option<job::Job>,
}

impl Running {
    fn log_tail(&self) -> String {
        let log = unpoisoned(&self.log);
        log.iter().map(String::as_str).collect::<Vec<_>>().join(" | ")
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn free_port() -> Result<u16, EngineError> {
    TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| EngineError::failed(format!("no free port: {error}")))
}

/// Physical cores, roughly: more threads than that slow whisper.cpp down.
fn thread_count() -> usize {
    let logical = std::thread::available_parallelism().map_or(4, usize::from);
    (logical / 2).clamp(1, 8)
}

/// Keeps the last lines the engine printed and notes whether it found a GPU.
/// Reading to the end matters: a full pipe would stall the engine.
fn follow_log(stderr: ChildStderr, log: Arc<Mutex<VecDeque<String>>>, gpu: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut raw = Vec::new();
        loop {
            raw.clear();
            match reader.read_until(b'\n', &mut raw) {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
            let line = String::from_utf8_lossy(&raw).trim().to_owned();
            if line.is_empty() {
                continue;
            }
            if line.contains(GPU_MARKER) {
                gpu.store(true, Ordering::Relaxed);
            }
            let mut log = unpoisoned(&log);
            if log.len() == LOG_LINES_KEPT {
                log.pop_front();
            }
            log.push_back(line);
        }
    });
}

fn start(model: &str) -> Result<Running, EngineError> {
    let paths = locate(model)?;
    let port = free_port()?;
    let engine_dir = paths.server.parent().unwrap_or(Path::new("."));

    let mut command = Command::new(&paths.server);
    command
        .current_dir(engine_dir)
        .args(["--host", "127.0.0.1", "--port", &port.to_string()])
        .args(["-t", &thread_count().to_string()])
        // Greedy decoding: in the benchmark it was as accurate as beam search and a little faster.
        .args(["-bs", "1", "-bo", "1"])
        .arg("-m")
        .arg(&paths.model)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if let Some(cuda_dir) = std::env::var_os(CUDA_DIR_VAR) {
        let mut path = vec![PathBuf::from(cuda_dir)];
        path.extend(std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()));
        if let Ok(joined) = std::env::join_paths(path) {
            command.env("PATH", joined);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|error| EngineError::failed(format!("could not start the engine: {error}")))?;
    let job = job::Job::kill_on_close(&child);
    let gpu = Arc::new(AtomicBool::new(false));
    let log = Arc::new(Mutex::new(VecDeque::new()));
    if let Some(stderr) = child.stderr.take() {
        follow_log(stderr, Arc::clone(&log), Arc::clone(&gpu));
    }
    // From here on, dropping `running` stops the child.
    let mut running = Running { child, port, model: model.to_owned(), gpu, log, _job: job };

    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        if let Ok(Some(status)) = running.child.try_wait() {
            return Err(EngineError::failed(format!(
                "the engine stopped while loading ({status}): {}",
                running.log_tail()
            )));
        }
        let head = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
        if matches!(exchange(port, &head, &[], Duration::from_secs(2)), Ok((200, _))) {
            return Ok(running);
        }
        if Instant::now() > deadline {
            return Err(EngineError::failed("the engine took too long to load the model"));
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

/// The running engine for `model`, started (or restarted) when needed.
fn ensure<'a>(slot: &'a mut Option<Running>, model: &str) -> Result<&'a Running, EngineError> {
    let alive = slot
        .as_mut()
        .is_some_and(|running| running.model == model && matches!(running.child.try_wait(), Ok(None)));
    if !alive {
        // Stop the old one first, so two models never share the graphics memory.
        *slot = None;
        *slot = Some(start(model)?);
    }
    Ok(slot.as_ref().expect("the engine was just started"))
}

// --------------------------------------------------------------------------
// Talking to the child
// --------------------------------------------------------------------------

/// One HTTP exchange over a fresh connection. Returns the status and the body.
fn exchange(port: u16, head: &str, body: &[u8], patience: Duration) -> std::io::Result<(u16, Vec<u8>)> {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))?;
    stream.set_read_timeout(Some(patience))?;
    stream.set_write_timeout(Some(patience))?;
    stream.write_all(head.as_bytes())?;
    stream.write_all(body)?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response)?;
    let invalid = || std::io::Error::new(std::io::ErrorKind::InvalidData, "malformed HTTP response");
    let split = response.windows(4).position(|window| window == b"\r\n\r\n").ok_or_else(invalid)?;
    let status = std::str::from_utf8(&response[..split])
        .ok()
        .and_then(|headers| headers.split_whitespace().nth(1))
        .and_then(|code| code.parse().ok())
        .ok_or_else(invalid)?;
    Ok((status, response.split_off(split + 4)))
}

fn wav_file(pcm: &[u8]) -> Vec<u8> {
    let data_len = pcm.len() as u32;
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

fn multipart_body(boundary: &str, fields: &[(&str, &str)], wav: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(wav.len() + 1024);
    for (name, value) in fields {
        body.extend_from_slice(
            format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes(),
        );
    }
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n\
             Content-Type: audio/wav\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(wav);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

/// The engine's lines as one run of text.
fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Splits what the interface sent: a 4-byte length, that many bytes of JSON, then the audio.
fn split_payload(payload: &[u8]) -> Result<(RequestHeader, &[u8]), EngineError> {
    let (length, rest) = payload
        .split_first_chunk::<4>()
        .ok_or_else(|| EngineError::bad_request("payload too short"))?;
    let length = u32::from_le_bytes(*length) as usize;
    if length > rest.len() {
        return Err(EngineError::bad_request("header length exceeds the payload"));
    }
    let (header, pcm) = rest.split_at(length);
    let header: RequestHeader = serde_json::from_slice(header)
        .map_err(|error| EngineError::bad_request(format!("unreadable header: {error}")))?;
    if pcm.len() % 2 != 0 {
        return Err(EngineError::bad_request("audio is not 16-bit"));
    }
    if !is_language_code(&header.language) {
        return Err(EngineError::bad_request("not a language code"));
    }
    Ok((header, pcm))
}

/// `fa`, `en`, `auto`: the header's text goes into the request to the engine as it is.
fn is_language_code(language: &str) -> bool {
    (2..=8).contains(&language.len()) && language.bytes().all(|byte| byte.is_ascii_lowercase())
}

// --------------------------------------------------------------------------
// What the commands use
// --------------------------------------------------------------------------

#[derive(Default)]
pub struct Engine {
    running: Mutex<Option<Running>>,
}

impl Engine {
    /// Loads the model ahead of the first recording.
    pub fn warm(&self, model: &str) -> Result<EngineInfo, EngineError> {
        let mut slot = unpoisoned(&self.running);
        let running = ensure(&mut slot, model)?;
        Ok(EngineInfo { gpu: running.gpu.load(Ordering::Relaxed) })
    }

    pub fn transcribe(&self, payload: &[u8]) -> Result<Transcript, EngineError> {
        let (header, pcm) = split_payload(payload)?;
        // The lock covers starting only; the engine itself takes one recording at a time.
        let (port, gpu) = {
            let mut slot = unpoisoned(&self.running);
            let running = ensure(&mut slot, &header.model)?;
            (running.port, running.gpu.load(Ordering::Relaxed))
        };

        let audio_seconds = pcm.len() as u64 / (u64::from(SAMPLE_RATE) * 2);
        // Plain text only. Asking the server for timed segments ("verbose_json") makes it
        // go over the audio a second time, which doubles the wait for nothing the app shows.
        let mut fields = vec![("response_format", "json"), ("language", header.language.as_str())];
        // On one line, so nothing in the glossary can pass for a part of the request.
        let prompt = one_line(&header.prompt);
        if !prompt.is_empty() {
            fields.push(("prompt", prompt.as_str()));
        }
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| since.as_nanos());
        let boundary = format!("----stt-app-{nanos:x}");
        let body = multipart_body(&boundary, &fields, &wav_file(pcm));
        let head = format!(
            "POST /inference HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\
             Content-Type: multipart/form-data; boundary={boundary}\r\nContent-Length: {}\r\n\r\n",
            body.len()
        );

        let started = Instant::now();
        // Without a graphics card the engine can be slower than the audio is long.
        let patience = Duration::from_secs(120 + audio_seconds * 4);
        let (status, reply) = exchange(port, &head, &body, patience)
            .map_err(|error| EngineError::failed(format!("the engine did not answer: {error}")))?;
        if status != 200 {
            return Err(EngineError::failed(format!(
                "the engine answered {status}: {}",
                String::from_utf8_lossy(&reply)
            )));
        }
        let reply: ServerReply = serde_json::from_slice(&reply)
            .map_err(|error| EngineError::failed(format!("unreadable answer: {error}")))?;
        if let Some(error) = reply.error {
            return Err(EngineError::failed(error));
        }

        let text = one_line(&reply.text);
        let segments = if text.is_empty() {
            Vec::new()
        } else {
            vec![Segment { text, start_ms: 0, end_ms: pcm.len() as u64 * 1000 / (u64::from(SAMPLE_RATE) * 2) }]
        };
        Ok(Transcript {
            segments,
            gpu,
            elapsed_ms: started.elapsed().as_millis() as u64,
        })
    }

    /// Lets go of `model`'s file, so it can be deleted.
    pub fn release(&self, model: &str) {
        let mut slot = unpoisoned(&self.running);
        if slot.as_ref().is_some_and(|running| running.model == model) {
            *slot = None;
        }
    }

    /// Stops the child and frees the model's memory.
    pub fn shutdown(&self) {
        *unpoisoned(&self.running) = None;
    }
}

// --------------------------------------------------------------------------
// Tying the child's life to the app's
// --------------------------------------------------------------------------

/// A Windows job that ends the engine when the app's process ends for any
/// reason, a crash included, so the model never stays behind in memory.
#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub struct Job(HANDLE);

    // SAFETY: the handle is only ever closed, once, by whichever thread drops the job.
    unsafe impl Send for Job {}

    impl Job {
        pub fn kill_on_close(child: &Child) -> Option<Job> {
            // SAFETY: plain Win32 calls with valid arguments; `info` is zero-initialised
            // plain data and outlives the call that reads it.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let job = Job(handle);
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let configured = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    (&raw const info).cast(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                ) != 0;
                let assigned = configured && AssignProcessToJobObject(handle, child.as_raw_handle() as HANDLE) != 0;
                assigned.then_some(job)
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle came from CreateJobObjectW and is closed exactly once.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(not(windows))]
mod job {
    pub struct Job;

    impl Job {
        pub fn kill_on_close(_child: &std::process::Child) -> Option<Job> {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_header_and_audio() {
        let header = br#"{"model":"large-v3-turbo","language":"fa"}"#;
        let mut payload = (header.len() as u32).to_le_bytes().to_vec();
        payload.extend_from_slice(header);
        payload.extend_from_slice(&[1, 0, 2, 0]);

        let (parsed, pcm) = split_payload(&payload).expect("valid payload");
        assert_eq!(parsed.model, "large-v3-turbo");
        assert_eq!(parsed.language, "fa");
        assert_eq!(parsed.prompt, "");
        assert_eq!(pcm, [1, 0, 2, 0]);
    }

    #[test]
    fn rejects_broken_payloads() {
        assert!(split_payload(&[1, 0]).is_err());
        assert!(split_payload(&[200, 0, 0, 0, b'{']).is_err());
        let mut odd = 2u32.to_le_bytes().to_vec();
        odd.extend_from_slice(b"{}");
        assert!(split_payload(&odd).is_err(), "a header without a model is refused");
    }

    #[test]
    fn refuses_a_language_that_is_not_a_code() {
        let payload = |language: &str| {
            let header = format!(r#"{{"model":"small","language":"{language}"}}"#);
            let mut payload = (header.len() as u32).to_le_bytes().to_vec();
            payload.extend_from_slice(header.as_bytes());
            payload
        };
        assert!(split_payload(&payload("auto")).is_ok());
        for language in ["", "f", "FA", "fa
--x", "fa en", "abcdefghi"] {
            assert!(split_payload(&payload(language)).is_err(), "{language:?} should be refused");
        }
    }

    #[test]
    fn wraps_audio_in_a_wav_header() {
        let wav = wav_file(&[0; 32_000]);
        assert_eq!(wav.len(), 44 + 32_000);
        assert_eq!(&wav[..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 32_000);
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), SAMPLE_RATE);
    }

    #[test]
    fn joins_the_lines_the_engine_answers_with() {
        assert_eq!(one_line(" Hello there.\n We deploy on Monday.\n"), "Hello there. We deploy on Monday.");
        assert_eq!(one_line(" \n "), "");
    }

    #[test]
    fn unknown_models_are_reported_as_missing() {
        assert!(matches!(check("no-such-model"), Err(EngineError { kind: ErrorKind::ModelMissing, .. })));
    }
}
