use tauri_plugin_window_state::StateFlags;

pub const SETTINGS_STORE: &str = "opencode.settings.dat";
pub const DEFAULT_SERVER_URL_KEY: &str = "defaultServerUrl";
pub const WSL_ENABLED_KEY: &str = "wslEnabled";
pub const SIDECAR_EXPOSE_LAN_KEY: &str = "sidecarExposeLan";
pub const SIDECAR_PORT_KEY: &str = "sidecarPort";
pub const SIDECAR_FIXED_TOKEN_DEFAULT_PASSWORD: &str = "123456";
pub const UPDATER_ENABLED: bool = option_env!("TAURI_SIGNING_PRIVATE_KEY").is_some();

pub fn window_state_flags() -> StateFlags {
    StateFlags::all() - StateFlags::DECORATIONS - StateFlags::VISIBLE
}
