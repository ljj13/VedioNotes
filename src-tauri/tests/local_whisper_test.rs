use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use video_distiller_lib::credential_store::SecretPayload;
use video_distiller_lib::profiles::{TranscriptionProfile, TranscriptionProviderKind};
use video_distiller_lib::providers::error::ProviderErrorKind;
use video_distiller_lib::providers::local_whisper::{
    map_whisper_to_overall_percent, parse_whisper_progress_line, CommandWhisperProcessRunner,
    LocalWhisperCppAdapter, LocalWhisperError, ProcessOutput, WhisperChild, WhisperProcessRunner,
    WhisperComputeSelection, WhisperProcessSpawner, WhisperProgressReporter, WhisperRuntimePaths,
};
use video_distiller_lib::providers::{TranscriptionAdapter, TranscriptionRegistry};

struct FakeRunner {
    output: Result<ProcessOutput, LocalWhisperError>,
    text_output: Option<Vec<u8>>,
    calls: Mutex<Vec<(PathBuf, Vec<OsString>)>>,
}

struct WaitingChild {
    killed: Arc<std::sync::atomic::AtomicBool>,
}

impl WhisperChild for WaitingChild {
    fn try_wait(&mut self) -> Result<Option<i32>, LocalWhisperError> {
        Ok(None)
    }
    fn kill(&mut self) -> Result<(), LocalWhisperError> {
        self.killed.store(true, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }
    fn wait(&mut self) -> Result<ProcessOutput, LocalWhisperError> {
        Ok(ProcessOutput {
            status_code: -1,
            stdout: Vec::new(),
            stderr: Vec::new(),
        })
    }
}

struct CancellingSpawner {
    cancel: Arc<AtomicBool>,
    killed: Arc<std::sync::atomic::AtomicBool>,
}

struct CancellingOutputRunner {
    cancel: Arc<AtomicBool>,
    output_path: Mutex<Option<PathBuf>>,
}

struct CudaFallbackRunner {
    calls: Mutex<Vec<PathBuf>>,
    cancel_on_cuda_failure: bool,
}

impl WhisperProcessRunner for CudaFallbackRunner {
    fn run(
        &self,
        program: &Path,
        args: &[OsString],
        cancel: &AtomicBool,
        _progress: WhisperProgressReporter,
    ) -> Result<ProcessOutput, LocalWhisperError> {
        self.calls.lock().unwrap().push(program.to_path_buf());
        let output_base = args.windows(2).find(|pair| pair[0] == "-of").unwrap()[1].clone();
        let output_path = appended_txt_path(output_base);
        if program.ends_with("cuda-cli.exe") {
            std::fs::write(&output_path, b"partial gpu output").unwrap();
            if self.cancel_on_cuda_failure {
                cancel.store(true, std::sync::atomic::Ordering::SeqCst);
            }
            return Err(LocalWhisperError);
        }
        assert!(!output_path.exists(), "partial CUDA output must be removed before CPU retry");
        std::fs::write(output_path, b"cpu fallback transcript\n").unwrap();
        Ok(ProcessOutput { status_code: 0, stdout: Vec::new(), stderr: Vec::new() })
    }
}

fn appended_txt_path(base: impl AsRef<OsStr>) -> PathBuf {
    let mut output = base.as_ref().to_os_string();
    output.push(".txt");
    PathBuf::from(output)
}

impl WhisperProcessRunner for CancellingOutputRunner {
    fn run(
        &self,
        _program: &Path,
        args: &[OsString],
        _cancel: &AtomicBool,
        _progress: WhisperProgressReporter,
    ) -> Result<ProcessOutput, LocalWhisperError> {
        let output_base = args.windows(2).find(|pair| pair[0] == "-of").unwrap()[1].clone();
        let output_path = appended_txt_path(output_base);
        std::fs::write(&output_path, b"partial transcript").unwrap();
        *self.output_path.lock().unwrap() = Some(output_path);
        self.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        Err(LocalWhisperError)
    }
}

impl WhisperProcessSpawner for CancellingSpawner {
    fn spawn(
        &self,
        _program: &Path,
        _args: &[OsString],
        _progress: WhisperProgressReporter,
    ) -> Result<Box<dyn WhisperChild>, LocalWhisperError> {
        self.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        Ok(Box::new(WaitingChild {
            killed: self.killed.clone(),
        }))
    }
}

#[test]
fn production_runner_kills_child_when_cancelled_in_flight() {
    let cancel = Arc::new(AtomicBool::new(false));
    let killed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let runner = CommandWhisperProcessRunner::with_spawner(Arc::new(CancellingSpawner {
        cancel: cancel.clone(),
        killed: killed.clone(),
    }));
    assert!(runner
        .run(
            Path::new("never-launched.exe"),
            &[],
            &cancel,
            Arc::new(|_| {}),
        )
        .is_err());
    assert!(killed.load(std::sync::atomic::Ordering::SeqCst));
}

impl FakeRunner {
    fn succeeded(text_output: &[u8]) -> Self {
        Self {
            output: Ok(ProcessOutput {
                status_code: 0,
                stdout: Vec::new(),
                stderr: Vec::new(),
            }),
            text_output: Some(text_output.to_vec()),
            calls: Mutex::new(Vec::new()),
        }
    }
}

impl WhisperProcessRunner for FakeRunner {
    fn run(
        &self,
        program: &Path,
        args: &[OsString],
        _cancel: &AtomicBool,
        _progress: WhisperProgressReporter,
    ) -> Result<ProcessOutput, LocalWhisperError> {
        self.calls
            .lock()
            .unwrap()
            .push((program.to_path_buf(), args.to_vec()));
        if let Some(text) = &self.text_output {
            let output_base = args.windows(2).find(|pair| pair[0] == "-of").unwrap()[1].clone();
            std::fs::write(appended_txt_path(output_base), text).unwrap();
        }
        self.output.clone()
    }
}

fn local_profile() -> TranscriptionProfile {
    TranscriptionProfile {
        id: "local-whisper-cpp".into(),
        name: "本地 Whisper".into(),
        provider: TranscriptionProviderKind::LocalWhisperCpp,
        base_url: String::new(),
        model: "tiny".into(),
        enabled: true,
        built_in: true,
        online_options: Default::default(),
    }
}

#[tokio::test]
async fn adapter_uses_only_local_cli_model_and_audio_paths() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("ggml-tiny.bin");
    let audio = root.path().join("input.wav");
    std::fs::write(&model, b"model").unwrap();
    std::fs::write(&audio, b"audio").unwrap();
    let runner = Arc::new(FakeRunner::succeeded("local transcript\n".as_bytes()));
    let adapter = LocalWhisperCppAdapter::with_ready_model_path(
        runner.clone(),
        model.clone(),
        PathBuf::from("whisper-cli.exe"),
    );
    let secret = SecretPayload::Bearer {
        api_key: "must-not-be-observed".into(),
    };

