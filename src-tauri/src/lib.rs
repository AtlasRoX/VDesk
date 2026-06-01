mod server;

use std::sync::Mutex;
use tauri::Manager;
use uuid::Uuid;

// ─── Atomic global keystroke counter (incremented by WH_KEYBOARD_LL hook) ───
static GLOBAL_KEY_COUNT: std::sync::atomic::AtomicU32 =
    std::sync::atomic::AtomicU32::new(0);

// ─── App-level Tauri state ──────────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
pub struct ServerInfoPayload {
    pub ip: String,
    pub port: u16,
    pub token: String,
    pub expires_in_secs: i64,
    pub local_only: bool,
}

pub struct AppState {
    pub ip: std::sync::Arc<Mutex<Option<String>>>,
    pub port: std::sync::Arc<Mutex<Option<u16>>>,
    pub server_state: std::sync::Arc<Mutex<Option<std::sync::Arc<server::ServerState>>>>,
}

// ─── Existing Tauri commands ─────────────────────────────────────────────────

#[tauri::command]
fn get_server_info(state: tauri::State<'_, AppState>) -> Result<ServerInfoPayload, String> {
    let ip = state.ip.lock().unwrap().clone().ok_or("Server IP not set")?;
    let port = state.port.lock().unwrap().clone().ok_or("Server Port not set")?;
    let server_state_opt = state.server_state.lock().unwrap().clone();

    if let Some(server_state) = server_state_opt {
        let token = server_state.token.lock().unwrap().clone();
        let expires_at = *server_state.token_expires_at.lock().unwrap();
        let local_only = *server_state.local_only.lock().unwrap();

        let now = std::time::Instant::now();
        let expires_in_secs = if expires_at > now {
            (expires_at - now).as_secs() as i64
        } else {
            0
        };

        Ok(ServerInfoPayload {
            ip,
            port,
            token,
            expires_in_secs,
            local_only,
        })
    } else {
        Err("Server state not initialized".to_string())
    }
}

#[tauri::command]
fn refresh_server_token(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let server_state_opt = state.server_state.lock().unwrap().clone();
    if let Some(server_state) = server_state_opt {
        let mut token = server_state.token.lock().unwrap();
        let mut expires_at = server_state.token_expires_at.lock().unwrap();

        let new_token = Uuid::new_v4().to_string();
        *token = new_token.clone();
        *expires_at = std::time::Instant::now() + std::time::Duration::from_secs(300);

        println!("Tauri command: Refreshed session token to {}", new_token);
        Ok(new_token)
    } else {
        Err("Server not initialized".to_string())
    }
}

#[tauri::command]
fn toggle_local_only(state: tauri::State<'_, AppState>, local_only: bool) -> Result<(), String> {
    let server_state_opt = state.server_state.lock().unwrap().clone();
    if let Some(server_state) = server_state_opt {
        let mut local_only_lock = server_state.local_only.lock().unwrap();
        *local_only_lock = local_only;
        println!("Tauri command: Toggled local_only to {}", local_only);
        Ok(())
    } else {
        Err("Server not initialized".to_string())
    }
}

// ─── Native Telemetry: Global keyboard counter ──────────────────────────────

/// Return (and reset) the number of key-down events recorded system-wide
/// by the WH_KEYBOARD_LL hook since the last call.
/// This works even when a different application (VS Code, terminal, etc.) has focus.
#[tauri::command]
fn get_keyboard_telemetry() -> u32 {
    #[cfg(target_os = "windows")]
    {
        GLOBAL_KEY_COUNT.swap(0, std::sync::atomic::Ordering::Relaxed)
    }
    #[cfg(not(target_os = "windows"))]
    {
        0
    }
}

// ─── Native Telemetry: Foreground window tracker ─────────────────────────────

#[derive(Clone, serde::Serialize)]
pub struct ForegroundWindowInfo {
    pub title: String,
    pub process_name: String,
}

