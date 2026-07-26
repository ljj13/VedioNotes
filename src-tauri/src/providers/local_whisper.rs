//! 本地 Whisper 适配器——封装 whisper.cpp CLI 的调用，包括参数构造、输出解析和错误处理.

use async_trait::async_trait;
use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use crate::credential_store::SecretPayload;
use crate::diagnostics::{
    self, DiagnosticEventKind, DiagnosticLevel, DiagnosticRecord,
};
use crate::local_models::ready_model_path;
use crate::profiles::TranscriptionProfile;
use crate::providers::error::{self, ProviderError, ProviderErrorKind};
use crate::providers::TranscriptionAdapter;
use crate::process_utils::hidden_command;

#[derive(Debug, Clone)]
/// ProcessOutput
pub struct ProcessOutput {
    pub status_code: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

/// Detail-free because process and filesystem details may contain user paths.
#[derive(Debug, Clone)]
/// LocalWhisperError
pub struct LocalWhisperError;

/// WhisperProgressReporter
pub type WhisperProgressReporter = Arc<dyn Fn(u8) + Send + Sync>;
/// WhisperComputeFallbackReporter
pub type WhisperComputeFallbackReporter = Arc<dyn Fn() + Send + Sync>;

#[derive(Debug, Clone)]
/// WhisperRuntimePaths
pub struct WhisperRuntimePaths {
    pub cpu_cli: PathBuf,
    pub cuda_cli: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// WhisperComputeSelection
pub enum WhisperComputeSelection {
    Automatic,
    CpuOnly,
}

/// WhisperProcessRunner
pub trait WhisperProcessRunner: Send + Sync {
    fn run(
        &self,
        program: &Path,
        args: &[OsString],
        cancel: &AtomicBool,
        progress: WhisperProgressReporter,
    ) -> Result<ProcessOutput, LocalWhisperError>;
}

/// WhisperChild
pub trait WhisperChild: Send {
    fn try_wait(&mut self) -> Result<Option<i32>, LocalWhisperError>;
    fn kill(&mut self) -> Result<(), LocalWhisperError>;
    fn wait(&mut self) -> Result<ProcessOutput, LocalWhisperError>;
}

/// WhisperProcessSpawner
pub trait WhisperProcessSpawner: Send + Sync {
    fn spawn(
        &self,
        program: &Path,
        args: &[OsString],
        progress: WhisperProgressReporter,
    ) -> Result<Box<dyn WhisperChild>, LocalWhisperError>;
}

struct StdWhisperChild {
    child: std::process::Child,
    stderr_reader: Option<JoinHandle<()>>,
}

impl WhisperChild for StdWhisperChild {
    fn try_wait(&mut self) -> Result<Option<i32>, LocalWhisperError> {
        self.child
            .try_wait()
            .map(|status| status.map(|value| value.code().unwrap_or(-1)))
            .map_err(|_| LocalWhisperError)
    }

    fn kill(&mut self) -> Result<(), LocalWhisperError> {
        self.child.kill().map_err(|_| LocalWhisperError)
    }

    fn wait(&mut self) -> Result<ProcessOutput, LocalWhisperError> {
        let status = self.child.wait().map_err(|_| LocalWhisperError)?;
        if let Some(reader) = self.stderr_reader.take() {
            let _ = reader.join();
        }
        Ok(ProcessOutput {
            status_code: status.code().unwrap_or(-1),
            stdout: Vec::new(),
            stderr: Vec::new(),
        })
    }
}

/// StdWhisperProcessSpawner
pub struct StdWhisperProcessSpawner;

impl WhisperProcessSpawner for StdWhisperProcessSpawner {
    fn spawn(
        &self,
        program: &Path,
        args: &[OsString],
        progress: WhisperProgressReporter,
    ) -> Result<Box<dyn WhisperChild>, LocalWhisperError> {
        let mut child = hidden_command(program)
            .args(args)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| LocalWhisperError)?;
        let stderr = child.stderr.take().ok_or(LocalWhisperError)?;
        let stderr_reader = std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(percent) = parse_whisper_progress_line(&line) {
                    progress(percent);
                }
            }
        });
        Ok(Box::new(StdWhisperChild {
            child,
            stderr_reader: Some(stderr_reader),
        }))
    }
}

