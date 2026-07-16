fn main() {
    if let Ok(output) = std::process::Command::new("rustc").arg("--version").output() {
        if output.status.success() {
            if let Ok(version) = String::from_utf8(output.stdout) {
                println!("cargo:rustc-env=VIDEO_DISTILLER_RUST_VERSION={}", version.trim());
            }
        }
    }
    tauri_build::build()
}
