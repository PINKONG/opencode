use std::net::UdpSocket;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::constants::{
    SETTINGS_STORE, SIDECAR_EXPOSE_LAN_KEY, SIDECAR_PERSISTENT_PASSWORD_KEY, SIDECAR_PORT_KEY,
};

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SidecarLanConfig {
    pub enabled: bool,
    pub address_mode: SidecarLanAddressMode,
    pub custom_address: String,
    pub fixed_port: Option<u32>,
    pub fixed_token: bool,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SidecarLanAddressMode {
    Lan,
    Custom,
}

pub struct SidecarHosts {
    pub bind_host: String,
    pub advertise_host: String,
    pub health_host: String,
}

fn parse_port(value: Option<&serde_json::Value>) -> Option<u32> {
    value.and_then(|v| v.as_u64()).and_then(|v| {
        if (1..=65535).contains(&v) {
            Some(v as u32)
        } else {
            None
        }
    })
}

fn normalize_config(value: Option<&serde_json::Value>, fixed_port: Option<u32>) -> SidecarLanConfig {
    let Some(value) = value else {
        return SidecarLanConfig {
            enabled: false,
            address_mode: SidecarLanAddressMode::Lan,
            custom_address: String::new(),
            fixed_port,
            fixed_token: false,
        };
    };

    if let Some(enabled) = value.as_bool() {
        return SidecarLanConfig {
            enabled,
            address_mode: SidecarLanAddressMode::Lan,
            custom_address: String::new(),
            fixed_port,
            fixed_token: false,
        };
    }

    let Some(obj) = value.as_object() else {
        return SidecarLanConfig {
            enabled: false,
            address_mode: SidecarLanAddressMode::Lan,
            custom_address: String::new(),
            fixed_port,
            fixed_token: false,
        };
    };

    let enabled = obj
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let custom_address = obj
        .get("customAddress")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let address_mode = if obj
        .get("addressMode")
        .and_then(|v| v.as_str())
        .is_some_and(|v| v == "custom")
        && !custom_address.is_empty()
    {
        SidecarLanAddressMode::Custom
    } else {
        SidecarLanAddressMode::Lan
    };
    let fixed_token = obj
        .get("fixedToken")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    SidecarLanConfig {
        enabled,
        address_mode: address_mode.clone(),
        custom_address: if address_mode == SidecarLanAddressMode::Custom {
            custom_address
        } else {
            String::new()
        },
        fixed_port,
        fixed_token,
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_sidecar_lan_config(app: AppHandle) -> Result<SidecarLanConfig, String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;
    let fixed_port = parse_port(store.get(SIDECAR_PORT_KEY).as_ref());
    Ok(normalize_config(
        store.get(SIDECAR_EXPOSE_LAN_KEY).as_ref(),
        fixed_port,
    ))
}

#[tauri::command]
#[specta::specta]
pub fn set_sidecar_lan_config(app: AppHandle, config: SidecarLanConfig) -> Result<(), String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;
    store.set(
        SIDECAR_EXPOSE_LAN_KEY,
        serde_json::json!({
            "enabled": config.enabled,
            "addressMode": if matches!(config.address_mode, SidecarLanAddressMode::Custom) { "custom" } else { "lan" },
            "customAddress": config.custom_address.trim(),
            "fixedToken": config.fixed_token,
        }),
    );

    if let Some(port) = config.fixed_port.filter(|port| (1..=65535).contains(port)) {
        store.set(SIDECAR_PORT_KEY, serde_json::json!(port));
    } else {
        store.delete(SIDECAR_PORT_KEY);
    }

    store
        .save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;
    Ok(())
}

pub fn resolve_configured_port(config: &SidecarLanConfig) -> Option<u32> {
    config.fixed_port.filter(|port| (1..=65535).contains(port))
}

pub fn get_or_create_persistent_password(app: AppHandle) -> Result<String, String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;
    if let Some(existing) = store
        .get(SIDECAR_PERSISTENT_PASSWORD_KEY)
        .and_then(|v| v.as_str().map(|v| v.trim().to_string()))
        .filter(|v| !v.is_empty())
    {
        return Ok(existing);
    }
    let next = uuid::Uuid::new_v4().to_string();
    store.set(
        SIDECAR_PERSISTENT_PASSWORD_KEY,
        serde_json::json!(next.clone()),
    );
    store
        .save()
        .map_err(|e| format!("Failed to save settings: {}", e))?;
    Ok(next)
}

pub fn resolve_sidecar_hosts(config: &SidecarLanConfig) -> SidecarHosts {
    if !config.enabled {
        return SidecarHosts {
            bind_host: "127.0.0.1".to_string(),
            advertise_host: "127.0.0.1".to_string(),
            health_host: "127.0.0.1".to_string(),
        };
    }

    let auto = detect_lan_ipv4().unwrap_or_else(|| "127.0.0.1".to_string());
    let preferred = if config.address_mode == SidecarLanAddressMode::Custom {
        let candidate = config.custom_address.trim();
        // Tauri/Rust path currently derives a single LAN IP via UDP route probing instead of
        // enumerating all interfaces. We only accept customAddress when it matches the probed
        // address; otherwise we fall back to auto to avoid advertising an unreachable IP.
        if !candidate.is_empty() && candidate == auto {
            candidate.to_string()
        } else {
            auto.clone()
        }
    } else {
        auto.clone()
    };

    SidecarHosts {
        bind_host: "0.0.0.0".to_string(),
        advertise_host: preferred,
        health_host: "127.0.0.1".to_string(),
    }
}

fn detect_lan_ipv4() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    match addr.ip() {
        std::net::IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_unspecified() => Some(v4.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_bool_legacy_config() {
        let input = serde_json::json!(true);
        let config = normalize_config(Some(&input), None);
        assert!(config.enabled);
        assert!(matches!(config.address_mode, SidecarLanAddressMode::Lan));
        assert_eq!(config.custom_address, "");
        assert!(!config.fixed_token);
    }

    #[test]
    fn custom_mode_requires_nonempty_address() {
        let input = serde_json::json!({
            "enabled": true,
            "addressMode": "custom",
            "customAddress": "   ",
        });
        let config = normalize_config(Some(&input), None);
        assert!(matches!(config.address_mode, SidecarLanAddressMode::Lan));
        assert!(!config.fixed_token);
    }

    #[test]
    fn parse_fixed_token_config() {
        let input = serde_json::json!({
            "enabled": true,
            "addressMode": "lan",
            "fixedToken": true,
        });
        let config = normalize_config(Some(&input), None);
        assert!(config.fixed_token);
    }

    #[test]
    fn resolve_hosts_defaults_to_loopback_when_disabled() {
        let config = SidecarLanConfig {
            enabled: false,
            address_mode: SidecarLanAddressMode::Lan,
            custom_address: String::new(),
            fixed_port: None,
            fixed_token: false,
        };
        let hosts = resolve_sidecar_hosts(&config);
        assert_eq!(hosts.bind_host, "127.0.0.1");
        assert_eq!(hosts.advertise_host, "127.0.0.1");
    }
}
