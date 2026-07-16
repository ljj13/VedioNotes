use crate::domain::AppError;
use crate::process_utils::hidden_command;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const MAX_PROCESS_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Default)]
pub struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    pub fn flag(&self) -> &AtomicBool {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SenseVoiceProcessInvocation {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub windows_hidden: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SenseVoiceProcessOutput {
    pub status_code: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

/// Detail-free: OS errors and child output can contain user paths or secrets.
#[derive(Debug, Clone, Copy)]
pub struct SenseVoiceProcessError;

pub trait SenseVoiceChild: Send {
    fn try_wait(&mut self) -> Result<Option<i32>, SenseVoiceProcessError>;
    fn kill(&mut self) -> Result<(), SenseVoiceProcessError>;
    fn wait(&mut self) -> Result<SenseVoiceProcessOutput, SenseVoiceProcessError>;
}

pub trait SenseVoiceProcessSpawner: Send + Sync {
    fn spawn(
        &self,
        invocation: &SenseVoiceProcessInvocation,
    ) -> Result<Box<dyn SenseVoiceChild>, SenseVoiceProcessError>;
}

pub trait SenseVoiceProcessRunner: Send + Sync {
    fn run(
        &self,
        invocation: &SenseVoiceProcessInvocation,
        cancel: &AtomicBool,
        timeout: Duration,
    ) -> Result<SenseVoiceProcessOutput, AppError>;
}

struct StdSenseVoiceChild {
    child: std::process::Child,
    stdout: Arc<Mutex<Vec<u8>>>,
    stderr: Arc<Mutex<Vec<u8>>>,
    readers: Vec<JoinHandle<()>>,
}

impl SenseVoiceChild for StdSenseVoiceChild {
    fn try_wait(&mut self) -> Result<Option<i32>, SenseVoiceProcessError> {
        self.child
            .try_wait()
            .map(|status| status.map(|value| value.code().unwrap_or(-1)))
            .map_err(|_| SenseVoiceProcessError)
    }

    fn kill(&mut self) -> Result<(), SenseVoiceProcessError> {
        self.child.kill().map_err(|_| SenseVoiceProcessError)
    }

    fn wait(&mut self) -> Result<SenseVoiceProcessOutput, SenseVoiceProcessError> {
        let status = self.child.wait().map_err(|_| SenseVoiceProcessError)?;
        for reader in self.readers.drain(..) {
            let _ = reader.join();
        }
        let stdout = self.stdout.lock().map_err(|_| SenseVoiceProcessError)?.clone();
        let stderr = self.stderr.lock().map_err(|_| SenseVoiceProcessError)?.clone();
        Ok(SenseVoiceProcessOutput {
            status_code: status.code().unwrap_or(-1),
            stdout,
            stderr,
        })
    }
}

pub struct StdSenseVoiceProcessSpawner;

impl SenseVoiceProcessSpawner for StdSenseVoiceProcessSpawner {
    fn spawn(
        &self,
        invocation: &SenseVoiceProcessInvocation,
    ) -> Result<Box<dyn SenseVoiceChild>, SenseVoiceProcessError> {
        let mut command = hidden_command(&invocation.program);
        command
            .args(&invocation.args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn().map_err(|_| SenseVoiceProcessError)?;
        let stdout_pipe = child.stdout.take().ok_or(SenseVoiceProcessError)?;
        let stderr_pipe = child.stderr.take().ok_or(SenseVoiceProcessError)?;
        let stdout = Arc::new(Mutex::new(Vec::new()));
        let stderr = Arc::new(Mutex::new(Vec::new()));
        let stdout_reader = spawn_bounded_reader(stdout_pipe, stdout.clone());
        let stderr_reader = spawn_bounded_reader(stderr_pipe, stderr.clone());
        Ok(Box::new(StdSenseVoiceChild {
            child,
            stdout,
            stderr,
            readers: vec![stdout_reader, stderr_reader],
        }))
    }
}

fn spawn_bounded_reader<R: Read + Send + 'static>(
    mut input: R,
    output: Arc<Mutex<Vec<u8>>>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 16 * 1024];
        loop {
            let Ok(count) = input.read(&mut buffer) else {
                break;
            };
            if count == 0 {
                break;
            }
            if let Ok(mut bytes) = output.lock() {
                let remaining = MAX_PROCESS_OUTPUT_BYTES.saturating_sub(bytes.len());
                bytes.extend_from_slice(&buffer[..count.min(remaining)]);
            }
        }
    })
}

pub struct CommandSenseVoiceProcessRunner {
    spawner: Arc<dyn SenseVoiceProcessSpawner>,
}

impl CommandSenseVoiceProcessRunner {
    pub fn with_spawner(spawner: Arc<dyn SenseVoiceProcessSpawner>) -> Self {
        Self { spawner }
    }
}

impl Default for CommandSenseVoiceProcessRunner {
    fn default() -> Self {
        Self::with_spawner(Arc::new(StdSenseVoiceProcessSpawner))
    }
}

