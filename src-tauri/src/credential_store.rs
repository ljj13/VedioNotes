//! 凭据存储——使用操作系统安全存储（Tauri Stronghold）保存 API Key.
//! 前端只能查询"有无"，不能读取内容.

use crate::domain::AppError;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Service name used for all profile credential entries in the credential manager.
pub const CREDENTIAL_SERVICE: &str = "video-distiller-profiles-v1";

/// Maximum length for profile_type and profile_id validation.
const MAX_ID_LENGTH: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// CapabilityKind
pub enum CapabilityKind {
    Vector,
    Rerank,
    WebSearch,
    Tts,
    Image,
    LocalAgent,
}

impl CapabilityKind {
    /// fn
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Vector => "vector",
            Self::Rerank => "rerank",
            Self::WebSearch => "web-search",
            Self::Tts => "tts",
            Self::Image => "image",
            Self::LocalAgent => "local-agent",
        }
    }
}

// ---------------------------------------------------------------------------
// Secret payload types
// ---------------------------------------------------------------------------

/// The type of secret stored for a profile.
///
/// - `Bearer`: single API key (MiMo, DeepSeek, OpenAI-compatible).
/// - `Tencent`: multi-field Tencent Cloud credentials.
///
/// The `Debug` implementation always redacts secret values.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
/// SecretPayload
pub enum SecretPayload {
    Bearer {
        /// The API key / bearer token.
        api_key: String,
    },
    Tencent {
        /// Tencent Cloud App ID.
        app_id: String,
        /// Tencent Cloud Secret ID.
        secret_id: String,
        /// Tencent Cloud Secret Key.
        secret_key: String,
    },
}

impl std::fmt::Debug for SecretPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Bearer { .. } => f
                .debug_struct("Bearer")
                .field("api_key", &"[redacted]")
                .finish(),
            Self::Tencent { app_id, .. } => f
                .debug_struct("Tencent")
                .field("app_id", &app_id)
                .field("secret_id", &"[redacted]")
                .field("secret_key", &"[redacted]")
                .finish(),
        }
    }
}

impl SecretPayload {
    /// Return a copy of this payload with all secret values replaced by
    /// `"[redacted]"`. The variant and non-sensitive fields (e.g. `app_id`)
    /// are preserved.
    pub fn redacted(&self) -> Self {
        match self {
            Self::Bearer { .. } => Self::Bearer {
                api_key: "[redacted]".into(),
            },
            Self::Tencent { app_id, .. } => Self::Tencent {
                app_id: app_id.clone(),
                secret_id: "[redacted]".into(),
                secret_key: "[redacted]".into(),
            },
        }
    }
}

impl std::fmt::Display for SecretPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Bearer { .. } => write!(f, "Bearer {{ api_key: [redacted] }}"),
            Self::Tencent { app_id, .. } => {
                write!(
                    f,
                    "Tencent {{ app_id: {}, secret_id: [redacted], secret_key: [redacted] }}",
                    app_id
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Credential backend error type
// ---------------------------------------------------------------------------

/// Typed error for credential backend operations.
///
/// - `NotFound`: The credential does not exist (idempotent on delete, absence on has/get).
/// - `Other`: A system/backend failure that must be surfaced rather than hidden.
#[derive(Debug, Clone, PartialEq, Eq)]
/// CredentialBackendError
pub enum CredentialBackendError {
    NotFound,
    Other(String),
}

impl std::fmt::Display for CredentialBackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "credential not found"),
            Self::Other(_) => write!(f, "credential backend error"),
        }
    }
}

// ---------------------------------------------------------------------------
// Credential backend trait
// ---------------------------------------------------------------------------

