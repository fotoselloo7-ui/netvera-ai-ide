//! NetVera local workspace commands. No AI/tool output is executed automatically.
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

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
    let root = fs::canonicalize(root).map_err(|e| format!("Cannot access project folder: {e}"))?;
    if !root.is_dir() { return Err("Project path is not a directory".into()); }
    Ok(root)
}

fn inside_root(root: &Path, relative: &str, writing: bool) -> Result<PathBuf, String> {
    let given = Path::new(relative);
    if given.is_absolute() || given.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err("Only project-relative paths are permitted".into());
    }
    let joined = root.join(given);
    let checked = if writing && !joined.exists() {
        let parent = joined.parent().ok_or("Invalid destination")?;
        let real_parent = fs::canonicalize(parent).map_err(|e| format!("Parent folder does not exist: {e}"))?;
        real_parent.join(joined.file_name().ok_or("Invalid filename")?)
    } else {
        fs::canonicalize(&joined).map_err(|e| format!("Cannot access file: {e}"))?
    };
    if !checked.starts_with(root) { return Err("Path leaves the selected workspace".into()); }
    Ok(checked)
}

#[tauri::command]
pub fn workspace_list_files(root: String) -> Result<Vec<WorkspaceEntry>, String> {
    let base = root_path(&root)?;
    let mut result = Vec::new();
    let mut dirs = vec![(base.clone(), 0_u8)];
    while let Some((dir, depth)) = dirs.pop() {
        if result.len() >= 800 { break; }
        let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for item in entries {
            let item = item.map_err(|e| e.to_string())?;
            let name = item.file_name().to_string_lossy().to_string();
            if matches!(name.as_str(), ".git" | "node_modules" | "target" | "dist" | "build" | ".next" | ".venv" | "vendor") { continue; }
            let path = item.path();
            let kind = item.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() { continue; }
            let is_dir = kind.is_dir();
            let relative = path.strip_prefix(&base).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
            result.push(WorkspaceEntry { path: relative, is_dir });
            if is_dir && depth < 7 { dirs.push((path, depth + 1)); }
            if result.len() >= 800 { break; }
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
    if !meta.is_file() || meta.len() > 2_000_000 { return Err("Only text files up to 2 MB are supported".into()); }
    fs::read_to_string(file).map_err(|e| format!("File must be UTF-8 text: {e}"))
}

#[tauri::command]
pub fn workspace_write_file(root: String, path: String, content: String) -> Result<(), String> {
    if content.len() > 2_000_000 { return Err("File is larger than 2 MB".into()); }
    let root = root_path(&root)?;
    let file = inside_root(&root, &path, true)?;
    if !file.is_file() { return Err("For safety, new files must first be created in your editor".into()); }
    fs::write(file, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn workspace_run_command(root: String, command: String) -> Result<CommandResult, String> {
    if command.trim().is_empty() || command.len() > 4096 { return Err("Invalid command length".into()); }
    let root = root_path(&root)?;
    // Only explicit user actions call this function; never dispatch model text automatically.
    let output = if cfg!(windows) {
        Command::new("cmd.exe").arg("/C").arg(&command).current_dir(root).output()
    } else {
        Command::new("/bin/sh").arg("-c").arg(&command).current_dir(root).output()
    }.map_err(|e| e.to_string())?;
    Ok(CommandResult {
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).chars().take(100_000).collect(),
        stderr: String::from_utf8_lossy(&output.stderr).chars().take(100_000).collect(),
    })
}
