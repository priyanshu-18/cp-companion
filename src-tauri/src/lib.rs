use tauri::{Manager, Runtime};

// ── macOS: Direct ObjC runtime calls (no external crate needed) ──────────────
// We call libobjc.dylib directly via C FFI.
// Works on Apple Silicon (ARM64) and Intel (x86_64).
#[cfg(target_os = "macos")]
mod macos_window {
    use std::ffi::c_void;

    #[link(name = "objc", kind = "dylib")]
    unsafe extern "C" {
        fn sel_registerName(name: *const u8) -> *const c_void;
        fn objc_msgSend();
    }

    /// Set NSWindow.level.
    /// -1 → below all normal apps (desktop-pinned).
    ///  0 → normal.
    ///  3 → kCGFloatingWindowLevel (always-on-top / floating).
    pub unsafe fn set_level(ns_win: *mut c_void, level: i64) {
        unsafe {
            let sel = sel_registerName(b"setLevel:\0".as_ptr());
            let f: unsafe extern "C" fn(*mut c_void, *const c_void, i64) =
                std::mem::transmute(objc_msgSend as *const ());
            f(ns_win, sel, level);
        }
    }

    /// Set NSWindowCollectionBehavior flags.
    /// Desktop-pinned: 1 (canJoinAllSpaces) | 16 (stationary) | 64 (ignoresCycle) = 81
    pub unsafe fn set_collection_behavior(ns_win: *mut c_void, behavior: u64) {
        unsafe {
            let sel = sel_registerName(b"setCollectionBehavior:\0".as_ptr());
            let f: unsafe extern "C" fn(*mut c_void, *const c_void, u64) =
                std::mem::transmute(objc_msgSend as *const ());
            f(ns_win, sel, behavior);
        }
    }
}

// ── Windows: Win32 API ────────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
mod win32_window {
    extern "system" {
        fn SetWindowPos(
            h_wnd: isize, h_wnd_insert_after: isize,
            x: i32, y: i32, cx: i32, cy: i32, u_flags: u32,
        ) -> i32;
        fn GetWindowLongPtrW(h_wnd: isize, n_index: i32) -> isize;
        fn SetWindowLongPtrW(h_wnd: isize, n_index: i32, dw_new_long: isize) -> isize;
    }

    const HWND_BOTTOM:      isize = 1;
    const HWND_TOPMOST:     isize = -1;
    const SWP_NOMOVE:        u32  = 0x0002;
    const SWP_NOSIZE:        u32  = 0x0001;
    const SWP_NOACTIVATE:    u32  = 0x0010;
    const GWL_EXSTYLE:       i32  = -20;
    const WS_EX_NOACTIVATE: isize = 0x08000000;
    const WS_EX_TOOLWINDOW: isize = 0x00000080;
    const WS_EX_TOPMOST:    isize = 0x00000008;

    pub unsafe fn pin_to_desktop(hwnd: isize) {
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE,
                (style | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) & !WS_EX_TOPMOST);
            SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }

    pub unsafe fn set_floating(hwnd: isize) {
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE,
                (style & !(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW)) | WS_EX_TOPMOST);
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn start_drag<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.start_dragging();
}

/// Apply native desktop-pinned mode (behind all app windows).
#[tauri::command]
async fn pin_to_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Could not get main window")?;

    window.set_always_on_top(false).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let ns_win = window.ns_window().map_err(|e| e.to_string())?;
        unsafe {
            macos_window::set_level(ns_win, -1);
            // canJoinAllSpaces(1) | stationary(16) | ignoresCycle(64)
            macos_window::set_collection_behavior(ns_win, 81);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe { win32_window::pin_to_desktop(hwnd); }
    }

    Ok(())
}

/// Restore floating always-on-top mode.
#[tauri::command]
async fn set_floating_mode(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Could not get main window")?;

    #[cfg(target_os = "macos")]
    {
        let ns_win = window.ns_window().map_err(|e| e.to_string())?;
        unsafe {
            macos_window::set_level(ns_win, 3); // kCGFloatingWindowLevel
            macos_window::set_collection_behavior(ns_win, 0);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe { win32_window::set_floating(hwnd); }
    }

    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn minimize_window<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.minimize();
}

#[tauri::command]
async fn close_window<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.close();
}

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
            pin_to_desktop,
            set_floating_mode,
            minimize_window,
            close_window,
            get_window_position,
            set_window_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CP Companion");
}
