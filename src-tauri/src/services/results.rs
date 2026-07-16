use crate::domain::{AppError, Distillation, TaskOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Render a Distillation result as Markdown text.
pub fn render_markdown(
    source: &str,
    timestamp: &str,
    distillation: &Distillation,
    options: &TaskOptions,
) -> String {
    let mut md = String::new();

    md.push_str("---\n");
    md.push_str(&format!("template: {}\n", options.note_template));
    md.push_str(&format!("style: {}\n", options.note_style.as_str()));
    md.push_str("---\n\n");

    // Header
    md.push_str("# 视频核心提炼\n\n");
    md.push_str(&format!("- **来源**: {}\n", sanitize_filename(source)));
    md.push_str(&format!("- **处理时间**: {}\n\n", timestamp));
    md.push_str("---\n\n");

    // Core conclusion
    md.push_str("## 核心结论\n\n");
    md.push_str(&distillation.core_conclusion);
    md.push_str("\n\n");

    // Key evidence
    md.push_str("## 关键依据\n\n");
    for evidence in &distillation.key_evidence {
        md.push_str(&format!("- {}", evidence.text));
        if let Some(seconds) = evidence.timestamp_seconds {
            let label = format_timestamp(seconds);
            if let Some(link) = timestamp_link(evidence.source_url.as_deref(), seconds) {
                md.push_str(&format!(" [{}]({})", label, link));
            } else {
                md.push_str(&format!(" [{}]", label));
            }
        }
        md.push('\n');
    }
    md.push_str("\n");

    // Implications
    md.push_str("## 启示/行动\n\n");
    for implication in &distillation.implications {
        md.push_str(&format!("- {}\n", implication));
    }
    md.push_str("\n");

    // Transcript (optional)
    if let Some(transcript) = &distillation.transcript {
        md.push_str("---\n\n");
        md.push_str("## 完整转写\n\n");
        md.push_str(transcript);
        md.push_str("\n");
    }

    md
}

fn format_timestamp(seconds: f64) -> String {
    let total = seconds.max(0.0).floor() as u64;
    format!("{:02}:{:02}", total / 60, total % 60)
}

fn timestamp_link(source_url: Option<&str>, seconds: f64) -> Option<String> {
    let url = source_url?;
    let parsed = url::Url::parse(url).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();
    let total = seconds.max(0.0).floor() as u64;
    if is_host_or_subdomain(&host, "bilibili.com") || is_host_or_subdomain(&host, "b23.tv") {
        let mut linked = parsed;
        linked
            .query_pairs_mut()
            .append_pair("t", &total.to_string());
        Some(linked.into())
    } else if is_host_or_subdomain(&host, "youtube.com") || is_host_or_subdomain(&host, "youtu.be")
    {
        let mut linked = parsed;
        linked
            .query_pairs_mut()
            .append_pair("t", &format!("{}s", total));
        Some(linked.into())
    } else {
        None
    }
}

fn is_host_or_subdomain(host: &str, root: &str) -> bool {
    host == root
        || host
            .strip_suffix(root)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

/// Save a Distillation result to a Markdown file atomically.
/// Writes to a .tmp file first, then renames.
pub fn save_markdown(
    source_video: &str,
    timestamp: &str,
    distillation: &Distillation,
    output_dir: &Path,
    options: &TaskOptions,
) -> Result<String, AppError> {
    let stem = sanitize_stem(source_video);
    let filename = format!("{}-核心提炼.md", stem);
    let output_path = output_dir.join(&filename);

    let md_content = render_markdown(source_video, timestamp, distillation, options);

    // Atomic write: .tmp → rename
    let tmp_path = output_path.with_extension("md.tmp");
    std::fs::write(&tmp_path, &md_content).map_err(|e| {
        AppError::new(
            "io_error",
            format!("无法写入文件: {}", e),
            "请检查磁盘空间和权限。",
        )
    })?;

    std::fs::rename(&tmp_path, &output_path).map_err(|e| {
        // Try direct write as fallback
        std::fs::write(&output_path, &md_content).ok();
        AppError::new(
            "io_error",
            format!("无法保存文件: {}", e),
            "请检查磁盘空间和权限。",
        )
    })?;

    Ok(output_path.to_string_lossy().to_string())
}

/// Copy a completed Markdown result without decoding or re-rendering it.
/// Both paths must use the `.md` extension. The destination is written
/// through a sibling temporary file so a partial copy is never exposed.
pub fn copy_markdown_file(source: &Path, destination: &Path) -> Result<PathBuf, AppError> {
    validate_markdown_path(source)?;
    validate_markdown_path(destination)?;
    if !source.is_file() {
        return Err(AppError::new(
            "markdown_source_missing",
            "原 Markdown 文件不存在。",
            "请重新生成结果后再另存为。",
        ));
    }

    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(copy_io_error)?;
    }
    let bytes = std::fs::read(source).map_err(copy_io_error)?;
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::Builder::new()
        .prefix(".markdown-copy-")
        .tempfile_in(parent)
        .map_err(copy_io_error)?;
    temporary.write_all(&bytes).map_err(copy_io_error)?;
    temporary.flush().map_err(copy_io_error)?;
    temporary.as_file().sync_all().map_err(copy_io_error)?;
    temporary
        .persist(destination)
        .map_err(|error| copy_io_error(error.error))?;
    Ok(destination.to_path_buf())
}

fn validate_markdown_path(path: &Path) -> Result<(), AppError> {
    let is_markdown = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
    if !is_markdown {
        return Err(AppError::new(
            "invalid_markdown_path",
            "仅支持 .md Markdown 文件。",
            "请选择扩展名为 .md 的文件。",
        ));
    }
    Ok(())
}

fn copy_io_error(error: std::io::Error) -> AppError {
    AppError::new(
        "markdown_copy_failed",
        format!("Markdown 文件复制失败: {error}"),
        "请检查文件路径、磁盘空间和权限。",
    )
}

/// Sanitize a string for use as a Markdown display name.
fn sanitize_filename(name: &str) -> String {
    name.to_string()
}

/// Extract a safe file stem from a video path.
fn sanitize_stem(path: &str) -> String {
    let p = Path::new(path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("video");
    // Remove characters unsafe for filenames
    let safe: String = stem
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    if safe.is_empty() {
        "video".to_string()
    } else {
        safe
    }
}
