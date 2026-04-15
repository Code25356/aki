use base64::Engine;

#[tauri::command]
fn extract_pdf_text(base64_data: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF extraction error: {}", e))?;

    Ok(text)
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn rebuild_app() -> Result<String, String> {
    use std::process::Command;

    let source_dir = std::path::PathBuf::from("/Users/avajpayee/AI/aichat");

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![rebuild_app, extract_pdf_text])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
