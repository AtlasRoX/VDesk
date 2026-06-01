use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use local_ip_address::local_ip;
use rcgen::generate_simple_self_signed;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Instant,
};
use tokio::sync::mpsc;
use tower_http::cors::CorsLayer;

pub type Tx = mpsc::UnboundedSender<Message>;

#[derive(Default)]
pub struct Session {
    pub desktop_tx: Option<Tx>,
    pub mobile_tx: Option<Tx>,
}

/// Per-IP PIN failure tracking: (failure_count, lockout_until)
pub type PinAttemptMap = HashMap<String, (u32, Instant)>;

pub struct ServerState {
    pub token: Mutex<String>,
    pub pin: Mutex<String>,
    pub token_expires_at: Mutex<Instant>,
    pub local_only: Mutex<bool>,
    pub sessions: Mutex<HashMap<String, Session>>,
    /// Brute-force guard: maps IP string → (consecutive_failures, lockout_until)
    pub pin_attempts: Mutex<PinAttemptMap>,
}

#[derive(Deserialize)]
pub struct SignalingParams {
    pub token: String,
    pub role: String, // "desktop" or "mobile"
}

#[derive(Deserialize)]
pub struct RegisterTrustPayload {
    pub client_id: String,
    pub device_name: String,
}

#[derive(Deserialize)]
pub struct CheckTrustParams {
    pub client_id: String,
}

#[derive(Serialize)]
pub struct TrustResponse {
    pub success: bool,
    pub token: Option<String>,
    pub reason: Option<String>,
    pub local_only: Option<bool>,
}

pub struct ServerInfo {
    pub ip: String,
    pub port: u16,
    pub state: Arc<ServerState>,
}

fn get_trusted_devices_filepath() -> std::path::PathBuf {
    let mut path = if let Ok(profile) = std::env::var("USERPROFILE") {
        std::path::PathBuf::from(profile)
    } else if let Ok(home) = std::env::var("HOME") {
        std::path::PathBuf::from(home)
    } else {
        std::path::PathBuf::from(".")
    };
    path.push(".vr_desk_trusted.json");
    path
}

async fn read_trusted_devices() -> Vec<String> {
    let path = get_trusted_devices_filepath();
    if let Ok(content) = tokio::fs::read_to_string(path).await {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(&content) {
            return list;
        }
    }
    Vec::new()
}

async fn write_trusted_devices(list: &Vec<String>) {
    let path = get_trusted_devices_filepath();
    if let Ok(content) = serde_json::to_string(list) {
        let _ = tokio::fs::write(path, content).await;
    }
}

async fn register_trust(
    State(state): State<Arc<ServerState>>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    axum::Json(payload): axum::Json<RegisterTrustPayload>,
) -> Response {
    let local_only = *state.local_only.lock().unwrap();
    if local_only && !addr.ip().is_loopback() {
        return (
            axum::http::StatusCode::FORBIDDEN,
            axum::Json(TrustResponse {
                success: false,
                token: None,
                reason: Some("Connections restricted to USB (localhost) loopback interface.".to_string()),
                local_only: Some(local_only),
            }),
        ).into_response();
    }

    let mut trusted = read_trusted_devices().await;
    let client_id = payload.client_id.trim().to_string();
    
    if !client_id.is_empty() && !trusted.contains(&client_id) {
        trusted.push(client_id);
        write_trusted_devices(&trusted).await;
        println!("Registered trusted client device ID: {} (Device: {})", payload.client_id, payload.device_name);
    }
    
    let current_token = state.token.lock().unwrap().clone();
    axum::Json(TrustResponse {
        success: true,
        token: Some(current_token),
        reason: None,
        local_only: Some(local_only),
    }).into_response()
}

async fn check_trust(
    State(state): State<Arc<ServerState>>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    Query(params): Query<CheckTrustParams>,
) -> Response {
    let local_only = *state.local_only.lock().unwrap();
    if local_only && !addr.ip().is_loopback() {
        return (
            axum::http::StatusCode::FORBIDDEN,
            axum::Json(TrustResponse {
                success: false,
                token: None,
                reason: Some("Connections restricted to USB (localhost) loopback interface.".to_string()),
                local_only: Some(local_only),
            }),
        ).into_response();
    }

    let trusted = read_trusted_devices().await;
    let client_id = params.client_id.trim().to_string();
    
    if trusted.contains(&client_id) {
        let current_token = state.token.lock().unwrap().clone();
        let expires_at = *state.token_expires_at.lock().unwrap();
        
        if std::time::Instant::now() > expires_at {
            return axum::Json(TrustResponse {
                success: false,
                token: None,
                reason: Some("Session pairing token has expired. Please refresh code on PC companion.".to_string()),
                local_only: Some(local_only),
            }).into_response();
        }

        axum::Json(TrustResponse {
            success: true,
            token: Some(current_token),
            reason: None,
            local_only: Some(local_only),
        }).into_response()
    } else {
        axum::Json(TrustResponse {
            success: false,
            token: None,
            reason: Some("Device not trusted. Please scan pairing QR code first.".to_string()),
            local_only: Some(local_only),
        }).into_response()
    }
}

