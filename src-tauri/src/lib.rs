mod net;
mod platforms;

use net::{ApiError, ContestDto, HttpState, PlatformStatsDto};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime, State,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

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
    unsafe extern "system" {
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

#[cfg(target_os = "windows")]
fn apply_windows_mode<R: Runtime>(window: &tauri::Window<R>, desktop: bool) -> Result<(), String> {
    let win_clone = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = win_clone.set_always_on_top(!desktop);
            if let Ok(hwnd) = win_clone.hwnd() {
                unsafe {
                    if desktop {
                        win32_window::pin_to_desktop(hwnd.0 as isize);
                    } else {
                        win32_window::set_floating(hwnd.0 as isize);
                    }
                }
            }
        })
        .map_err(|e| e.to_string())
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
        apply_windows_mode(&window, true)?;
        eprintln!("[CP Companion] pin_to_desktop: HWND_BOTTOM applied on main thread");
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
        apply_windows_mode(&window, false)?;
        eprintln!("[CP Companion] set_floating_mode: HWND_TOPMOST applied on main thread");
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

#[tauri::command]
async fn fetch_codeforces(
    state: State<'_, HttpState>,
    handle: String,
) -> Result<PlatformStatsDto, ApiError> {
    let clean = net::validate_handle(&handle)?;
    platforms::codeforces::fetch_stats(&state.0, &clean).await
}

#[tauri::command]
async fn fetch_leetcode(
    state: State<'_, HttpState>,
    handle: String,
) -> Result<PlatformStatsDto, ApiError> {
    let clean = net::validate_handle(&handle)?;
    platforms::leetcode::fetch_stats(&state.0, &clean).await
}

#[tauri::command]
async fn fetch_codechef(
    state: State<'_, HttpState>,
    handle: String,
) -> Result<PlatformStatsDto, ApiError> {
    let clean = net::validate_handle(&handle)?;
    platforms::codechef::fetch_stats(&state.0, &clean).await
}

#[tauri::command]
async fn fetch_contests(state: State<'_, HttpState>) -> Result<Vec<ContestDto>, ApiError> {
    let (cf, lc, cc) = tokio::join!(
        platforms::codeforces::fetch_contests(&state.0),
        platforms::leetcode::fetch_contests(&state.0),
        platforms::codechef::fetch_contests(&state.0),
    );
    let mut all = Vec::new();
    if let Ok(mut v) = cf {
        all.append(&mut v);
    }
    if let Ok(mut v) = lc {
        all.append(&mut v);
    }
    if let Ok(mut v) = cc {
        all.append(&mut v);
    }
    all.sort_by(|a, b| a.start_time.cmp(&b.start_time));
    Ok(all)
}

#[tauri::command]
fn get_autostart<R: Runtime>(app: tauri::AppHandle<R>) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart<R: Runtime>(app: tauri::AppHandle<R>, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    if enabled {
        al.enable().map_err(|e| e.to_string())
    } else {
        al.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn send_contest_notification<R: Runtime>(
    app: tauri::AppHandle<R>,
    title: String,
    body: String,
    with_sound: bool,
) -> Result<(), String> {
    let notif = app.notification();
    if let Ok(state) = notif.permission_state() {
        if state != tauri_plugin_notification::PermissionState::Granted {
            let _ = notif.request_permission();
        }
    }
    let mut builder = notif.builder().title(title).body(body);
    if with_sound {
        builder = builder.sound("Ping");
    }
    let _ = builder.show();
    Ok(())
}

#[tauri::command]
async fn briefly_show_alarm_window<R: Runtime>(
    window: tauri::Window<R>,
    restore_desktop: bool,
) -> Result<(), String> {
    let _ = window.show();
    let _ = set_floating_mode(window.clone()).await;
    let win_clone = window.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        if restore_desktop {
            let _ = pin_to_desktop(win_clone).await;
        }
    });
    Ok(())
}

#[tauri::command]
fn open_contest_url<R: Runtime>(app: tauri::AppHandle<R>, url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid contest URL".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only https URLs are allowed".to_string());
    }
    let host = parsed.host_str().unwrap_or("");
    let allowed = matches!(
        host,
        "leetcode.com"
            | "www.leetcode.com"
            | "codechef.com"
            | "www.codechef.com"
            | "codeforces.com"
            | "www.codeforces.com"
    );
    if !allowed {
        return Err("Contest host not in allowlist".to_string());
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_support_link<R: Runtime>(app: tauri::AppHandle<R>, key: String) -> Result<(), String> {
    let url = match key.as_str() {
        "githubRepo" => "https://github.com/priyanshu-18/cp-companion",
        "githubSponsors" => "https://github.com/sponsors/priyanshu-18",
        "kofi" => "https://ko-fi.com/impropriyanshu",
        "reportBug" => "https://github.com/priyanshu-18/cp-companion",
        "downloadLatest" => "https://github.com/priyanshu-18/releases/latest",
        _ => return Err("URL key not in allowlist".to_string()),
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_update<R: Runtime>(app: tauri::AppHandle<R>) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(update.version)),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn install_update<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_state = HttpState::new().expect("failed to build HTTP client");
    tauri::Builder::default()
        .manage(http_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .setup(|app| {
            // Hide from Dock & Cmd+Tab app switcher on macOS
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Enable autostart by default on first run
            if let Ok(false) = app.autolaunch().is_enabled() {
                let _ = app.autolaunch().enable();
            }
            let autostart_on = app.autolaunch().is_enabled().unwrap_or(true);

            // Build menu bar tray icon
            let show_hide = MenuItem::with_id(app, "toggle_vis", "Show / Hide Widget", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Refresh Now", true, None::<&str>)?;
            let pin_item = CheckMenuItem::with_id(app, "pin_desktop", "Pin to Desktop", true, false, None::<&str>)?;
            let login_item = CheckMenuItem::with_id(app, "autostart", "Launch at Login", true, autostart_on, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit CP Companion", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&show_hide, &refresh, &pin_item, &login_item, &sep, &quit],
            )?;

            let pin_clone = pin_item.clone();
            let login_clone = login_item.clone();

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("CP Companion");

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "toggle_vis" => {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "refresh" => {
                        let _ = app.emit("tray-refresh", ());
                    }
                    "pin_desktop" => {
                        let pinned = pin_clone.is_checked().unwrap_or(false);
                        let _ = app.emit("tray-set-mode", if pinned { "desktop" } else { "floating" });
                    }
                    "autostart" => {
                        let enabled = login_clone.is_checked().unwrap_or(true);
                        let al = app.autolaunch();
                        if enabled {
                            let _ = al.enable();
                        } else {
                            let _ = al.disable();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_drag,
            pin_to_desktop,
            set_floating_mode,
            minimize_window,
            close_window,
            get_window_bounds,
            set_window_bounds,
            fetch_codeforces,
            fetch_leetcode,
            fetch_codechef,
            fetch_contests,
            get_autostart,
            set_autostart,
            check_update,
            install_update,
            open_support_link,
            open_contest_url,
            send_contest_notification,
            briefly_show_alarm_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CP Companion");
}
