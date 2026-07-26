//! VedioNotes Rust 后端入口——声明所有模块和 Tauri 插件，注册命令处理器，定义 run() 入口函数.
//! 类似 C main 之前的所有初始化代码.

pub mod artifact_download;
pub mod ai_capabilities;
pub mod capability_store;
pub mod commands;
pub mod cuda_runtime;
pub mod credential_store;
pub mod data_management;
pub mod diagnostics;
pub mod domain;
pub mod download_cookies;
pub mod history_store;
pub mod local_models;
pub mod note_chat;
pub mod preferences;
pub mod profile_store;
pub mod provider_catalog;
pub mod profiles;
pub mod providers;
pub mod process_utils;
pub mod services;
pub mod sensevoice_models;
pub mod subtitles;
pub mod task_store;

use commands::ManagedServices;
use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// run
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::new())
        .setup(|app| {
            // Resolve profile config path from app data directory
            let app_data_dir: PathBuf = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("video-distiller"));

            // Ensure the directory exists
            std::fs::create_dir_all(&app_data_dir).ok();
            if diagnostics::initialize(&app_data_dir).is_ok() {
                diagnostics::record(diagnostics::DiagnosticRecord {
                    level: diagnostics::DiagnosticLevel::Info,
                    event: diagnostics::DiagnosticEventKind::AppStarted,
                    task_id: None,
                    stage: None,
                    percent: None,
                    elapsed_ms: None,
                    exit_code: None,
                    output_exists: None,
                    output_bytes: None,
                });
            }

            let profile_path = app_data_dir.join("profiles.json");
            let services = ManagedServices::new(profile_path);

            app.manage(services);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_distillation,
            commands::cancel_distillation,
            commands::get_profiles,
            commands::get_summary_provider_catalog,
            commands::save_and_activate_catalog_summary_profile,
            commands::save_transcription_profile,
            commands::save_summary_profile,
            commands::delete_profile,
            commands::set_active_profile,
            commands::set_fallback_transcription_profile,
            commands::test_profile,
            commands::discover_summary_models,
            commands::save_api_key_command,
            commands::check_api_key,
            commands::has_profile_credential,
            commands::check_legacy_credential,
            commands::complete_migration,
            commands::get_migration_state,
            commands::get_preferences,
            commands::set_markdown_output_dir,
            commands::get_export_preferences,
            commands::save_export_preferences,
            commands::restore_export_preferences,
            commands::export_note,
            commands::get_cache_usage,
            commands::clear_cache,
            commands::list_logs,
            commands::read_log,
            commands::set_log_level,
            commands::clear_logs,
            commands::save_appearance_preferences,
            commands::get_about_snapshot,
            commands::open_app_data_directory,
            commands::open_export_directory,
            commands::open_log_directory,
            commands::open_documentation,
            commands::set_transcription_preferences,
            commands::copy_markdown_result,
            commands::get_home_snapshot,
            commands::list_task_records,
            commands::retry_task_record,
            commands::search_library,
            commands::set_note_favorite,
            commands::set_note_tags,
            commands::mark_note_opened,
            commands::list_history,
            commands::search_history,
            commands::get_history,
            commands::get_history_markdown,
            commands::delete_history,
            commands::ask_history_note,
            commands::list_local_models,
            commands::download_local_model,
            commands::delete_local_model,
            commands::get_cuda_runtime_status,
            commands::set_local_compute_mode,
            commands::download_cuda_runtime,
            commands::delete_cuda_runtime,
            commands::get_sensevoice_status,
            commands::download_sensevoice,
            commands::cancel_sensevoice_download,
            commands::delete_sensevoice,
            commands::set_sensevoice_model,
            commands::get_download_cookie_status,
            commands::save_download_cookie,
            commands::delete_download_cookie,
            commands::get_diagnostic_log_path,
            commands::get_capability_settings,
            commands::get_capability_status,
            commands::save_and_activate_catalog_summary_profile,
            commands::save_vector_config,
            commands::save_rerank_config,
            commands::save_web_search_config,
            commands::save_tts_config,
            commands::save_image_config,
            commands::save_local_agent_config,
            commands::test_vector_config,
            commands::test_rerank_config,
            commands::test_web_search_config,
            commands::test_tts_config,
            commands::test_image_config,
            commands::test_local_agent_config,
            commands::index_note,
            commands::semantic_search,
            commands::web_search,
            commands::synthesize_speech,
            commands::generate_note_image,
            commands::detect_local_agents,
            commands::run_local_agent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