/// Abstraction over credential storage backends.
///
/// Production: `keyring::Entry` wrapping Windows Credential Manager.
/// Test: `InMemoryBackend` (in-memory HashMap).
pub trait CredentialBackend: Send + Sync {
    /// Store a password string.
    fn set_password(
        &self,
        service: &str,
        account: &str,
        password: &str,
    ) -> Result<(), CredentialBackendError>;
    /// Retrieve a password string. Returns `Err(NotFound)` if not found.
    fn get_password(&self, service: &str, account: &str) -> Result<String, CredentialBackendError>;
    /// Delete a stored credential. Returns `Err(NotFound)` if no credential exists.
    fn delete_password(&self, service: &str, account: &str) -> Result<(), CredentialBackendError>;
    /// Clone this backend into a new box. Used by `ManagedServices` to create
    /// independent `CredentialStore` instances that share the same backend logic.
    fn make_clone_box(&self) -> Box<dyn CredentialBackend>;
}

// ---------------------------------------------------------------------------
// In-memory backend (for tests)
// ---------------------------------------------------------------------------

/// An in-memory credential backend for testing. Never writes to the real
/// credential manager.
#[derive(Debug, Default, Clone)]
/// InMemoryBackend
pub struct InMemoryBackend {
    store: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, String>>>,
}

impl InMemoryBackend {
    /// new
    pub fn new() -> Self {
        Self::default()
    }

    /// Store an arbitrary value without serialization. Used to simulate
    /// a malformed stored secret in tests.
    pub fn store_raw(&mut self, key: &str) -> Result<(), CredentialBackendError> {
        let mut store = self
            .store
            .lock()
            .map_err(|e| CredentialBackendError::Other(e.to_string()))?;
        store.insert(
            key.to_string(),
            "this-is-sensitive-stored-data-that-should-not-leak".into(),
        );
        Ok(())
    }
}

impl CredentialBackend for InMemoryBackend {
    fn set_password(
        &self,
        _service: &str,
        account: &str,
        password: &str,
    ) -> Result<(), CredentialBackendError> {
        let mut store = self
            .store
            .lock()
            .map_err(|e| CredentialBackendError::Other(e.to_string()))?;
        store.insert(account.to_string(), password.to_string());
        Ok(())
    }

    fn get_password(
        &self,
        _service: &str,
        account: &str,
    ) -> Result<String, CredentialBackendError> {
        let store = self
            .store
            .lock()
            .map_err(|e| CredentialBackendError::Other(e.to_string()))?;
        store
            .get(account)
            .cloned()
            .ok_or(CredentialBackendError::NotFound)
    }

    fn delete_password(&self, _service: &str, account: &str) -> Result<(), CredentialBackendError> {
        let mut store = self
            .store
            .lock()
            .map_err(|e| CredentialBackendError::Other(e.to_string()))?;
        if store.remove(account).is_some() {
            Ok(())
        } else {
            Err(CredentialBackendError::NotFound)
        }
    }

    fn make_clone_box(&self) -> Box<dyn CredentialBackend> {
        Box::new(Self {
            store: Arc::clone(&self.store),
        })
    }
}

// ---------------------------------------------------------------------------
// Keyring backend (production)
// ---------------------------------------------------------------------------

/// Production credential backend wrapping `keyring::Entry`.
pub struct KeyringBackend;

impl CredentialBackend for KeyringBackend {
    fn set_password(
        &self,
        service: &str,
        account: &str,
        password: &str,
    ) -> Result<(), CredentialBackendError> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|e| CredentialBackendError::Other(e.to_string()))?;
        entry
            .set_password(password)
            .map_err(|e| map_keyring_error(e))
    }

    fn get_password(&self, service: &str, account: &str) -> Result<String, CredentialBackendError> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|e| CredentialBackendError::Other(e.to_string()))?;
        entry.get_password().map_err(|e| map_keyring_error(e))
    }

    fn delete_password(&self, service: &str, account: &str) -> Result<(), CredentialBackendError> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|e| CredentialBackendError::Other(e.to_string()))?;
        entry.delete_credential().map_err(|e| map_keyring_error(e))
    }

    fn make_clone_box(&self) -> Box<dyn CredentialBackend> {
        Box::new(KeyringBackend)
    }
}

