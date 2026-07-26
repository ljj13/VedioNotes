//! 诊断工具——提供诊断日志文件路径查询.

use crate::domain::TaskStage;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// DEFAULT MAX LOG BYTES
pub const DEFAULT_MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
/// DiagnosticLevel
pub enum DiagnosticLevel {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
/// DiagnosticEventKind
pub enum DiagnosticEventKind {
    AppStarted,
    TaskStarted,
    StageChanged,
    TaskCompleted,
    TaskCancelled,
    TaskFailed,
    ProcessExited,
    OutputMissing,
    LocalComputeFallback,
}

#[derive(Debug, Clone, Serialize)]
/// DiagnosticRecord
pub struct DiagnosticRecord {
    pub level: DiagnosticLevel,
    pub event: DiagnosticEventKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<TaskStage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elapsed_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_exists: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_bytes: Option<u64>,
}

impl DiagnosticRecord {
    /// task
    pub fn task(event: DiagnosticEventKind, task_id: impl Into<String>) -> Self {
        Self {
            level: DiagnosticLevel::Info,
            event,
            task_id: Some(task_id.into()),
            stage: None,
            percent: None,
            elapsed_ms: None,
            exit_code: None,
            output_exists: None,
            output_bytes: None,
        }
    }
}

#[derive(Debug, Clone)]
/// DiagnosticLogger
pub struct DiagnosticLogger {
    path: PathBuf,
    rotated_path: PathBuf,
    max_bytes: u64,
}

#[derive(Serialize)]
struct TimestampedRecord<'a> {
    timestamp: String,
    #[serde(flatten)]
    record: &'a DiagnosticRecord,
}

impl DiagnosticLogger {
    /// new
    pub fn new(app_data_dir: &Path) -> io::Result<Self> {
        Self::with_max_bytes(app_data_dir, DEFAULT_MAX_LOG_BYTES)
    }

    /// with max bytes
    pub fn with_max_bytes(app_data_dir: &Path, max_bytes: u64) -> io::Result<Self> {
        if max_bytes == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "diagnostic log size must be positive",
            ));
        }
        let log_dir = app_data_dir.join("logs");
        fs::create_dir_all(&log_dir)?;
        Ok(Self {
            path: log_dir.join("video-distiller.log"),
            rotated_path: log_dir.join("video-distiller.1.log"),
            max_bytes,
        })
    }

    /// path
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// rotated path
    pub fn rotated_path(&self) -> &Path {
        &self.rotated_path
    }

    /// record
    pub fn record(&self, record: DiagnosticRecord) -> io::Result<()> {
        validate_record(&record)?;
        let line = serde_json::to_vec(&TimestampedRecord {
            timestamp: chrono::Utc::now().to_rfc3339(),
            record: &record,
        })
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let next_size = line.len() as u64 + 1;
        let current_size = self.path.metadata().map(|meta| meta.len()).unwrap_or(0);
        if current_size > 0 && current_size.saturating_add(next_size) > self.max_bytes {
            let _ = fs::remove_file(&self.rotated_path);
            fs::rename(&self.path, &self.rotated_path)?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        file.write_all(&line)?;
        file.write_all(b"\n")
    }
}

fn validate_record(record: &DiagnosticRecord) -> io::Result<()> {
    if record.percent.is_some_and(|percent| percent > 100) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "diagnostic percentage is out of range",
        ));
    }
    if let Some(task_id) = &record.task_id {
        let safe = !task_id.is_empty()
            && task_id.len() <= 128
            && task_id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'));
        if !safe {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "diagnostic task identifier is unsafe",
            ));
        }
    }
    Ok(())
}

static GLOBAL_LOGGER: OnceLock<DiagnosticLogger> = OnceLock::new();

/// initialize
pub fn initialize(app_data_dir: &Path) -> io::Result<PathBuf> {
    if let Some(logger) = GLOBAL_LOGGER.get() {
        return Ok(logger.path().to_path_buf());
    }
    let logger = DiagnosticLogger::new(app_data_dir)?;
    let path = logger.path().to_path_buf();
    let _ = GLOBAL_LOGGER.set(logger);
    Ok(path)
}

/// record
pub fn record(record: DiagnosticRecord) {
    if let Some(logger) = GLOBAL_LOGGER.get() {
        let _ = logger.record(record);
    }
}

/// log path
pub fn log_path() -> Option<PathBuf> {
    GLOBAL_LOGGER.get().map(|logger| logger.path().to_path_buf())
}