    let transcript = adapter
        .transcribe(&audio, &local_profile(), &secret, &AtomicBool::new(false))
        .await
        .unwrap();

    assert_eq!(transcript, "local transcript");
    let calls = runner.calls.lock().unwrap();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].0, PathBuf::from("whisper-cli.exe"));
    let args: Vec<String> = calls[0]
        .1
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    assert_eq!(
        &args[..6],
        [
            "-m",
            model.to_string_lossy().as_ref(),
            "-f",
            audio.to_string_lossy().as_ref(),
            "-l",
            "auto"
        ]
    );
    assert!(args
        .windows(2)
        .any(|pair| pair[0] == "-of" && pair[1].ends_with(".input.whisper")));
    assert!(args.iter().any(|arg| arg == "-otxt"));
    let output_base = args.windows(2).find(|pair| pair[0] == "-of").unwrap()[1].clone();
    assert!(
        !appended_txt_path(output_base).exists(),
        "adapter must delete its owned text output after reading it"
    );
    assert!(!args.iter().any(|arg| arg.contains("must-not-be-observed")));
}

#[tokio::test]
async fn adapter_reads_whisper_cpp_appended_txt_output() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("ggml-tiny.bin");
    let audio = root.path().join("input.wav");
    std::fs::write(&model, b"model").unwrap();
    std::fs::write(&audio, b"audio").unwrap();
    let adapter = LocalWhisperCppAdapter::with_ready_model_path(
        Arc::new(FakeRunner::succeeded(b"append contract transcript\n")),
        model,
        PathBuf::from("whisper-cli.exe"),
    );

    let transcript = adapter
        .transcribe(
            &audio,
            &local_profile(),
            &SecretPayload::Bearer {
                api_key: "not-observed".into(),
            },
            &AtomicBool::new(false),
        )
        .await
        .unwrap();

    assert_eq!(transcript, "append contract transcript");
}

