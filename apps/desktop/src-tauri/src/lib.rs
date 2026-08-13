use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
    time::{Duration, Instant},
};

const MAX_SELECTED_PATH_BYTES: usize = 4 * 1024;
const MAX_REPOSITORY_FILES: usize = 20_000;
const MAX_REPOSITORY_PATH_BYTES: usize = 2 * 1024;
const MAX_MANIFEST_FILES: usize = 256;
const MAX_METADATA_BYTES: u64 = 64 * 1024;
const MAX_REPOSITORY_DIRECTORIES: usize = 10_000;
const MAX_REPOSITORY_ENTRIES: usize = 40_000;
const MAX_REPOSITORY_DEPTH: usize = 64;
const MAX_ENUMERATION_RUNTIME: Duration = Duration::from_secs(10);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositorySummary {
    root: String,
    name: String,
    branch: String,
    head_sha: String,
    working_tree_status: &'static str,
    read_only: bool,
    file_count: usize,
    manifest_files: Vec<String>,
    files: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RepositoryError {
    NotGitRepository,
    UnsupportedGitIndirection,
    AccessDenied,
    HeadUnavailable,
    FileBudgetExceeded,
    PathEncodingUnsupported,
    ValidationFailed,
}

#[derive(Debug, Eq, PartialEq)]
enum MetadataRead {
    Value(String),
    Missing,
}

impl RepositoryError {
    fn code(self) -> &'static str {
        match self {
            Self::NotGitRepository => "NOT_GIT_REPOSITORY",
            Self::UnsupportedGitIndirection => "UNSUPPORTED_GIT_INDIRECTION",
            Self::AccessDenied => "REPOSITORY_ACCESS_DENIED",
            Self::HeadUnavailable => "REPOSITORY_HEAD_UNAVAILABLE",
            Self::FileBudgetExceeded => "REPOSITORY_FILE_BUDGET_EXCEEDED",
            Self::PathEncodingUnsupported => "REPOSITORY_PATH_ENCODING_UNSUPPORTED",
            Self::ValidationFailed => "REPOSITORY_VALIDATION_FAILED",
        }
    }
}

fn map_io_error(error: &io::Error) -> RepositoryError {
    match error.kind() {
        io::ErrorKind::PermissionDenied => RepositoryError::AccessDenied,
        _ => RepositoryError::ValidationFailed,
    }
}
fn single_line_utf8(output: &str) -> Result<String, RepositoryError> {
    let value = output.trim_end_matches(['\r', '\n']);
    if value.is_empty()
        || value.contains(['\r', '\n', '\0'])
        || contains_unsafe_format_controls(value)
    {
        return Err(RepositoryError::ValidationFailed);
    }
    Ok(value.to_owned())
}

fn contains_unsafe_format_controls(value: &str) -> bool {
    value.chars().any(|character| {
        character.is_control()
            || matches!(
                character,
                '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'
            )
    })
}

fn is_safe_relative_file_path(value: &str) -> bool {
    if value.is_empty()
        || value.len() > MAX_REPOSITORY_PATH_BYTES
        || value.starts_with(['/', '\\'])
        || value.as_bytes().get(1) == Some(&b':')
        || value.contains('\\')
        || contains_unsafe_format_controls(value)
    {
        return false;
    }

    Path::new(value)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
        && value
            .split(['/', '\\'])
            .all(|component| !component.is_empty() && component != "." && component != "..")
}

fn is_safe_head_reference(value: &str) -> bool {
    if !value.starts_with("refs/heads/")
        || !is_safe_relative_file_path(value)
        || value.contains("..")
        || value.contains("@{")
        || value.ends_with('.')
        || value
            .chars()
            .any(|character| matches!(character, ' ' | '~' | '^' | ':' | '?' | '*' | '['))
    {
        return false;
    }

    value.split('/').all(|component| {
        let trimmed = component.trim_end_matches([' ', '.']);
        let base = trimmed.split('.').next().unwrap_or_default();
        let reserved_device = matches!(
            base.to_ascii_uppercase().as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "CONIN$"
                | "CONOUT$"
                | "CLOCK$"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        );
        !component.is_empty()
            && component == trimmed
            && !component.starts_with('.')
            && !component.ends_with(".lock")
            && !component
                .chars()
                .any(|character| matches!(character, '\u{00b9}' | '\u{00b2}' | '\u{00b3}'))
            && !reserved_device
    })
}

