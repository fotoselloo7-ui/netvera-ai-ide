//! NetVera workspace commands.
//! Only the trusted main Tauri WebView can invoke these commands.
//! Provider WebViews never receive workspace permissions.
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_TEXT: usize = 2_000_000;
const MAX_RESULTS: usize = 1200;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_OUTPUT: usize = 100_000;

#[derive(Serialize)]
pub struct WorkspaceEntry {
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
pub struct CommandResult {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

fn root_path(root: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|e| format!("Proje klasörü açılamadı: {e}"))?;
    if !root.is_dir() {
        return Err("Proje yolu bir klasör olmalıdır".into());
    }
    Ok(root)
}

fn protected_segment(segment: &str) -> bool {
    let name = segment.to_ascii_lowercase();
    matches!(name.as_str(), ".git" | "node_modules" | "target" | "dist" | "build" | ".next" | ".venv" | "vendor" | ".ssh" | ".aws" | ".openbrowser")
        || (name.starts_with(".env") && name != ".env.example")
}

fn relative_path(relative: &str) -> Result<&Path, String> {
    let path = Path::new(relative);
    if relative.is_empty() || path.is_absolute()
        || path.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
        || path.components().all(|c| matches!(c, Component::CurDir))
        || relative.replace('\\', "/").split('/').any(protected_segment)
    {
        return Err("Bu dosya yolu güvenli proje sınırlarının dışında".into());
    }
    Ok(path)
}

fn inside_root(root: &Path, relative: &str, writing: bool) -> Result<PathBuf, String> {
    let given = relative_path(relative)?;
    let joined = root.join(given);
    if fs::symlink_metadata(&joined).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return Err("Sembolik bağlantılar düzenlenemez".into());
    }
    let checked = if writing && !joined.exists() {
        let parent = joined.parent().ok_or("Geçersiz hedef")?;
        let real_parent = fs::canonicalize(parent).map_err(|e| format!("Üst klasör yok: {e}"))?;
        real_parent.join(joined.file_name().ok_or("Geçersiz dosya adı")?)
    } else {
        fs::canonicalize(&joined).map_err(|e| format!("Dosya açılamadı: {e}"))?
    };
    if !checked.starts_with(root) {
        return Err("Dosya seçilen projenin dışına çıkıyor".into());
    }
    Ok(checked)
}

#[tauri::command]
pub fn workspace_list_files(root: String) -> Result<Vec<WorkspaceEntry>, String> {
    let base = root_path(&root)?;
    let mut result = Vec::new();
    let mut dirs = vec![(base.clone(), 0_u8)];
    while let Some((dir, depth)) = dirs.pop() {
        if result.len() >= MAX_RESULTS { break; }
        for item in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let item = item.map_err(|e| e.to_string())?;
            let name = item.file_name().to_string_lossy().to_string();
            if protected_segment(&name) { continue; }
            let kind = item.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() { continue; }
            let is_dir = kind.is_dir();
            if !is_dir && !kind.is_file() { continue; }
            let path = item.path();
            let relative = path.strip_prefix(&base).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
            result.push(WorkspaceEntry { path: relative, is_dir });
            if is_dir && depth < 7 { dirs.push((path, depth + 1)); }
            if result.len() >= MAX_RESULTS { break; }
        }
    }
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

#[tauri::command]
pub fn workspace_read_file(root: String, path: String) -> Result<String, String> {
    let root = root_path(&root)?;
    let file = inside_root(&root, &path, false)?;
    let meta = fs::metadata(&file).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_TEXT as u64 {
        return Err("Yalnızca 2 MB altındaki metin dosyaları açılabilir".into());
    }
    fs::read_to_string(file).map_err(|e| format!("UTF-8 metin dosyası olmalı: {e}"))
}

/// Optimistic locking: never overwrite a file that changed after it was reviewed.
/// expected_content=None is only valid for a new file.
#[tauri::command]
pub fn workspace_apply_edit(
    root: String,
    path: String,
    expected_content: Option<String>,
    content: String,
) -> Result<(), String> {
    if content.len() > MAX_TEXT { return Err("Dosya 2 MB sınırını aşıyor".into()); }
    let root = root_path(&root)?;
    let file = inside_root(&root, &path, true)?;

    if file.exists() {
        if !file.is_file() { return Err("Hedef bir dosya olmalı".into()); }
        let expected = expected_content.ok_or("Mevcut dosya için önce eski içerik okunmalı")?;
        if expected.len() > MAX_TEXT { return Err("Eski içerik boyutu geçersiz".into()); }
        let current = fs::read_to_string(&file).map_err(|e| e.to_string())?;
        if current != expected {
            return Err("Dosya başka bir işlem tarafından değiştirildi. Yeniden açıp karşılaştır.".into());
        }
        fs::write(file, content).map_err(|e| e.to_string())
    } else {
        if expected_content.is_some() { return Err("Dosya bulunamadı; değişiklik iptal edildi".into()); }
        let mut target = OpenOptions::new().write(true).create_new(true)
            .open(&file).map_err(|e| format!("Yeni dosya oluşturulamadı: {e}"))?;
        target.write_all(content.as_bytes()).map_err(|e| e.to_string())
    }
}

fn capture_output<T: Read>(mut source: T) -> String {
    let mut captured = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        match source.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if captured.len() < MAX_OUTPUT {
                    let keep = n.min(MAX_OUTPUT - captured.len());
                    captured.extend_from_slice(&buffer[..keep]);
                }
                // Keep draining stdout/stderr, even after the size cap.
            }
        }
    }
    String::from_utf8_lossy(&captured).into_owned()
}

#[tauri::command]
pub fn workspace_run_command(root: String, command: String) -> Result<CommandResult, String> {
    let command = command.trim().to_string();
    if command.is_empty() || command.len() > 4096 {
        return Err("Komut uzunluğu geçersiz".into());
    }
    let root = root_path(&root)?;
    // Called only by an explicit user click, with a confirmation in the UI.
    // Do not call this from AI responses or a background task.
    let mut process = if cfg!(windows) {
        let mut cmd = Command::new("cmd.exe");
        cmd.arg("/C").arg(&command);
        cmd
    } else {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(&command);
        cmd
    };
    let mut child = process.current_dir(root)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("Terminal başlatılamadı: {e}"))?;
    let stdout = child.stdout.take().ok_or("stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("stderr unavailable")?;
    let out_reader = thread::spawn(move || capture_output(stdout));
    let err_reader = thread::spawn(move || capture_output(stderr));
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? { break status; }
        if started.elapsed() >= COMMAND_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = out_reader.join();
            let _ = err_reader.join();
            return Err("Komut 60 saniye zaman sınırını aştı".into());
        }
        thread::sleep(Duration::from_millis(100));
    };
    Ok(CommandResult {
        exit_code: status.code(),
        stdout: out_reader.join().map_err(|_| "stdout thread failed")?,
        stderr: err_reader.join().map_err(|_| "stderr thread failed")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_path_traversal() {
        assert!(relative_path("../escape.ts").is_err());
        assert!(relative_path(".git/config").is_err());
        assert!(relative_path(".env").is_err());
        assert!(relative_path("src/app.ts").is_ok());
    }
}
