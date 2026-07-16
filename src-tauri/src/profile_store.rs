// == Versioned Profile Store ================================================
//
// Atomic JSON persistence for AppProfiles. Produces version-1 defaults when
// the file is absent; validates before every write; uses a temporary sibling
// file flushed and synced before replacing the target.

use crate::domain::AppError;
use crate::profiles::AppProfiles;
use std::io::Write;
use std::path::PathBuf;

/// A file-backed store for provider profiles.
///
/// Construction:
/// ```ignore
/// let store = ProfileStore::new("profiles.json");
/// ```
///
/// On `load()`:
/// - File absent → returns version-1 defaults.
/// - File present with valid JSON → deserializes and returns.
/// - File present with malformed/invalid JSON → returns `AppError` with
///   code `profile_config_invalid`; the file is NOT overwritten.
///
/// On `save()`:
/// - Validates `AppProfiles` first. Returns `AppError` on validation failure.
/// - Writes pretty JSON to `profiles.json.tmp`, flushes and syncs the file,
///   then renames it over the target. On any failure, the original target
///   (if it existed) is left intact.
pub struct ProfileStore {
    path: PathBuf,
}

impl ProfileStore {
    /// Create a new `ProfileStore` bound to the given file path.
    ///
    /// The path must be in a directory that exists; `load()` and `save()`
    /// will return errors if the directory does not exist at call time.
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    /// Load profiles from the file, or return version-1 defaults.
    ///
    /// If the file does not exist, defaults are returned (the file is not
    /// created until `save()` is called).
    ///
    /// If the file exists but contains invalid JSON, an `AppError` with
    /// code `profile_config_invalid` is returned and the file is preserved.
    ///
    /// If the file exists with valid JSON but the profiles fail validation
    /// (e.g. unsupported schema version, invalid active/fallback references),
    /// an `AppError` with code `profile_config_invalid` is returned and the
    /// file is preserved unchanged.
    pub fn load(&self) -> Result<AppProfiles, AppError> {
        if !self.path.exists() {
            return Ok(AppProfiles::defaults());
        }

        let content = std::fs::read_to_string(&self.path).map_err(|e| {
            AppError::new(
                "profile_config_invalid",
                format!("无法读取配置文件: {}", e),
                "请检查配置文件权限。",
            )
        })?;

        let mut profiles = serde_json::from_str::<AppProfiles>(&content).map_err(|e| {
            AppError::new(
                "profile_config_invalid",
                format!("配置文件格式无效: {}", e),
                "请修正配置文件或删除后重新配置。",
            )
        })?;

        // Enforce supported schema version and validate the loaded content
        if profiles.schema_version != 1 {
            return Err(AppError::new(
                "profile_config_invalid",
                format!(
                    "不支持的配置架构版本: {}。预期版本: 1.",
                    profiles.schema_version
                ),
                "请使用当前版本的应用重新创建配置文件。",
            ));
        }

        profiles.validate().map_err(|e| {
            AppError::new(
                "profile_config_invalid",
                format!("配置文件内容无效: {}", e),
                "请修正配置文件中的引用或删除后重新配置。",
            )
        })?;

        if profiles.ensure_builtin_profiles() {
            self.save(&profiles)?;
        }

        Ok(profiles)
    }

    /// Save profiles atomically.
    ///
    /// 1. Validates the profiles.
    /// 2. Serializes to pretty JSON.
    /// 3. Writes to `{target}.tmp`, flushing and syncing the file.
    /// 4. Renames the temp file over the target (atomic on Windows when on
    ///    the same volume).
    ///
    /// Returns `AppError` if validation, serialization, or I/O fails.
    pub fn save(&self, profiles: &AppProfiles) -> Result<(), AppError> {
        // Validate first
        profiles.validate().map_err(|e| {
            AppError::new(
                "validation_error",
                format!("配置验证失败: {}", e),
                "请检查配置是否正确。",
            )
        })?;

        // Serialize to pretty JSON
        let json = serde_json::to_string_pretty(profiles).map_err(|e| {
            AppError::new(
                "serialization_error",
                format!("配置文件序列化失败: {}", e),
                "请重试。",
            )
        })?;

        // Write to a temporary sibling file
        let temp_path = self.path.with_extension("json.tmp");
        let mut file = std::fs::File::create(&temp_path).map_err(|e| {
            AppError::new(
                "io_error",
                format!("创建临时配置文件失败: {}", e),
                "请检查磁盘空间和权限。",
            )
        })?;

        file.write_all(json.as_bytes()).map_err(|e| {
            AppError::new(
                "io_error",
                format!("写入临时配置文件失败: {}", e),
                "请检查磁盘空间。",
            )
        })?;

        file.flush().map_err(|e| {
            AppError::new(
                "io_error",
                format!("刷新临时配置文件失败: {}", e),
                "请检查磁盘空间。",
            )
        })?;

        // On Windows, File::sync_all is needed for true durability.
        file.sync_all().map_err(|e| {
            AppError::new(
                "io_error",
                format!("同步临时配置文件失败: {}", e),
                "请检查磁盘状态。",
            )
        })?;

        // Rename (atomic on Windows within the same volume)
        std::fs::rename(&temp_path, &self.path).map_err(|e| {
            AppError::new(
                "io_error",
                format!("替换配置文件失败: {}", e),
                "请检查文件权限。",
            )
        })?;

        Ok(())
    }
}
