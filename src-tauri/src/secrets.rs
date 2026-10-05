//! API keys, kept in the Windows Credential Manager.
//!
//! A key is tied to the Windows user account and encrypted by the system. It is
//! never written to the app's own files, so copying the app folder does not
//! copy it, and it is never handed back to the interface: the native side
//! reads it only to attach it to a request (see `cloud.rs`).

/// Longest key accepted. Real keys are well under a hundred characters.
const MAX_KEY_LENGTH: usize = 512;

/// The name of an entry as the Credential Manager shows it.
fn target(name: &str) -> String {
    format!("Avanevis/{name}")
}

/// A key must be able to travel in an HTTP header: visible ASCII, no spaces or line breaks.
fn checked(key: &str) -> Result<&str, String> {
    let key = key.trim();
    if key.is_empty() || key.len() > MAX_KEY_LENGTH {
        return Err("the key is empty or too long".into());
    }
    if !key.bytes().all(|byte| byte.is_ascii_graphic()) {
        return Err("the key has characters a key cannot contain".into());
    }
    Ok(key)
}

pub fn set(name: &str, key: &str) -> Result<(), String> {
    store::write(&target(name), checked(key)?)
}

/// The stored key, or `None` when there is none.
pub fn get(name: &str) -> Result<Option<String>, String> {
    store::read(&target(name))
}

pub fn exists(name: &str) -> Result<bool, String> {
    get(name).map(|key| key.is_some())
}

/// Removes the key. Removing one that is not there is not an error.
pub fn delete(name: &str) -> Result<(), String> {
    store::delete(&target(name))
}

#[cfg(windows)]
mod store {
    use std::ptr;

    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    fn failure(action: &str) -> String {
        format!("could not {action} the key (Windows error {})", unsafe { GetLastError() })
    }

    pub fn write(target: &str, key: &str) -> Result<(), String> {
        let mut target = wide(target);
        let mut user = wide("api-key");
        let mut blob = key.as_bytes().to_vec();
        // SAFETY: an all-zero CREDENTIALW is valid (null pointers, zero counts).
        let mut credential: CREDENTIALW = unsafe { std::mem::zeroed() };
        credential.Type = CRED_TYPE_GENERIC;
        credential.TargetName = target.as_mut_ptr();
        credential.UserName = user.as_mut_ptr();
        credential.CredentialBlobSize = blob.len() as u32;
        credential.CredentialBlob = blob.as_mut_ptr();
        credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
        // SAFETY: every pointer in `credential` outlives the call.
        if unsafe { CredWriteW(&credential, 0) } == 0 {
            return Err(failure("store"));
        }
        Ok(())
    }

    pub fn read(target: &str) -> Result<Option<String>, String> {
        let target = wide(target);
        let mut found: *mut CREDENTIALW = ptr::null_mut();
        // SAFETY: `target` is null-terminated and `found` receives a system allocation.
        if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut found) } == 0 {
            return match unsafe { GetLastError() } {
                ERROR_NOT_FOUND => Ok(None),
                _ => Err(failure("read")),
            };
        }
        // SAFETY: on success `found` points to a credential whose blob is `CredentialBlobSize` bytes.
        let key = unsafe {
            let credential = &*found;
            let blob = std::slice::from_raw_parts(credential.CredentialBlob, credential.CredentialBlobSize as usize);
            let key = String::from_utf8_lossy(blob).into_owned();
            CredFree(found.cast());
            key
        };
        Ok(Some(key))
    }

    pub fn delete(target: &str) -> Result<(), String> {
        let target = wide(target);
        // SAFETY: `target` is null-terminated.
        if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 && unsafe { GetLastError() } != ERROR_NOT_FOUND
        {
            return Err(failure("remove"));
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod store {
    const UNSUPPORTED: &str = "keys can only be stored on Windows";

    pub fn write(_target: &str, _key: &str) -> Result<(), String> {
        Err(UNSUPPORTED.into())
    }

    pub fn read(_target: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn delete(_target: &str) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_keys_that_cannot_go_in_a_header() {
        assert!(checked("").is_err());
        assert!(checked("   ").is_err());
        assert!(checked("abc def").is_err());
        assert!(checked("abc\r\nX-Injected: 1").is_err());
        assert!(checked(&"a".repeat(MAX_KEY_LENGTH + 1)).is_err());
        assert_eq!(checked("  sk-or-v1-abc_123  "), Ok("sk-or-v1-abc_123"));
    }

    #[cfg(windows)]
    #[test]
    fn stores_reads_and_removes_a_key() {
        // A name the app never uses, so a real key is not touched.
        let name = "unit-test-entry";
        delete(name).unwrap();
        assert_eq!(get(name).unwrap(), None);

        set(name, "not-a-real-key").unwrap();
        assert!(exists(name).unwrap());
        assert_eq!(get(name).unwrap().as_deref(), Some("not-a-real-key"));

        set(name, "replaced").unwrap();
        assert_eq!(get(name).unwrap().as_deref(), Some("replaced"));

        delete(name).unwrap();
        assert!(!exists(name).unwrap());
        delete(name).unwrap();
    }
}
