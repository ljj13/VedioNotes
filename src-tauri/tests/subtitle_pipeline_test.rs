use std::path::Path;
use video_distiller_lib::{
    domain::InputSource,
    subtitles::{
        acquire_transcript_with, source_platform, CaptionProcess, CaptionProcessOutput,
        SourcePlatform,
    },
};

struct FakeCaptionProcess {
    output: CaptionProcessOutput,
    vtt: Option<&'static str>,
    calls: std::cell::Cell<usize>,
}

impl CaptionProcess for FakeCaptionProcess {
    fn execute(
        &self,
        _executable: &Path,
        args: &[String],
        work_dir: &Path,
    ) -> CaptionProcessOutput {
        assert!(args.iter().any(|arg| arg == "--skip-download"));
        assert!(args.iter().any(|arg| arg == "--write-subs"));
        self.calls.set(self.calls.get() + 1);
        if let Some(vtt) = self.vtt {
            std::fs::write(work_dir.join("captions.en.vtt"), vtt).unwrap();
        }
        self.output.clone()
    }
}

fn bilibili() -> InputSource {
    InputSource::BilibiliUrl {
        url: "https://www.bilibili.com/video/BV1x".into(),
    }
}

fn youtube() -> InputSource {
    InputSource::YoutubeUrl {
        url: "https://www.youtube.com/watch?v=abc".into(),
    }
}

#[test]
fn classifier_keeps_local_and_douyin_on_media_route() {
    assert_eq!(
        source_platform(&InputSource::File {
            path: "clip.mp4".into()
        }),
        SourcePlatform::Local
    );
    assert_eq!(
        source_platform(&InputSource::DouyinUrl {
            url: "https://www.douyin.com/video/1".into()
        }),
        SourcePlatform::Douyin
    );
    assert_eq!(source_platform(&bilibili()), SourcePlatform::Bilibili);
    assert_eq!(source_platform(&youtube()), SourcePlatform::Youtube);
}

#[test]
fn nonempty_bilibili_captions_bypass_downloader_and_asr() {
    let temp = tempfile::tempdir().unwrap();
    let process = FakeCaptionProcess {
        output: CaptionProcessOutput { success: true },
        vtt: Some("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n  first caption \n\n00:00:04.000 --> 00:00:05.000\nsecond caption\n"),
        calls: std::cell::Cell::new(0),
    };
    let mut media_asr_calls = 0;

    let acquisition = acquire_transcript_with(
        &bilibili(),
        &process,
        Path::new("yt-dlp"),
        temp.path(),
        || {
            media_asr_calls += 1;
            Ok("ASR transcript".into())
        },
    )
    .unwrap();

    assert_eq!(process.calls.get(), 1);
    assert_eq!(
        media_asr_calls, 0,
        "timed captions must bypass media download and ASR"
    );
    assert_eq!(acquisition.transcript, "first caption\nsecond caption");
    assert_eq!(acquisition.captions.unwrap()[0].start_seconds, 1.0);
}

#[test]
fn nonempty_youtube_captions_bypass_downloader_and_asr() {
    let temp = tempfile::tempdir().unwrap();
    let process = FakeCaptionProcess {
        output: CaptionProcessOutput { success: true },
        vtt: Some("WEBVTT\n\n00:01:02.500 --> 00:01:04.000\nyoutube caption\n"),
        calls: std::cell::Cell::new(0),
    };
    let mut media_asr_calls = 0;

    let acquisition = acquire_transcript_with(
        &youtube(),
        &process,
        Path::new("yt-dlp"),
        temp.path(),
        || {
            media_asr_calls += 1;
            Ok("ASR transcript".into())
        },
    )
    .unwrap();

    assert_eq!(media_asr_calls, 0);
    assert_eq!(acquisition.transcript, "youtube caption");
    assert_eq!(acquisition.captions.unwrap()[0].start_seconds, 62.5);
}

#[test]
fn missing_or_empty_captions_use_existing_media_asr_fallback() {
    for vtt in [None, Some("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n   \n")] {
        let temp = tempfile::tempdir().unwrap();
        let process = FakeCaptionProcess {
            output: CaptionProcessOutput { success: true },
            vtt,
            calls: std::cell::Cell::new(0),
        };
        let mut media_asr_calls = 0;
        let acquisition = acquire_transcript_with(
            &youtube(),
            &process,
            Path::new("yt-dlp"),
            temp.path(),
            || {
                media_asr_calls += 1;
                Ok("fallback ASR".into())
            },
        )
        .unwrap();
        assert_eq!(media_asr_calls, 1);
        assert!(acquisition.captions.is_none());
        assert_eq!(acquisition.transcript, "fallback ASR");
    }
}

#[test]
fn douyin_never_invokes_caption_process_and_uses_media_asr() {
    let temp = tempfile::tempdir().unwrap();
    let process = FakeCaptionProcess {
        output: CaptionProcessOutput { success: true },
        vtt: Some("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nignored\n"),
        calls: std::cell::Cell::new(0),
    };
    let mut media_asr_calls = 0;
    let source = InputSource::DouyinUrl {
        url: "https://www.douyin.com/video/1".into(),
    };
    let acquisition =
        acquire_transcript_with(&source, &process, Path::new("yt-dlp"), temp.path(), || {
            media_asr_calls += 1;
            Ok("douyin ASR".into())
        })
        .unwrap();
    assert_eq!(process.calls.get(), 0);
    assert_eq!(media_asr_calls, 1);
    assert_eq!(acquisition.transcript, "douyin ASR");
}

#[test]
fn failed_caption_process_uses_existing_media_asr_fallback_once() {
    let temp = tempfile::tempdir().unwrap();
    let process = FakeCaptionProcess {
        output: CaptionProcessOutput { success: false },
        vtt: None,
        calls: std::cell::Cell::new(0),
    };
    let mut media_asr_calls = 0;
    let acquisition = acquire_transcript_with(
        &youtube(),
        &process,
        Path::new("yt-dlp"),
        temp.path(),
        || {
            media_asr_calls += 1;
            Ok("fallback ASR".into())
        },
    )
    .unwrap();

    assert_eq!(process.calls.get(), 1);
    assert_eq!(media_asr_calls, 1);
    assert!(acquisition.captions.is_none());
    assert_eq!(acquisition.transcript, "fallback ASR");
}

#[test]
fn caption_io_failure_is_redacted_and_uses_media_asr_fallback_once() {
    let temp = tempfile::tempdir().unwrap();
    let not_a_directory = temp.path().join("caption-target");
    std::fs::write(&not_a_directory, "not a directory").unwrap();
    let process = FakeCaptionProcess {
        output: CaptionProcessOutput { success: true },
        vtt: None,
        calls: std::cell::Cell::new(0),
    };
    let mut media_asr_calls = 0;

    let acquisition = acquire_transcript_with(
        &youtube(),
        &process,
        Path::new("yt-dlp"),
        &not_a_directory,
        || {
            media_asr_calls += 1;
            Ok("fallback ASR".into())
        },
    )
    .unwrap();

    assert_eq!(process.calls.get(), 0);
    assert_eq!(media_asr_calls, 1);
    assert_eq!(acquisition.transcript, "fallback ASR");
}
