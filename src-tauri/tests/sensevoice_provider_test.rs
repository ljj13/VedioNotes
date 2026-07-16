use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use video_distiller_lib::providers::sensevoice::{
    CancellationToken, CommandSenseVoiceProcessRunner, SenseVoiceAdapter, SenseVoiceChild,
    SenseVoiceOptions, SenseVoiceProcessError, SenseVoiceProcessInvocation,
    SenseVoiceProcessOutput, SenseVoiceProcessRunner, SenseVoiceProcessSpawner,
};

struct FakeRunner {
    result: Result<SenseVoiceProcessOutput, video_distiller_lib::domain::AppError>,
    invocation: Mutex<Option<SenseVoiceProcessInvocation>>,
}

impl SenseVoiceProcessRunner for FakeRunner {
    fn run(
        &self,
        invocation: &SenseVoiceProcessInvocation,
        _cancel: &AtomicBool,
        _timeout: Duration,
    ) -> Result<SenseVoiceProcessOutput, video_distiller_lib::domain::AppError> {
        *self.invocation.lock().unwrap() = Some(invocation.clone());
        self.result.clone()
    }
}

fn ready_adapter(runner: Arc<dyn SenseVoiceProcessRunner>) -> SenseVoiceAdapter {
    SenseVoiceAdapter::new(
        runner,
        PathBuf::from("sherpa-onnx-offline.exe"),
        PathBuf::from("model.int8.onnx"),
        PathBuf::from("tokens.txt"),
    )
}

#[test]
fn adapter_invokes_hidden_official_cli_and_parses_json_result() {
    let runner = Arc::new(FakeRunner {
        result: Ok(SenseVoiceProcessOutput {
            status_code: 0,
            stdout: b"input.wav\n{\"text\":\"\xe5\xbc\x80\xe6\x94\xbe\xe6\x97\xb6\xe9\x97\xb4\xe6\x97\xa9\xe4\xb8\x8a\xe4\xb9\x9d\xe7\x82\xb9\xe8\x87\xb3\xe4\xb8\x8b\xe5\x8d\x88\xe4\xba\x94\xe7\x82\xb9\xe3\x80\x82\",\"timestamps\":[0.2],\"tokens\":[\"\xe5\xbc\x80\"]}\n".to_vec(),
            stderr: Vec::new(),
        }),
        invocation: Mutex::new(None),
    });
    let adapter = ready_adapter(runner.clone());

    let result = adapter
        .transcribe(
            Path::new("input.wav"),
            SenseVoiceOptions::default(),
            CancellationToken::new(),
        )
        .unwrap();

    assert_eq!(result.text, "\u{5f00}\u{653e}\u{65f6}\u{95f4}\u{65e9}\u{4e0a}\u{4e5d}\u{70b9}\u{81f3}\u{4e0b}\u{5348}\u{4e94}\u{70b9}\u{3002}");
    let invocation = runner.invocation.lock().unwrap().clone().unwrap();
    assert!(invocation.windows_hidden);
    assert_eq!(invocation.program, PathBuf::from("sherpa-onnx-offline.exe"));
    let args = invocation
        .args
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    assert!(args.iter().any(|arg| arg == "--sense-voice-model=model.int8.onnx"));
    assert!(args.iter().any(|arg| arg == "--tokens=tokens.txt"));
    assert!(args.iter().any(|arg| arg == "input.wav"));
}

struct WaitingChild {
    killed: Arc<AtomicBool>,
    waited: Arc<AtomicBool>,
    output: SenseVoiceProcessOutput,
}

impl SenseVoiceChild for WaitingChild {
    fn try_wait(&mut self) -> Result<Option<i32>, SenseVoiceProcessError> {
        Ok(None)
    }

    fn kill(&mut self) -> Result<(), SenseVoiceProcessError> {
        self.killed.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn wait(&mut self) -> Result<SenseVoiceProcessOutput, SenseVoiceProcessError> {
        self.waited.store(true, Ordering::SeqCst);
        Ok(self.output.clone())
    }
}

struct FakeSpawner {
    child: Mutex<Option<WaitingChild>>,
    on_spawn_cancel: Option<Arc<AtomicBool>>,
}

impl SenseVoiceProcessSpawner for FakeSpawner {
    fn spawn(
        &self,
        _invocation: &SenseVoiceProcessInvocation,
    ) -> Result<Box<dyn SenseVoiceChild>, SenseVoiceProcessError> {
        if let Some(cancel) = &self.on_spawn_cancel {
            cancel.store(true, Ordering::SeqCst);
        }
        Ok(Box::new(self.child.lock().unwrap().take().unwrap()))
    }
}

fn hidden_invocation() -> SenseVoiceProcessInvocation {
    SenseVoiceProcessInvocation {
        program: PathBuf::from("never-launched.exe"),
        args: Vec::<OsString>::new(),
        windows_hidden: true,
    }
}

#[test]
fn production_runner_kills_and_waits_when_cancelled() {
    let cancel = Arc::new(AtomicBool::new(false));
    let killed = Arc::new(AtomicBool::new(false));
    let waited = Arc::new(AtomicBool::new(false));
    let runner = CommandSenseVoiceProcessRunner::with_spawner(Arc::new(FakeSpawner {
        child: Mutex::new(Some(WaitingChild {
            killed: killed.clone(),
            waited: waited.clone(),
            output: SenseVoiceProcessOutput {
                status_code: -1,
                stdout: Vec::new(),
                stderr: Vec::new(),
            },
        })),
        on_spawn_cancel: Some(cancel.clone()),
    }));

    let error = runner
        .run(&hidden_invocation(), &cancel, Duration::from_secs(1))
        .unwrap_err();

    assert_eq!(error.code, "cancelled");
    assert!(killed.load(Ordering::SeqCst));
    assert!(waited.load(Ordering::SeqCst));
}

#[test]
fn production_runner_times_out_and_redacts_process_output() {
    let killed = Arc::new(AtomicBool::new(false));
    let waited = Arc::new(AtomicBool::new(false));
    let runner = CommandSenseVoiceProcessRunner::with_spawner(Arc::new(FakeSpawner {
        child: Mutex::new(Some(WaitingChild {
            killed: killed.clone(),
            waited: waited.clone(),
            output: SenseVoiceProcessOutput {
                status_code: 9,
                stdout: b"api_key=must-not-leak".to_vec(),
                stderr: b"Bearer must-not-leak".to_vec(),
            },
        })),
        on_spawn_cancel: None,
    }));

    let error = runner
        .run(
            &hidden_invocation(),
            &AtomicBool::new(false),
            Duration::ZERO,
        )
        .unwrap_err();

    assert_eq!(error.code, "sensevoice_timeout");
    assert!(!format!("{} {}", error.message, error.recovery).contains("must-not-leak"));
    assert!(killed.load(Ordering::SeqCst));
    assert!(waited.load(Ordering::SeqCst));
}

#[test]
fn malformed_or_empty_json_is_rejected_without_raw_output() {
    let runner = Arc::new(FakeRunner {
        result: Ok(SenseVoiceProcessOutput {
            status_code: 0,
            stdout: b"{not-json api_key=must-not-leak}\n".to_vec(),
            stderr: Vec::new(),
        }),
        invocation: Mutex::new(None),
    });

    let error = ready_adapter(runner)
        .transcribe(
            Path::new("input.wav"),
            SenseVoiceOptions::default(),
            CancellationToken::new(),
        )
        .unwrap_err();

    assert_eq!(error.code, "sensevoice_output_invalid");
    assert!(!format!("{} {}", error.message, error.recovery).contains("must-not-leak"));
}

