//! Google Drive support: a loopback HTTP listener for the OAuth "Desktop
//! app" redirect flow, plus OS-keychain storage for the refresh token.
//! Everything else (PKCE, the authorize URL, the token exchange, and every
//! Drive REST call) lives in TypeScript and talks to Google directly via
//! `fetch()` — this module exists only for the two things the webview can't
//! do itself: open a raw TCP listener, and reach the OS credential store.

use std::collections::HashMap;
use std::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::{timeout, Duration};

const KEYRING_SERVICE: &str = "com.mhenr.tonote";
const KEYRING_USER: &str = "google-drive-refresh-token";

#[derive(Default)]
pub struct DriveOAuthState(pub Mutex<Option<TcpListener>>);

#[derive(serde::Serialize)]
pub struct OAuthCallbackResult {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// Binds an ephemeral loopback port and stashes the listener in managed
/// state. Must be called before the system browser is opened, and its
/// result (the port) is what the authorize URL's redirect_uri points at.
#[tauri::command]
pub async fn drive_oauth_listen(
    state: tauri::State<'_, DriveOAuthState>,
) -> Result<u16, String> {
    // 127.0.0.1 only — this must never be reachable from the LAN.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    *state.0.lock().map_err(|_| "lock poisoned".to_string())? = Some(listener);
    Ok(port)
}

/// Waits for the single redirect request Google's consent screen sends back,
/// extracts `code`/`state`/`error` from the query string, and responds with
/// a small "you can close this tab" page.
#[tauri::command]
pub async fn drive_oauth_await_code(
    state: tauri::State<'_, DriveOAuthState>,
) -> Result<OAuthCallbackResult, String> {
    let listener = state
        .0
        .lock()
        .map_err(|_| "lock poisoned".to_string())?
        .take()
        .ok_or_else(|| "OAuth listener was not started".to_string())?;

    let (mut stream, _) = timeout(Duration::from_secs(120), listener.accept())
        .await
        .map_err(|_| "Timed out waiting for the Google sign-in redirect".to_string())?
        .map_err(|e| e.to_string())?;

    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let request_line = request.lines().next().unwrap_or("");
    let params = parse_query_params(&request_line_query(request_line));

    let body = "<html><body><p>You can close this tab and return to Rove ToNote.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;

    Ok(OAuthCallbackResult {
        code: params.get("code").cloned(),
        state: params.get("state").cloned(),
        error: params.get("error").cloned(),
    })
}

/// Extracts the query string from an HTTP request line, e.g.
/// `"GET /callback?code=xyz&state=abc HTTP/1.1"` -> `"code=xyz&state=abc"`.
fn request_line_query(request_line: &str) -> String {
    request_line
        .split_whitespace()
        .nth(1)
        .and_then(|path_and_query| path_and_query.split_once('?'))
        .map(|(_, query)| query.to_string())
        .unwrap_or_default()
}

fn parse_query_params(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .filter_map(|pair| pair.split_once('='))
        .map(|(key, value)| (url_decode(key), url_decode(value)))
        .collect()
}

/// Minimal percent-decoding (accumulates raw bytes before the final UTF-8
/// decode, so multi-byte percent-encoded sequences decode correctly).
fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
pub fn store_drive_refresh_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_drive_refresh_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_drive_refresh_token() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_and_plus() {
        assert_eq!(url_decode("a%20b+c"), "a b c");
        assert_eq!(url_decode("code%3D1"), "code=1");
        assert_eq!(url_decode("no-escapes"), "no-escapes");
    }

    #[test]
    fn extracts_query_from_request_line() {
        assert_eq!(
            request_line_query("GET /callback?code=xyz&state=abc HTTP/1.1"),
            "code=xyz&state=abc"
        );
        assert_eq!(request_line_query("GET / HTTP/1.1"), "");
        assert_eq!(request_line_query(""), "");
    }

    #[test]
    fn parses_multiple_params() {
        let params = parse_query_params("code=xyz&state=abc%20123");
        assert_eq!(params.get("code"), Some(&"xyz".to_string()));
        assert_eq!(params.get("state"), Some(&"abc 123".to_string()));
    }

    #[test]
    fn parses_error_param() {
        let params = parse_query_params("error=access_denied&state=abc");
        assert_eq!(params.get("error"), Some(&"access_denied".to_string()));
        assert_eq!(params.get("code"), None);
    }

    /// Mirrors what `drive_oauth_await_code` does end to end (minus the
    /// `tauri::State` plumbing): bind, accept one real TCP connection, read
    /// the request line, parse the query string, respond, shut down.
    #[tokio::test]
    async fn loopback_listener_round_trip() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let accept_task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).await.unwrap();
            let request = String::from_utf8_lossy(&buf[..n]).to_string();
            let request_line = request.lines().next().unwrap_or("").to_string();
            let params = parse_query_params(&request_line_query(&request_line));
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .await
                .unwrap();
            let _ = stream.shutdown().await;
            params
        });

        let mut client = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .unwrap();
        client
            .write_all(b"GET /callback?code=abc123&state=xyz789 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .await
            .unwrap();

        let params = accept_task.await.unwrap();
        assert_eq!(params.get("code"), Some(&"abc123".to_string()));
        assert_eq!(params.get("state"), Some(&"xyz789".to_string()));
    }

    /// Genuine round-trip through the OS credential store (Windows
    /// Credential Manager on this dev machine), using a throwaway entry
    /// distinct from the app's real one so it can't collide/interfere.
    #[test]
    fn keyring_round_trip() {
        let entry = keyring::Entry::new("com.mhenr.tonote.test", "round-trip-test").unwrap();
        entry.set_password("smoke-test-token").unwrap();
        assert_eq!(entry.get_password().unwrap(), "smoke-test-token");
        entry.delete_credential().unwrap();
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    }
}
