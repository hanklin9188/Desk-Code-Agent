#[tauri::command]
fn runtime_provenance() -> serde_json::Value {
    serde_json::json!({
        "transport": "tauri_command",
        "privacy": "local_only",
        "network_enabled": false,
        "runtime": "desk-code-agent"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_provenance])
        .run(tauri::generate_context!())
        .expect("failed to run Desk Code Agent desktop shell");
}
