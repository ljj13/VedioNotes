use video_distiller_lib::process_utils::{hidden_command, WINDOWS_CREATE_NO_WINDOW};

#[test]
fn hidden_command_uses_the_windows_no_console_flag_contract() {
    assert_eq!(WINDOWS_CREATE_NO_WINDOW, 0x0800_0000);
    let command = hidden_command("fixture-tool.exe");
    assert_eq!(command.get_program(), "fixture-tool.exe");
}

#[test]
fn production_child_process_sites_use_the_shared_builder() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    for relative in [
        "src/providers/local_whisper.rs",
        "src/services/bilibili_native.rs",
        "src/services/download.rs",
        "src/services/media.rs",
        "src/subtitles.rs",
    ] {
        let source = std::fs::read_to_string(root.join(relative)).unwrap();
        assert!(
            !source.contains("Command::new(")
                && !source.contains("std::process::Command::new("),
            "{relative} bypasses process_utils::hidden_command"
        );
    }
}
