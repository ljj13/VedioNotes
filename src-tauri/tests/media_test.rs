use std::path::{Path, PathBuf};
use video_distiller_lib::services::media::{
    build_ffmpeg_audio_args, classify_media_file, prepare_audio, validate_media_file,
    FfmpegCommandRunner, LocalFfmpegScreenshotCapturer, MediaKind,
};

#[test]
fn rejects_unsupported_extension() {
    let err = validate_media_file(Path::new("notes.txt")).unwrap_err();
    assert_eq!(err.code, "unsupported_media");
}

#[test]
fn rejects_nonexistent_file() {
    let err = prepare_audio(
        Path::new("C:\\nonexistent_video.mov"),
        Path::new("C:\\work"),
    )
    .unwrap_err();
    assert_eq!(err.code, "file_not_found");
}

#[test]
fn accepts_supported_extensions() {
    for ext in &["mp4", "mov", "mkv", "webm"] {
        let name = format!("video.{}", ext);
        assert!(
            validate_media_file(Path::new(&name)).is_ok(),
            "Should accept .{}",
            ext
        );
    }
}

#[test]
fn accepts_supported_audio_extensions() {
    for ext in ["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"] {
        let name = format!("clip.{ext}");
        assert_eq!(
            classify_media_file(Path::new(&name)).unwrap(),
            MediaKind::Audio,
            "Should classify .{ext} as audio",
        );
    }
}

#[test]
fn ffmpeg_normalization_keeps_audio_input_and_outputs_mono_16khz() {
    let args =
        build_ffmpeg_audio_args(Path::new("F:\\voice.m4a"), Path::new("C:\\work\\voice.mp3"));
    assert!(args.windows(2).any(|x| x == ["-ac", "1"]));
    assert!(args.windows(2).any(|x| x == ["-ar", "16000"]));
    assert!(!args.iter().any(|x| x == "-vn"));
}

#[test]
fn ffmpeg_video_extraction_disables_video_stream() {
    let args = build_ffmpeg_audio_args(Path::new("F:\\1.mp4"), Path::new("C:\\work\\1.mp3"));
    assert!(args.iter().any(|x| x == "-vn"));
}

struct FakeCommandRunner {
    calls: std::sync::Mutex<Vec<(PathBuf, Vec<String>)>>,
    fail: bool,
}

impl FfmpegCommandRunner for FakeCommandRunner {
    fn run(&self, executable: &Path, args: &[String]) -> Result<(), String> {
        self.calls
            .lock()
            .unwrap()
            .push((executable.to_path_buf(), args.to_vec()));
        if self.fail {
            return Err("ffmpeg unavailable at C:\\private\\ffmpeg.exe".into());
        }
        let output = PathBuf::from(args.last().unwrap());
        std::fs::write(output, "frame").map_err(|error| error.to_string())
    }
}

#[test]
fn local_screenshot_capturer_uses_injected_ffmpeg_runner_with_one_frame_arguments() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("lecture.mp4");
    let output = temp.path().join("frame.jpg");
    std::fs::write(&source, "media").unwrap();
    let runner = FakeCommandRunner {
        calls: Default::default(),
        fail: false,
    };
    let capturer = LocalFfmpegScreenshotCapturer::new(PathBuf::from("ffmpeg-sidecar.exe"), runner);

    video_distiller_lib::history_store::ScreenshotCapturer::capture(
        &capturer, &source, 12.5, &output,
    )
    .unwrap();

    let calls = &capturer.runner().calls.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].0, PathBuf::from("ffmpeg-sidecar.exe"));
    assert!(calls[0].1.windows(2).any(|pair| pair == ["-ss", "12.5"]));
    assert!(calls[0].1.windows(2).any(|pair| pair == ["-frames:v", "1"]));
    assert_eq!(calls[0].1.last().unwrap(), &output.to_string_lossy());
    assert!(output.is_file());
}
