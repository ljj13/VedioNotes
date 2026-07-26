//! 历史记录存储——SQLite 数据库的 history 表操作.
//! 每次 AI 生成笔记后在这里记录.

use crate::domain::{AppError, Distillation, NoteStyle, TaskOptions};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// HistoryEntry
pub struct HistoryEntry {
    pub id: i64,
    pub title: String,
    pub source: String,
    pub note_template: String,
    pub note_style: NoteStyle,
    pub created_at: String,
    pub markdown_path: PathBuf,
    pub transcript_path: PathBuf,
    pub thumbnail_path: Option<PathBuf>,
    pub screenshot_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone)]
/// HistoryEntryInput
pub struct HistoryEntryInput {
    pub title: String,
    pub source: String,
    pub note_template: String,
    pub note_style: NoteStyle,
    pub created_at: String,
    pub markdown_path: PathBuf,
    pub transcript_path: PathBuf,
    pub thumbnail_path: Option<PathBuf>,
    pub screenshot_paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
/// LibrarySort
pub enum LibrarySort {
    #[default]
    Newest,
    RecentlyOpened,
    Title,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// LibraryQuery
pub struct LibraryQuery {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub favorite: Option<bool>,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub sort: LibrarySort,
    #[serde(default = "default_library_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

impl Default for LibraryQuery {
    fn default() -> Self {
        Self {
            text: String::new(),
            favorite: None,
            tag: None,
            sort: LibrarySort::Newest,
            limit: default_library_limit(),
            offset: 0,
        }
    }
}

impl LibraryQuery {
    /// tag
    pub fn tag(tag: impl Into<String>) -> Self {
        Self {
            tag: Some(tag.into()),
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// LibraryEntry
pub struct LibraryEntry {
    pub id: i64,
    pub title: String,
    pub source: String,
    pub note_template: String,
    pub note_style: NoteStyle,
    pub created_at: String,
    pub markdown_path: PathBuf,
    pub transcript_path: PathBuf,
    pub thumbnail_path: Option<PathBuf>,
    pub screenshot_paths: Vec<PathBuf>,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
/// Tag
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub note_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// LibrarySnapshot
pub struct LibrarySnapshot {
    pub entries: Vec<LibraryEntry>,
    pub tags: Vec<Tag>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
/// NoteChatTurn
pub struct NoteChatTurn {
    pub role: String,
    pub content: String,
}

impl NoteChatTurn {
    /// user
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
        }
    }
    /// assistant
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: content.into(),
        }
    }
}

/// 历史记录存储——管理已生成的笔记记录（SQLite）。
pub struct HistoryStore {
    database_path: PathBuf,
    assets_root: PathBuf,
}

impl HistoryStore {
    /// open
    pub fn open(database_path: PathBuf) -> Result<Self, AppError> {
        if let Some(parent) = database_path.parent() {
            std::fs::create_dir_all(parent).map_err(storage_error)?;
        }
        let parent = database_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        let assets_root = parent.join("history-assets");
        std::fs::create_dir_all(&assets_root).map_err(storage_error)?;
        let store = Self {
            database_path,
            assets_root: assets_root.canonicalize().map_err(storage_error)?,
        };
        let connection = store.connection()?;
        connection.execute_batch("\
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS history_entries (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL, source TEXT NOT NULL, note_template TEXT NOT NULL,
                note_style TEXT NOT NULL DEFAULT 'minimal',
                created_at TEXT NOT NULL, markdown_path TEXT NOT NULL, transcript_path TEXT NOT NULL,
                thumbnail_path TEXT
            );
            CREATE TABLE IF NOT EXISTS history_screenshots (
                history_id INTEGER NOT NULL REFERENCES history_entries(id) ON DELETE CASCADE,
                path TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_conversation_turns (
                id INTEGER PRIMARY KEY,
                history_id INTEGER NOT NULL REFERENCES history_entries(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS history_search USING fts5(
                title, source, note, transcript
            );
        ").map_err(storage_error)?;
        ensure_note_style_column(&connection)?;
        ensure_library_schema(&connection)?;
        Ok(store)
    }

    /// create
    pub fn create(&self, input: &HistoryEntryInput) -> Result<i64, AppError> {
        validate_asset(&input.markdown_path, &["md"])?;
        validate_asset(&input.transcript_path, &["txt"])?;
        if let Some(path) = &input.thumbnail_path {
            validate_asset(path, &["jpg", "jpeg", "png", "webp"])?;
        }
        for path in &input.screenshot_paths {
            validate_asset(path, &["jpg", "jpeg", "png", "webp"])?;
        }
        let entry_dir = self.assets_root.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&entry_dir).map_err(storage_error)?;
        let markdown_path = copy_owned_asset(&input.markdown_path, &entry_dir.join("note.md"))?;
        let transcript_path =
            copy_owned_asset(&input.transcript_path, &entry_dir.join("transcript.txt"))?;
        let thumbnail_path = input
            .thumbnail_path
            .as_ref()
            .map(|path| {
                copy_owned_asset(
                    path,
                    &entry_dir
                        .join("thumbnail")
                        .with_extension(path.extension().unwrap()),
                )
            })
            .transpose()?;
        let screenshot_paths = input
            .screenshot_paths
            .iter()
            .enumerate()
            .map(|(index, path)| {
                copy_owned_asset(
                    path,
                    &entry_dir
                        .join(format!("screenshot-{index}"))
                        .with_extension(path.extension().unwrap()),
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let note = std::fs::read_to_string(&markdown_path).map_err(storage_error)?;
        let transcript = std::fs::read_to_string(&transcript_path).map_err(storage_error)?;
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(storage_error)?;
        tx.execute("INSERT INTO history_entries (title, source, note_template, note_style, created_at, markdown_path, transcript_path, thumbnail_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", params![&input.title, &input.source, &input.note_template, input.note_style.as_str(), &input.created_at, markdown_path.to_string_lossy(), transcript_path.to_string_lossy(), thumbnail_path.as_ref().map(|path| path.to_string_lossy().to_string())]).map_err(storage_error)?;
        let id = tx.last_insert_rowid();
        for path in &screenshot_paths {
            tx.execute(
                "INSERT INTO history_screenshots (history_id, path) VALUES (?1, ?2)",
                params![id, path.to_string_lossy()],
            )
            .map_err(storage_error)?;
        }
        tx.execute("INSERT INTO history_search (rowid, title, source, note, transcript) VALUES (?1, ?2, ?3, ?4, ?5)", params![id, &input.title, &input.source, note, transcript]).map_err(storage_error)?;
        tx.commit().map_err(storage_error)?;
        Ok(id)
    }

    /// list
    pub fn list(&self) -> Result<Vec<HistoryEntry>, AppError> {
        self.query_entries("SELECT id FROM history_entries ORDER BY id DESC", params![])
    }

    /// search
    pub fn search(&self, query: &str) -> Result<Vec<HistoryEntry>, AppError> {
        if query.trim().is_empty() {
            return self.list();
        }
        self.query_entries(
            "SELECT rowid FROM history_search WHERE history_search MATCH ?1 ORDER BY rank",
            params![query],
        )
    }

    /// get
    pub fn get(&self, id: i64) -> Result<Option<HistoryEntry>, AppError> {
        let mut entries =
            self.query_entries("SELECT id FROM history_entries WHERE id = ?1", params![id])?;
        Ok(entries.pop())
    }

    /// library entry
    pub fn library_entry(&self, id: i64) -> Result<Option<LibraryEntry>, AppError> {
        let connection = self.connection()?;
        load_library_entry(&connection, id)
    }

    /// set favorite
    pub fn set_favorite(&self, id: i64, favorite: bool) -> Result<LibraryEntry, AppError> {
        let connection = self.connection()?;
        let changed = connection
            .execute(
                "UPDATE history_entries SET favorite = ?1 WHERE id = ?2",
                params![favorite as i64, id],
            )
            .map_err(storage_error)?;
        if changed == 0 {
            return Err(history_missing());
        }
        load_library_entry(&connection, id)?.ok_or_else(history_missing)
    }

    /// set tags
    pub fn set_tags(&self, id: i64, tags: &[String]) -> Result<LibraryEntry, AppError> {
        if self.get(id)?.is_none() {
            return Err(history_missing());
        }
        let normalized = normalize_tags(tags)?;
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(storage_error)?;
        tx.execute(
            "DELETE FROM history_entry_tags WHERE history_id = ?1",
            params![id],
        )
        .map_err(storage_error)?;
        for tag in normalized {
            tx.execute(
                "INSERT INTO history_tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
                params![tag],
            )
            .map_err(storage_error)?;
            let tag_id = tx
                .query_row(
                    "SELECT id FROM history_tags WHERE name = ?1 COLLATE NOCASE",
                    params![tag],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(storage_error)?;
            tx.execute(
                "INSERT INTO history_entry_tags (history_id, tag_id) VALUES (?1, ?2)",
                params![id, tag_id],
            )
            .map_err(storage_error)?;
        }
        tx.commit().map_err(storage_error)?;
        self.library_entry(id)?.ok_or_else(history_missing)
    }

    /// mark opened
    pub fn mark_opened(&self, id: i64) -> Result<LibraryEntry, AppError> {
        let connection = self.connection()?;
        let changed = connection
            .execute(
                "UPDATE history_entries SET last_opened_at = ?1 WHERE id = ?2",
                params![Utc::now().to_rfc3339(), id],
            )
            .map_err(storage_error)?;
        if changed == 0 {
            return Err(history_missing());
        }
        load_library_entry(&connection, id)?.ok_or_else(history_missing)
    }

    /// search library
    pub fn search_library(&self, query: &LibraryQuery) -> Result<LibrarySnapshot, AppError> {
        let connection = self.connection()?;
        let mut ids = if query.text.trim().is_empty() {
            let mut statement = connection
                .prepare("SELECT id FROM history_entries")
                .map_err(storage_error)?;
            let rows = statement
                .query_map([], |row| row.get::<_, i64>(0))
                .map_err(storage_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(storage_error)?;
            rows
        } else {
            let fts_query = safe_fts_query(&query.text);
            let mut statement = connection
                .prepare("SELECT rowid FROM history_search WHERE history_search MATCH ?1")
                .map_err(storage_error)?;
            let rows = statement
                .query_map(params![fts_query], |row| row.get::<_, i64>(0))
                .map_err(storage_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(storage_error)?;
            rows
        };
        let mut entries = Vec::with_capacity(ids.len());
        for id in ids.drain(..) {
            if let Some(entry) = load_library_entry(&connection, id)? {
                if query.favorite.is_some_and(|favorite| entry.favorite != favorite) {
                    continue;
                }
                if query.tag.as_ref().is_some_and(|tag| {
                    !entry.tags.iter().any(|entry_tag| entry_tag.eq_ignore_ascii_case(tag.trim()))
                }) {
                    continue;
                }
                entries.push(entry);
            }
        }
        match query.sort {
            LibrarySort::Newest => entries.sort_by(|left, right| right.created_at.cmp(&left.created_at).then_with(|| right.id.cmp(&left.id))),
            LibrarySort::RecentlyOpened => entries.sort_by(|left, right| {
                let left_key = left.last_opened_at.as_deref().unwrap_or(&left.created_at);
                let right_key = right.last_opened_at.as_deref().unwrap_or(&right.created_at);
                right_key.cmp(left_key).then_with(|| right.id.cmp(&left.id))
            }),
            LibrarySort::Title => entries.sort_by(|left, right| left.title.to_lowercase().cmp(&right.title.to_lowercase()).then_with(|| left.id.cmp(&right.id))),
        }
        let total = entries.len() as u64;
        let entries = entries
            .into_iter()
            .skip(query.offset as usize)
            .take(query.limit.clamp(1, 200) as usize)
            .collect();
        Ok(LibrarySnapshot {
            entries,
            tags: list_tags(&connection)?,
            total,
        })
    }

    /// Read the app-owned Markdown copy for one history row.
    ///
    /// The caller supplies only a database ID. The stored path is canonicalized
    /// and must remain below this store's canonical history-assets root, so this
    /// method cannot become an arbitrary filesystem read command.
    pub fn read_markdown(&self, id: i64) -> Result<String, AppError> {
        let entry = self.get(id)?.ok_or_else(|| {
            AppError::new(
                "history_missing",
                "历史记录不存在。",
                "请刷新历史列表后重试。",
            )
        })?;
        let path = &entry.markdown_path;
        let is_markdown = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
        if !is_markdown {
            return Err(AppError::new(
                "invalid_history_asset",
                "历史笔记资源类型无效。",
                "请重新生成笔记后重试。",
            ));
        }
        if !path.is_file() {
            return Err(AppError::new(
                "history_asset_missing",
                "历史笔记文件不存在。",
                "请重新生成笔记后重试。",
            ));
        }
        let canonical = path.canonicalize().map_err(|_| {
            AppError::new(
                "history_asset_unreadable",
                "历史笔记文件不可读取。",
                "请检查应用数据目录权限后重试。",
            )
        })?;
        if !canonical.starts_with(&self.assets_root) || !canonical.is_file() {
            return Err(AppError::new(
                "invalid_history_asset",
                "历史笔记资源无效。",
                "请重新生成笔记后重试。",
            ));
        }
        std::fs::read_to_string(canonical).map_err(|_| {
            AppError::new(
                "history_asset_unreadable",
                "历史笔记文件不可读取。",
                "请检查应用数据目录权限或文件编码后重试。",
            )
        })
    }

    /// append conversation
    pub fn append_conversation(
        &self,
        history_id: i64,
        turns: &[NoteChatTurn],
    ) -> Result<(), AppError> {
        if self.get(history_id)?.is_none() {
            return Err(AppError::new(
                "history_missing",
                "历史记录不存在。",
                "请刷新历史列表后重试。",
            ));
        }
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(storage_error)?;
        for turn in turns {
            if turn.role != "user" && turn.role != "assistant" {
                return Err(AppError::new(
                    "invalid_conversation_turn",
                    "问答记录无效。",
                    "请重试。",
                ));
            }
            tx.execute("INSERT INTO history_conversation_turns (history_id, role, content) VALUES (?1, ?2, ?3)", params![history_id, &turn.role, &turn.content]).map_err(storage_error)?;
        }
        tx.commit().map_err(storage_error)
    }

    /// list conversation
    pub fn list_conversation(&self, history_id: i64) -> Result<Vec<NoteChatTurn>, AppError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare("SELECT role, content FROM history_conversation_turns WHERE history_id = ?1 ORDER BY id ASC").map_err(storage_error)?;
        let turns = statement
            .query_map(params![history_id], |row| {
                Ok(NoteChatTurn {
                    role: row.get(0)?,
                    content: row.get(1)?,
                })
            })
            .map_err(storage_error)?
            .map(|turn| turn.map_err(storage_error))
            .collect();
        turns
    }

    /// delete
    pub fn delete(&self, id: i64) -> Result<(), AppError> {
        let Some(entry) = self.get(id)? else {
            return Ok(());
        };
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(storage_error)?;
        tx.execute("DELETE FROM history_search WHERE rowid = ?1", params![id])
            .map_err(storage_error)?;
        tx.execute("DELETE FROM history_entries WHERE id = ?1", params![id])
            .map_err(storage_error)?;
        tx.commit().map_err(storage_error)?;
        for path in owned_asset_paths(&entry) {
            self.remove_owned_asset(&path)?;
        }
        Ok(())
    }

    fn connection(&self) -> Result<Connection, AppError> {
        let connection = Connection::open(&self.database_path).map_err(storage_error)?;
        // SQLite foreign-key enforcement is connection-local. Every
        // operational connection needs it so a delete cascades conversation
        // rows before SQLite can reuse an INTEGER PRIMARY KEY value.
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
            .map_err(storage_error)?;
        Ok(connection)
    }

    fn remove_owned_asset(&self, path: &Path) -> Result<(), AppError> {
        let Ok(canonical) = path.canonicalize() else {
            return Ok(());
        };
        if canonical.starts_with(&self.assets_root) && canonical.is_file() {
            std::fs::remove_file(canonical).map_err(storage_error)?;
        }
        Ok(())
    }

    fn query_entries<P: rusqlite::Params>(
        &self,
        query: &str,
        params: P,
    ) -> Result<Vec<HistoryEntry>, AppError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(query).map_err(storage_error)?;
        let ids = statement
            .query_map(params, |row| row.get::<_, i64>(0))
            .map_err(storage_error)?;
        ids.map(|id| self.load_entry(id.map_err(storage_error)?))
            .collect()
    }

    fn load_entry(&self, id: i64) -> Result<HistoryEntry, AppError> {
        let connection = self.connection()?;
        let mut entry = connection.query_row("SELECT id, title, source, note_template, note_style, created_at, markdown_path, transcript_path, thumbnail_path FROM history_entries WHERE id = ?1", params![id], |row| {
            let stored_style: String = row.get(4)?;
            Ok(HistoryEntry {
                id: row.get(0)?,
                title: row.get(1)?,
                source: row.get(2)?,
                note_template: row.get(3)?,
                note_style: NoteStyle::from_stable_id(&stored_style).unwrap_or_default(),
                created_at: row.get(5)?,
                markdown_path: PathBuf::from(row.get::<_, String>(6)?),
                transcript_path: PathBuf::from(row.get::<_, String>(7)?),
                thumbnail_path: row.get::<_, Option<String>>(8)?.map(PathBuf::from),
                screenshot_paths: Vec::new(),
            })
        }).optional().map_err(storage_error)?.ok_or_else(|| AppError::new("history_missing", "历史记录不存在。", "请刷新历史列表后重试。"))?;
        let mut statement = connection
            .prepare("SELECT path FROM history_screenshots WHERE history_id = ?1")
            .map_err(storage_error)?;
        entry.screenshot_paths = statement
            .query_map(params![id], |row| row.get::<_, String>(0))
            .map_err(storage_error)?
            .map(|path| path.map(PathBuf::from).map_err(storage_error))
            .collect::<Result<_, _>>()?;
        Ok(entry)
    }
}

fn ensure_note_style_column(connection: &Connection) -> Result<(), AppError> {
    let has_column = {
        let mut statement = connection
            .prepare("PRAGMA table_info(history_entries)")
            .map_err(storage_error)?;
        let names = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(storage_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(storage_error)?;
        names.iter().any(|name| name == "note_style")
    };
    if !has_column {
        connection
            .execute(
                "ALTER TABLE history_entries ADD COLUMN note_style TEXT NOT NULL DEFAULT 'minimal'",
                [],
            )
            .map_err(storage_error)?;
    }
    Ok(())
}

fn ensure_library_schema(connection: &Connection) -> Result<(), AppError> {
    ensure_history_column(
        connection,
        "favorite",
        "ALTER TABLE history_entries ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_history_column(
        connection,
        "last_opened_at",
        "ALTER TABLE history_entries ADD COLUMN last_opened_at TEXT",
    )?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS history_tags (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );
            CREATE TABLE IF NOT EXISTS history_entry_tags (
                history_id INTEGER NOT NULL REFERENCES history_entries(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES history_tags(id) ON DELETE CASCADE,
                PRIMARY KEY (history_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS history_entries_favorite_idx ON history_entries(favorite);
            CREATE INDEX IF NOT EXISTS history_entries_last_opened_idx ON history_entries(last_opened_at DESC);
            CREATE INDEX IF NOT EXISTS history_entry_tags_tag_idx ON history_entry_tags(tag_id);",
        )
        .map_err(storage_error)
}

fn ensure_history_column(
    connection: &Connection,
    column: &str,
    migration: &str,
) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("PRAGMA table_info(history_entries)")
        .map_err(storage_error)?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_error)?;
    if !names.iter().any(|name| name == column) {
        connection.execute(migration, []).map_err(storage_error)?;
    }
    Ok(())
}

fn load_library_entry(
    connection: &Connection,
    id: i64,
) -> Result<Option<LibraryEntry>, AppError> {
    let mut entry = connection
        .query_row(
            "SELECT id, title, source, note_template, note_style, created_at, markdown_path,
                    transcript_path, thumbnail_path, favorite, last_opened_at
             FROM history_entries WHERE id = ?1",
            params![id],
            |row| {
                let stored_style: String = row.get(4)?;
                Ok(LibraryEntry {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    source: row.get(2)?,
                    note_template: row.get(3)?,
                    note_style: NoteStyle::from_stable_id(&stored_style).unwrap_or_default(),
                    created_at: row.get(5)?,
                    markdown_path: PathBuf::from(row.get::<_, String>(6)?),
                    transcript_path: PathBuf::from(row.get::<_, String>(7)?),
                    thumbnail_path: row.get::<_, Option<String>>(8)?.map(PathBuf::from),
                    screenshot_paths: Vec::new(),
                    favorite: row.get::<_, i64>(9)? != 0,
                    tags: Vec::new(),
                    last_opened_at: row.get(10)?,
                })
            },
        )
        .optional()
        .map_err(storage_error)?;
    let Some(entry) = entry.as_mut() else {
        return Ok(None);
    };
    let mut screenshot_statement = connection
        .prepare("SELECT path FROM history_screenshots WHERE history_id = ?1 ORDER BY rowid")
        .map_err(storage_error)?;
    entry.screenshot_paths = screenshot_statement
        .query_map(params![id], |row| row.get::<_, String>(0))
        .map_err(storage_error)?
        .map(|path| path.map(PathBuf::from).map_err(storage_error))
        .collect::<Result<_, _>>()?;
    let mut tag_statement = connection
        .prepare(
            "SELECT tags.name
             FROM history_entry_tags links
             JOIN history_tags tags ON tags.id = links.tag_id
             WHERE links.history_id = ?1
             ORDER BY links.rowid",
        )
        .map_err(storage_error)?;
    entry.tags = tag_statement
        .query_map(params![id], |row| row.get::<_, String>(0))
        .map_err(storage_error)?
        .map(|tag| tag.map_err(storage_error))
        .collect::<Result<_, _>>()?;
    Ok(Some(entry.clone()))
}

fn list_tags(connection: &Connection) -> Result<Vec<Tag>, AppError> {
    let mut statement = connection
        .prepare(
            "SELECT tags.id, tags.name, COUNT(links.history_id)
             FROM history_tags tags
             JOIN history_entry_tags links ON links.tag_id = tags.id
             GROUP BY tags.id, tags.name
             HAVING COUNT(links.history_id) > 0
             ORDER BY tags.name COLLATE NOCASE",
        )
        .map_err(storage_error)?;
    let tags = statement
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                note_count: row.get(2)?,
            })
        })
        .map_err(storage_error)?
        .map(|tag| tag.map_err(storage_error))
        .collect();
    tags
}

fn normalize_tags(tags: &[String]) -> Result<Vec<String>, AppError> {
    if tags.len() > 20 {
        return Err(invalid_tags());
    }
    let mut normalized = Vec::new();
    for raw in tags {
        let tag = raw.trim();
        if tag.is_empty()
            || tag.chars().count() > 40
            || tag.chars().any(char::is_control)
        {
            return Err(invalid_tags());
        }
        if !normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(tag))
        {
            normalized.push(tag.to_string());
        }
    }
    Ok(normalized)
}

fn safe_fts_query(text: &str) -> String {
    text.split_whitespace()
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn history_missing() -> AppError {
    AppError::new(
        "history_missing",
        "历史记录不存在。",
        "请刷新历史列表后重试。",
    )
}

fn invalid_tags() -> AppError {
    AppError::new(
        "invalid_history_tags",
        "笔记标签无效。",
        "请使用不超过 20 个、每个不超过 40 个字符的标签。",
    )
}

const fn default_library_limit() -> u32 {
    50
}

fn copy_owned_asset(source: &Path, destination: &Path) -> Result<PathBuf, AppError> {
    std::fs::copy(source, destination).map_err(storage_error)?;
    destination.canonicalize().map_err(storage_error)
}

fn owned_asset_paths(entry: &HistoryEntry) -> Vec<PathBuf> {
    let mut paths = vec![entry.markdown_path.clone(), entry.transcript_path.clone()];
    if let Some(path) = &entry.thumbnail_path {
        paths.push(path.clone());
    }
    paths.extend(entry.screenshot_paths.iter().cloned());
    paths
}

fn validate_asset(path: &Path, extensions: &[&str]) -> Result<(), AppError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    if extension
        .as_deref()
        .map_or(true, |value| !extensions.contains(&value))
    {
        return Err(AppError::new(
            "invalid_history_asset",
            "历史资源类型无效。",
            "请选择受支持的笔记、转写或图片资源。",
        ));
    }
    if !path.is_file() {
        return Err(AppError::new(
            "history_asset_missing",
            "历史资源不存在。",
            "请重新生成笔记后重试。",
        ));
    }
    Ok(())
}

fn storage_error(_error: impl std::fmt::Display) -> AppError {
    AppError::new(
        "history_storage_failed",
        "历史记录存储失败。",
        "请检查磁盘空间和应用数据目录权限。",
    )
}

/// ScreenshotCapturer
pub trait ScreenshotCapturer: Send + Sync {
    fn capture(&self, source: &Path, seconds: f64, output: &Path) -> Result<(), String>;
}

#[derive(Debug, Clone, PartialEq)]
/// ScreenshotCaptureResult
pub struct ScreenshotCaptureResult {
    pub paths: Vec<Option<PathBuf>>,
    pub warnings: Vec<String>,
}

/// capture selected screenshots
pub fn capture_selected_screenshots(
    capturer: &dyn ScreenshotCapturer,
    include_screenshots: bool,
    source: &Path,
    timestamps: &[f64],
    output_dir: &Path,
) -> Result<ScreenshotCaptureResult, AppError> {
    if !include_screenshots {
        return Ok(ScreenshotCaptureResult {
            paths: Vec::new(),
            warnings: Vec::new(),
        });
    }
    if std::fs::create_dir_all(output_dir).is_err() {
        return Ok(ScreenshotCaptureResult {
            paths: vec![None; timestamps.len()],
            warnings: vec!["截图保存失败。".into(); timestamps.len()],
        });
    }
    let mut result = ScreenshotCaptureResult {
        paths: Vec::new(),
        warnings: Vec::new(),
    };
    for (index, seconds) in timestamps.iter().enumerate() {
        let output = output_dir.join(format!("evidence-{index}.jpg"));
        match capturer.capture(source, *seconds, &output) {
            Ok(()) if output.is_file() => result.paths.push(Some(output)),
            Ok(()) | Err(_) => {
                let _ = std::fs::remove_file(&output);
                result.paths.push(None);
                result.warnings.push("截图保存失败。".into());
            }
        }
    }
    Ok(result)
}

/// Capture only timestamped evidence after a media path has been acquired.
/// This is deliberately a pure orchestration seam: production may provide a
/// platform capturer, while tests use a fake and never invoke FFmpeg.
pub fn capture_evidence_with(
    capturer: &dyn ScreenshotCapturer,
    options: &TaskOptions,
    source: Option<&Path>,
    distillation: &mut Distillation,
    output_dir: &Path,
) -> Result<Vec<String>, AppError> {
    if !options.include_screenshots {
        return Ok(Vec::new());
    }
    let Some(source) = source.filter(|path| path.is_file()) else {
        return Ok(Vec::new());
    };
    let indexes_and_times = distillation
        .key_evidence
        .iter()
        .enumerate()
        .filter_map(|(index, evidence)| evidence.timestamp_seconds.map(|seconds| (index, seconds)))
        .collect::<Vec<_>>();
    let captured = capture_selected_screenshots(
        capturer,
        true,
        source,
        &indexes_and_times
            .iter()
            .map(|(_, seconds)| *seconds)
            .collect::<Vec<_>>(),
        output_dir,
    )?;
    for ((index, _), path) in indexes_and_times
        .into_iter()
        .zip(captured.paths.into_iter())
    {
        distillation.key_evidence[index].screenshot_path =
            path.map(|path| path.to_string_lossy().into_owned());
    }
    Ok(captured.warnings)
}
