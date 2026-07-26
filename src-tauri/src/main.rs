//! 可执行程序入口——调用 lib::run() 启动应用.
//! Windows 下禁用控制台窗口.
//! 编译产物是 VedioNotes.exe.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    video_distiller_lib::run()
}
