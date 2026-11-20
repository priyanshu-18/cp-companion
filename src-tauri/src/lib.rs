use tauri::Runtime;

/// Allow the frontend to start a native window drag
#[tauri::command]
async fn start_drag<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.start_dragging();
}

/// Toggle always-on-top state
#[tauri::command]
async fn set_always_on_top<R: Runtime>(window: tauri::Window<R>, always_on_top: bool) {
    let _ = window.set_always_on_top(always_on_top);
}

/// Minimize the window
#[tauri::command]
async fn minimize_window<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.minimize();
}

/// Close / hide the window
#[tauri::command]
async fn close_window<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.close();
}

/// Save window position to be restored on next launch
#[tauri::command]
async fn get_window_position<R: Runtime>(
    window: tauri::Window<R>,
) -> Result<(i32, i32), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y))
}

#[tauri::command]
async fn set_window_position<R: Runtime>(
    window: tauri::Window<R>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    use tauri::PhysicalPosition;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_drag,
            set_always_on_top,
            minimize_window,
            close_window,
            get_window_position,
            set_window_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CP Companion");
}
