//! 下载 Cookie 管理——安全存储各视频平台的 Cookie（用于高级下载功能）.

use crate::credential_store::{CredentialBackend, CredentialBackendError, KeyringBackend};
use crate::domain::AppError;
use crate::services::download::VideoPlatform;
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tempfile::NamedTempFile;

/// DOWNLOAD COOKIE SERVICE
pub const DOWNLOAD_COOKIE_SERVICE: &str = "video-distiller-download-cookies-v1";
const MAX_COOKIE_LENGTH: usize = 32 * 1024;

/// DownloadCookieStore
pub struct DownloadCookieStore {
    backend: Box<dyn CredentialBackend>,
}

/// A task-owned Netscape cookie file. It is deleted when this guard is
/// dropped, including normal errors and cancellation unwinding.
pub struct TempCookieFile {
    file: NamedTempFile,
}

/// Task-scoped cookie representations. Native HTTP receives only the raw
/// single-line header while yt-dlp receives only the Netscape file path.
pub struct DownloadCookieMaterial {
    raw_header: Option<String>,
    netscape_file: Option<TempCookieFile>,
}

impl DownloadCookieMaterial {
    /// Raw single-line Cookie header for reqwest clients.
    pub fn raw_header(&self) -> Option<&str> {
        self.raw_header.as_deref()
    }

    /// Ephemeral Netscape file for yt-dlp. The file is removed on drop.
    pub fn netscape_file_path(&self) -> Option<&Path> {
        self.netscape_file.as_ref().map(TempCookieFile::path)
    }
}

/// Non-sensitive presence flags used to explain an incomplete Douyin
/// session without exposing any Cookie value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DouyinCookieFieldPresence {
    pub ms_token: bool,
    pub ttwid: bool,
    pub s_v_web_id: bool,
}

impl TempCookieFile {
    /// path
    pub fn path(&self) -> &Path {
        self.file.path()
    }
}

impl DownloadCookieStore {
    /// new
    pub fn new(backend: impl CredentialBackend + 'static) -> Self {
        Self {
            backend: Box::new(backend),
        }
    }

    /// new from box
    pub fn new_from_box(backend: Box<dyn CredentialBackend>) -> Self {
        Self { backend }
    }

    /// production
    pub fn production() -> Self {
        Self::new(KeyringBackend)
    }

    /// set
    pub fn set(&self, platform: VideoPlatform, cookie: &str) -> Result<(), AppError> {
        if cookie.trim().is_empty() || cookie.len() > MAX_COOKIE_LENGTH {
            return Err(AppError::new(
                "invalid_cookie",
                "Cookie 不能为空或过长。",
                "请粘贴有效的 Cookie。",
            ));
        }
        let normalized = normalize_stored_cookie(cookie)?.ok_or_else(invalid_cookie_error)?;
        self.backend
            .set_password(
                DOWNLOAD_COOKIE_SERVICE,
                &cookie_account(platform),
                &normalized,
            )
            .map_err(storage_error)
    }

    /// get
    pub fn get(&self, platform: VideoPlatform) -> Result<String, AppError> {
        self.backend
            .get_password(DOWNLOAD_COOKIE_SERVICE, &cookie_account(platform))
            .map_err(|error| match error {
                CredentialBackendError::NotFound => AppError::new(
                    "cookie_missing",
                    "未配置该平台的 Cookie。",
                    "可在设置中手动粘贴 Cookie 后重试。",
                ),
                CredentialBackendError::Other(_) => storage_error(error),
            })
    }

    /// Available only to task-local download/subtitle code. Settings screens
    /// must use `has`, so a saved value is never sent back to the frontend.
    pub fn get_optional(&self, platform: VideoPlatform) -> Result<Option<String>, AppError> {
        match self
            .backend
            .get_password(DOWNLOAD_COOKIE_SERVICE, &cookie_account(platform))
        {
            Ok(cookie) => normalize_stored_cookie(&cookie),
            Err(CredentialBackendError::NotFound) => Ok(None),
            Err(error) => Err(storage_error(error)),
        }
    }

    /// has
    pub fn has(&self, platform: VideoPlatform) -> Result<bool, AppError> {
        match self
            .backend
            .get_password(DOWNLOAD_COOKIE_SERVICE, &cookie_account(platform))
        {
            Ok(_) => Ok(true),
            Err(CredentialBackendError::NotFound) => Ok(false),
            Err(error) => Err(storage_error(error)),
        }
    }

