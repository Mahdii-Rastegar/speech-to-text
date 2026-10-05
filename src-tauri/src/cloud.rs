//! Requests to the cloud services, with the user's key attached here.
//!
//! The interface decides what to ask (it builds the JSON body and reads the
//! answer), but it never sees the key and cannot choose where the key goes:
//! each provider has one fixed address, and only a path below it can be asked for.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use ureq::tls::{RootCerts, TlsConfig, TlsProvider};
use ureq::{Agent, Proxy};

use crate::secrets;

/// Long transcripts take a while to rewrite; past this the user is better told than kept waiting.
const TIMEOUT: Duration = Duration::from_secs(180);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Openrouter,
    Google,
}

impl Provider {
    /// The name the key is stored under.
    pub fn name(self) -> &'static str {
        match self {
            Self::Openrouter => "openrouter",
            Self::Google => "google",
        }
    }

    fn base_url(self) -> &'static str {
        match self {
            Self::Openrouter => "https://openrouter.ai/api/v1",
            Self::Google => "https://generativelanguage.googleapis.com/v1beta",
        }
    }

    /// The header each service expects the key in.
    fn auth_header(self, key: &str) -> (&'static str, String) {
        match self {
            Self::Openrouter => ("Authorization", format!("Bearer {key}")),
            Self::Google => ("x-goog-api-key", key.to_owned()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Method {
    Get,
    Post,
}

/// What the service answered. Error statuses are answers too: the interface reads them.
#[derive(Debug, Serialize)]
pub struct CloudResponse {
    status: u16,
    body: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    MissingKey,
    Offline,
    Timeout,
    BadRequest,
    Failed,
}

/// A request that got no answer at all. The detail never contains the key.
#[derive(Debug, Serialize)]
pub struct CloudError {
    kind: ErrorKind,
    detail: String,
}

impl CloudError {
    fn new(kind: ErrorKind, detail: impl Into<String>) -> Self {
        Self { kind, detail: detail.into() }
    }
}

/// Only plain paths below the provider's address: nothing that could point the request elsewhere.
fn checked_path(path: &str) -> Result<&str, CloudError> {
    let plain = path.starts_with('/')
        && !path.contains("..")
        && !path.contains("//")
        && path.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"/._-:".contains(&byte));
    if plain {
        Ok(path)
    } else {
        Err(CloudError::new(ErrorKind::BadRequest, "the request path is not allowed"))
    }
}

/// The proxy address in Windows' "Internet Options" form: `host:port`, or
/// `http=host:port;https=host:port`. VPN apps that work as a system proxy set it.
fn proxy_url(setting: &str) -> Option<String> {
    let setting = setting.trim();
    let entry = if setting.contains('=') {
        let find = |scheme: &str| {
            setting.split(';').find_map(|part| part.trim().strip_prefix(scheme)).map(str::trim)
        };
        find("https=").or_else(|| find("http="))?
    } else {
        setting
    };
    if entry.is_empty() {
        return None;
    }
    Some(if entry.contains("://") { entry.to_owned() } else { format!("http://{entry}") })
}

#[cfg(windows)]
fn system_proxy() -> Option<Proxy> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RRF_RT_REG_SZ};

    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let key = wide(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings");

    let mut enabled = 0u32;
    let mut size = size_of::<u32>() as u32;
    // SAFETY: the buffer is a u32 and `size` says so.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            wide("ProxyEnable").as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&raw mut enabled).cast(),
            &mut size,
        )
    };
    if status != 0 || enabled == 0 {
        return None;
    }

    let mut server = [0u16; 512];
    let mut size = size_of_val(&server) as u32;
    // SAFETY: `size` is the buffer's length in bytes.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            wide("ProxyServer").as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            server.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if status != 0 {
        return None;
    }
    let length = server.iter().position(|&unit| unit == 0).unwrap_or(server.len());
    Proxy::new(&proxy_url(&String::from_utf16_lossy(&server[..length]))?).ok()
}

#[cfg(not(windows))]
fn system_proxy() -> Option<Proxy> {
    None
}

/// Built for each request, so switching a VPN on or off takes effect at once.
fn agent() -> Agent {
    let tls = TlsConfig::builder().provider(TlsProvider::NativeTls).root_certs(RootCerts::PlatformVerifier).build();
    Agent::config_builder()
        .tls_config(tls)
        .proxy(system_proxy().or_else(Proxy::try_from_env))
        .timeout_global(Some(TIMEOUT))
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .http_status_as_error(false)
        .max_redirects(0)
        .build()
        .new_agent()
}

fn transport_error(error: ureq::Error) -> CloudError {
    let kind = match &error {
        ureq::Error::Timeout(_) => ErrorKind::Timeout,
        ureq::Error::HostNotFound | ureq::Error::ConnectionFailed | ureq::Error::Io(_) | ureq::Error::ConnectProxyFailed(_) => {
            ErrorKind::Offline
        }
        _ => ErrorKind::Failed,
    };
    CloudError::new(kind, error.to_string())
}

