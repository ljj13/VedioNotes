//! AI 服务商目录——硬编码 116 个服务商和 3926 个模型的元数据，以及四个可执行协议适配器的路由.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::AppError;

const CATALOG_JSON: &str = include_str!("../assets/models-dev-standard.json");
static CATALOG: OnceLock<Result<SummaryProviderCatalog, String>> = OnceLock::new();

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
/// SummaryProtocolKind
pub enum SummaryProtocolKind {
    #[serde(rename = "openai-compatible")]
    OpenAiCompatible,
    #[serde(rename = "openai-responses")]
    OpenAiResponses,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "google")]
    Google,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// SummaryModelCatalogEntry
pub struct SummaryModelCatalogEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub summary_eligible: bool,
    #[serde(default)]
    pub summary_ineligible_reason: Option<String>,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub modalities: Value,
    #[serde(default)]
    pub capabilities: Value,
    #[serde(default)]
    pub limit: Value,
    #[serde(default)]
    pub cost: Value,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default, rename = "release_date")]
    pub release_date: Option<String>,
    #[serde(default, rename = "last_updated")]
    pub last_updated: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// SummaryProviderCatalogEntry
pub struct SummaryProviderCatalogEntry {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub protocol: SummaryProtocolKind,
    pub base_url: String,
    pub documentation_url: Option<String>,
    pub npm_package: String,
    pub models: Vec<SummaryModelCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// SummaryProviderCatalog
pub struct SummaryProviderCatalog {
    pub schema_version: u32,
    pub source: String,
    pub source_sha256: String,
    pub provider_count: usize,
    pub model_count: usize,
    pub providers: Vec<SummaryProviderCatalogEntry>,
}

fn parse_catalog() -> Result<SummaryProviderCatalog, String> {
    let catalog: SummaryProviderCatalog =
        serde_json::from_str(CATALOG_JSON).map_err(|_| "catalog JSON is invalid".to_string())?;
    if catalog.schema_version != 1 {
        return Err("catalog schema is unsupported".to_string());
    }
    if catalog.provider_count != 116 || catalog.providers.len() != 116 {
        return Err("catalog provider boundary is invalid".to_string());
    }
    let model_count = catalog.providers.iter().map(|item| item.models.len()).sum::<usize>();
    if catalog.model_count != 3926 || model_count != 3926 {
        return Err("catalog model boundary is invalid".to_string());
    }
    if catalog.providers.iter().any(|provider| {
        provider.id.trim().is_empty()
            || provider.display_name.trim().is_empty()
            || provider.base_url.trim().is_empty()
            || provider.models.is_empty()
    }) {
        return Err("catalog contains an incomplete provider".to_string());
    }
    Ok(catalog)
}

/// catalog
pub fn catalog() -> Result<&'static SummaryProviderCatalog, AppError> {
    match CATALOG.get_or_init(parse_catalog) {
        Ok(catalog) => Ok(catalog),
        Err(_) => Err(AppError::new(
            "summary_catalog_invalid",
            "内置 AI 服务目录无法读取。",
            "请重新安装或使用自定义兼容服务。",
        )),
    }
}

/// provider
pub fn provider(id: &str) -> Result<&'static SummaryProviderCatalogEntry, AppError> {
    let normalized = id.trim();
    catalog()?
        .providers
        .iter()
        .find(|provider| provider.id == normalized)
        .ok_or_else(|| {
            AppError::new(
                "summary_provider_not_found",
                "未找到该 AI 服务商。",
                "请刷新服务目录或选择自定义服务。",
            )
        })
}