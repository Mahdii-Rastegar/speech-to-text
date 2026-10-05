//! The local engine's model files: which ones exist, fetching one, removing one.
//!
//! A model is a single large file. It is fetched in pieces, each its own
//! request, into a `.part` file beside its final place: a connection that
//! stalls costs one piece, and a download that was stopped (by the user, by
//! the network, by closing the app) carries on from where it was. The file is
//! only given its real name once its length and SHA-256 match the catalog.

use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::cloud;
use crate::engine;

/// Where the files are published: the whisper.cpp project's own repository.
const SOURCE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// How much one request asks for.
const PIECE_BYTES: u64 = 4 * 1024 * 1024;
/// A piece that takes longer than this is given up and asked for again.
const PIECE_TIMEOUT: Duration = Duration::from_secs(180);
const ATTEMPTS_PER_PIECE: u32 = 3;
/// The address the file is really served from is a few redirects away.
const REDIRECTS: u32 = 5;
const PROGRESS_EVERY: Duration = Duration::from_millis(200);

pub struct ModelSpec {
    /// The name the interface and the settings know the model by.
    pub id: &'static str,
    pub file: &'static str,
    pub bytes: u64,
    sha256: &'static str,
}

/// The models the app offers. The first one is the recommended one.
pub const CATALOG: [ModelSpec; 2] = [
    ModelSpec {
        id: "large-v3-turbo",
        file: "ggml-large-v3-turbo-q5_0.bin",
        bytes: 574_041_195,
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    },
    ModelSpec {
        id: "small",
        file: "ggml-small-q5_1.bin",
        bytes: 190_085_487,
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    },
];

pub fn spec(id: &str) -> Option<&'static ModelSpec> {
    CATALOG.iter().find(|spec| spec.id == id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    UnknownModel,
    Busy,
    Cancelled,
    Offline,
    Timeout,
    Blocked,
    Corrupt,
    Disk,
    Failed,
}

/// What the interface receives when a command fails.
#[derive(Debug, Serialize)]
pub struct ModelError {
    kind: ErrorKind,
    detail: String,
}

impl ModelError {
    fn new(kind: ErrorKind, detail: impl Into<String>) -> Self {
        Self { kind, detail: detail.into() }
    }

    fn disk(error: std::io::Error) -> Self {
        Self::new(ErrorKind::Disk, error.to_string())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    id: &'static str,
    bytes: u64,
    installed: bool,
    /// How much of an unfinished download is already on the disk.
    downloaded_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub received: u64,
    pub total: u64,
}

fn part_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(format!("{}.part", spec.file))
}

fn length_of(path: &Path) -> u64 {
    std::fs::metadata(path).map_or(0, |metadata| metadata.len())
}

pub fn list() -> Vec<ModelStatus> {
    let dir = engine::models_dir();
    CATALOG
        .iter()
        .map(|spec| ModelStatus {
            id: spec.id,
            bytes: spec.bytes,
            installed: engine::find_model(spec.file).is_some(),
            downloaded_bytes: dir.as_deref().map_or(0, |dir| length_of(&part_path(dir, spec))),
        })
        .collect()
}

/// Removes the model's file and whatever is left of a download. The caller
/// stops the engine first: Windows does not delete a file that is open.
pub fn delete(id: &str) -> Result<(), ModelError> {
    let spec = spec(id).ok_or_else(|| ModelError::new(ErrorKind::UnknownModel, id))?;
    let mut files: Vec<PathBuf> = engine::find_model(spec.file).into_iter().collect();
    if let Some(dir) = engine::models_dir() {
        files.push(part_path(&dir, spec));
    }
    for file in files {
        match std::fs::remove_file(&file) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(ModelError::disk(error)),
        }
    }
    Ok(())
}

fn sha256_of(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut chunk = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        hasher.update(&chunk[..read]);
    }
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

fn request_error(error: &ureq::Error) -> ModelError {
    let kind = match cloud::failure_kind(error) {
        cloud::ErrorKind::Offline => ErrorKind::Offline,
        cloud::ErrorKind::Timeout => ErrorKind::Timeout,
        _ => ErrorKind::Failed,
    };
    ModelError::new(kind, error.to_string())
}

