#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod tray;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Create the system tray
            tray::create_tray(app.handle())?;

            // Set up window close handler to minimize to tray instead of quitting
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nodes");
}