fn is_manifest(path: &str) -> bool {
    matches!(
        path.rsplit('/').next().unwrap_or_default(),
        "package.json"
            | "pnpm-workspace.yaml"
            | "Cargo.toml"
            | "pyproject.toml"
            | "requirements.txt"
            | "go.mod"
            | "pom.xml"
            | "build.gradle"
            | "build.gradle.kts"
            | "composer.json"
            | "Gemfile"
            | "mix.exs"
    )
}

fn read_bounded_regular_file(path: &Path) -> Result<String, RepositoryError> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let mut file = options.open(path).map_err(|error| map_io_error(&error))?;
    let metadata = file.metadata().map_err(|error| map_io_error(&error))?;
    if !metadata.file_type().is_file() || is_link_or_reparse(&metadata) {
        return Err(RepositoryError::ValidationFailed);
    }
    if metadata.len() > MAX_METADATA_BYTES {
        return Err(RepositoryError::ValidationFailed);
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(MAX_METADATA_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| map_io_error(&error))?;
    if bytes.len() as u64 > MAX_METADATA_BYTES {
        return Err(RepositoryError::ValidationFailed);
    }
    String::from_utf8(bytes).map_err(|_| RepositoryError::PathEncodingUnsupported)
}

#[cfg(windows)]
fn configure_no_follow(options: &mut fs::OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(unix)]
fn configure_no_follow(options: &mut fs::OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;
    const O_NOFOLLOW: i32 = 0x20000;
    options.custom_flags(O_NOFOLLOW);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut fs::OpenOptions) {}

#[cfg(windows)]
fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

fn read_metadata_within(git_dir: &Path, path: &Path) -> Result<MetadataRead, RepositoryError> {
    let relative = path
        .strip_prefix(git_dir)
        .map_err(|_| RepositoryError::ValidationFailed)?;
    let mut current = git_dir.to_owned();
    for component in relative.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(RepositoryError::ValidationFailed);
        }
        current.push(component);
        let metadata = match fs::symlink_metadata(&current) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(MetadataRead::Missing)
            }
            Err(error) => return Err(map_io_error(&error)),
        };
        if is_link_or_reparse(&metadata) {
            return Err(RepositoryError::ValidationFailed);
        }
    }
    if current != path {
        return Err(RepositoryError::ValidationFailed);
    }
    read_bounded_regular_file(&current).map(MetadataRead::Value)
}

fn find_repository_root(selected: &Path) -> Result<(PathBuf, PathBuf), RepositoryError> {
    for candidate in selected.ancestors() {
        let git_dir = candidate.join(".git");
        match fs::symlink_metadata(&git_dir) {
            Ok(metadata) if metadata.file_type().is_dir() && !is_link_or_reparse(&metadata) => {
                return Ok((candidate.to_owned(), git_dir));
            }
            Ok(metadata) if metadata.file_type().is_file() => {
                return Err(RepositoryError::UnsupportedGitIndirection)
            }
            Ok(_) => return Err(RepositoryError::ValidationFailed),
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(map_io_error(&error)),
        }
    }
    Err(RepositoryError::NotGitRepository)
}

fn validate_commit(value: &str) -> Result<String, RepositoryError> {
    let value = single_line_utf8(value)?;
    if matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(value)
    } else {
        Err(RepositoryError::ValidationFailed)
    }
}

fn resolve_head(git_dir: &Path) -> Result<(String, String), RepositoryError> {
    let MetadataRead::Value(head) = read_metadata_within(git_dir, &git_dir.join("HEAD"))? else {
        return Err(RepositoryError::ValidationFailed);
    };
    let head = single_line_utf8(&head)?;
    if let Some(reference) = head.strip_prefix("ref: ") {
        if !is_safe_head_reference(reference) {
            return Err(RepositoryError::ValidationFailed);
        }
        let branch = reference.trim_start_matches("refs/heads/").to_owned();
        let loose_path = git_dir.join(reference);
        let commit = match read_metadata_within(git_dir, &loose_path)? {
            MetadataRead::Value(value) => validate_commit(&value)?,
            MetadataRead::Missing => {
                let MetadataRead::Value(packed) =
                    read_metadata_within(git_dir, &git_dir.join("packed-refs"))?
                else {
                    return Err(RepositoryError::HeadUnavailable);
                };
                let value = packed
                    .lines()
                    .filter(|line| !line.starts_with(['#', '^']))
                    .find_map(|line| line.split_once(' ').filter(|(_, name)| *name == reference))
                    .map(|(commit, _)| commit)
                    .ok_or(RepositoryError::HeadUnavailable)?;
                validate_commit(value)?
            }
        };
        Ok((branch, commit))
    } else {
        Ok(("(detached)".to_owned(), validate_commit(&head)?))
    }
}