impl SenseVoiceProcessRunner for CommandSenseVoiceProcessRunner {
    fn run(
        &self,
        invocation: &SenseVoiceProcessInvocation,
        cancel: &AtomicBool,
        timeout: Duration,
    ) -> Result<SenseVoiceProcessOutput, AppError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(cancelled_error());
        }
        let mut child = self.spawner.spawn(invocation).map_err(|_| {
            AppError::new(
                "sensevoice_start_failed",
                "无法启动 SenseVoice 转写组件。",
                "请在设置中重新安装 SenseVoice 组件。",
            )
        })?;
        let started = Instant::now();
        loop {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(cancelled_error());
            }
            if started.elapsed() >= timeout {
                let _ = child.kill();
                let _ = child.wait();
                return Err(AppError::new(
                    "sensevoice_timeout",
                    "SenseVoice 转写超时。",
                    "请重试或改用本地 Whisper。",
                ));
            }
            match child.try_wait() {
                Ok(Some(_)) => {
                    let output = child.wait().map_err(|_| process_failed_error())?;
                    if output.status_code != 0 {
                        return Err(process_failed_error());
                    }
                    return Ok(output);
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(10)),
                Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(process_failed_error());
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct SenseVoiceOptions {
    pub language: String,
    pub use_itn: bool,
    pub num_threads: u16,
    pub timeout: Duration,
}

impl Default for SenseVoiceOptions {
    fn default() -> Self {
        Self {
            language: "auto".to_owned(),
            use_itn: true,
            num_threads: 2,
            timeout: Duration::from_secs(60 * 30),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SenseVoiceTranscript {
    pub text: String,
    #[serde(default)]
    pub timestamps: Vec<f32>,
    #[serde(default)]
    pub tokens: Vec<String>,
    #[serde(default)]
    pub words: Vec<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub emotion: Option<String>,
    #[serde(default)]
    pub event: Option<String>,
}

pub struct SenseVoiceAdapter {
    runner: Arc<dyn SenseVoiceProcessRunner>,
    runtime_path: PathBuf,
    model_path: PathBuf,
    tokens_path: PathBuf,
}

impl SenseVoiceAdapter {
    pub fn new(
        runner: Arc<dyn SenseVoiceProcessRunner>,
        runtime_path: PathBuf,
        model_path: PathBuf,
        tokens_path: PathBuf,
    ) -> Self {
        Self {
            runner,
            runtime_path,
            model_path,
            tokens_path,
        }
    }

    pub fn transcribe(
        &self,
        audio_path: &Path,
        options: SenseVoiceOptions,
        cancel: CancellationToken,
    ) -> Result<SenseVoiceTranscript, AppError> {
        self.transcribe_with_flag(audio_path, options, cancel.flag())
    }

    pub fn transcribe_with_flag(
        &self,
        audio_path: &Path,
        options: SenseVoiceOptions,
        cancel: &AtomicBool,
    ) -> Result<SenseVoiceTranscript, AppError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(cancelled_error());
        }
        let language = normalize_language(&options.language)?;
        let invocation = SenseVoiceProcessInvocation {
            program: self.runtime_path.clone(),
            args: vec![
                OsString::from(format!(
                    "--tokens={}",
                    self.tokens_path.to_string_lossy()
                )),
                OsString::from(format!(
                    "--sense-voice-model={}",
                    self.model_path.to_string_lossy()
                )),
                OsString::from(format!("--num-threads={}", options.num_threads.clamp(1, 16))),
                OsString::from(format!(
                    "--sense-voice-use-itn={}",
                    if options.use_itn { 1 } else { 0 }
                )),
                OsString::from(format!("--sense-voice-language={language}")),
                OsString::from("--debug=0"),
                audio_path.as_os_str().to_owned(),
            ],
            windows_hidden: true,
        };
        let output = self
            .runner
            .run(&invocation, cancel, options.timeout)?;
        parse_result(&output.stdout)
    }
}

fn normalize_language(language: &str) -> Result<&str, AppError> {
    match language.trim().to_ascii_lowercase().as_str() {
        "" | "auto" => Ok("auto"),
        "zh" => Ok("zh"),
        "en" => Ok("en"),
        "ja" => Ok("ja"),
        "ko" => Ok("ko"),
        "yue" => Ok("yue"),
        _ => Err(AppError::new(
            "sensevoice_language_invalid",
            "SenseVoice 识别语言不受支持。",
            "请选择自动、中文、英语、日语、韩语或粤语。",
        )),
    }
}

fn parse_result(stdout: &[u8]) -> Result<SenseVoiceTranscript, AppError> {
    let text = std::str::from_utf8(stdout).map_err(|_| output_invalid_error())?;
    let json_line = text
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with('{') && line.ends_with('}'))
        .ok_or_else(output_invalid_error)?;
    let result: SenseVoiceTranscript =
        serde_json::from_str(json_line).map_err(|_| output_invalid_error())?;
    if result.text.trim().is_empty() {
        return Err(output_invalid_error());
    }
    Ok(SenseVoiceTranscript {
        text: result.text.trim().to_owned(),
        ..result
    })
}

fn cancelled_error() -> AppError {
    AppError::new("cancelled", "任务已取消。", "可以重新开始转写。")
}

fn process_failed_error() -> AppError {
    AppError::new(
        "sensevoice_process_failed",
        "SenseVoice 转写进程执行失败。",
        "请查看应用日志，或改用本地 Whisper。",
    )
}

fn output_invalid_error() -> AppError {
    AppError::new(
        "sensevoice_output_invalid",
        "SenseVoice 返回了无法读取的结果。",
        "请重试或重新安装 SenseVoice 组件。",
    )
}