    /// delete
    pub fn delete(&self, platform: VideoPlatform) -> Result<(), AppError> {
        match self
            .backend
            .delete_password(DOWNLOAD_COOKIE_SERVICE, &cookie_account(platform))
        {
            Ok(()) | Err(CredentialBackendError::NotFound) => Ok(()),
            Err(error) => Err(storage_error(error)),
        }
    }

    /// Convert a manually entered `name=value; name2=value2` Cookie string to
    /// an ephemeral Netscape file accepted by yt-dlp. The raw Cookie never
    /// appears in a command argument or an application error.
    pub fn write_netscape_cookie_file(
        &self,
        platform: VideoPlatform,
        work_dir: &Path,
    ) -> Result<Option<TempCookieFile>, AppError> {
        let Some(cookie) = self.get_optional(platform)? else {
            return Ok(None);
        };
        write_netscape_cookie_file_from_header(platform, work_dir, &cookie).map(Some)
    }

    /// Prepare both representations from one credential read so their types
    /// cannot be accidentally interchanged by the download command.
    pub fn prepare_download_cookie(
        &self,
        platform: VideoPlatform,
        work_dir: &Path,
    ) -> Result<DownloadCookieMaterial, AppError> {
        let raw_header = self.get_optional(platform)?;
        let netscape_file = raw_header
            .as_deref()
            .map(|header| write_netscape_cookie_file_from_header(platform, work_dir, header))
            .transpose()?;
        Ok(DownloadCookieMaterial {
            raw_header,
            netscape_file,
        })
    }
}

fn write_netscape_cookie_file_from_header(
    platform: VideoPlatform,
    work_dir: &Path,
    cookie: &str,
) -> Result<TempCookieFile, AppError> {
        std::fs::create_dir_all(work_dir).map_err(|_| {
            AppError::new(
                "cookie_file_error",
                "无法创建临时 Cookie 文件。",
                "请检查临时目录权限后重试。",
            )
        })?;
        let mut file = NamedTempFile::new_in(work_dir).map_err(|_| {
            AppError::new(
                "cookie_file_error",
                "无法创建临时 Cookie 文件。",
                "请检查临时目录权限后重试。",
            )
        })?;
        file.write_all(b"# Netscape HTTP Cookie File\n")
            .and_then(|_| {
                for (name, value) in parse_cookie_pairs(cookie) {
                    writeln!(
                        file,
                        "{}\tTRUE\t/\tTRUE\t0\t{}\t{}",
                        platform.cookie_domain(),
                        name,
                        value
                    )?;
                }
                file.flush()
            })
            .map_err(|_| {
                AppError::new(
                    "cookie_file_error",
                    "无法写入临时 Cookie 文件。",
                    "请检查临时目录权限后重试。",
                )
            })?;
        Ok(TempCookieFile { file })
}

impl VideoPlatform {
    fn cookie_domain(self) -> &'static str {
        match self {
            Self::Bilibili => ".bilibili.com",
            Self::Youtube => ".youtube.com",
            Self::Douyin => ".douyin.com",
        }
    }
}

fn cookie_account(platform: VideoPlatform) -> &'static str {
    match platform {
        VideoPlatform::Bilibili => "download-cookie:bilibili",
        VideoPlatform::Youtube => "download-cookie:youtube",
        VideoPlatform::Douyin => "download-cookie:douyin",
    }
}

fn parse_cookie_pairs(cookie: &str) -> Vec<(&str, &str)> {
    cookie
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .filter_map(|(name, value)| {
            let name = name.trim();
            let value = value.trim();
            (!name.is_empty()).then_some((name, value))
        })
        .collect()
}

fn invalid_cookie_error() -> AppError {
    AppError::new(
        "invalid_cookie",
        "Cookie 格式无效。",
        "请粘贴 name=value; name2=value2 格式的 Cookie。",
    )
}

fn normalize_stored_cookie(cookie: &str) -> Result<Option<String>, AppError> {
    if cookie.lines().any(|line| line.split('\t').count() >= 7)
        || cookie.trim_start().starts_with("# Netscape")
    {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        cookie_header_from_netscape(cookie, now)
    } else {
        normalize_raw_cookie_header(cookie)
    }
}

fn normalize_raw_cookie_header(cookie: &str) -> Result<Option<String>, AppError> {
    if cookie.chars().any(|character| matches!(character, '\r' | '\n' | '\t')) {
        return Err(invalid_cookie_error());
    }
    let pairs = parse_cookie_pairs(cookie)
        .into_iter()
        .map(|(name, value)| (name.to_string(), value.to_string()))
        .collect::<Vec<_>>();
    normalize_cookie_pairs(pairs)
}