fn enumerate_repository_files(root: &Path) -> Result<Vec<String>, RepositoryError> {
    let mut files = BTreeSet::new();
    let canonical_root = fs::canonicalize(root).map_err(|error| map_io_error(&error))?;
    let mut visited = BTreeSet::from([canonical_root.clone()]);
    let mut directories = vec![(canonical_root.clone(), 0usize)];
    let mut examined_entries = 0usize;
    let deadline = Instant::now() + MAX_ENUMERATION_RUNTIME;
    while let Some((directory, depth)) = directories.pop() {
        if Instant::now() >= deadline {
            return Err(RepositoryError::ValidationFailed);
        }
        for entry in fs::read_dir(&directory).map_err(|error| map_io_error(&error))? {
            if Instant::now() >= deadline {
                return Err(RepositoryError::ValidationFailed);
            }
            examined_entries += 1;
            if examined_entries > MAX_REPOSITORY_ENTRIES {
                return Err(RepositoryError::FileBudgetExceeded);
            }
            let entry = entry.map_err(|error| map_io_error(&error))?;
            let metadata =
                fs::symlink_metadata(entry.path()).map_err(|error| map_io_error(&error))?;
            if is_link_or_reparse(&metadata) {
                continue;
            }
            let path = entry.path();
            let relative = path
                .strip_prefix(&canonical_root)
                .map_err(|_| RepositoryError::ValidationFailed)?;
            let entry_name = entry.file_name();
            let entry_name = entry_name.to_string_lossy();
            if entry_name.eq_ignore_ascii_case(".git") {
                continue;
            }
            if metadata.file_type().is_dir() {
                if depth >= MAX_REPOSITORY_DEPTH {
                    return Err(RepositoryError::FileBudgetExceeded);
                }
                if matches!(
                    entry_name.to_ascii_lowercase().as_str(),
                    "node_modules" | "target" | "dist" | ".runtime" | ".venv"
                ) {
                    continue;
                }
                let canonical = fs::canonicalize(path).map_err(|error| map_io_error(&error))?;
                if !canonical.starts_with(&canonical_root) {
                    return Err(RepositoryError::ValidationFailed);
                }
                if visited.insert(canonical.clone()) {
                    if visited.len() > MAX_REPOSITORY_DIRECTORIES {
                        return Err(RepositoryError::FileBudgetExceeded);
                    }
                    directories.push((canonical, depth + 1));
                }
            } else if metadata.file_type().is_file() {
                let value = relative
                    .to_str()
                    .ok_or(RepositoryError::PathEncodingUnsupported)?
                    .replace('\\', "/");
                if !is_safe_relative_file_path(&value) {
                    return Err(RepositoryError::ValidationFailed);
                }
                files.insert(value);
                if files.len() > MAX_REPOSITORY_FILES {
                    return Err(RepositoryError::FileBudgetExceeded);
                }
            }
        }
    }
    Ok(files.into_iter().collect())
}

fn canonicalize_directory(path: &Path) -> Result<PathBuf, RepositoryError> {
    preflight_local_path(path)?;
    let metadata = fs::symlink_metadata(path).map_err(|error| match error.kind() {
        io::ErrorKind::PermissionDenied => RepositoryError::AccessDenied,
        _ => RepositoryError::ValidationFailed,
    })?;
    if !metadata.is_dir() || is_link_or_reparse(&metadata) {
        return Err(RepositoryError::ValidationFailed);
    }
    let canonical = fs::canonicalize(path).map_err(|error| match error.kind() {
        io::ErrorKind::PermissionDenied => RepositoryError::AccessDenied,
        _ => RepositoryError::ValidationFailed,
    })?;
    require_local_filesystem(&canonical)?;
    Ok(canonical)
}

