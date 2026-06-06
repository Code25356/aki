use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub type McpProcesses = Arc<Mutex<HashMap<String, McpProcess>>>;

pub struct McpProcess {
    child: Child,
    stdin: tokio::process::ChildStdin,
    stdout_reader: BufReader<tokio::process::ChildStdout>,
}

pub fn create_mcp_state() -> McpProcesses {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Resolve full path for a command (macOS GUI apps don't inherit shell PATH)
fn resolve_command(command: &str) -> String {
    // Common paths where node/npx live on macOS
    let search_paths = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        // nvm default
        &format!("{}/.nvm/versions/node", std::env::var("HOME").unwrap_or_default()),
    ];

    // Try to find the command in common paths
    for dir in &search_paths {
        let path = format!("{}/{}", dir, command);
        if std::path::Path::new(&path).exists() {
            return path;
        }
    }

    // For nvm, check the default symlink or latest version
    if let Ok(home) = std::env::var("HOME") {
        let nvm_bin = format!("{}/.nvm/alias/default", home);
        if std::path::Path::new(&nvm_bin).exists() {
            // Read symlink and check if command exists there
        }
        // Check common nvm current path
        // Check nvm versions directory for the command
        if let Ok(entries) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
            let mut versions: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            versions.sort_by(|a, b| b.file_name().cmp(&a.file_name())); // latest first
            if let Some(latest) = versions.first() {
                let path = format!("{}/bin/{}", latest.path().display(), command);
                if std::path::Path::new(&path).exists() {
                    return path;
                }
            }
        }
    }

    // Fallback: return as-is and hope it's in PATH
    command.to_string()
}

/// Build a PATH that includes common node binary locations
fn build_path() -> String {
    let mut paths: Vec<String> = Vec::new();

    // Add homebrew
    paths.push("/opt/homebrew/bin".to_string());
    paths.push("/usr/local/bin".to_string());

    // Add nvm if available
    if let Ok(home) = std::env::var("HOME") {
        if let Ok(entries) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
            let mut versions: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
            if let Some(latest) = versions.first() {
                paths.push(format!("{}/bin", latest.path().display()));
            }
        }
    }

    // Append existing PATH
    if let Ok(existing) = std::env::var("PATH") {
        paths.push(existing);
    }

    paths.join(":")
}

/// Spawn an MCP server as a child process communicating over stdio.
#[tauri::command]
pub async fn mcp_spawn(
    state: tauri::State<'_, McpProcesses>,
    server_id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<String, String> {
    let resolved_cmd = resolve_command(&command);
    let full_path = build_path();

    // Ensure any directory arguments exist (e.g., filesystem server workspace)
    for arg in &args {
        if arg.starts_with("/") && !arg.contains('.') {
            let _ = std::fs::create_dir_all(arg);
        }
    }

    let mut cmd = Command::new(&resolved_cmd);
    cmd.args(&args)
        .envs(&env)
        .env("PATH", &full_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn MCP server '{}': {}", server_id, e))?;

    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stdout_reader = BufReader::new(stdout);

    let process = McpProcess {
        child,
        stdin,
        stdout_reader,
    };

    let mut processes = state.lock().await;
    processes.insert(server_id.clone(), process);

    Ok(server_id)
}

/// Send a JSON-RPC message to an MCP server and read the response line.
#[tauri::command]
pub async fn mcp_send(
    state: tauri::State<'_, McpProcesses>,
    server_id: String,
    message: String,
) -> Result<String, String> {
    let mut processes = state.lock().await;
    let process = processes
        .get_mut(&server_id)
        .ok_or_else(|| format!("MCP server '{}' not found", server_id))?;

    // Write message + newline to stdin
    let msg_with_newline = format!("{}\n", message.trim());
    process
        .stdin
        .write_all(msg_with_newline.as_bytes())
        .await
        .map_err(|e| format!("Failed to write to MCP server: {}", e))?;
    process
        .stdin
        .flush()
        .await
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Read response lines — skip non-JSON lines (server banners, logs, etc.)
    let read_result = tokio::time::timeout(std::time::Duration::from_secs(30), async {
        loop {
            let mut line = String::new();
            match process.stdout_reader.read_line(&mut line).await {
                Ok(0) => return Err("MCP server closed connection".to_string()),
                Ok(_) => {
                    let trimmed = line.trim();
                    // JSON-RPC responses start with '{' — skip anything else
                    if trimmed.starts_with('{') {
                        return Ok(trimmed.to_string());
                    }
                    // Skip non-JSON lines (banners, warnings, etc.)
                    continue;
                }
                Err(e) => return Err(format!("Failed to read from MCP server: {}", e)),
            }
        }
    })
    .await;

    match read_result {
        Ok(Ok(json)) => Ok(json),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("MCP server response timed out (30s)".to_string()),
    }
}

/// Stop an MCP server process.
#[tauri::command]
pub async fn mcp_stop(
    state: tauri::State<'_, McpProcesses>,
    server_id: String,
) -> Result<(), String> {
    let mut processes = state.lock().await;
    if let Some(mut process) = processes.remove(&server_id) {
        let _ = process.child.kill().await;
    }
    Ok(())
}

/// Install an npm MCP server package (caches it locally via npx).
#[tauri::command]
pub async fn mcp_install(package_name: String) -> Result<String, String> {
    // Use npx -y to download and cache the package without running it
    let output = Command::new("npx")
        .args(["-y", "--package", &package_name, "echo", "installed"])
        .output()
        .await
        .map_err(|e| format!("Failed to install '{}': {}", package_name, e))?;

    if output.status.success() {
        Ok(format!("Installed {}", package_name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Install failed: {}", stderr))
    }
}

/// List currently connected MCP server IDs.
#[tauri::command]
pub async fn mcp_list(state: tauri::State<'_, McpProcesses>) -> Result<Vec<String>, String> {
    let processes = state.lock().await;
    Ok(processes.keys().cloned().collect())
}