fn cookie_header_from_netscape(
    contents: &str,
    now_epoch_seconds: u64,
) -> Result<Option<String>, AppError> {
    let mut pairs = Vec::new();
    for line in contents.lines() {
        let trimmed = line.trim_end_matches('\r');
        if trimmed.is_empty() || (trimmed.starts_with('#') && !trimmed.starts_with("#HttpOnly_")) {
            continue;
        }
        let fields = trimmed.split('\t').collect::<Vec<_>>();
        if fields.len() < 7 {
            continue;
        }
        let Ok(expires) = fields[4].parse::<u64>() else {
            continue;
        };
        if expires != 0 && expires <= now_epoch_seconds {
            continue;
        }
        pairs.push((fields[5].trim().to_string(), fields[6].trim().to_string()));
    }
    normalize_cookie_pairs(pairs)
}

fn normalize_cookie_pairs(pairs: Vec<(String, String)>) -> Result<Option<String>, AppError> {
    let mut positions = HashMap::<String, usize>::new();
    let mut normalized = Vec::<(String, String)>::new();
    for (name, value) in pairs {
        if name.is_empty()
            || name.chars().any(|character| {
                character.is_control() || character.is_whitespace() || matches!(character, '=' | ';')
            })
            || value.chars().any(|character| character.is_control())
        {
            continue;
        }
        if let Some(index) = positions.get(&name).copied() {
            normalized[index].1 = value;
        } else {
            positions.insert(name.clone(), normalized.len());
            normalized.push((name, value));
        }
    }
    if normalized.is_empty() {
        return Ok(None);
    }
    let header = normalized
        .into_iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");
    reqwest::header::HeaderValue::from_str(&header).map_err(|_| invalid_cookie_error())?;
    Ok(Some(header))
}

/// Inspect only field names; values are never returned or logged.
pub fn inspect_douyin_cookie_fields(header: &str) -> DouyinCookieFieldPresence {
    let names = parse_cookie_pairs(header)
        .into_iter()
        .map(|(name, _)| name)
        .collect::<Vec<_>>();
    DouyinCookieFieldPresence {
        ms_token: names.contains(&"msToken"),
        ttwid: names.contains(&"ttwid"),
        s_v_web_id: names.contains(&"s_v_web_id"),
    }
}

fn storage_error(_: CredentialBackendError) -> AppError {
    AppError::new(
        "cookie_storage_error",
        "Cookie 存储系统错误。",
        "请检查系统凭据管理器是否可用。",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_netscape_cookie_text_to_a_single_safe_header() {
        let source = concat!(
            "# Netscape HTTP Cookie File\n",
            "#HttpOnly_.douyin.com\tTRUE\t/\tTRUE\t0\tmsToken\ttest_token\n",
            ".douyin.com\tTRUE\t/\tTRUE\t0\tttwid\ttest_ttwid\n",
            "\n",
            ".douyin.com\tTRUE\t/\tTRUE\t4102444800\ts_v_web_id\tverify_test\n",
        );

        let header = cookie_header_from_netscape(source, 1_800_000_000)
            .expect("valid Netscape cookies should parse")
            .expect("at least one cookie should remain");

        assert_eq!(header, "msToken=test_token; ttwid=test_ttwid; s_v_web_id=verify_test");
        assert!(!header.contains(['\r', '\n', '\t']));
    }

    #[test]
    fn skips_expired_duplicate_and_malformed_netscape_entries() {
        let source = concat!(
            "# comment\n",
            ".douyin.com\tTRUE\t/\tTRUE\t100\texpired\told\n",
            "not-a-netscape-line\n",
            ".douyin.com\tTRUE\t/\tTRUE\t0\tttwid\tfirst\n",
            ".douyin.com\tTRUE\t/\tTRUE\t0\tttwid\tlatest\n",
            ".douyin.com\tTRUE\t/\tTRUE\t0\tempty\t\n",
        );

        let header = cookie_header_from_netscape(source, 200)
            .expect("malformed lines should not poison valid entries")
            .expect("valid entries should remain");

        assert_eq!(header, "ttwid=latest; empty=");
    }

    #[test]
    fn rejects_control_characters_in_a_raw_cookie_header() {
        let error = normalize_raw_cookie_header("msToken=test\r\nInjected: value")
            .expect_err("header injection must be rejected");

        assert_eq!(error.code, "invalid_cookie");
        assert!(!error.message.contains("test"));
    }

    #[test]
    fn reports_only_presence_of_required_douyin_cookie_fields() {
        let presence = inspect_douyin_cookie_fields(
            "msToken=test_token; ttwid=test_ttwid; s_v_web_id=verify_test",
        );

        assert!(presence.ms_token);
        assert!(presence.ttwid);
        assert!(presence.s_v_web_id);
    }
}
