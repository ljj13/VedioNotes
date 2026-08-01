use std::sync::atomic::{AtomicUsize, Ordering};

use tempfile::tempdir;
use video_distiller_lib::verified_file_cache::verify_file_cached;

#[test]
fn unchanged_file_reuses_the_persisted_verification_result() {
    let root = tempdir().unwrap();
    let model_path = root.path().join("model.bin");
    std::fs::write(&model_path, b"abc").unwrap();
    let verifier_calls = AtomicUsize::new(0);

    let verify = || {
        verifier_calls.fetch_add(1, Ordering::SeqCst);
        Ok::<bool, ()>(true)
    };

    assert!(verify_file_cached(root.path(), &model_path, "sha256:fixture", verify,).unwrap());
    assert!(verify_file_cached(root.path(), &model_path, "sha256:fixture", verify,).unwrap());
    assert_eq!(verifier_calls.load(Ordering::SeqCst), 1);

    std::fs::write(&model_path, b"changed-size").unwrap();
    assert!(verify_file_cached(root.path(), &model_path, "sha256:fixture", verify,).unwrap());
    assert_eq!(verifier_calls.load(Ordering::SeqCst), 2);
}
