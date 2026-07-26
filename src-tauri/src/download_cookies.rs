//! 下载 Cookie 管理——安全存储各视频平台的 Cookie（用于高级下载功能）.

use crate::credential_store::{CredentialBackend, CredentialBackendError, KeyringBackend};
use crate::domain::AppError;
use crate::services::download::VideoPlatform;
use std::io::Write;
use std::path::Path;
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
        if cookie.trim().is_empty()
            || cookie.len() > MAX_COOKIE_LENGTH
            || parse_cookie_pairs(cookie).is_empty()
        {
            return Err(AppError::new(
                "invalid_cookie",
                "Cookie 不能为空或过长。",
                "请粘贴有效的 Cookie。",
            ));
        }
        self.backend
            .set_password(DOWNLOAD_COOKIE_SERVICE, &cookie_account(platform), cookie)
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
            Ok(cookie) => Ok(Some(cookie)),
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
        let cookie = match self
            .backend
            .get_password(DOWNLOAD_COOKIE_SERVICE, &cookie_account(platform))
        {
            Ok(cookie) => cookie,
            Err(CredentialBackendError::NotFound) => return Ok(None),
            Err(error) => return Err(storage_error(error)),
        };
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
                for (name, value) in parse_cookie_pairs(&cookie) {
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
        Ok(Some(TempCookieFile { file }))
    }
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
            (!name.is_empty() && !value.is_empty()).then_some((name, value))
        })
        .collect()
}

fn storage_error(_: CredentialBackendError) -> AppError {
    AppError::new(
        "cookie_storage_error",
        "Cookie 存储系统错误。",
        "请检查系统凭据管理器是否可用。",
    )
}