#[derive(Deserialize)]
pub struct PairByPinPayload {
    pub pin: String,
    pub client_id: String,
    pub device_name: String,
}

async fn pair_by_pin(
    State(state): State<Arc<ServerState>>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    axum::Json(payload): axum::Json<PairByPinPayload>,
) -> Response {
    let local_only = *state.local_only.lock().unwrap();
    if local_only && !addr.ip().is_loopback() {
        return (
            axum::http::StatusCode::FORBIDDEN,
            axum::Json(TrustResponse {
                success: false,
                token: None,
                reason: Some("Connections restricted to USB (localhost) loopback interface.".to_string()),
                local_only: Some(local_only),
            }),
        ).into_response();
    }

    // ── Brute-force rate limit: 5 failures → 30-second lockout per source IP ──
    let ip_key = addr.ip().to_string();
    {
        let mut attempts = state.pin_attempts.lock().unwrap();
        let now = Instant::now();
        if let Some((count, lockout_until)) = attempts.get(&ip_key) {
            if *count >= 5 && now < *lockout_until {
                let secs_left = (*lockout_until - now).as_secs();
                return (
                    axum::http::StatusCode::TOO_MANY_REQUESTS,
                    axum::Json(TrustResponse {
                        success: false,
                        token: None,
                        reason: Some(format!(
                            "Too many incorrect PIN attempts. Try again in {} seconds.",
                            secs_left
                        )),
                        local_only: Some(local_only),
                    }),
                ).into_response();
            }
            // Lockout expired — clear the stale entry so the window resets
            if now >= *lockout_until {
                attempts.remove(&ip_key);
            }
        }
    }

    let active_pin = state.pin.lock().unwrap().clone();
    let expires_at = *state.token_expires_at.lock().unwrap();

    if Instant::now() > expires_at {
        return axum::Json(TrustResponse {
            success: false,
            token: None,
            reason: Some("Pairing PIN has expired. Please refresh the PIN code on your PC companion.".to_string()),
            local_only: Some(local_only),
        }).into_response();
    }

    if payload.pin.trim() == active_pin {
        // ── Success: clear failure counter for this IP ──
        state.pin_attempts.lock().unwrap().remove(&ip_key);

        // Register the client as trusted
        let mut trusted = read_trusted_devices().await;
        let client_id = payload.client_id.trim().to_string();
        if !client_id.is_empty() && !trusted.contains(&client_id) {
            trusted.push(client_id);
            write_trusted_devices(&trusted).await;
            println!("Registered trusted client device by PIN: {} (Device: {})", payload.client_id, payload.device_name);
        }

        let current_token = state.token.lock().unwrap().clone();
        axum::Json(TrustResponse {
            success: true,
            token: Some(current_token),
            reason: None,
            local_only: Some(local_only),
        }).into_response()
    } else {
        // ── Failure: increment counter; lock out after 5 attempts for 30 seconds ──
        {
            let mut attempts = state.pin_attempts.lock().unwrap();
            let entry = attempts.entry(ip_key.clone()).or_insert((0, Instant::now()));
            entry.0 += 1;
            if entry.0 >= 5 {
                entry.1 = Instant::now() + std::time::Duration::from_secs(30);
                println!("PIN brute-force guard: locking out {} for 30 seconds after {} failures", ip_key, entry.0);
            }
        }
        axum::Json(TrustResponse {
            success: false,
            token: None,
            reason: Some("Incorrect 6-digit security pairing PIN code.".to_string()),
            local_only: Some(local_only),
        }).into_response()
    }
}

#[derive(Deserialize)]
pub struct SettingsPayload {
    pub local_only: bool,
}

async fn update_settings(
    State(state): State<Arc<ServerState>>,
    axum::Json(payload): axum::Json<SettingsPayload>,
) -> impl IntoResponse {
    let mut local_only = state.local_only.lock().unwrap();
    *local_only = payload.local_only;
    println!("Server settings updated: local_only = {}", payload.local_only);
    axum::http::StatusCode::OK
}

