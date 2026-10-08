# Runs a command (cargo, by default) inside the MSVC developer environment.
#
# Why this exists: rustc's default host toolchain is x86_64-pc-windows-msvc, and
# several build scripts in this dependency tree (vswhom-sys, libsqlite3-sys,
# embed-resource, tauri's build.rs) shell out to `cl.exe`/`link.exe`. The Visual
# Studio toolset is installed on the machines this app is built on, but it is
# NOT on PATH outside a developer prompt, so a bare `cargo check` dies with:
#
#     error occurred in cc-rs: failed to find tool "cl.exe": program not found
#
# vswhere also cannot be relied on to locate it (some installs leave the
# installer database unregistered, and vswhere then returns no instance at all),
# so this script probes the install roots directly.
#
# Usage (from anywhere):
#   pwsh -File src-tauri/scripts/with-msvc.ps1                 # cargo check --all-targets
#   pwsh -File src-tauri/scripts/with-msvc.ps1 test --no-fail-fast
#   pwsh -File src-tauri/scripts/with-msvc.ps1 clippy --all-targets
#   pwsh -File src-tauri/scripts/with-msvc.ps1 build --release
#
# Anything it does not recognise as cargo arguments is forwarded verbatim, so
# `pwsh -File with-msvc.ps1 tauri build` works too.

[CmdletBinding()]
param(
    # Defaults to `check --all-targets`; pass your own command to override.
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Command = @('check', '--all-targets')
)

$ErrorActionPreference = 'Stop'

function Find-VcVars64 {
    $roots = @(
        ${env:ProgramFiles(x86)},
        $env:ProgramFiles,
        'C:\BuildTools',
        'C:\Program Files\BuildTools'
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    $candidates = foreach ($root in $roots) {
        Get-ChildItem -LiteralPath $root -Filter 'vcvars64.bat' -Recurse `
            -ErrorAction SilentlyContinue -Depth 6 |
            Where-Object { $_.FullName -match 'VC\\Auxiliary\\Build\\vcvars64\.bat$' }
    }

    # Prefer an explicitly installed VC toolset over a Community/Enterprise one:
    # the Build Tools install is the minimal one and is what CI images carry.
    $candidates |
        Sort-Object -Property @{ Expression = { if ($_.FullName -match '\\BuildTools\\') { 0 } else { 1 } } }, FullName |
        Select-Object -First 1 -ExpandProperty FullName
}

$vcvars = Find-VcVars64
if (-not $vcvars) {
    throw @'
No MSVC developer environment found.

Searched for vcvars64.bat under Program Files, Program Files (x86) and
C:\BuildTools. Install the Visual Studio Build Tools with the
"Desktop development with C++" workload:

  winget install Microsoft.VisualStudio.2022.BuildTools

This script does not install anything. A Rust toolchain cannot substitute for
cl.exe: the C/C++ build scripts in this dependency tree are compiled by cl.exe
for the msvc host target.
'@
}

Write-Host "msvc: $vcvars"

# vcvars*.bat only sets variables for the cmd session it runs in, so import them
# into this process; cargo and every build script it spawns inherit them.
$dump = & cmd.exe /d /c "`"$vcvars`" >nul 2>&1 && set"
if ($LASTEXITCODE -ne 0) {
    throw "vcvars64.bat failed to initialize the environment (exit $LASTEXITCODE)."
}
foreach ($line in $dump) {
    if ($line -match '^([^=]+)=(.*)$') {
        try { Set-Item -LiteralPath "env:$($matches[1])" -Value $matches[2] } catch { }
    }
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw 'cargo is not on PATH. Install Rust from https://rustup.rs and reopen the shell.'
}

# cargo needs a manifest. Run from wherever this script lives if the caller did
# not already stand in a cargo package (the repo root is the usual case).
if (-not (Test-Path -LiteralPath (Join-Path $PWD 'Cargo.toml'))) {
    $tauriDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
    if (Test-Path -LiteralPath (Join-Path $tauriDir 'Cargo.toml')) {
        Write-Host "run in: $tauriDir"
        Set-Location -LiteralPath $tauriDir
    }
}

if ($Command.Count -gt 0 -and $Command[0] -eq 'tauri') {
    $tauriArgs = if ($Command.Count -gt 1) { $Command[1..($Command.Count - 1)] } else { @() }
    Write-Host "run:   npx tauri $($tauriArgs -join ' ')"
    $ErrorActionPreference = 'Continue'
    & npx.cmd --yes tauri $tauriArgs
    $code = $LASTEXITCODE
    exit $code
}

# If building release with cargo, ensure custom-protocol feature is included
# so the desktop binary embeds frontend dist instead of looking for localhost:5173.
if ($Command -contains 'build' -and $Command -contains '--release' -and -not ($Command -contains '--features')) {
    $Command += @('--features', 'custom-protocol')
}

$targetDir = (cargo metadata --format-version 1 --no-deps | ConvertFrom-Json).target_directory
Write-Host "target: $targetDir"
Write-Host "run:   cargo $($Command -join ' ')"

# cargo writes every progress line ("Compiling", "Finished", warnings) to stderr.
# Under $ErrorActionPreference = 'Stop' PowerShell turns each of those into a
# terminating NativeCommandError, so the script died on the first "Compiling"
# line and left a truncated build. Progress on stderr is not a failure: only
# cargo's own exit code is. Relax the preference for the invocation and let the
# exit code below decide.
$ErrorActionPreference = 'Continue'
& cargo @Command
$code = $LASTEXITCODE
exit $code

