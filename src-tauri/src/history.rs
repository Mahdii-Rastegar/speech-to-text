//! The History database.
//!
//! One SQLite file in the app's `data` folder. A session is stored as the JSON
//! text the interface hands over, next to the two things this side needs to
//! know about it: its id and when it was made. Only text and metadata ever get
//! here; audio is never stored.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection};

const DATA_DIR: &str = "data";
const DATABASE_FILE: &str = "history.sqlite3";
/// Overrides where the `data` folder is.
const DATA_DIR_VAR: &str = "STT_DATA_DIR";

/// The folder beside the executable, so the app can be carried around with its
/// data. Development builds use the project folder instead, where a clean
/// build does not erase it.
pub fn data_dir() -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os(DATA_DIR_VAR) {
        return Ok(PathBuf::from(dir));
    }
    let exe = std::env::current_exe().map_err(|error| format!("unknown app folder: {error}"))?;
    let beside = exe.parent().ok_or("unknown app folder")?;
    if cfg!(debug_assertions) {
        if let Some(project) = beside.ancestors().take(5).find(|dir| dir.join("src-tauri").is_dir()) {
            return Ok(project.join(DATA_DIR));
        }
    }
    Ok(beside.join(DATA_DIR))
}

fn prepare(connection: &Connection) -> rusqlite::Result<()> {
    // Deleted text is overwritten in the file, not just unlinked.
    connection.pragma_update(None, "secure_delete", true)?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
             id         TEXT PRIMARY KEY,
             created_at TEXT NOT NULL,
             body       TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS sessions_by_date ON sessions (created_at);",
    )
}

fn open(dir: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(dir).map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    let connection = Connection::open(dir.join(DATABASE_FILE)).map_err(|error| error.to_string())?;
    prepare(&connection).map_err(|error| error.to_string())?;
    Ok(connection)
}

fn list(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    connection
        .prepare("SELECT body FROM sessions ORDER BY created_at DESC")?
        .query_map([], |row| row.get(0))?
        .collect()
}

fn save(connection: &Connection, id: &str, created_at: &str, body: &str) -> rusqlite::Result<()> {
    connection
        .execute(
            "INSERT INTO sessions (id, created_at, body) VALUES (?1, ?2, ?3)
             ON CONFLICT (id) DO UPDATE SET created_at = excluded.created_at, body = excluded.body",
            params![id, created_at, body],
        )
        .map(|_| ())
}

/// The database, opened the first time it is needed.
#[derive(Default)]
pub struct History {
    connection: Mutex<Option<Connection>>,
}

impl History {
    fn with<T>(&self, work: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
        let mut slot: MutexGuard<'_, Option<Connection>> =
            self.connection.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let connection = match slot.as_ref() {
            Some(connection) => connection,
            None => slot.insert(open(&data_dir()?)?),
        };
        work(connection).map_err(|error| error.to_string())
    }

    /// Every session's JSON text, newest first.
    pub fn list(&self) -> Result<Vec<String>, String> {
        self.with(list)
    }

    /// Adds the session, or replaces the one with the same id.
    pub fn save(&self, id: &str, created_at: &str, body: &str) -> Result<(), String> {
        self.with(|connection| save(connection, id, created_at, body))
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.with(|connection| connection.execute("DELETE FROM sessions WHERE id = ?1", [id]).map(|_| ()))
    }

    pub fn clear(&self) -> Result<(), String> {
        self.with(|connection| connection.execute("DELETE FROM sessions", []).map(|_| ()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        prepare(&connection).expect("schema");
        connection
    }

    #[test]
    fn lists_newest_first() {
        let connection = database();
        save(&connection, "a", "2026-10-01T08:00:00.000Z", "old").unwrap();
        save(&connection, "b", "2026-10-05T08:00:00.000Z", "new").unwrap();
        save(&connection, "c", "2026-10-03T08:00:00.000Z", "middle").unwrap();
        assert_eq!(list(&connection).unwrap(), ["new", "middle", "old"]);
    }

    #[test]
    fn saving_the_same_id_replaces_the_session() {
        let connection = database();
        save(&connection, "a", "2026-10-01T08:00:00.000Z", "raw only").unwrap();
        save(&connection, "a", "2026-10-01T08:00:00.000Z", "with a summary").unwrap();
        assert_eq!(list(&connection).unwrap(), ["with a summary"]);
    }

    #[test]
    fn keeps_persian_text_as_it_is() {
        let connection = database();
        let body = r#"{"rawTranscript":"سلام، این یک «آزمایش» است"}"#;
        save(&connection, "a", "2026-10-01T08:00:00.000Z", body).unwrap();
        assert_eq!(list(&connection).unwrap(), [body]);
    }

    #[test]
    fn survives_closing_and_reopening_the_file() {
        let dir = std::env::temp_dir().join(format!("stt-app-history-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        {
            let connection = open(&dir).expect("new database");
            save(&connection, "a", "2026-10-01T08:00:00.000Z", "kept").unwrap();
            save(&connection, "b", "2026-10-02T08:00:00.000Z", "deleted").unwrap();
            connection.execute("DELETE FROM sessions WHERE id = ?1", ["b"]).unwrap();
        }
        let connection = open(&dir).expect("existing database");
        assert_eq!(list(&connection).unwrap(), ["kept"]);
        drop(connection);
        std::fs::remove_dir_all(&dir).expect("temporary folder removed");
    }
}