#[tokio::test]
async fn automatic_compute_retries_cpu_exactly_once_after_cuda_start_failure() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("model.bin");
    let audio = root.path().join("input.wav");
    std::fs::write(&model, b"model").unwrap();
    std::fs::write(&audio, b"audio").unwrap();
    let runner = Arc::new(CudaFallbackRunner { calls: Mutex::new(Vec::new()), cancel_on_cuda_failure: false });
    let fallbacks = Arc::new(Mutex::new(0_u8));
    let fallback_counter = fallbacks.clone();
    let adapter = LocalWhisperCppAdapter::with_ready_model_runtime_paths(
        runner.clone(),
        model,
        WhisperRuntimePaths {
            cpu_cli: PathBuf::from("cpu-cli.exe"),
            cuda_cli: Some(PathBuf::from("cuda-cli.exe")),
        },
        WhisperComputeSelection::Automatic,
    )
    .with_compute_fallback_reporter(Arc::new(move || *fallback_counter.lock().unwrap() += 1));

    let transcript = adapter
        .transcribe(&audio, &local_profile(), &SecretPayload::Bearer { api_key: String::new() }, &AtomicBool::new(false))
        .await
        .unwrap();

    assert_eq!(transcript, "cpu fallback transcript");
    assert_eq!(runner.calls.lock().unwrap().as_slice(), &[PathBuf::from("cuda-cli.exe"), PathBuf::from("cpu-cli.exe")]);
    assert_eq!(*fallbacks.lock().unwrap(), 1);
}

#[tokio::test]
async fn cpu_only_mode_never_invokes_the_cuda_cli() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("model.bin");
    let audio = root.path().join("input.wav");
    std::fs::write(&model, b"model").unwrap();
    std::fs::write(&audio, b"audio").unwrap();
    let runner = Arc::new(CudaFallbackRunner { calls: Mutex::new(Vec::new()), cancel_on_cuda_failure: false });
    let adapter = LocalWhisperCppAdapter::with_ready_model_runtime_paths(
        runner.clone(),
        model,
        WhisperRuntimePaths { cpu_cli: PathBuf::from("cpu-cli.exe"), cuda_cli: Some(PathBuf::from("cuda-cli.exe")) },
        WhisperComputeSelection::CpuOnly,
    );

    adapter.transcribe(&audio, &local_profile(), &SecretPayload::Bearer { api_key: String::new() }, &AtomicBool::new(false)).await.unwrap();

    assert_eq!(runner.calls.lock().unwrap().as_slice(), &[PathBuf::from("cpu-cli.exe")]);
}

#[tokio::test]
async fn cancellation_after_cuda_failure_prevents_cpu_retry() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("model.bin");
    let audio = root.path().join("input.wav");
    std::fs::write(&model, b"model").unwrap();
    std::fs::write(&audio, b"audio").unwrap();
    let runner = Arc::new(CudaFallbackRunner { calls: Mutex::new(Vec::new()), cancel_on_cuda_failure: true });
    let cancel = AtomicBool::new(false);
    let adapter = LocalWhisperCppAdapter::with_ready_model_runtime_paths(
        runner.clone(),
        model,
        WhisperRuntimePaths { cpu_cli: PathBuf::from("cpu-cli.exe"), cuda_cli: Some(PathBuf::from("cuda-cli.exe")) },
        WhisperComputeSelection::Automatic,
    );

    let error = adapter.transcribe(&audio, &local_profile(), &SecretPayload::Bearer { api_key: String::new() }, &cancel).await.unwrap_err();

    assert_eq!(error.kind, ProviderErrorKind::Cancelled);
    assert_eq!(runner.calls.lock().unwrap().as_slice(), &[PathBuf::from("cuda-cli.exe")]);
}