/// Map a `keyring::Error` to our typed `CredentialBackendError`.
/// `NoEntry` becomes `NotFound`; all other errors become `Other`
/// without embedding the stored credential value in the error text.
fn map_keyring_error(e: keyring::Error) -> CredentialBackendError {
    match e {
        keyring::Error::NoEntry => CredentialBackendError::NotFound,
        _ => CredentialBackendError::Other("credential backend error".into()),
    }
}

// ---------------------------------------------------------------------------
// CredentialStore
// ---------------------------------------------------------------------------

/// High-level credential store wrapping a `CredentialBackend`.
///
/// Each credential is stored under the service name `video-distiller-profiles-v1`
/// and account name `<profile_type>:<profile_id>`.
pub struct CredentialStore {
    backend: Box<dyn CredentialBackend>,
}

impl CredentialStore {
    /// Create a new `CredentialStore` using the given backend.
    pub fn new(backend: impl CredentialBackend + 'static) -> Self {
        Self {
            backend: Box::new(backend),
        }
    }

    /// Create a new `CredentialStore` from an already-boxed backend.
    pub fn new_from_box(backend: Box<dyn CredentialBackend>) -> Self {
        Self { backend }
    }

    /// set capability
    pub fn set_capability(
        &self,
        kind: CapabilityKind,
        provider_id: &str,
        payload: &SecretPayload,
    ) -> Result<(), AppError> {
        self.set(&format!("capability:{}", kind.as_str()), provider_id, payload)
    }

    /// get capability
    pub fn get_capability(
        &self,
        kind: CapabilityKind,
        provider_id: &str,
    ) -> Result<SecretPayload, AppError> {
        self.get(&format!("capability:{}", kind.as_str()), provider_id)
    }

    /// has capability
    pub fn has_capability(
        &self,
        kind: CapabilityKind,
        provider_id: &str,
    ) -> Result<bool, AppError> {
        self.has(&format!("capability:{}", kind.as_str()), provider_id)
    }

    /// delete capability
    pub fn delete_capability(
        &self,
        kind: CapabilityKind,
        provider_id: &str,
    ) -> Result<(), AppError> {
        self.delete(&format!("capability:{}", kind.as_str()), provider_id)
    }

    /// Set a credential for the given profile type and ID.
    ///
    /// Validates that `profile_type` and `profile_id` are non-empty and
    /// within reasonable length, serializes the payload as JSON, and
    /// stores it via the backend.
    pub fn set(
        &self,
        profile_type: &str,
        profile_id: &str,
        payload: &SecretPayload,
    ) -> Result<(), AppError> {
        validate_key(profile_type, profile_id)?;
        let account = credential_account(profile_type, profile_id);
        let json = serde_json::to_string(payload).map_err(|e| {
            AppError::new(
                "credential_serialization_error",
                format!("凭据序列化失败: {}", e),
                "请重试。",
            )
        })?;
        self.backend
            .set_password(CREDENTIAL_SERVICE, &account, &json)
            .map_err(|e| {
                AppError::new(
                    "credential_error",
                    format!("保存凭据失败: {}", e),
                    "请检查系统凭据管理器是否可用。",
                )
            })
    }

