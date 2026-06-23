use base64::Engine;
use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

mod mcp;

#[derive(Serialize)]
pub struct ShellResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
}

/// Execute a shell command and return stdout, stderr, and exit code.
/// Runs via /bin/sh -c on macOS/Linux for full shell features (pipes, env vars, etc.).
#[tauri::command]
async fn execute_shell(
    command: String,
    working_directory: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ShellResult, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30_000));

    let mut cmd = tokio::process::Command::new("/bin/sh");
    cmd.arg("-c").arg(&command);

    if let Some(ref dir) = working_directory {
        cmd.current_dir(dir);
    }

    // Inherit a reasonable PATH for GUI apps on macOS
    let home = std::env::var("HOME").unwrap_or_default();

    // Resolve nvm node path dynamically
    let nvm_dir = format!("{}/.nvm/versions/node", home);
    let nvm_bin = if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        versions.sort();
        versions.last().map(|v| format!("{}/{}/bin", nvm_dir, v)).unwrap_or_default()
    } else {
        String::new()
    };

    let path = format!(
        "{}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:{}/.cargo/bin",
        nvm_bin, home
    );
    cmd.env("PATH", &path);
    cmd.env("HOME", &home);

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;

    let result = tokio::time::timeout(timeout, child.wait_with_output()).await;

    match result {
        Ok(Ok(output)) => Ok(ShellResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code(),
        }),
        Ok(Err(e)) => Err(format!("Process error: {}", e)),
        Err(_) => Err(format!("Command timed out after {}ms", timeout.as_millis())),
    }
}

#[tauri::command]
fn extract_pdf_text(base64_data: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    // pdf-extract panics on some PDFs (bad font encodings) instead of returning Err.
    // Catch the panic so it doesn't crash the entire app.
    let result = std::panic::catch_unwind(|| {
        pdf_extract::extract_text_from_mem(&bytes)
    });

    match result {
        Ok(Ok(text)) => Ok(text),
        Ok(Err(e)) => Err(format!("PDF extraction error: {}", e)),
        Err(_) => Err("PDF extraction failed: the file contains unsupported font encodings".to_string()),
    }
}

/// Fetch a URL from the Rust side (bypasses CORS).
/// Returns the response body as a string.
/// Blocks private/internal IPs and non-HTTP(S) schemes to prevent SSRF.
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    // Block non-HTTP(S) schemes
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only HTTP and HTTPS URLs are allowed".to_string());
    }

    // Parse and validate host
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let host = parsed.host_str().ok_or("URL has no host")?;

    // Block private/internal hosts
    let blocked_hosts = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"];
    if blocked_hosts.iter().any(|h| host.eq_ignore_ascii_case(h)) {
        return Err("Access to localhost is blocked".to_string());
    }

    // Block private IP ranges
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        let is_private = match ip {
            std::net::IpAddr::V4(v4) => {
                v4.is_private() || v4.is_loopback() || v4.is_link_local()
                    || v4.octets()[0] == 169 && v4.octets()[1] == 254 // link-local
                    || v4.octets()[0] == 0 // 0.0.0.0/8
            }
            std::net::IpAddr::V6(v6) => v6.is_loopback(),
        };
        if is_private {
            return Err("Access to private/internal IPs is blocked".to_string());
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status().as_u16(), url));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))
}

/// Start a temporary HTTP server on port 19847 to capture OAuth redirect.
/// Returns the authorization code from the redirect URL.
/// Times out after 120 seconds.
#[tauri::command]
async fn capture_oauth_callback() -> Result<String, String> {
    // Use SO_REUSEADDR to handle the case where a previous listener is still bound
    let socket = tokio::net::TcpSocket::new_v4()
        .map_err(|e| format!("Failed to create socket: {}", e))?;
    socket.set_reuseaddr(true)
        .map_err(|e| format!("Failed to set reuseaddr: {}", e))?;
    socket.bind("127.0.0.1:19847".parse().unwrap())
        .map_err(|e| format!("Failed to bind port 19847: {}", e))?;
    let listener = socket.listen(1)
        .map_err(|e| format!("Failed to listen: {}", e))?;

    // Wait for a single connection with timeout
    let result = tokio::time::timeout(std::time::Duration::from_secs(120), async {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("Accept failed: {}", e))?;

        let mut buf = vec![0u8; 4096];
        let n = stream
            .read(&mut buf)
            .await
            .map_err(|e| format!("Read failed: {}", e))?;

        let request = String::from_utf8_lossy(&buf[..n]).to_string();

        // Extract code from GET /oauth/callback?code=...&scope=...
        let code = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|path| path.split('?').nth(1))
            .and_then(|query| {
                query.split('&').find_map(|param| {
                    let mut parts = param.splitn(2, '=');
                    let key = parts.next()?;
                    let value = parts.next()?;
                    if key == "code" { Some(value.to_string()) } else { None }
                })
            })
            .ok_or_else(|| "No auth code found in redirect".to_string())?;

        // Send success response
        let html = "<html><body><h2>Success!</h2><p>You can close this tab and return to Aki.</p></body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        let _ = stream.write_all(response.as_bytes()).await;

        Ok::<String, String>(code)
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(_) => Err("OAuth callback timed out after 120 seconds".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(mcp::create_mcp_state())
        .invoke_handler(tauri::generate_handler![
            extract_pdf_text,
            capture_oauth_callback,
            fetch_url,
            execute_shell,
            mcp::mcp_spawn,
            mcp::mcp_send,
            mcp::mcp_stop,
            mcp::mcp_install,
            mcp::mcp_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
