use tauri::Runtime;

// ── macOS: Direct ObjC runtime calls (no external crate needed) ──────────────
// All functions in this module MUST be called from the macOS main thread.
// NSWindow operations are not thread-safe; AppKit will SIGTRAP on violations.
#[cfg(target_os = "macos")]
mod macos_window {
    use std::ffi::c_void;

    #[link(name = "objc", kind = "dylib")]
    unsafe extern "C" {
        fn sel_registerName(name: *const u8) -> *const c_void;
        fn objc_msgSend();
    }

    /// Set NSWindow.level  ── MAIN THREAD ONLY ──
    /// -1 → kCGDesktopWindowLevel  (desktop-pinned, behind all apps)
    ///  0 → kCGNormalWindowLevel   (normal application window)
    ///  3 → kCGFloatingWindowLevel (always-on-top / floating)
    pub unsafe fn set_level(ns_win: *mut c_void, level: i64) {
        unsafe {
            let sel = sel_registerName(b"setLevel:\0".as_ptr());
            let f: unsafe extern "C" fn(*mut c_void, *const c_void, i64) =
                std::mem::transmute(objc_msgSend as *const ());
            f(ns_win, sel, level);
        }
    }

    /// Set NSWindowCollectionBehavior flags  ── MAIN THREAD ONLY ──
    /// Desktop-pinned: canJoinAllSpaces(1) | stationary(16) | ignoresCycle(64) = 81
    /// Floating:       0 (default / no special behavior)
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

// ── Helper: run a fallible closure on the macOS main thread ──────────────────
//
// `window.run_on_main_thread()` requires a `FnOnce() -> ()` closure — it
// cannot return a Result.  We smuggle the result out through a one-shot
// `std::sync::mpsc` channel, then block the calling (tokio worker) thread
// until the main-thread closure completes.
//
// This avoids:
//  • SIGTRAP "Must only be used from the main thread" (AppKit thread violation)
//  • Silently swallowing errors that happen inside the closure
#[cfg(target_os = "macos")]
fn run_on_main<R, F>(window: &tauri::Window<R>, f: F) -> Result<(), String>
where
    R: Runtime,
    F: FnOnce(&tauri::Window<R>) -> Result<(), String> + Send + 'static,
{
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let win_clone = window.clone();
    window
        .run_on_main_thread(move || {
            let result = f(&win_clone);
            let _ = tx.send(result);
        })
        .map_err(|e| format!("run_on_main_thread dispatch failed: {e}"))?;
    rx.recv()
        .map_err(|e| format!("run_on_main_thread result channel broken: {e}"))?
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn start_drag<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.start_dragging();
}

/// Apply native desktop-pinned mode (behind all app windows).
///
/// # Thread safety
/// All AppKit (NSWindow) calls are dispatched to the macOS main thread via
/// `run_on_main()`.  Without this, AppKit raises EXC_BREAKPOINT/SIGTRAP with
/// "Must only be used from the main thread" because Tauri async commands run
/// on tokio worker threads.
#[tauri::command]
async fn pin_to_desktop<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        run_on_main(&window, |w| {
            // set_always_on_top touches AppKit — must also be on main thread.
            w.set_always_on_top(false).map_err(|e| e.to_string())?;

            let ns_win = w.ns_window().map_err(|e| e.to_string())?;
            unsafe {
                // kCGDesktopWindowLevel = -1: behind all app windows
                macos_window::set_level(ns_win, -1);
                // canJoinAllSpaces(1) | stationary(16) | ignoresCycle(64) = 81
                macos_window::set_collection_behavior(ns_win, 81);
            }
            eprintln!("[CP Companion] pin_to_desktop: NSWindow level -1 (desktop-pinned)");
            Ok(())
        })?;
    }

    #[cfg(target_os = "windows")]
    {
        // Win32 calls are safe from any thread; run directly.
        window.set_always_on_top(false).map_err(|e| e.to_string())?;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe { win32_window::pin_to_desktop(hwnd); }
        eprintln!("[CP Companion] pin_to_desktop: HWND_BOTTOM applied");
    }

    Ok(())
}

/// Restore floating always-on-top mode.
///
/// # Thread safety
/// All AppKit (NSWindow) calls are dispatched to the macOS main thread.
#[tauri::command]
async fn set_floating_mode<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        run_on_main(&window, |w| {
            let ns_win = w.ns_window().map_err(|e| e.to_string())?;
            unsafe {
                macos_window::set_level(ns_win, 3); // kCGFloatingWindowLevel
                macos_window::set_collection_behavior(ns_win, 0);
            }
            // set_always_on_top touches AppKit — must also be on main thread.
            w.set_always_on_top(true).map_err(|e| e.to_string())?;
            eprintln!("[CP Companion] set_floating_mode: NSWindow level 3 (floating)");
            Ok(())
        })?;
    }

    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe { win32_window::set_floating(hwnd); }
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        eprintln!("[CP Companion] set_floating_mode: HWND_TOPMOST applied");
    }

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

/// Returns current outer position and inner (content) size as (x, y, w, h).
#[tauri::command]
async fn get_window_bounds<R: Runtime>(
    window: tauri::Window<R>,
) -> Result<(i32, i32, u32, u32), String> {
    let pos  = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y, size.width, size.height))
}

/// Restores saved position and size.  Clamps to sensible limits before applying.
#[tauri::command]
async fn set_window_bounds<R: Runtime>(
    window: tauri::Window<R>,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    use tauri::{PhysicalPosition, PhysicalSize};
    // Clamp width/height to configured limits
    let w = w.clamp(300, 560);
    let h = h.clamp(480, 1000);
    window
        .set_size(PhysicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
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
            get_window_bounds,
            set_window_bounds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CP Companion");
}
