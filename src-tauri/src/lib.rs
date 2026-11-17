mod drive;

// Opens a second instance of the app (a separate OS process, since the
// document stores are process-global singletons) pointed at `path` — used
// to view a backup snapshot without touching the currently-open document.
#[tauri::command]
fn open_new_instance(path: String) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    std::process::Command::new(exe)
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// The document path (if any) this instance was launched with — set by
// open_new_instance above when opening a backup.
#[tauri::command]
fn get_startup_arg() -> Option<String> {
    std::env::args().nth(1)
}

// Shows a JS-built context menu (by resource id) at a logical point in the
// window, or at the cursor. Replaces the JS `Menu.popup()`, whose built-in
// command keeps the webview's resource-table lock held for as long as the
// menu is open: on Windows the popup is a modal loop on the main thread, so
// any other menu/resource call that reaches the main thread meanwhile (e.g.
// building the next menu, closing the previous one) blocks on that lock and
// the app freezes for good. Here the lock is released before the popup.
#[tauri::command]
async fn popup_context_menu(
    webview: tauri::Webview,
    window: tauri::Window,
    rid: tauri::ResourceId,
    at: Option<(f64, f64)>,
) -> Result<(), String> {
    use tauri::menu::ContextMenu;
    use tauri::Manager;
    let menu = webview
        .resources_table()
        .get::<tauri::menu::Menu<tauri::Wry>>(rid)
        .map_err(|e| e.to_string())?;
    match at {
        Some((x, y)) => menu.popup_at(window, tauri::LogicalPosition::new(x, y)),
        None => menu.popup(window),
    }
    .map_err(|e| e.to_string())
}

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
            open_new_instance,
            get_startup_arg,
            popup_context_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
