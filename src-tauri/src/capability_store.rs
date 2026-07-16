use crate::domain::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use url::Url;

const SCHEMA_VERSION: u32 = 1;
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VectorConfig {
    pub enabled: bool,
    pub provider_id: String,
    pub endpoint: String,
    pub model: String,
    pub collection: String,
    pub dimensions: Option<u32>,
}

impl Default for VectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_id: "vector-default".into(),
            endpoint: String::new(),
            model: String::new(),
            collection: "notes".into(),
            dimensions: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RerankConfig {
    pub enabled: bool,
    pub provider_id: String,
    pub endpoint: String,
    pub model: String,
}

impl Default for RerankConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_id: "rerank-default".into(),
            endpoint: String::new(),
            model: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchConfig {
    pub enabled: bool,
    pub provider_id: String,
    pub endpoint: String,
    pub max_results: u8,
}

impl Default for WebSearchConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_id: "web-search-default".into(),
            endpoint: String::new(),
            max_results: 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TtsConfig {
    pub enabled: bool,
    pub provider_id: String,
    pub endpoint: String,
    pub model: String,
    pub voice: String,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_id: "tts-default".into(),
            endpoint: String::new(),
            model: String::new(),
            voice: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageConfig {
    pub enabled: bool,
    pub provider_id: String,
    pub endpoint: String,
    pub model: String,
    pub size: String,
}

impl Default for ImageConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_id: "image-default".into(),
            endpoint: String::new(),
            model: String::new(),
            size: "1024x1024".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentConfig {
    pub enabled: bool,
    pub provider_id: String,
    pub executable: String,
    pub arguments: Vec<String>,
    pub timeout_seconds: u64,
}

impl Default for LocalAgentConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_id: "local-agent-default".into(),
            executable: String::new(),
            arguments: Vec::new(),
            timeout_seconds: 120,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilitySettings {
    pub schema_version: u32,
    #[serde(default)]
    pub vector: VectorConfig,
    #[serde(default)]
    pub rerank: RerankConfig,
    #[serde(default)]
    pub web_search: WebSearchConfig,
    #[serde(default)]
    pub tts: TtsConfig,
    #[serde(default)]
    pub image: ImageConfig,
    #[serde(default)]
    pub local_agent: LocalAgentConfig,
}

impl Default for CapabilitySettings {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            vector: VectorConfig::default(),
            rerank: RerankConfig::default(),
            web_search: WebSearchConfig::default(),
            tts: TtsConfig::default(),
            image: ImageConfig::default(),
            local_agent: LocalAgentConfig::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct CapabilityStore {
    path: PathBuf,
}

impl CapabilityStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn load(&self) -> Result<CapabilitySettings, AppError> {
        if !self.path.exists() {
            return Ok(CapabilitySettings::default());
        }
        let metadata = std::fs::metadata(&self.path).map_err(store_io_error)?;
        if metadata.len() > MAX_CONFIG_BYTES {
            return Err(store_corrupt());
        }
        let bytes = std::fs::read(&self.path).map_err(store_io_error)?;
        let settings: CapabilitySettings =
            serde_json::from_slice(&bytes).map_err(|_| store_corrupt())?;
        validate_settings(&settings)?;
        Ok(settings)
    }

    pub fn save(&self, settings: &CapabilitySettings) -> Result<(), AppError> {
        validate_settings(settings)?;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(store_io_error)?;
        }
        let bytes = serde_json::to_vec_pretty(settings).map_err(|_| store_corrupt())?;
        let temporary = temporary_path(&self.path);
        std::fs::write(&temporary, bytes).map_err(store_io_error)?;
        if let Err(error) = std::fs::rename(&temporary, &self.path) {
            let _ = std::fs::remove_file(&temporary);
            return Err(store_io_error(error));
        }
        Ok(())
    }

    pub fn save_vector(&self, config: VectorConfig) -> Result<(), AppError> {
        let mut settings = self.load()?;
        settings.vector = config;
        self.save(&settings)
    }

    pub fn save_rerank(&self, config: RerankConfig) -> Result<(), AppError> {
        let mut settings = self.load()?;
        settings.rerank = config;
        self.save(&settings)
    }

    pub fn save_web_search(&self, config: WebSearchConfig) -> Result<(), AppError> {
        let mut settings = self.load()?;
        settings.web_search = config;
        self.save(&settings)
    }

    pub fn save_tts(&self, config: TtsConfig) -> Result<(), AppError> {
        let mut settings = self.load()?;
        settings.tts = config;
        self.save(&settings)
    }

    pub fn save_image(&self, config: ImageConfig) -> Result<(), AppError> {
        let mut settings = self.load()?;
        settings.image = config;
        self.save(&settings)
    }

    pub fn save_local_agent(&self, config: LocalAgentConfig) -> Result<(), AppError> {
        let mut settings = self.load()?;
        settings.local_agent = config;
        self.save(&settings)
    }
}