#[tokio::test]
async fn adapter_rejects_missing_or_invalid_text_output() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("model.bin");
    let audio = root.path().join("input.wav");
    std::fs::write(&model, b"model").unwrap();
    std::fs::write(&audio, b"audio").unwrap();
    for text_output in [None, Some(vec![0xff])] {
        let runner = Arc::new(FakeRunner {
            output: Ok(ProcessOutput {
                status_code: 0,
                stdout: Vec::new(),
                stderr: Vec::new(),
            }),
            text_output,
            calls: Mutex::new(Vec::new()),
        });
        let adapter = LocalWhisperCppAdapter::with_ready_model_path(
            runner,
            model.clone(),
            PathBuf::from("whisper-cli.exe"),
        );
        let err = adapter
            .transcribe(
                &audio,
                &local_profile(),
                &SecretPayload::Bearer {
                    api_key: "x".into(),
                },
                &AtomicBool::new(false),
            )
            .await
            .unwrap_err();
        assert_eq!(err.kind, ProviderErrorKind::ProviderError);
    }
}

#[tokio::test]
async fn adapter_removes_owned_text_output_when_runner_cancels() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("model.bin");
    let audio = root.path().join("input.wav");
    std::fs::write(&model, b"model").unwrap();
    std::fs::write(&audio, b"audio").unwrap();
    let cancel = Arc::new(AtomicBool::new(false));
    let runner = Arc::new(CancellingOutputRunner {
        cancel: cancel.clone(),
        output_path: Mutex::new(None),
    });
    let adapter = LocalWhisperCppAdapter::with_ready_model_path(
        runner.clone(),
        model,
        PathBuf::from("whisper-cli.exe"),
    );

    let err = adapter
        .transcribe(
            &audio,
            &local_profile(),
            &SecretPayload::Bearer {
                api_key: "x".into(),
            },
            &cancel,
        )
        .await
        .unwrap_err();

    assert_eq!(err.kind, ProviderErrorKind::Cancelled);
    assert!(!runner
        .output_path
        .lock()
        .unwrap()
        .as_ref()
        .unwrap()
        .exists());
}

#[tokio::test]
async fn adapter_redacts_process_failure() {
    let root = tempfile::tempdir().unwrap();
    let runner = Arc::new(FakeRunner {
        output: Ok(ProcessOutput {
            status_code: 1,
            stdout: Vec::new(),
            stderr: b"secret=C:/private/model.bin".to_vec(),
        }),
        text_output: None,
        calls: Mutex::new(Vec::new()),
    });
    let adapter = LocalWhisperCppAdapter::new(
        runner,
        root.path().to_path_buf(),
        PathBuf::from("whisper-cli.exe"),
    );
    let err = adapter
        .transcribe(
            Path::new("audio.wav"),
            &local_profile(),
            &SecretPayload::Bearer {
                api_key: "x".into(),
            },
            &AtomicBool::new(false),
        )
        .await
        .unwrap_err();

    assert_eq!(err.kind, ProviderErrorKind::ProviderError);
    assert!(!err.message.contains("private"));
    assert!(!err.message.contains("secret="));
}

#[test]
fn local_whisper_kind_is_registered_without_an_online_adapter() {
    let registry = TranscriptionRegistry::new();
    assert!(registry
        .get(&TranscriptionProviderKind::LocalWhisperCpp)
        .is_ok());
}

#[test]
fn parses_only_bounded_whisper_progress_percentages() {
    assert_eq!(
        parse_whisper_progress_line("whisper_print_progress_callback: progress =  37%"),
        Some(37)
    );
    assert_eq!(parse_whisper_progress_line("progress = 100%"), Some(100));
    assert_eq!(parse_whisper_progress_line("progress = 101%"), None);
    assert_eq!(parse_whisper_progress_line("private path C:/secret.wav"), None);
}

#[test]
fn maps_real_whisper_progress_into_the_transcription_range() {
    assert_eq!(map_whisper_to_overall_percent(0), 35);
    assert_eq!(map_whisper_to_overall_percent(50), 52);
    assert_eq!(map_whisper_to_overall_percent(100), 70);
    assert_eq!(map_whisper_to_overall_percent(255), 70);
}
