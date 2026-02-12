//! System tray support for Nodes.
//!
//! Provides a tray icon with menu for quick access and background operation.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};

/// Creates and configures the system tray for the application.
pub fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    // Build the tray menu
    let show_item = MenuItem::with_id(app, "show", "Show Nodes", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    // Build the tray icon
    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    // Emit event to frontend for graceful cleanup
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("app:before-quit", ());
                    }
                    // Give frontend time to cleanup, then exit
                    std::thread::spawn({
                        let app_handle = app.clone();
                        move || {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            app_handle.exit(0);
                        }
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
