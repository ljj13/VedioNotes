use tempfile::tempdir;
use video_distiller_lib::commands::{
    download_cookie_status, save_download_cookie_for_services, ManagedServices,
};
use video_distiller_lib::credential_store::InMemoryBackend;
use video_distiller_lib::download_cookies::DownloadCookieStore;
use video_distiller_lib::services::download::VideoPlatform;

#[test]
fn cookie_store_round_trips_per_platform_without_cross_platform_leakage() {
    let store = DownloadCookieStore::new(InMemoryBackend::new());

    store
        .set(VideoPlatform::Bilibili, "SESSDATA=test-value")
        .unwrap();

    assert!(store.has(VideoPlatform::Bilibili).unwrap());
    assert!(!store.has(VideoPlatform::Youtube).unwrap());
    assert_eq!(
        store.get(VideoPlatform::Bilibili).unwrap(),
        "SESSDATA=test-value"
    );
}

#[test]
fn cookie_store_delete_is_idempotent_and_rejects_blank_values() {
    let store = DownloadCookieStore::new(InMemoryBackend::new());

    let error = store.set(VideoPlatform::Douyin, "   ").unwrap_err();
    assert_eq!(error.code, "invalid_cookie");

    let error = store
        .set(VideoPlatform::Douyin, "not-a-cookie")
        .unwrap_err();
    assert_eq!(error.code, "invalid_cookie");

    store.delete(VideoPlatform::Douyin).unwrap();
    store.set(VideoPlatform::Douyin, "sessionid=test").unwrap();
    store.delete(VideoPlatform::Douyin).unwrap();
    assert!(!store.has(VideoPlatform::Douyin).unwrap());
}

#[test]
fn cookie_store_creates_a_task_scoped_netscape_file_and_removes_it_on_drop() {
    let store = DownloadCookieStore::new(InMemoryBackend::new());
    let work_dir = tempdir().unwrap();
    store
        .set(
            VideoPlatform::Bilibili,
            "SESSDATA=test-value; bili_jct=csrf",
        )
        .unwrap();

    let path = {
        let file = store
            .write_netscape_cookie_file(VideoPlatform::Bilibili, work_dir.path())
            .unwrap()
            .expect("configured Cookie should create a file");
        let path = file.path().to_path_buf();
        let body = std::fs::read_to_string(&path).unwrap();
        assert!(body.starts_with("# Netscape HTTP Cookie File\n"));
        assert!(body.contains(".bilibili.com\tTRUE\t/\tTRUE\t0\tSESSDATA\ttest-value"));
        assert!(body.contains(".bilibili.com\tTRUE\t/\tTRUE\t0\tbili_jct\tcsrf"));
        path
    };

    assert!(!path.exists());
}

#[test]
fn prepared_cookie_material_keeps_raw_header_and_netscape_file_separate() {
    let store = DownloadCookieStore::new(InMemoryBackend::new());
    let work_dir = tempdir().unwrap();
    store
        .set(
            VideoPlatform::Douyin,
            "msToken=test_token; ttwid=test_ttwid; s_v_web_id=verify_test",
        )
        .unwrap();

    let material = store
        .prepare_download_cookie(VideoPlatform::Douyin, work_dir.path())
        .unwrap();
    let raw = material.raw_header().expect("native header should exist");
    let file_path = material
        .netscape_file_path()
        .expect("yt-dlp cookie file should exist");
    let file_body = std::fs::read_to_string(file_path).unwrap();

    assert_eq!(
        raw,
        "msToken=test_token; ttwid=test_ttwid; s_v_web_id=verify_test"
    );
    assert!(!raw.contains(['\r', '\n', '\t']));
    assert!(file_body.starts_with("# Netscape HTTP Cookie File\n"));
    assert!(file_body.contains("\tmsToken\ttest_token"));
    assert_ne!(raw, file_body);
}

#[test]
fn command_helpers_return_status_only_and_redact_invalid_cookie_errors() {
    let dir = tempdir().unwrap();
    let services =
        ManagedServices::new_with_backend(dir.path().join("profiles.json"), InMemoryBackend::new());

    let before = download_cookie_status(&services).unwrap();
    assert!(!before.bilibili && !before.douyin && !before.youtube);

    save_download_cookie_for_services(&services, "bilibili", "SESSDATA=test-secret").unwrap();
    let after = download_cookie_status(&services).unwrap();
    assert!(after.bilibili && !after.douyin && !after.youtube);

    let error = save_download_cookie_for_services(&services, "unknown", "SESSDATA=test-secret")
        .unwrap_err();
    assert_eq!(error.code, "invalid_platform");
    assert!(!error.message.contains("test-secret"));
    assert!(!error.recovery.contains("test-secret"));
}