/// Appends the bytes from `from` up to the end of the piece to `part`.
/// Returns how many arrived; the whole piece or nothing counts, so on any
/// failure the file is cut back to where it was.
fn fetch_piece(
    url: &str,
    part: &mut File,
    from: u64,
    total: u64,
    cancelled: &AtomicBool,
    mut on_bytes: impl FnMut(u64),
) -> Result<u64, ModelError> {
    let last = (from + PIECE_BYTES).min(total) - 1;
    let wanted = last - from + 1;
    let mut response = cloud::agent(PIECE_TIMEOUT, REDIRECTS)
        .get(url)
        .header("Range", format!("bytes={from}-{last}"))
        .call()
        .map_err(|error| request_error(&error))?;
    match response.status().as_u16() {
        206 => {}
        403 | 451 => return Err(ModelError::new(ErrorKind::Blocked, format!("HTTP {}", response.status()))),
        status => return Err(ModelError::new(ErrorKind::Failed, format!("HTTP {status}"))),
    }

    part.seek(SeekFrom::Start(from)).map_err(ModelError::disk)?;
    let mut reader = response.body_mut().as_reader();
    let mut chunk = vec![0u8; 64 * 1024];
    let mut received = 0u64;
    let outcome = loop {
        if cancelled.load(Ordering::Relaxed) {
            break Err(ModelError::new(ErrorKind::Cancelled, "stopped by the user"));
        }
        let read = match reader.read(&mut chunk) {
            Ok(0) => break Ok(()),
            Ok(read) => read,
            Err(error) => break Err(ModelError::new(ErrorKind::Timeout, error.to_string())),
        };
        if received + read as u64 > wanted {
            break Err(ModelError::new(ErrorKind::Failed, "the server sent more than was asked for"));
        }
        if let Err(error) = part.write_all(&chunk[..read]) {
            break Err(ModelError::disk(error));
        }
        received += read as u64;
        on_bytes(from + received);
    };
    let complete = outcome.and_then(|()| {
        if received == wanted {
            Ok(())
        } else {
            Err(ModelError::new(ErrorKind::Timeout, "the connection closed early"))
        }
    });
    if let Err(error) = complete {
        // Whole pieces only: a later attempt starts on a clean boundary.
        part.set_len(from).map_err(ModelError::disk)?;
        return Err(error);
    }
    Ok(received)
}

/// Fetches `spec` from `url` into `dir`, carrying on from an earlier attempt.
fn fetch(
    spec: &ModelSpec,
    url: &str,
    dir: &Path,
    cancelled: &AtomicBool,
    on_progress: &dyn Fn(Progress),
) -> Result<(), ModelError> {
    std::fs::create_dir_all(dir).map_err(ModelError::disk)?;
    let part_file = part_path(dir, spec);
    let mut part =
        OpenOptions::new().create(true).truncate(false).write(true).open(&part_file).map_err(ModelError::disk)?;
    let mut have = part.metadata().map_err(ModelError::disk)?.len();
    if have > spec.bytes {
        // Not a download of this file: start over.
        part.set_len(0).map_err(ModelError::disk)?;
        have = 0;
    }

    let mut reported = Instant::now();
    on_progress(Progress { received: have, total: spec.bytes });
    while have < spec.bytes {
        let mut attempt = 1;
        loop {
            let result = fetch_piece(url, &mut part, have, spec.bytes, cancelled, |received| {
                if reported.elapsed() >= PROGRESS_EVERY {
                    reported = Instant::now();
                    on_progress(Progress { received, total: spec.bytes });
                }
            });
            match result {
                Ok(received) => {
                    have += received;
                    break;
                }
                Err(error) => {
                    let lasting = matches!(error.kind, ErrorKind::Cancelled | ErrorKind::Blocked | ErrorKind::Disk);
                    if lasting || attempt == ATTEMPTS_PER_PIECE {
                        return Err(error);
                    }
                    attempt += 1;
                }
            }
        }
    }
    drop(part);
    on_progress(Progress { received: have, total: spec.bytes });

    let digest = sha256_of(&part_file).map_err(ModelError::disk)?;
    if digest != spec.sha256 {
        // Nothing of it can be trusted, so nothing of it is kept.
        let _ = std::fs::remove_file(&part_file);
        return Err(ModelError::new(ErrorKind::Corrupt, "the file does not match its checksum"));
    }
    std::fs::rename(&part_file, dir.join(spec.file)).map_err(ModelError::disk)
}

fn unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// The downloads in progress, each with the switch that stops it.
#[derive(Default)]
pub struct Downloads {
    running: Mutex<HashMap<&'static str, Arc<AtomicBool>>>,
}

impl Downloads {
    /// Fetches a model and returns when it is in place. Stopping it keeps what arrived.
    pub fn download(&self, id: &str, on_progress: &dyn Fn(Progress)) -> Result<(), ModelError> {
        let spec = spec(id).ok_or_else(|| ModelError::new(ErrorKind::UnknownModel, id))?;
        if engine::find_model(spec.file).is_some() {
            return Ok(());
        }
        let dir = engine::models_dir()
            .ok_or_else(|| ModelError::new(ErrorKind::Disk, "the app's folder is unknown"))?;

        let cancelled = Arc::new(AtomicBool::new(false));
        {
            let mut running = unpoisoned(&self.running);
            if running.contains_key(spec.id) {
                return Err(ModelError::new(ErrorKind::Busy, "this model is already being downloaded"));
            }
            running.insert(spec.id, Arc::clone(&cancelled));
        }
        let url = format!("{SOURCE}/{}", spec.file);
        let result = fetch(spec, &url, &dir, &cancelled, on_progress);
        unpoisoned(&self.running).remove(spec.id);
        result
    }

    pub fn cancel(&self, id: &str) {
        if let Some(cancelled) = unpoisoned(&self.running).get(id) {
            cancelled.store(true, Ordering::Relaxed);
        }
    }

