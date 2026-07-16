use std::fs;
use tempfile::tempdir;
use video_distiller_lib::data_management::{
    serialize_note, CacheCategory, DataManagementService, ExportFormat, MAX_LOG_TAIL_BYTES,
};

fn write_bytes(path: &std::path::Path, size: usize) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, vec![b'x'; size]).unwrap();
}

#[test]
fn cache_usage_and_cleanup_are_limited_to_canonical_cache_roots() {
    let root = tempdir().unwrap();
    let app_data = root.path().join("app-data");
    let temporary_media = root.path().join("temporary-media");
    let history_root = app_data.join("history-assets");
    let model_root = app_data.join("models");
    let runtime_root = app_data.join("runtimes");

    write_bytes(&temporary_media.join("task/audio.wav"), 11);
    write_bytes(&app_data.join("cache/screenshots/frame.jpg"), 13);
    write_bytes(&app_data.join("cache/transcription/chunk.txt"), 17);
    write_bytes(&app_data.join("cache/ai-index/index.bin"), 19);
    write_bytes(&history_root.join("note.md"), 23);
    write_bytes(&model_root.join("sensevoice/model.onnx"), 29);
    write_bytes(&runtime_root.join("cuda/cudart.dll"), 31);

    let service = DataManagementService::new(&app_data, &temporary_media);
    let usage = service.cache_usage().unwrap();
    assert_eq!(usage.total_bytes, 60);
    assert_eq!(usage.categories.len(), 4);

    let temporary = service.clear_cache(CacheCategory::TemporaryMedia).unwrap();
    assert_eq!(temporary.removed_bytes, 11);
    assert!(!temporary_media.join("task/audio.wav").exists());

    let cleared = service.clear_cache(CacheCategory::All).unwrap();
    assert_eq!(cleared.removed_bytes, 49);
    assert!(history_root.join("note.md").exists());
    assert!(model_root.join("sensevoice/model.onnx").exists());
    assert!(runtime_root.join("cuda/cudart.dll").exists());
    assert!(cleared.preserved_paths.iter().any(|path| path.ends_with("history-assets")));
    assert!(cleared.preserved_paths.iter().any(|path| path.ends_with("models")));
    assert!(cleared.preserved_paths.iter().any(|path| path.ends_with("runtimes")));
}

#[test]
fn logs_are_addressed_by_validated_id_and_read_with_a_bounded_tail() {
    let root = tempdir().unwrap();
    let app_data = root.path().join("app-data");
    let logs = app_data.join("logs");
    fs::create_dir_all(&logs).unwrap();
    let payload = "a".repeat(MAX_LOG_TAIL_BYTES + 1024);
    fs::write(logs.join("video-distiller.log"), payload).unwrap();
    fs::write(logs.join("ignore.txt"), "not a log").unwrap();

    let service = DataManagementService::new(&app_data, root.path().join("temporary-media"));
    let descriptors = service.list_logs().unwrap();
    assert_eq!(descriptors.len(), 1);
    assert_eq!(descriptors[0].id, "video-distiller.log");

    let tail = service.read_log("video-distiller.log", MAX_LOG_TAIL_BYTES).unwrap();
    assert!(tail.content.len() <= MAX_LOG_TAIL_BYTES);
    assert!(tail.truncated);
    assert!(service.read_log("../video-distiller.log", 1024).is_err());
    assert!(service.read_log("ignore.txt", 1024).is_err());
}

#[test]
fn markdown_html_and_text_exports_have_real_serializers() {
    let markdown = "# 标题\n\n- 第一条\n- 第二条";
    assert_eq!(serialize_note(ExportFormat::Markdown, "标题", markdown), markdown);
    let html = serialize_note(ExportFormat::Html, "标题", markdown);
    assert!(html.contains("<!doctype html>"));
    assert!(html.contains("<h1>标题</h1>"));
    assert!(html.contains("<li>第一条</li>"));
    let text = serialize_note(ExportFormat::Text, "标题", markdown);
    assert!(!text.contains('#'));
    assert!(text.contains("第一条"));
}