/// Return the title and process name of the currently focused foreground window.
/// Reads across the entire desktop, not just the Tauri webview.
#[tauri::command]
fn get_foreground_window() -> ForegroundWindowInfo {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
        };

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd == 0 {
                return ForegroundWindowInfo {
                    title: String::new(),
                    process_name: String::new(),
                };
            }

            // Window title
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            let title = if len > 0 {
                String::from_utf16_lossy(&buf[..len as usize])
            } else {
                String::new()
            };

            // Process name
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);

            let process_name = if pid != 0 {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if handle != 0 {
                    let mut name_buf = [0u16; 512];
                    let mut size: u32 = name_buf.len() as u32;
                    let ok = QueryFullProcessImageNameW(handle, 0, name_buf.as_mut_ptr(), &mut size);
                    CloseHandle(handle);
                    if ok != 0 && size > 0 {
                        let full = String::from_utf16_lossy(&name_buf[..size as usize]);
                        std::path::Path::new(&full)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_lowercase()
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            ForegroundWindowInfo { title, process_name }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        ForegroundWindowInfo {
            title: String::new(),
            process_name: String::new(),
        }
    }
}

// ─── Native Telemetry: GDI Screen Capture ────────────────────────────────────

#[derive(Debug, Clone)]
struct MonitorInfo {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn monitor_enum_proc(
    _hmonitor: windows_sys::Win32::Graphics::Gdi::HMONITOR,
    _hdc: windows_sys::Win32::Graphics::Gdi::HDC,
    rect: *mut windows_sys::Win32::Foundation::RECT,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::BOOL {
    let monitors = &mut *(lparam as *mut Vec<MonitorInfo>);
    if !rect.is_null() {
        let r = &*rect;
        monitors.push(MonitorInfo {
            left: r.left,
            top: r.top,
            width: r.right - r.left,
            height: r.bottom - r.top,
        });
    }
    1 // TRUE
}

/// Capture the specified monitor via GDI BitBlt, encode as JPEG, and return
/// a base64 data URL for the AI vision analysis pipeline.
/// Falls back with an error on non-Windows builds.
#[tauri::command]
fn capture_native_screen(monitor_index: Option<usize>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
            GetDC, GetDIBits, ReleaseDC, SelectObject,
            BI_RGB, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
            EnumDisplayMonitors,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetDesktopWindow, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
        };

        unsafe {
            // Enumerate monitors
            let mut monitors: Vec<MonitorInfo> = Vec::new();
            let ok = EnumDisplayMonitors(
                0,
                std::ptr::null(),
                Some(monitor_enum_proc),
                &mut monitors as *mut Vec<MonitorInfo> as isize,
            );

            let (left, top, width, height) = if ok != 0 && !monitors.is_empty() {
                let idx = monitor_index.unwrap_or(0);
                let m = if idx < monitors.len() {
                    &monitors[idx]
                } else {
                    &monitors[0]
                };
                (m.left, m.top, m.width, m.height)
            } else {
                // Fallback to primary screen metrics if enumeration fails
                let w = GetSystemMetrics(SM_CXSCREEN);
                let h = GetSystemMetrics(SM_CYSCREEN);
                (0, 0, w, h)
            };

            let desktop = GetDesktopWindow();
            let hdc_screen = GetDC(desktop);
            if hdc_screen == 0 {
                return Err("GetDC failed".to_string());
            }

            let hdc_mem = CreateCompatibleDC(hdc_screen);
            if hdc_mem == 0 {
                ReleaseDC(desktop, hdc_screen);
                return Err("CreateCompatibleDC failed".to_string());
            }

            let hbm = CreateCompatibleBitmap(hdc_screen, width, height);
            if hbm == 0 {
                DeleteDC(hdc_mem);
                ReleaseDC(desktop, hdc_screen);
                return Err("CreateCompatibleBitmap failed".to_string());
            }

            let old = SelectObject(hdc_mem, hbm);
            BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, left, top, SRCCOPY);
            SelectObject(hdc_mem, old);

            // Retrieve pixel data (BGR24, DWORD-aligned rows)
            let bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height, // top-down
                    biPlanes: 1,
                    biBitCount: 24,
                    biCompression: BI_RGB as u32,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [RGBQUAD { rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 }],
            };

            let row_bytes = ((width * 3 + 3) / 4) * 4; // DWORD-aligned stride
            let buf_size = (row_bytes * height) as usize;
            let mut pixel_buf: Vec<u8> = vec![0u8; buf_size];

            let scan_lines = GetDIBits(
                hdc_mem,
                hbm,
                0,
                height as u32,
                pixel_buf.as_mut_ptr() as *mut _,
                &bmi as *const _ as *mut _,
                DIB_RGB_COLORS,
            );

            DeleteObject(hbm);
            DeleteDC(hdc_mem);
            ReleaseDC(desktop, hdc_screen);

            if scan_lines == 0 {
                return Err("GetDIBits returned 0 scan lines".to_string());
            }

            // Convert BGR24 → RGB24 (GDI pixel order is BGR)
            let mut rgb_buf: Vec<u8> = Vec::with_capacity((width * height * 3) as usize);
            for row in 0..height as usize {
                let row_start = row * row_bytes as usize;
                for col in 0..width as usize {
                    let i = row_start + col * 3;
                    rgb_buf.push(pixel_buf[i + 2]); // R
                    rgb_buf.push(pixel_buf[i + 1]); // G
                    rgb_buf.push(pixel_buf[i]);     // B
                }
            }

            // Encode as JPEG at 75% quality
            let img = image::RgbImage::from_raw(width as u32, height as u32, rgb_buf)
                .ok_or("Failed to construct RgbImage from GDI pixel buffer")?;

            let mut jpeg_bytes: Vec<u8> = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
            img.write_to(&mut cursor, image::ImageFormat::Jpeg)
                .map_err(|e| format!("JPEG encoding error: {}", e))?;

            let b64 = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                &jpeg_bytes,
            );
            Ok(format!("data:image/jpeg;base64,{}", b64))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("capture_native_screen is only available on Windows".to_string())
    }
}

