//! 任务记录存储——SQLite 数据库的 task_records 表操作.
//! 记录每次蒸馏任务的执行情况.

use crate::domain::{AppError, InputSource, TaskOptions};
use crate::history_store::HistoryStore;
use crate::history_store::LibraryEntry;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
/// TaskState
pub enum TaskState {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl TaskState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err(storage_error()),
        }
    }

    fn is_terminal(self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Cancelled)
    }
}

#[derive(Debug, Clone, PartialEq)]
/// TaskRecordInput
pub struct TaskRecordInput {
    pub task_id: String,
    pub title: String,
    pub source: InputSource,
    pub source_label: String,
    pub options: TaskOptions,
    pub transcription_profile_id: String,
    pub transcription_profile_name: String,
    pub transcription_model: String,
    pub summary_profile_id: String,
    pub summary_profile_name: String,
    pub summary_model: String,
    pub compute: String,
    pub started_at: String,
    pub diagnostic_log_id: Option<String>,
}

impl TaskRecordInput {
    /// running
    pub fn running(task_id: impl Into<String>) -> Self {
        Self {
            task_id: task_id.into(),
            title: "视频提炼任务".into(),
            source: InputSource::File {
                path: String::new(),
            },
            source_label: "本地文件".into(),
            options: TaskOptions::default(),
            transcription_profile_id: String::new(),
            transcription_profile_name: String::new(),
            transcription_model: String::new(),
            summary_profile_id: String::new(),
            summary_profile_name: String::new(),
            summary_model: String::new(),
            compute: "cpu".into(),
            started_at: Utc::now().to_rfc3339(),
            diagnostic_log_id: Some("app-diagnostics".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// TaskRecord
pub struct TaskRecord {
    pub id: i64,
    pub task_id: String,
    pub title: String,
    pub source_label: String,
    pub state: TaskState,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub transcription_profile_id: String,
    pub transcription_profile_name: String,
    pub transcription_model: String,
    pub summary_profile_id: String,
    pub summary_profile_name: String,
    pub summary_model: String,
    pub compute: String,
    pub note_id: Option<i64>,
    pub error_code: Option<String>,
    pub diagnostic_log_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// TaskRetryRequest
pub struct TaskRetryRequest {
    pub source: InputSource,
    pub options: TaskOptions,
    pub transcription_profile_id: String,
    pub summary_profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// HomeSnapshot
pub struct HomeSnapshot {
    pub note_count: u64,
    pub task_count: u64,
    pub ready_local_model_count: u64,
    pub recent_notes: Vec<LibraryEntry>,
    pub recent_tasks: Vec<TaskRecord>,
}

/// 任务记录存储——管理任务执行记录（SQLite）。
pub struct TaskStore {
    database_path: PathBuf,
}

impl TaskStore {
    /// open
    pub fn open(database_path: PathBuf) -> Result<Self, AppError> {
        if let Some(parent) = database_path.parent() {
            std::fs::create_dir_all(parent).map_err(|_| storage_error())?;
        }
        // Task records and notes deliberately share one application database.
        // Initialize the parent note schema first so the note_id foreign key is
        // valid even when the first action in a fresh profile is starting a task.
        HistoryStore::open(database_path.clone())?;
        let store = Self { database_path };
        let connection = store.connection()?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS task_records (
                    id INTEGER PRIMARY KEY,
                    task_id TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    source_label TEXT NOT NULL,
                    source_json TEXT NOT NULL,
                    options_json TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    duration_ms INTEGER,
                    transcription_profile_id TEXT NOT NULL,
                    transcription_profile_name TEXT NOT NULL,
                    transcription_model TEXT NOT NULL,
                    summary_profile_id TEXT NOT NULL,
                    summary_profile_name TEXT NOT NULL,
                    summary_model TEXT NOT NULL,
                    compute TEXT NOT NULL,
                    note_id INTEGER REFERENCES history_entries(id) ON DELETE SET NULL,
                    error_code TEXT,
                    diagnostic_log_id TEXT
                );
                CREATE INDEX IF NOT EXISTS task_records_started_at_idx ON task_records(started_at DESC);
                CREATE INDEX IF NOT EXISTS task_records_state_idx ON task_records(state);",
            )
            .map_err(|_| storage_error())?;
        Ok(store)
    }

    /// insert task
    pub fn insert_task(&self, input: &TaskRecordInput) -> Result<i64, AppError> {
        if input.task_id.trim().is_empty() {
            return Err(AppError::new(
                "invalid_task_record",
                "任务记录无效。",
                "请重新创建任务。",
            ));
        }
        let source_json = serde_json::to_string(&input.source).map_err(|_| storage_error())?;
        let options_json = serde_json::to_string(&input.options).map_err(|_| storage_error())?;
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO task_records (
                    task_id, title, source_label, source_json, options_json, state, started_at,
                    transcription_profile_id, transcription_profile_name, transcription_model,
                    summary_profile_id, summary_profile_name, summary_model, compute, diagnostic_log_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, 'running', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    input.task_id,
                    input.title,
                    input.source_label,
                    source_json,
                    options_json,
                    input.started_at,
                    input.transcription_profile_id,
                    input.transcription_profile_name,
                    input.transcription_model,
                    input.summary_profile_id,
                    input.summary_profile_name,
                    input.summary_model,
                    input.compute,
                    input.diagnostic_log_id,
                ],
            )
            .map_err(|_| storage_error())?;
        Ok(connection.last_insert_rowid())
    }

    /// finish task
    pub fn finish_task(
        &self,
        id: i64,
        state: TaskState,
        error_code: Option<&str>,
        note_id: Option<i64>,
    ) -> Result<(), AppError> {
        if !state.is_terminal() {
            return Err(AppError::new(
                "invalid_task_state",
                "任务终态无效。",
                "请刷新任务状态后重试。",
            ));
        }
        let error_code = normalize_error_code(error_code)?;
        let connection = self.connection()?;
        let started_at = connection
            .query_row(
                "SELECT started_at FROM task_records WHERE id = ?1",
                params![id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| storage_error())?
            .ok_or_else(task_missing)?;
        let finished_at = Utc::now();
        let duration_ms = DateTime::parse_from_rfc3339(&started_at)
            .ok()
            .map(|started| {
                finished_at
                    .signed_duration_since(started.with_timezone(&Utc))
                    .num_milliseconds()
                    .max(0) as u64
            });
        connection
            .execute(
                "UPDATE task_records SET state = ?1, finished_at = ?2, duration_ms = ?3, error_code = ?4, note_id = ?5 WHERE id = ?6",
                params![state.as_str(), finished_at.to_rfc3339(), duration_ms, error_code, note_id, id],
            )
            .map_err(|_| storage_error())?;
        Ok(())
    }

    /// get task
    pub fn get_task(&self, id: i64) -> Result<Option<TaskRecord>, AppError> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT id, task_id, title, source_label, state, started_at, finished_at, duration_ms,
                        transcription_profile_id, transcription_profile_name, transcription_model,
                        summary_profile_id, summary_profile_name, summary_model, compute, note_id,
                        error_code, diagnostic_log_id
                 FROM task_records WHERE id = ?1",
                params![id],
                read_record,
            )
            .optional()
            .map_err(|_| storage_error())
    }

    /// list tasks
    pub fn list_tasks(&self, query: &str) -> Result<Vec<TaskRecord>, AppError> {
        let connection = self.connection()?;
        let pattern = format!("%{}%", query.trim());
        let mut statement = connection
            .prepare(
                "SELECT id, task_id, title, source_label, state, started_at, finished_at, duration_ms,
                        transcription_profile_id, transcription_profile_name, transcription_model,
                        summary_profile_id, summary_profile_name, summary_model, compute, note_id,
                        error_code, diagnostic_log_id
                 FROM task_records
                 WHERE ?1 = '%%' OR title LIKE ?1 OR source_label LIKE ?1
                 ORDER BY id DESC",
            )
            .map_err(|_| storage_error())?;
        let records = statement
            .query_map(params![pattern], read_record)
            .map_err(|_| storage_error())?
            .map(|row| row.map_err(|_| storage_error()))
            .collect();
        records
    }

    /// retry request
    pub fn retry_request(&self, id: i64) -> Result<TaskRetryRequest, AppError> {
        let connection = self.connection()?;
        let row = connection
            .query_row(
                "SELECT source_json, options_json, transcription_profile_id, summary_profile_id FROM task_records WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()
            .map_err(|_| storage_error())?
            .ok_or_else(task_missing)?;
        Ok(TaskRetryRequest {
            source: serde_json::from_str(&row.0).map_err(|_| storage_error())?,
            options: serde_json::from_str(&row.1).map_err(|_| storage_error())?,
            transcription_profile_id: row.2,
            summary_profile_id: row.3,
        })
    }

    /// update title
    pub fn update_title(&self, id: i64, title: &str) -> Result<(), AppError> {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 240 {
            return Err(AppError::new(
                "invalid_task_title",
                "任务标题无效。",
                "请刷新任务记录后重试。",
            ));
        }
        let connection = self.connection()?;
        let changed = connection
            .execute(
                "UPDATE task_records SET title = ?1 WHERE id = ?2",
                params![title, id],
            )
            .map_err(|_| storage_error())?;
        if changed == 0 {
            return Err(task_missing());
        }
        Ok(())
    }

    fn connection(&self) -> Result<Connection, AppError> {
        let connection = Connection::open(&self.database_path).map_err(|_| storage_error())?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
            .map_err(|_| storage_error())?;
        Ok(connection)
    }
}

fn read_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRecord> {
    let state: String = row.get(4)?;
    Ok(TaskRecord {
        id: row.get(0)?,
        task_id: row.get(1)?,
        title: row.get(2)?,
        source_label: row.get(3)?,
        state: TaskState::parse(&state).map_err(|_| rusqlite::Error::InvalidQuery)?,
        started_at: row.get(5)?,
        finished_at: row.get(6)?,
        duration_ms: row.get(7)?,
        transcription_profile_id: row.get(8)?,
        transcription_profile_name: row.get(9)?,
        transcription_model: row.get(10)?,
        summary_profile_id: row.get(11)?,
        summary_profile_name: row.get(12)?,
        summary_model: row.get(13)?,
        compute: row.get(14)?,
        note_id: row.get(15)?,
        error_code: row.get(16)?,
        diagnostic_log_id: row.get(17)?,
    })
}

fn normalize_error_code(value: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(value) = value else { return Ok(None) };
    let value = value.trim();
    if value.is_empty()
        || value.len() > 64
        || !value
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '_' || character == '-')
    {
        return Err(AppError::new(
            "invalid_task_error_code",
            "任务错误代码无效。",
            "请刷新任务记录后重试。",
        ));
    }
    Ok(Some(value.to_string()))
}

fn task_missing() -> AppError {
    AppError::new(
        "task_record_missing",
        "任务记录不存在。",
        "请刷新任务列表后重试。",
    )
}

fn storage_error() -> AppError {
    AppError::new(
        "task_storage_failed",
        "任务记录存储失败。",
        "请检查磁盘空间和应用数据目录权限。",
    )
}
