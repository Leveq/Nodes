#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod tray;

use tauri::{Emitter, Manager};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Create the system tray
            tray::create_tray(app.handle())?;

            // Minimize to tray on close (production behavior)
            // Set to false for debug mode (quit on close)
            let minimize_to_tray = true;

            if minimize_to_tray {
                let main_window = app.get_webview_window("main").unwrap();
                main_window.on_window_event({
                    let window = main_window.clone();
                    move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            // Hide the window instead of closing it
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                });
            } else {
                // Debug behavior: quit on close
                let main_window = app.get_webview_window("main").unwrap();
                let app_handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Emit event for frontend cleanup
                        let _ = app_handle.emit("app:before-quit", ());
                        // Allow close to proceed after brief delay for cleanup
                        api.prevent_close();
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(200));
                            handle.exit(0);
                        });
                    }
                });
            }

            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running Nodes");
}