// ─── Win32 Low-Level Keyboard Hook ──────────────────────────────────────────

/// Spawn a dedicated thread that installs a WH_KEYBOARD_LL hook and runs its
/// own Win32 message loop. Every key-down event from any process increments
/// GLOBAL_KEY_COUNT so the AI panel can compute a true system-wide WPM.
#[cfg(target_os = "windows")]
fn install_global_keyboard_hook() {
    std::thread::spawn(|| {
        use windows_sys::Win32::Foundation::LPARAM;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW,
            TranslateMessage, UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT,
            MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
        };

        unsafe extern "system" fn kb_proc(
            n_code: i32,
            w_param: usize,
            l_param: LPARAM,
        ) -> LPARAM {
            if n_code == HC_ACTION as i32
                && (w_param == WM_KEYDOWN as usize || w_param == WM_SYSKEYDOWN as usize)
            {
                let _info = &*(l_param as *const KBDLLHOOKSTRUCT);
                GLOBAL_KEY_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
            CallNextHookEx(0, n_code, w_param, l_param)
        }

        unsafe {
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(kb_proc), 0, 0);
            if hook == 0 {
                eprintln!("[vr-desk] SetWindowsHookExW failed – falling back to browser-only key telemetry");
                return;
            }
            println!("[vr-desk] WH_KEYBOARD_LL global hook installed successfully");

            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, 0, 0, 0) != 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            UnhookWindowsHookEx(hook);
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn install_global_keyboard_hook() {}

// ─── Tauri Entry Point ───────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install system-wide keyboard hook before the Tauri event loop starts
    install_global_keyboard_hook();

    tauri::Builder::default()
        .manage(AppState {
            ip: std::sync::Arc::new(Mutex::new(None)),
            port: std::sync::Arc::new(Mutex::new(None)),
            server_state: std::sync::Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            refresh_server_token,
            toggle_local_only,
            get_keyboard_telemetry,
            get_foreground_window,
            capture_native_screen,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Generate initial pairing token
            let token = Uuid::new_v4().to_string();
            let token_for_adb = token.clone();

            let state = app.state::<AppState>();
            let ip_mutex = state.ip.clone();
            let port_mutex = state.port.clone();
            let server_state_mutex = state.server_state.clone();

            // Start Axum server in async task
            tauri::async_runtime::spawn(async move {
                match server::start_server(token).await {
                    Ok(info) => {
                        *ip_mutex.lock().unwrap() = Some(info.ip);
                        *port_mutex.lock().unwrap() = Some(info.port);
                        *server_state_mutex.lock().unwrap() = Some(info.state);
                    }
                    Err(e) => {
                        eprintln!("Failed to start companion server: {}", e);
                    }
                }
            });

            // ADB reverse-proxy background task for USB mode
            let port_mutex_for_adb = state.port.clone();
            tauri::async_runtime::spawn(async move {
                let mut opened_devices = std::collections::HashSet::<String>::new();
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                    let port = {
                        let lock = port_mutex_for_adb.lock().unwrap();
                        lock.clone()
                    };

                    if let Some(p) = port {
                        #[cfg(target_os = "windows")]
                        const CREATE_NO_WINDOW: u32 = 0x08000000;

                        // 1. Check for connected Android devices via ADB
                        let mut devices_cmd = std::process::Command::new("adb");
                        devices_cmd.arg("devices");
                        #[cfg(target_os = "windows")]
                        {
                            use std::os::windows::process::CommandExt;
                            devices_cmd.creation_flags(CREATE_NO_WINDOW);
                        }

                        let mut current_connected = std::collections::HashSet::new();
                        if let Ok(output) = devices_cmd.output() {
                            let stdout_str = String::from_utf8_lossy(&output.stdout);
                            for line in stdout_str.lines() {
                                let parts: Vec<&str> = line.split_whitespace().collect();
                                if parts.len() == 2 && parts[1] == "device" {
                                    current_connected.insert(parts[0].to_string());
                                }
                            }
                        }

                        // 2. Setup reverse port-forwarding and auto-launch for newly connected devices
                        for device_id in &current_connected {
                            // Run adb reverse for this specific device
                            let mut rev_cmd = std::process::Command::new("adb");
                            rev_cmd.args(&[
                                "-s",
                                device_id,
                                "reverse",
                                &format!("tcp:{}", p),
                                &format!("tcp:{}", p),
                            ]);
                            #[cfg(target_os = "windows")]
                            {
                                use std::os::windows::process::CommandExt;
                                rev_cmd.creation_flags(CREATE_NO_WINDOW);
                            }
                            let _ = rev_cmd.output();

                            // If we haven't opened the VR stream URL on this device yet, do it now
                            if !opened_devices.contains(device_id) {
                                println!("[vr-desk] USB device connected: {}. Auto-launching VR stream companion...", device_id);
                                let pairing_url = format!(
                                    "https://localhost:{}/mobile/test-xr/?token={}",
                                    p, token_for_adb
                                );

                                let mut launch_cmd = std::process::Command::new("adb");
                                launch_cmd.args(&[
                                    "-s",
                                    device_id,
                                    "shell",
                                    "am",
                                    "start",
                                    "-a",
                                    "android.intent.action.VIEW",
                                    "-d",
                                    &pairing_url,
                                ]);
                                #[cfg(target_os = "windows")]
                                {
                                    use std::os::windows::process::CommandExt;
                                    launch_cmd.creation_flags(CREATE_NO_WINDOW);
                                }
                                let _ = launch_cmd.output();

                                opened_devices.insert(device_id.clone());
                            }
                        }

                        // 3. Remove devices that have disconnected from our list
                        opened_devices.retain(|id| current_connected.contains(id));
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