async fn refresh_session(
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    let mut token = state.token.lock().unwrap();
    let mut pin = state.pin.lock().unwrap();
    let mut expires_at = state.token_expires_at.lock().unwrap();
    
    let new_token = uuid::Uuid::new_v4().to_string();
    *token = new_token.clone();
    
    let new_pin = {
        let u = uuid::Uuid::new_v4();
        let bytes = u.as_bytes();
        let num = ((bytes[0] as u32) << 16 | (bytes[1] as u32) << 8 | (bytes[2] as u32)) % 900_000 + 100_000;
        format!("{}", num)
    };
    *pin = new_pin.clone();
    
    *expires_at = Instant::now() + std::time::Duration::from_secs(300); // 5 mins
    
    println!("Session pairing token refreshed: {} (PIN: {})", new_token, new_pin);
    
    let local_only = *state.local_only.lock().unwrap();
    axum::Json(TrustResponse {
        success: true,
        token: Some(new_token),
        reason: Some(new_pin),
        local_only: Some(local_only),
    })
}

#[derive(Serialize)]
pub struct SessionStatus {
    pub token: String,
    pub pin: String,
    pub expires_in_secs: i64,
    pub local_only: bool,
    pub has_desktop: bool,
    pub has_mobile: bool,
}

async fn get_session_status(
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    let token = state.token.lock().unwrap().clone();
    let pin = state.pin.lock().unwrap().clone();
    let expires_at = *state.token_expires_at.lock().unwrap();
    let local_only = *state.local_only.lock().unwrap();
    
    let now = Instant::now();
    let expires_in_secs = if expires_at > now {
        (expires_at - now).as_secs() as i64
    } else {
        0
    };

    let sessions = state.sessions.lock().unwrap();
    let (has_desktop, has_mobile) = if let Some(session) = sessions.get(&token) {
        (session.desktop_tx.is_some(), session.mobile_tx.is_some())
    } else {
        (false, false)
    };

    axum::Json(SessionStatus {
        token,
        pin,
        expires_in_secs,
        local_only,
        has_desktop,
        has_mobile,
    })
}

fn generate_self_signed_cert(ip: &str) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    let subject_alt_names = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        ip.to_string(),
    ];
    let certified_key = generate_simple_self_signed(subject_alt_names)?;
    let cert_pem = certified_key.cert.pem();
    let key_pem = certified_key.key_pair.serialize_pem();
    Ok((cert_pem, key_pem))
}

pub async fn start_server(token: String) -> Result<ServerInfo, Box<dyn std::error::Error + Send + Sync>> {
    // 1. Discover local network IP
    let ip = match local_ip() {
        Ok(ip_addr) => ip_addr.to_string(),
        Err(e) => {
            eprintln!("Failed to get local IP, defaulting to localhost: {}", e);
            "127.0.0.1".to_string()
        }
    };

    // 2. Generate self-signed SSL/TLS certificate for secure WSS connection
    let (cert_pem, key_pem) = generate_self_signed_cert(&ip)?;
    let tls_config = axum_server::tls_rustls::RustlsConfig::from_pem(
        cert_pem.into_bytes(),
        key_pem.into_bytes(),
    )
    .await?;

    let initial_pin = {
        let u = uuid::Uuid::new_v4();
        let bytes = u.as_bytes();
        let num = ((bytes[0] as u32) << 16 | (bytes[1] as u32) << 8 | (bytes[2] as u32)) % 900_000 + 100_000;
        format!("{}", num)
    };
    println!("Session pairing 6-digit PIN generated: {}", initial_pin);

    // 3. Initialize Shared Server State
    let state = Arc::new(ServerState {
        token: Mutex::new(token.clone()),
        pin: Mutex::new(initial_pin),
        token_expires_at: Mutex::new(Instant::now() + std::time::Duration::from_secs(300)), // 5 mins
        local_only: Mutex::new(false),
        sessions: Mutex::new(HashMap::new()),
        pin_attempts: Mutex::new(HashMap::new()),
    });

    // 4. Setup Router with static file fallback serving from Next.js build
    let app = Router::new()
        .route("/ws/signaling", get(ws_handler))
        .route("/ping", get(|| async { "pong" }))
        .route("/api/register_trust", axum::routing::post(register_trust))
        .route("/api/pair_trusted", axum::routing::get(check_trust))
        .route("/api/pair_by_pin", axum::routing::post(pair_by_pin))
        .route("/api/session/settings", axum::routing::post(update_settings))
        .route("/api/session/refresh", axum::routing::post(refresh_session))
        .route("/api/session/status", axum::routing::get(get_session_status))
        .fallback_service(tower_http::services::ServeDir::new("../out"))
        .layer(CorsLayer::permissive())
        .with_state(state.clone());

    // 5. Start listening. Try default port 8080, fallback to dynamic available port (0) if in use
    let default_port = 8080;
    let addr = SocketAddr::from(([0, 0, 0, 0], default_port));
    
    let std_listener = match std::net::TcpListener::bind(addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Port {} is occupied ({}). Binding to dynamic fallback port...", default_port, e);
            std::net::TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], 0)))?
        }
    };
    
    let bound_addr = std_listener.local_addr()?;
    let port = bound_addr.port();
    
    // Spawn HTTPS / WSS server task
    let server_app = app.clone();
    
    let _server_task = tokio::spawn(async move {
        println!("Binding HTTPS/WSS server to {}", bound_addr);
        if let Err(e) = axum_server::from_tcp_rustls(std_listener, tls_config)
            .serve(server_app.into_make_service_with_connect_info::<SocketAddr>())
            .await
        {
            eprintln!("HTTPS server error: {}", e);
        }
    });

    println!("HTTPS server active at https://{}:{}", ip, port);

    Ok(ServerInfo { ip, port, state })
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<SignalingParams>,
    State(state): State<Arc<ServerState>>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    // 1. Check local_only mode
    let local_only = *state.local_only.lock().unwrap();
    if local_only && !addr.ip().is_loopback() {
        return axum::http::StatusCode::FORBIDDEN.into_response();
    }

    // 2. Check token validity and expiry
    let current_token = state.token.lock().unwrap().clone();
    let expires_at = *state.token_expires_at.lock().unwrap();
    
    if params.token != current_token || std::time::Instant::now() > expires_at {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    }

    // 3. For mobile connection, check if already paired and invalidate the token (one-time token)
    if params.role == "mobile" {
        let sessions = state.sessions.lock().unwrap();
        if let Some(session) = sessions.get(&params.token) {
            if session.mobile_tx.is_some() {
                return axum::http::StatusCode::CONFLICT.into_response();
            }
        }
        
        // Invalidate the token immediately for future connections (one-time use)
        let mut expires_lock = state.token_expires_at.lock().unwrap();
        *expires_lock = std::time::Instant::now();
        println!("Mobile connected. Session token invalidated for future pairings.");
    }

    ws.on_upgrade(move |socket| handle_socket(socket, params, state))
}