    /// Get a credential for the given profile type and ID.
    ///
    /// Returns `AppError` with code `credential_missing` when no credential
    /// is stored, or `credential_invalid` when the stored value is
    /// malformed JSON. The stored value is never included in the error.
    /// Returns `credential_error` for backend/system failures.
    pub fn get(&self, profile_type: &str, profile_id: &str) -> Result<SecretPayload, AppError> {
        validate_key(profile_type, profile_id)?;
        let account = credential_account(profile_type, profile_id);
        let json = self
            .backend
            .get_password(CREDENTIAL_SERVICE, &account)
            .map_err(|e| match e {
                CredentialBackendError::NotFound => AppError::new(
                    "credential_missing",
                    "未找到凭据。",
                    "请先在设置中配置该配置档的凭据。",
                ),
                CredentialBackendError::Other(_) => AppError::new(
                    "credential_error",
                    "凭据存储系统错误。",
                    "请检查系统凭据管理器是否可用。",
                ),
            })?;
        serde_json::from_str::<SecretPayload>(&json).map_err(|_| {
            AppError::new(
                "credential_invalid",
                "存储的凭据格式无效，可能需要重新配置。",
                "请删除该凭据后重新保存。",
            )
        })
    }

    /// Delete a credential for the given profile type and ID.
    ///
    /// Returns `Ok(())` if the credential was deleted or did not exist.
    /// Returns `credential_error` for backend/system failures.
    pub fn delete(&self, profile_type: &str, profile_id: &str) -> Result<(), AppError> {
        validate_key(profile_type, profile_id)?;
        let account = credential_account(profile_type, profile_id);
        match self.backend.delete_password(CREDENTIAL_SERVICE, &account) {
            Ok(()) => Ok(()),
            Err(CredentialBackendError::NotFound) => Ok(()),
            Err(CredentialBackendError::Other(_)) => Err(AppError::new(
                "credential_error",
                "删除凭据时系统错误。",
                "请检查系统凭据管理器是否可用。",
            )),
        }
    }

    /// Check whether a credential exists for the given profile type and ID.
    ///
    /// Returns `Ok(false)` when no credential is stored.
    /// Returns `Ok(true)` when a credential exists.
    /// Returns `credential_error` for backend/system failures.
    pub fn has(&self, profile_type: &str, profile_id: &str) -> Result<bool, AppError> {
        validate_key(profile_type, profile_id)?;
        let account = credential_account(profile_type, profile_id);
        match self.backend.get_password(CREDENTIAL_SERVICE, &account) {
            Ok(_) => Ok(true),
            Err(CredentialBackendError::NotFound) => Ok(false),
            Err(CredentialBackendError::Other(_)) => Err(AppError::new(
                "credential_error",
                "检查凭据时系统错误。",
                "请检查系统凭据管理器是否可用。",
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/// Build the Credential Manager account name for a profile.
///
/// Format: `<profile_type>:<profile_id>`
pub fn credential_account(profile_type: &str, profile_id: &str) -> String {
    format!("{}:{}", profile_type, profile_id)
}

/// capability account
pub fn capability_account(
    kind: CapabilityKind,
    provider_id: &str,
) -> Result<String, AppError> {
    validate_key(&format!("capability:{}", kind.as_str()), provider_id)?;
    Ok(credential_account(
        &format!("capability:{}", kind.as_str()),
        provider_id,
    ))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Validate that `profile_type` and `profile_id` are non-empty and
/// within reasonable length.
fn validate_key(profile_type: &str, profile_id: &str) -> Result<(), AppError> {
    if profile_type.trim().is_empty() {
        return Err(AppError::new(
            "invalid_profile_type",
            "配置档类型不能为空。",
            "请指定有效的配置档类型。",
        ));
    }
    if profile_type.len() > MAX_ID_LENGTH {
        return Err(AppError::new(
            "invalid_profile_type",
            "配置档类型过长。",
            "配置档类型不能超过 128 个字符。",
        ));
    }
    if profile_id.trim().is_empty() {
        return Err(AppError::new(
            "invalid_profile_id",
            "配置档 ID 不能为空。",
            "请指定有效的配置档 ID。",
        ));
    }
    if profile_id.len() > MAX_ID_LENGTH {
        return Err(AppError::new(
            "invalid_profile_id",
            "配置档 ID 过长。",
            "配置档 ID 不能超过 128 个字符。",
        ));
    }
    Ok(())
}
