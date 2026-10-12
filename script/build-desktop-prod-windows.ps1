param(
  [string] $Root = ""
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string] $Label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Ensure-NodeHeap([string] $SizeMb = "8192") {
  if ($env:NODE_OPTIONS -match '(^|\s)--max-old-space-size=') {
    return
  }
  $env:NODE_OPTIONS = (($env:NODE_OPTIONS, "--max-old-space-size=$SizeMb") -join " ").Trim()
}

if (-not $Root) {
  $Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
}

$envf = Join-Path $Root ".env"
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()

if (Test-Path $envf) {
  Write-Host "==> load env $envf"
  Get-Content $envf | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') {
      return
    }
    if ($_ -notmatch '^\s*([^=]+?)=(.*)$') {
      return
    }
    $name = $matches[1].Trim()
    $val = $matches[2]
    if (
      ($val.StartsWith('"') -and $val.EndsWith('"')) -or
      ($val.StartsWith("'") -and $val.EndsWith("'"))
    ) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $val)
  }
}

$cargoBin = Join-Path $HOME ".cargo\bin"
if ((Test-Path (Join-Path $cargoBin "cargo.exe")) -and (($env:PATH -split ';') -notcontains $cargoBin)) {
  $env:PATH = "$cargoBin;$env:PATH"
}

$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $Bun) {
  $Bun = Join-Path $HOME ".bun\bin\bun.exe"
}
if (-not (Test-Path $Bun)) {
  throw "Missing bun executable. Add bun to PATH or install it at $Bun"
}

if ($arch -eq "X64") {
  $triple = "x86_64-pc-windows-msvc"
  $dir = "wiscode-cli-windows-x64-baseline"
  $args = @("run", "script/build.ts", "--single", "--baseline", "--skip-install")
}
elseif ($arch -eq "Arm64") {
  $triple = "aarch64-pc-windows-msvc"
  $dir = "wiscode-cli-windows-arm64"
  $args = @("run", "script/build.ts", "--single", "--skip-install")
}
else {
  throw "Unsupported Windows architecture: $arch"
}

Write-Host "==> root: $Root"
Write-Host "==> arch: $arch"

Set-Location $Root
$env:OPENCODE_CHANNEL = "prod"
$env:OPENCODE_VERSION = (Get-Content (Join-Path $Root "packages\opencode\package.json") -Raw | ConvertFrom-Json).version
Write-Host "==> bun install"
& $Bun install
Assert-LastExitCode "bun install"

Set-Location (Join-Path $Root "packages\opencode")
Write-Host "==> build sidecar"
& $Bun @args
Assert-LastExitCode "build sidecar"

$bin = Join-Path $Root "packages\opencode\dist\$dir\bin\wiscode-cli.exe"
if (-not (Test-Path $bin)) {
  throw "Missing sidecar binary: $bin"
}