async fn handle_socket(socket: WebSocket, params: SignalingParams, state: Arc<ServerState>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register peer in the session
    {
        let mut sessions = state.sessions.lock().unwrap();
        let session = sessions.entry(params.token.clone()).or_default();
        
        if params.role == "desktop" {
            session.desktop_tx = Some(tx.clone());
            println!("Desktop connected to signaling session: {}", params.token);
            // If mobile is already connected, notify pairing
            if session.mobile_tx.is_some() {
                let _ = tx.send(Message::Text("{\"type\":\"system\",\"event\":\"paired\"}".into()));
                let _ = session.mobile_tx.as_ref().unwrap().send(Message::Text("{\"type\":\"system\",\"event\":\"paired\"}".into()));
            }
        } else if params.role == "mobile" {
            session.mobile_tx = Some(tx.clone());
            println!("Mobile connected to signaling session: {}", params.token);
            // If desktop is already connected, notify pairing
            if session.desktop_tx.is_some() {
                let _ = tx.send(Message::Text("{\"type\":\"system\",\"event\":\"paired\"}".into()));
                let _ = session.desktop_tx.as_ref().unwrap().send(Message::Text("{\"type\":\"system\",\"event\":\"paired\"}".into()));
            }
        }
    }

    // Task 1: Read from our internal channel (rx) and push to WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Task 2: Read from WebSocket and forward to the other peer
    let token = params.token.clone();
    let role = params.role.clone();
    let state_clone = state.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            let sessions = state_clone.sessions.lock().unwrap();
            if let Some(session) = sessions.get(&token) {
                if role == "desktop" {
                    if let Some(ref mobile) = session.mobile_tx {
                        let _ = mobile.send(msg);
                    }
                } else if role == "mobile" {
                    if let Some(ref desktop) = session.desktop_tx {
                        let _ = desktop.send(msg);
                    }
                }
            }
        }
    });

    // Wait until one of the tasks finishes (client disconnected)
    tokio::select! {
        _ = &mut send_task => {},
        _ = &mut recv_task => {},
    }

    // Cleanup session registration on disconnect
    {
        let mut sessions = state.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&params.token) {
            if params.role == "desktop" {
                session.desktop_tx = None;
                println!("Desktop disconnected from session: {}", params.token);
                if let Some(ref mobile) = session.mobile_tx {
                    let _ = mobile.send(Message::Text("{\"type\":\"system\",\"event\":\"unpaired\"}".into()));
                }
            } else if params.role == "mobile" {
                session.mobile_tx = None;
                println!("Mobile disconnected from session: {}", params.token);
                if let Some(ref desktop) = session.desktop_tx {
                    let _ = desktop.send(Message::Text("{\"type\":\"system\",\"event\":\"unpaired\"}".into()));
                }
            }

            // Remove session entirely if both peers are gone
            if session.desktop_tx.is_none() && session.mobile_tx.is_none() {
                sessions.remove(&params.token);
            }
        }
    }
}
