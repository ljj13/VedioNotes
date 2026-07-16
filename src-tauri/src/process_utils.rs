use std::ffi::OsStr;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Prevents sidecar tools from opening a console window in the desktop app.
pub const WINDOWS_CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(WINDOWS_CREATE_NO_WINDOW);
    command
}
