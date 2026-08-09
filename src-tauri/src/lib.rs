mod drive;

// Most app logic (tree ops, markdown parsing, crypto, todo parsing, local
// file IO) lives in TypeScript. The `drive` module is the one exception: a
// webview can't open a raw TCP listener or reach the OS keychain, so the
// Google Drive OAuth loopback + refresh-token storage live here instead.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Must be registered after the fs plugin: it persists fs/dialog scope
        // grants (e.g. a previously opened document's path) across restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .manage(drive::DriveOAuthState::default())
        .invoke_handler(tauri::generate_handler![
            drive::drive_oauth_listen,
            drive::drive_oauth_await_code,
            drive::store_drive_refresh_token,
            drive::get_drive_refresh_token,
            drive::clear_drive_refresh_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