$rgArchiveDir = Join-Path $Root "third_party\\ripgrep\\v15.1.0"
if ($arch -eq "X64") {
  $rgArchive = Join-Path $rgArchiveDir "ripgrep-15.1.0-x86_64-pc-windows-msvc.zip"
}
else {
  $rgArchive = Join-Path $rgArchiveDir "ripgrep-15.1.0-aarch64-pc-windows-msvc.zip"
}
if (-not (Test-Path $rgArchive)) {
  throw "Missing ripgrep archive: $rgArchive"
}
$rgTemp = Join-Path ([System.IO.Path]::GetTempPath()) ("wiscode-rg-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force $rgTemp | Out-Null
Expand-Archive -LiteralPath $rgArchive -DestinationPath $rgTemp -Force
$rg = Get-ChildItem $rgTemp -Recurse -Filter rg.exe | Select-Object -First 1 -ExpandProperty FullName
if (-not $rg) {
  throw "Missing ripgrep binary in archive: $rgArchive"
}

Set-Location (Join-Path $Root "packages\desktop")
Write-Host "==> copy sidecar"
$resources = Join-Path $Root "packages\desktop\resources"
New-Item -ItemType Directory -Force $resources | Out-Null
Copy-Item $bin (Join-Path $resources "wiscode-cli.exe") -Force
$binDir = Split-Path $bin -Parent
Copy-Item (Join-Path $binDir "uv.exe") (Join-Path $resources "uv.exe") -Force
Copy-Item (Join-Path $binDir "uv-LICENSE-MIT") (Join-Path $resources "uv-LICENSE-MIT") -Force
$bmadDest = Join-Path $resources "bmad"
New-Item -ItemType Directory -Force $bmadDest | Out-Null
Copy-Item (Join-Path $binDir "bmad\*") $bmadDest -Recurse -Force
Copy-Item $rg (Join-Path $resources "rg.exe") -Force
New-Item -ItemType Directory -Force (Join-Path $Root "packages\desktop\native") | Out-Null

# Force known-good mirror endpoints to avoid inherited env pollution.
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://cdn.npmmirror.com/binaries/electron-builder-binaries/"
$env:NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR = $env:ELECTRON_BUILDER_BINARIES_MIRROR
$env:npm_config_electron_builder_binaries_mirror = $env:NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR
$env:ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL = $null
Remove-Item Env:NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR -ErrorAction SilentlyContinue
Remove-Item Env:npm_config_electron_builder_binaries_custom_dir -ErrorAction SilentlyContinue
Remove-Item Env:NPM_PACKAGE_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR -ErrorAction SilentlyContinue
Remove-Item Env:npm_package_config_electron_builder_binaries_custom_dir -ErrorAction SilentlyContinue
Remove-Item Env:npm_package_config_electron_builder_binaries_mirror -ErrorAction SilentlyContinue
Remove-Item Env:NPM_PACKAGE_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR -ErrorAction SilentlyContinue
if (-not $env:ELECTRON_CACHE) { $env:ELECTRON_CACHE = (Join-Path $Root ".cache\electron") }
if (-not $env:ELECTRON_BUILDER_CACHE) { $env:ELECTRON_BUILDER_CACHE = (Join-Path $Root ".cache\electron-builder") }
New-Item -ItemType Directory -Force $env:ELECTRON_CACHE | Out-Null
New-Item -ItemType Directory -Force $env:ELECTRON_BUILDER_CACHE | Out-Null

$rceditSource = Join-Path $Root "node_modules\.bun\electron-winstaller@5.4.0\node_modules\electron-winstaller\vendor\rcedit.exe"
if (Test-Path $rceditSource) {
  $rceditDir = Join-Path $env:ELECTRON_BUILDER_CACHE "rcedit"
  New-Item -ItemType Directory -Force $rceditDir | Out-Null
  Copy-Item $rceditSource (Join-Path $rceditDir "rcedit-x64.exe") -Force
  Copy-Item $rceditSource (Join-Path $rceditDir "rcedit-x86.exe") -Force
  $env:ELECTRON_BUILDER_RCEDIT_PATH = $rceditDir
}

Write-Host "==> electron mirror: $env:ELECTRON_MIRROR"
Write-Host "==> electron-builder mirror: $env:NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR"
Write-Host "==> electron-builder rcedit: $env:ELECTRON_BUILDER_RCEDIT_PATH"
Write-Host "==> electron-builder env"
Get-ChildItem Env: | Where-Object { $_.Name -match 'ELECTRON_BUILDER_BINARIES|ELECTRON_BUILDER_RCEDIT|ELECTRON_MIRROR|npm_config_electron_builder|npm_package_config_electron_builder' } | Sort-Object Name | Format-Table -AutoSize

Ensure-NodeHeap
Write-Host "==> node options: $env:NODE_OPTIONS"

Write-Host "==> typecheck"
& $Bun run typecheck
Assert-LastExitCode "desktop typecheck"

Write-Host "==> build frontend"
& $Bun run build
Assert-LastExitCode "desktop build"

Write-Host "==> package windows (electron-builder)"
& $Bun run package:win
Assert-LastExitCode "package windows"

Write-Host "==> artifacts"
Get-ChildItem (Join-Path $Root "packages\desktop\dist") -Recurse |
  Where-Object { $_.Name -like "WisCode*" -or $_.Extension -in ".exe", ".msi", ".zip", ".blockmap" } |
  Select-Object -ExpandProperty FullName
