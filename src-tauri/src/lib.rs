// No custom Rust commands are needed: all app logic (tree ops, markdown
// parsing, crypto, todo parsing, file IO) lives in TypeScript. This file only
// registers the fs/dialog/persisted-scope plugins that back the document's
// File > New/Open/Save flow.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // Must be registered after the fs plugin: it persists fs/dialog scope
        // grants (e.g. a previously opened document's path) across restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