fn validate_settings(settings: &CapabilitySettings) -> Result<(), AppError> {
    if settings.schema_version != SCHEMA_VERSION {
        return Err(capability_invalid());
    }
    validate_remote(
        settings.vector.enabled,
        &settings.vector.provider_id,
        &settings.vector.endpoint,
        &[&settings.vector.model, &settings.vector.collection],
    )?;
    if matches!(settings.vector.dimensions, Some(0 | 65536..)) {
        return Err(capability_invalid());
    }
    validate_remote(
        settings.rerank.enabled,
        &settings.rerank.provider_id,
        &settings.rerank.endpoint,
        &[&settings.rerank.model],
    )?;
    validate_remote(
        settings.web_search.enabled,
        &settings.web_search.provider_id,
        &settings.web_search.endpoint,
        &[],
    )?;
    if !(1..=20).contains(&settings.web_search.max_results) {
        return Err(capability_invalid());
    }
    validate_remote(
        settings.tts.enabled,
        &settings.tts.provider_id,
        &settings.tts.endpoint,
        &[&settings.tts.model, &settings.tts.voice],
    )?;
    validate_remote(
        settings.image.enabled,
        &settings.image.provider_id,
        &settings.image.endpoint,
        &[&settings.image.model, &settings.image.size],
    )?;
    validate_local_agent(&settings.local_agent)
}

fn validate_remote(
    enabled: bool,
    provider_id: &str,
    endpoint: &str,
    required: &[&String],
) -> Result<(), AppError> {
    validate_provider_id(provider_id)?;
    if !enabled {
        return Ok(());
    }
    if required.iter().any(|value| value.trim().is_empty()) {
        return Err(capability_invalid());
    }
    let url = Url::parse(endpoint.trim()).map_err(|_| capability_invalid())?;
    let host = url.host_str().ok_or_else(capability_invalid)?;
    let localhost = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if url.scheme() != "https" && !(url.scheme() == "http" && localhost) {
        return Err(capability_invalid());
    }
    Ok(())
}

fn validate_local_agent(config: &LocalAgentConfig) -> Result<(), AppError> {
    validate_provider_id(&config.provider_id)?;
    if !config.enabled {
        return Ok(());
    }
    if config.executable.trim().is_empty()
        || !Path::new(config.executable.trim()).is_absolute()
        || !(1..=1800).contains(&config.timeout_seconds)
    {
        return Err(capability_invalid());
    }
    let file_name = Path::new(config.executable.trim())
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(
        file_name.as_str(),
        "cmd" | "cmd.exe" | "powershell" | "powershell.exe" | "pwsh" | "pwsh.exe" | "sh" | "bash"
    ) {
        return Err(capability_invalid());
    }
    if config.arguments.len() > 32
        || config.arguments.iter().any(|argument| {
            argument.len() > 512
                || argument.contains("&&")
                || argument.contains("||")
                || argument.contains('|')
                || argument.contains('>')
                || argument.contains('<')
                || argument.contains(';')
                || argument.contains('\n')
                || argument.contains('\r')
        })
    {
        return Err(capability_invalid());
    }
    Ok(())
}

fn validate_provider_id(value: &str) -> Result<(), AppError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err(capability_invalid());
    }
    Ok(())
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".tmp");
    PathBuf::from(name)
}

fn capability_invalid() -> AppError {
    AppError::new(
        "capability_invalid",
        "AI 能力配置无效。",
        "请检查服务地址、模型和本地程序参数。",
    )
}

fn store_corrupt() -> AppError {
    AppError::new(
        "capability_store_corrupt",
        "AI 能力配置无法读取。",
        "请重置该能力配置后重试。",
    )
}

fn store_io_error(_: std::io::Error) -> AppError {
    AppError::new(
        "capability_store_io",
        "AI 能力配置无法保存。",
        "请检查应用数据目录权限。",
    )
}
