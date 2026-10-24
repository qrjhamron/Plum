#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

static ENGINE: Mutex<Option<Child>> = Mutex::new(None);

/// Buka URL eksternal (login Microsoft) di browser sistem dari jendela aplikasi.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("URL eksternal harus https".into());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn spawn_engine(app: &tauri::App) {
    let mut cmd: Option<Command> = None;

    // Mode paket (Windows): engine bundle di resources/engine (node.exe + app/).
    if let Ok(res) = app.path().resource_dir() {
        let node = res.join("engine").join("node.exe");
        let server = res.join("engine").join("app").join("server.js");
        if node.exists() && server.exists() {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| res.clone())
                .join("data");
            let mut c = Command::new(&node);
            c.arg(&server)
                .env("LAUNCHER_DATA_DIR", &data_dir)
                .env("PORT", "4173")
                .env("HOST", "127.0.0.1")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                c.creation_flags(0x0800_0000);
            }
            cmd = Some(c);
        }
    }

    // Mode dev: pakai Node dari PATH dan server.js di root proyek.
    if cmd.is_none() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let mut c = Command::new("node");
        c.arg(root.join("server.js"))
            .current_dir(&root)
            .env("PORT", "4173")
            .env("HOST", "127.0.0.1")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0800_0000);
        }
        cmd = Some(c);
    }

    if let Some(mut c) = cmd {
        if let Ok(child) = c.spawn() {
            if let Ok(mut slot) = ENGINE.lock() {
                *slot = Some(child);
            }
        }
    }
}

fn kill_engine() {
    if let Ok(mut slot) = ENGINE.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_external])
        .setup(|app| {
            spawn_engine(app);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("gagal membangun PlumCraft Launcher");

    app.run(|_handle, event| {
        if let RunEvent::Exit = event {
            kill_engine();
        }
    });
}