/// CommandWhisperProcessRunner
pub struct CommandWhisperProcessRunner {
    spawner: Arc<dyn WhisperProcessSpawner>,
}

impl CommandWhisperProcessRunner {
    /// with spawner
    pub fn with_spawner(spawner: Arc<dyn WhisperProcessSpawner>) -> Self {
        Self { spawner }
    }
}

impl Default for CommandWhisperProcessRunner {
    fn default() -> Self {
        Self::with_spawner(Arc::new(StdWhisperProcessSpawner))
    }
}

impl WhisperProcessRunner for CommandWhisperProcessRunner {
    fn run(
        &self,
        program: &Path,
        args: &[OsString],
        cancel: &AtomicBool,
        progress: WhisperProgressReporter,
    ) -> Result<ProcessOutput, LocalWhisperError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(LocalWhisperError);
        }
        let mut child = self.spawner.spawn(program, args, progress)?;
        loop {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(LocalWhisperError);
            }
            if child.try_wait()?.is_some() {
                return child.wait();
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

/// LocalWhisperCppAdapter
pub struct LocalWhisperCppAdapter {
    pub runner: Arc<dyn WhisperProcessRunner>,
    pub model_root: PathBuf,
    pub cli_path: PathBuf,
    runtime_paths: WhisperRuntimePaths,
    compute_selection: WhisperComputeSelection,
    ready_model_override: Option<PathBuf>,
    progress_reporter: WhisperProgressReporter,
    compute_fallback_reporter: WhisperComputeFallbackReporter,
}

impl LocalWhisperCppAdapter {
    /// new
    pub fn new(
        runner: Arc<dyn WhisperProcessRunner>,
        model_root: PathBuf,
        cli_path: PathBuf,
    ) -> Self {
        let runtime_paths = WhisperRuntimePaths {
            cpu_cli: cli_path.clone(),
            cuda_cli: None,
        };
        Self {
            runner,
            model_root,
            cli_path,
            runtime_paths,
            compute_selection: WhisperComputeSelection::Automatic,
            ready_model_override: None,
            progress_reporter: Arc::new(|_| {}),
            compute_fallback_reporter: Arc::new(|| {}),
        }
    }

    /// with runtime paths
    pub fn with_runtime_paths(
        runner: Arc<dyn WhisperProcessRunner>,
        model_root: PathBuf,
        runtime_paths: WhisperRuntimePaths,
        compute_selection: WhisperComputeSelection,
    ) -> Self {
        Self {
            runner,
            model_root,
            cli_path: runtime_paths.cpu_cli.clone(),
            runtime_paths,
            compute_selection,
            ready_model_override: None,
            progress_reporter: Arc::new(|_| {}),
            compute_fallback_reporter: Arc::new(|| {}),
        }
    }

    /// Narrow deterministic seam for fake-process tests. Production uses `new`.
    pub fn with_ready_model_path(
        runner: Arc<dyn WhisperProcessRunner>,
        model_path: PathBuf,
        cli_path: PathBuf,
    ) -> Self {
        let runtime_paths = WhisperRuntimePaths {
            cpu_cli: cli_path.clone(),
            cuda_cli: None,
        };
        Self {
            runner,
            model_root: PathBuf::new(),
            cli_path,
            runtime_paths,
            compute_selection: WhisperComputeSelection::Automatic,
            ready_model_override: Some(model_path),
            progress_reporter: Arc::new(|_| {}),
            compute_fallback_reporter: Arc::new(|| {}),
        }
    }

    /// with ready model runtime paths
    pub fn with_ready_model_runtime_paths(
        runner: Arc<dyn WhisperProcessRunner>,
        model_path: PathBuf,
        runtime_paths: WhisperRuntimePaths,
        compute_selection: WhisperComputeSelection,
    ) -> Self {
        Self {
            runner,
            model_root: PathBuf::new(),
            cli_path: runtime_paths.cpu_cli.clone(),
            runtime_paths,
            compute_selection,
            ready_model_override: Some(model_path),
            progress_reporter: Arc::new(|_| {}),
            compute_fallback_reporter: Arc::new(|| {}),
        }
    }

    /// with progress reporter
    pub fn with_progress_reporter(mut self, reporter: WhisperProgressReporter) -> Self {
        self.progress_reporter = reporter;
        self
    }

    /// with compute fallback reporter
    pub fn with_compute_fallback_reporter(
        mut self,
        reporter: WhisperComputeFallbackReporter,
    ) -> Self {
        self.compute_fallback_reporter = reporter;
        self
    }

    fn model_path(&self, profile: &TranscriptionProfile) -> Result<PathBuf, ProviderError> {
        if let Some(path) = &self.ready_model_override {
            return Ok(path.clone());
        }
        ready_model_path(&self.model_root, &profile.model).map_err(|_| {
            ProviderError::new(
                ProviderErrorKind::ProviderError,
                "本地 Whisper 模型尚未准备就绪。",
                "请下载或重新下载该模型。",
            )
        })
    }

    fn output_base(audio_path: &Path) -> PathBuf {
        let name = audio_path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("audio");
        audio_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(format!(".{name}.whisper"))
    }
}

/// whisper text output path
pub fn whisper_text_output_path(output_base: &Path) -> PathBuf {
    let mut output = output_base.as_os_str().to_os_string();
    output.push(".txt");
    PathBuf::from(output)
}

/// parse whisper progress line
pub fn parse_whisper_progress_line(line: &str) -> Option<u8> {
    let percent_index = line.rfind('%')?;
    let prefix = line[..percent_index].trim_end();
    let digits_reversed: String = prefix
        .chars()
        .rev()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    if digits_reversed.is_empty() {
        return None;
    }
    let digits: String = digits_reversed.chars().rev().collect();
    let percent = digits.parse::<u8>().ok()?;
    (percent <= 100).then_some(percent)
}

/// map whisper to overall percent
pub fn map_whisper_to_overall_percent(percent: u8) -> u8 {
    35 + ((u16::from(percent.min(100)) * 35) / 100) as u8
}

enum WhisperAttemptError {
    Cancelled,
    Failed,
}

impl LocalWhisperCppAdapter {
    fn run_attempt(
        &self,
        cli_path: &Path,
        args: &[OsString],
        output_text: &Path,
        cancel: &AtomicBool,
    ) -> Result<String, WhisperAttemptError> {
        let _ = std::fs::remove_file(output_text);
        let output = match self.runner.run(
            cli_path,
            args,
            cancel,
            self.progress_reporter.clone(),
        ) {
            Ok(output) => output,
            Err(_) => {
                let _ = std::fs::remove_file(output_text);
                return Err(if cancel.load(Ordering::SeqCst) {
                    WhisperAttemptError::Cancelled
                } else {
                    WhisperAttemptError::Failed
                });
            }
        };
        if cancel.load(Ordering::SeqCst) {
            let _ = std::fs::remove_file(output_text);
            return Err(WhisperAttemptError::Cancelled);
        }
        if output.status_code != 0 {
            diagnostics::record(DiagnosticRecord {
                level: DiagnosticLevel::Error,
                event: DiagnosticEventKind::ProcessExited,
                task_id: None,
                stage: None,
                percent: None,
                elapsed_ms: None,
                exit_code: Some(output.status_code),
                output_exists: Some(output_text.is_file()),
                output_bytes: output_text.metadata().ok().map(|meta| meta.len()),
            });
            let _ = std::fs::remove_file(output_text);
            return Err(WhisperAttemptError::Failed);
        }
        let output_exists = output_text.is_file();
        let output_bytes = output_text.metadata().ok().map(|meta| meta.len());
        diagnostics::record(DiagnosticRecord {
            level: if output_exists {
                DiagnosticLevel::Info
            } else {
                DiagnosticLevel::Warning
            },
            event: if output_exists {
                DiagnosticEventKind::ProcessExited
            } else {
                DiagnosticEventKind::OutputMissing
            },
            task_id: None,
            stage: None,
            percent: Some(70),
            elapsed_ms: None,
            exit_code: Some(output.status_code),
            output_exists: Some(output_exists),
            output_bytes,
        });
        let text = std::fs::read(output_text);
        let _ = std::fs::remove_file(output_text);
        let text = text.map_err(|_| WhisperAttemptError::Failed)?;
        let text = String::from_utf8(text).map_err(|_| WhisperAttemptError::Failed)?;
        let text = text.trim().to_string();
        if text.is_empty() {
            return Err(WhisperAttemptError::Failed);
        }
        Ok(text)
    }
}

#[async_trait]
impl TranscriptionAdapter for LocalWhisperCppAdapter {
    async fn transcribe(
        &self,
        audio_path: &Path,
        profile: &TranscriptionProfile,
        _secret: &SecretPayload,
        cancel: &AtomicBool,
    ) -> Result<String, ProviderError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(error::err_cancelled());
        }
        let model_path = self.model_path(profile)?;
        if !self.runtime_paths.cpu_cli.is_file() && self.ready_model_override.is_none() {
            return Err(ProviderError::new(
                ProviderErrorKind::ProviderError,
                "本地 Whisper 运行组件不可用。",
                "请重新安装应用后重试。",
            ));
        }
        if !audio_path.is_file() {
            return Err(ProviderError::new(
                ProviderErrorKind::ProviderError,
                "本地音频文件不可读取。",
                "请重新选择视频后重试。",
            ));
        }

        let output_base = Self::output_base(audio_path);
        let output_text = whisper_text_output_path(&output_base);
        let args = vec![
            OsString::from("-m"),
            model_path.into_os_string(),
            OsString::from("-f"),
            audio_path.as_os_str().to_os_string(),
            OsString::from("-l"),
            OsString::from("auto"),
            OsString::from("-of"),
            output_base.into_os_string(),
            OsString::from("-otxt"),
        ];
        let (primary_cli, used_cuda) = match (
            self.compute_selection,
            self.runtime_paths.cuda_cli.as_deref(),
        ) {
            (WhisperComputeSelection::Automatic, Some(cuda_cli)) => (cuda_cli, true),
            _ => (self.runtime_paths.cpu_cli.as_path(), false),
        };
        match self.run_attempt(primary_cli, &args, &output_text, cancel) {
            Ok(text) => Ok(text),
            Err(WhisperAttemptError::Cancelled) => Err(error::err_cancelled()),
            Err(WhisperAttemptError::Failed) if used_cuda && !cancel.load(Ordering::SeqCst) => {
                (self.compute_fallback_reporter)();
                match self.run_attempt(
                    &self.runtime_paths.cpu_cli,
                    &args,
                    &output_text,
                    cancel,
                ) {
                    Ok(text) => Ok(text),
                    Err(WhisperAttemptError::Cancelled) => Err(error::err_cancelled()),
                    Err(WhisperAttemptError::Failed) => Err(ProviderError::new(
                        ProviderErrorKind::ProviderError,
                        "本地 Whisper 转写失败。",
                        "CUDA 与 CPU 转写均未成功，请检查模型和音频后重试。",
                    )),
                }
            }
            Err(WhisperAttemptError::Failed) => Err(ProviderError::new(
                ProviderErrorKind::ProviderError,
                "本地 Whisper 转写失败。",
                "请检查运行组件、模型和音频后重试。",
            )),
        }
    }
}