#[cfg(windows)]
fn preflight_local_path(path: &Path) -> Result<(), RepositoryError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;

    let display = path.as_os_str().to_string_lossy();
    if display.starts_with(r"\\?\UNC\")
        || (display.starts_with(r"\\") && !display.starts_with(r"\\?\"))
    {
        return Err(RepositoryError::ValidationFailed);
    }
    let drive_path = display.strip_prefix(r"\\?\").unwrap_or(&display);
    let drive = drive_path
        .get(..2)
        .filter(|value| value.as_bytes().get(1) == Some(&b':'))
        .ok_or(RepositoryError::ValidationFailed)?;
    let mut root: Vec<u16> = std::ffi::OsStr::new(&format!("{drive}\\"))
        .encode_wide()
        .collect();
    root.push(0);
    let drive_type = unsafe { GetDriveTypeW(root.as_ptr()) };
    if !matches!(drive_type, 2 | 3 | 6) {
        return Err(RepositoryError::ValidationFailed);
    }
    let mut current = PathBuf::from(format!("{drive}\\"));
    for component in path.components().skip(2) {
        current.push(component);
        let metadata = fs::symlink_metadata(&current).map_err(|error| map_io_error(&error))?;
        if is_link_or_reparse(&metadata) {
            return Err(RepositoryError::ValidationFailed);
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn preflight_local_path(_path: &Path) -> Result<(), RepositoryError> {
    Ok(())
}

#[cfg(windows)]
fn require_local_filesystem(path: &Path) -> Result<(), RepositoryError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;

    let display = path.as_os_str().to_string_lossy();
    if display.starts_with(r"\\?\UNC\")
        || (display.starts_with(r"\\") && !display.starts_with(r"\\?\"))
    {
        return Err(RepositoryError::ValidationFailed);
    }
    let drive_path = display.strip_prefix(r"\\?\").unwrap_or(&display);
    let drive = drive_path
        .get(..2)
        .filter(|value| value.as_bytes().get(1) == Some(&b':'))
        .ok_or(RepositoryError::ValidationFailed)?;
    let mut root: Vec<u16> = std::ffi::OsStr::new(&format!("{drive}\\"))
        .encode_wide()
        .collect();
    root.push(0);
    if !matches!(unsafe { GetDriveTypeW(root.as_ptr()) }, 2 | 3 | 6) {
        return Err(RepositoryError::ValidationFailed);
    }
    Ok(())
}

#[cfg(not(windows))]
fn require_local_filesystem(_path: &Path) -> Result<(), RepositoryError> {
    Ok(())
}

fn inspect_repository_inner(path: &str) -> Result<RepositorySummary, RepositoryError> {
    if path.is_empty()
        || path.len() > MAX_SELECTED_PATH_BYTES
        || contains_unsafe_format_controls(path)
    {
        return Err(RepositoryError::ValidationFailed);
    }

    let selected = canonicalize_directory(Path::new(path))?;
    let (root, git_dir) = find_repository_root(&selected)?;
    let (branch, head_sha) = resolve_head(&git_dir)?;
    let files = enumerate_repository_files(&root)?;
    let manifest_files = files
        .iter()
        .filter(|path| is_manifest(path))
        .take(MAX_MANIFEST_FILES)
        .cloned()
        .collect();

    let root_string = root
        .to_str()
        .ok_or(RepositoryError::PathEncodingUnsupported)?
        .to_owned();
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or(RepositoryError::PathEncodingUnsupported)?
        .to_owned();

    Ok(RepositorySummary {
        root: root_string,
        name,
        branch,
        head_sha,
        // `git status` performs content conversion and may execute a
        // repository-configured clean/process filter. Repository contents are
        // untrusted, so onboarding intentionally does not compute dirtiness.
        working_tree_status: "NOT_CHECKED_SAFETY_BOUNDARY",
        read_only: true,
        file_count: files.len(),
        manifest_files,
        files,
    })
}

#[tauri::command]
async fn inspect_repository(path: String) -> Result<RepositorySummary, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_repository_inner(&path))
        .await
        .map_err(|_| RepositoryError::ValidationFailed.code().to_owned())?
        .map_err(|error| error.code().to_owned())
}

#[tauri::command]
fn runtime_provenance() -> serde_json::Value {
    serde_json::json!({
        "transport": "tauri_command",
        "privacy": "local_only",
        "network_enabled": false,
        "runtime": "desk-code-agent"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            inspect_repository,
            runtime_provenance
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Desk Code Agent desktop shell");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "desk-code-agent-{label}-{}-{}",
                std::process::id(),
                NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn fixture(label: &str) -> TestDirectory {
        let sandbox = TestDirectory::new(label);
        fs::create_dir_all(sandbox.0.join(".git/refs/heads")).unwrap();
        fs::create_dir_all(sandbox.0.join("src")).unwrap();
        fs::write(sandbox.0.join(".git/HEAD"), b"ref: refs/heads/main\n").unwrap();
        fs::write(
            sandbox.0.join(".git/refs/heads/main"),
            b"0123456789abcdef0123456789abcdef01234567\n",
        )
        .unwrap();
        fs::write(sandbox.0.join("Cargo.toml"), b"[package]\nname='fixture'\n").unwrap();
        fs::write(
            sandbox.0.join("src/lib.rs"),
            b"pub fn answer() -> u8 { 42 }\n",
        )
        .unwrap();
        sandbox
    }

    #[test]
    fn inspects_metadata_and_files_without_starting_git() {
        let sandbox = fixture("metadata");
        let observed = inspect_repository_inner(sandbox.0.join("src").to_str().unwrap()).unwrap();
        assert!(observed.name.starts_with("desk-code-agent-metadata-"));
        assert_eq!(observed.branch, "main");
        assert_eq!(
            observed.head_sha,
            "0123456789abcdef0123456789abcdef01234567"
        );
        assert_eq!(observed.working_tree_status, "NOT_CHECKED_SAFETY_BOUNDARY");
        assert_eq!(observed.files, vec!["Cargo.toml", "src/lib.rs"]);
        assert_eq!(observed.manifest_files, vec!["Cargo.toml"]);
    }

    #[test]
    fn repository_config_cannot_trigger_external_process_or_network_access() {
        let sandbox = fixture("untrusted-config");
        let marker = sandbox.0.join("FILTER_EXECUTED.marker");
        fs::write(
            sandbox.0.join(".git/config"),
            format!(
                "[include]\npath = \\\\attacker.invalid\\share\\config\n[filter \"canary\"]\nprocess = touch {}\n[core]\nexcludesFile = \\\\attacker.invalid\\share\\ignore\n",
                marker.display()
            ),
        )
        .unwrap();
        fs::write(sandbox.0.join(".gitattributes"), b"* filter=canary\n").unwrap();
        let observed = inspect_repository_inner(sandbox.0.to_str().unwrap()).unwrap();
        assert_eq!(observed.branch, "main");
        assert!(!marker.exists());
        assert!(observed.files.contains(&".gitattributes".to_owned()));
    }

    #[test]
    fn rejects_git_indirection_symlinks_and_unborn_heads() {
        let sandbox = TestDirectory::new("errors");
        assert_eq!(
            inspect_repository_inner(sandbox.0.to_str().unwrap()).unwrap_err(),
            RepositoryError::NotGitRepository
        );
        fs::create_dir_all(sandbox.0.join(".git")).unwrap();
        fs::write(sandbox.0.join(".git/HEAD"), b"ref: refs/heads/main\n").unwrap();
        assert_eq!(
            inspect_repository_inner(sandbox.0.to_str().unwrap()).unwrap_err(),
            RepositoryError::HeadUnavailable
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let outside = sandbox.0.join("outside-ref");
            fs::write(&outside, b"0123456789abcdef0123456789abcdef01234567\n").unwrap();
            fs::create_dir_all(sandbox.0.join(".git/refs/heads")).unwrap();
            symlink(&outside, sandbox.0.join(".git/refs/heads/main")).unwrap();
            assert_eq!(
                inspect_repository_inner(sandbox.0.to_str().unwrap()).unwrap_err(),
                RepositoryError::ValidationFailed
            );
        }
    }

    #[test]
    fn rejects_linked_worktree_gitfile_with_a_specific_closed_error() {
        let sandbox = TestDirectory::new("gitfile");
        fs::write(
            sandbox.0.join(".git"),
            b"gitdir: ../outside/.git/worktrees/fixture\n",
        )
        .unwrap();
        assert_eq!(
            inspect_repository_inner(sandbox.0.to_str().unwrap()).unwrap_err(),
            RepositoryError::UnsupportedGitIndirection
        );
    }

    #[test]
    fn accepts_only_bounded_relative_repository_paths() {
        assert!(is_safe_relative_file_path("src/lib.rs"));
        assert!(!is_safe_relative_file_path("../secret"));
        assert!(!is_safe_relative_file_path("C:\\outside.txt"));
        assert!(!is_safe_relative_file_path("src\\lib.rs"));
        assert!(!is_safe_relative_file_path("src/evil\u{202e}txt.exe"));
        assert!(is_safe_head_reference("refs/heads/feature/safe-name"));
        assert!(!is_safe_head_reference("refs/heads/main:stream"));
        assert!(!is_safe_head_reference("refs/heads/COM1"));
        assert!(!is_safe_head_reference("refs/heads/CONOUT$"));
        assert!(!is_safe_head_reference("refs/heads/COM\u{00b9}"));
        assert!(!is_safe_head_reference("refs/heads/trailing."));
        assert!(!is_safe_head_reference("refs/heads/name.lock"));
    }
}
