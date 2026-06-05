use base64::Engine;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

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

#[cfg(target_os = "macos")]
#[tauri::command]
async fn rebuild_app() -> Result<String, String> {
    use std::process::Command;

    let source_dir = std::path::PathBuf::from("/Users/avajpayee/AI/aichat");

    // Pull latest code from remote
    let pull_output = Command::new("git")
        .args(["pull", "--ff-only"])
        .current_dir(&source_dir)
        .output()
        .map_err(|e| format!("Failed to run git pull: {}", e))?;

    if !pull_output.status.success() {
        let stderr = String::from_utf8_lossy(&pull_output.stderr).to_string();
        return Err(format!("Git pull failed:\n{}", stderr));
    }

    let output = Command::new("/bin/zsh")
        .args([
            "-l",
            "-c",
            &format!(
                "cd '{}' && source \"$HOME/.cargo/env\" 2>/dev/null; source \"$HOME/.nvm/nvm.sh\" 2>/dev/null; export PATH=\"$HOME/.nvm/versions/node/$(nvm current)/bin:$PATH\" 2>/dev/null; npm run tauri build 2>&1",
                source_dir.display()
            ),
        ])
        .output()
        .map_err(|e| format!("Failed to start build: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Build failed:\n{}\n{}", stdout, stderr));
    }

    let app_source = source_dir.join("src-tauri/target/release/bundle/macos/Aki.app");
    let app_dest = std::path::PathBuf::from("/Applications/Aki.app");

    if app_dest.exists() {
        std::fs::remove_dir_all(&app_dest)
            .map_err(|e| format!("Failed to remove old app: {}", e))?;
    }

    let cp_output = Command::new("cp")
        .args(["-R", &app_source.to_string_lossy(), &app_dest.to_string_lossy()])
        .output()
        .map_err(|e| format!("Failed to copy app: {}", e))?;

    if !cp_output.status.success() {
        return Err(format!(
            "Failed to install app: {}",
            String::from_utf8_lossy(&cp_output.stderr)
        ));
    }

    Ok("Build and install successful!".to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn rebuild_app() -> Result<String, String> {
    Err("Rebuild is only supported on macOS.".to_string())
}

/// Fetch a URL from the Rust side (bypasses CORS).
/// Returns the response body as a string.
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
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
        .invoke_handler(tauri::generate_handler![
            rebuild_app,
            extract_pdf_text,
            capture_oauth_callback,
            fetch_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