    pub fn is_running(&self, id: &str) -> bool {
        unpoisoned(&self.running).contains_key(id)
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::sync::atomic::AtomicUsize;
    use std::thread;

    use super::*;

    /// 10 MB and a bit: three pieces, the last one short.
    const TEST_BYTES: usize = 10 * 1024 * 1024 + 123;

    fn content() -> Vec<u8> {
        (0..TEST_BYTES).map(|index| (index % 251) as u8).collect()
    }

    fn digest(bytes: &[u8]) -> String {
        Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn leak(text: String) -> &'static str {
        Box::leak(text.into_boxed_str())
    }

    fn test_spec(sha256: String) -> ModelSpec {
        ModelSpec { id: "test", file: "test.bin", bytes: TEST_BYTES as u64, sha256: leak(sha256) }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("stt-models-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    /// Serves `content` with range support. `drop_after` makes that many
    /// requests (counted from the first) end halfway through their piece.
    fn serve(content: Vec<u8>, drop_first: usize) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/file", listener.local_addr().unwrap());
        let requests = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&requests);
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let number = seen.fetch_add(1, Ordering::SeqCst);
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut range = None;
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                        break;
                    }
                    if let Some(value) = line.to_ascii_lowercase().strip_prefix("range: bytes=") {
                        let (from, to) = value.trim().split_once('-').unwrap();
                        range = Some((from.parse::<usize>().unwrap(), to.parse::<usize>().unwrap()));
                    }
                }
                let Some((from, to)) = range else { continue };
                let body = &content[from..=to];
                let head = format!(
                    "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let sent = if number < drop_first { &body[..body.len() / 2] } else { body };
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(sent);
            }
        });
        (url, requests)
    }

    #[test]
    fn fetches_a_file_piece_by_piece_and_checks_it() {
        let bytes = content();
        let spec = test_spec(digest(&bytes));
        let dir = temp_dir("whole");
        let (url, requests) = serve(bytes.clone(), 0);
        let last = Mutex::new(Progress { received: 0, total: 0 });

        fetch(&spec, &url, &dir, &AtomicBool::new(false), &|progress| *last.lock().unwrap() = progress).unwrap();

        assert_eq!(std::fs::read(dir.join("test.bin")).unwrap(), bytes);
        assert!(!part_path(&dir, &spec).exists());
        assert_eq!(requests.load(Ordering::SeqCst), 3);
        assert_eq!(last.lock().unwrap().received, TEST_BYTES as u64);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn asks_again_for_a_piece_that_was_cut_short() {
        let bytes = content();
        let spec = test_spec(digest(&bytes));
        let dir = temp_dir("retry");
        let (url, requests) = serve(bytes.clone(), 2);

        fetch(&spec, &url, &dir, &AtomicBool::new(false), &|_| {}).unwrap();

        assert_eq!(std::fs::read(dir.join("test.bin")).unwrap(), bytes);
        assert_eq!(requests.load(Ordering::SeqCst), 5);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn carries_on_from_what_an_earlier_attempt_left() {
        let bytes = content();
        let spec = test_spec(digest(&bytes));
        let dir = temp_dir("resume");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(part_path(&dir, &spec), &bytes[..PIECE_BYTES as usize * 2]).unwrap();
        let (url, requests) = serve(bytes.clone(), 0);

        fetch(&spec, &url, &dir, &AtomicBool::new(false), &|_| {}).unwrap();

        assert_eq!(std::fs::read(dir.join("test.bin")).unwrap(), bytes);
        assert_eq!(requests.load(Ordering::SeqCst), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn keeps_what_arrived_when_it_is_stopped() {
        let bytes = content();
        let spec = test_spec(digest(&bytes));
        let dir = temp_dir("cancel");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(part_path(&dir, &spec), &bytes[..PIECE_BYTES as usize]).unwrap();
        let (url, _) = serve(bytes, 0);
        let cancelled = AtomicBool::new(false);

        // Stopped as soon as it reports where it carries on from.
        let error = fetch(&spec, &url, &dir, &cancelled, &|_| cancelled.store(true, Ordering::Relaxed)).unwrap_err();

        assert_eq!(error.kind, ErrorKind::Cancelled);
        assert!(!dir.join("test.bin").exists());
        assert_eq!(length_of(&part_path(&dir, &spec)), PIECE_BYTES);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn refuses_a_file_that_does_not_match_its_checksum() {
        let spec = test_spec(digest(b"something else"));
        let dir = temp_dir("corrupt");
        let (url, _) = serve(content(), 0);

        let error = fetch(&spec, &url, &dir, &AtomicBool::new(false), &|_| {}).unwrap_err();

        assert_eq!(error.kind, ErrorKind::Corrupt);
        assert!(!dir.join("test.bin").exists());
        assert!(!part_path(&dir, &spec).exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_catalog_is_well_formed() {
        for spec in &CATALOG {
            assert_eq!(spec.sha256.len(), 64);
            assert!(spec.file.starts_with("ggml-") && spec.file.ends_with(".bin"));
            assert!(spec.bytes > 1_000_000);
        }
        assert!(spec("large-v3-turbo").is_some());
        assert!(spec("no-such-model").is_none());
    }
}