fn send(
    url: &str,
    method: Method,
    header: (&str, String),
    body: Option<&str>,
) -> Result<CloudResponse, CloudError> {
    let agent = agent();
    let result = match method {
        Method::Get => agent.get(url).header(header.0, header.1).call(),
        Method::Post => agent
            .post(url)
            .header(header.0, header.1)
            .header("Content-Type", "application/json")
            .send(body.unwrap_or("{}")),
    };
    let mut response = result.map_err(transport_error)?;
    let status = response.status().as_u16();
    let body = response.body_mut().read_to_string().map_err(transport_error)?;
    Ok(CloudResponse { status, body })
}

pub fn request(provider: Provider, method: Method, path: &str, body: Option<&str>) -> Result<CloudResponse, CloudError> {
    let path = checked_path(path)?;
    let key = secrets::get(provider.name())
        .map_err(|detail| CloudError::new(ErrorKind::Failed, detail))?
        .ok_or_else(|| CloudError::new(ErrorKind::MissingKey, format!("no key stored for {}", provider.name())))?;
    send(&format!("{}{path}", provider.base_url()), method, provider.auth_header(&key), body)
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    use super::*;

    #[test]
    fn accepts_only_plain_paths() {
        assert!(checked_path("/chat/completions").is_ok());
        assert!(checked_path("/models/gemini-flash-latest:generateContent").is_ok());
        assert!(checked_path("/key").is_ok());

        for path in ["key", "", "/../x", "//evil.example/x", "/a?key=1", "/a#b", "/a@b", "/a b", "/a\\b", "/a%2e"] {
            assert!(checked_path(path).is_err(), "{path} should be refused");
        }
    }

    #[test]
    fn reads_the_windows_proxy_setting() {
        assert_eq!(proxy_url("127.0.0.1:10808").as_deref(), Some("http://127.0.0.1:10808"));
        assert_eq!(
            proxy_url("http=127.0.0.1:8080;https=127.0.0.1:8443;socks=127.0.0.1:1080").as_deref(),
            Some("http://127.0.0.1:8443")
        );
        assert_eq!(proxy_url("http=127.0.0.1:8080").as_deref(), Some("http://127.0.0.1:8080"));
        assert_eq!(proxy_url("http://proxy.example:3128").as_deref(), Some("http://proxy.example:3128"));
        assert_eq!(proxy_url("socks=127.0.0.1:1080"), None);
        assert_eq!(proxy_url("  "), None);
    }

    #[test]
    fn keeps_each_provider_on_its_own_address() {
        assert!(Provider::Openrouter.base_url().starts_with("https://openrouter.ai/"));
        assert!(Provider::Google.base_url().starts_with("https://generativelanguage.googleapis.com/"));
        assert_eq!(Provider::Openrouter.auth_header("k"), ("Authorization", "Bearer k".to_owned()));
        assert_eq!(Provider::Google.auth_header("k"), ("x-goog-api-key", "k".to_owned()));
    }

    /// Answers one request with `status` and hands back what it was sent.
    fn serve_once(status: &'static str, answer: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut received = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let read = stream.read(&mut chunk).unwrap();
                received.extend_from_slice(&chunk[..read]);
                let text = String::from_utf8_lossy(&received);
                let Some(head_end) = text.find("\r\n\r\n") else { continue };
                let length = text
                    .lines()
                    .find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse().unwrap()))
                    .unwrap_or(0usize);
                if received.len() >= head_end + 4 + length {
                    break;
                }
            }
            write!(stream, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{answer}", answer.len())
                .unwrap();
            String::from_utf8(received).unwrap()
        });
        (url, server)
    }

    #[test]
    fn posts_the_body_with_the_key_and_returns_the_answer() {
        let (url, server) = serve_once("200 OK", r#"{"ok":true}"#);
        let response = send(
            &format!("{url}/chat/completions"),
            Method::Post,
            Provider::Openrouter.auth_header("test-key"),
            Some(r#"{"model":"m"}"#),
        )
        .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.body, r#"{"ok":true}"#);

        let received = server.join().unwrap().to_ascii_lowercase();
        assert!(received.starts_with("post /chat/completions http/1.1"));
        assert!(received.contains("authorization: bearer test-key"));
        assert!(received.contains("content-type: application/json"));
        assert!(received.ends_with(r#"{"model":"m"}"#));
    }

    #[test]
    fn hands_error_statuses_back_instead_of_failing() {
        let (url, server) = serve_once("401 Unauthorized", r#"{"error":{"message":"No auth"}}"#);
        let response = send(&format!("{url}/key"), Method::Get, Provider::Google.auth_header("k"), None).unwrap();
        assert_eq!(response.status, 401);
        assert!(response.body.contains("No auth"));
        assert!(server.join().unwrap().to_ascii_lowercase().contains("x-goog-api-key: k"));
    }

    #[test]
    fn reports_an_unreachable_service_as_offline() {
        // Nothing listens on the port once the listener is dropped.
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let error = send(&format!("http://127.0.0.1:{port}/x"), Method::Get, ("X-Test", String::new()), None).unwrap_err();
        assert_eq!(error.kind, ErrorKind::Offline);
    }
}
