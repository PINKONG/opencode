param(
  [string] $Root = ""
)

$ErrorActionPreference = "Stop"

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

if ($arch -eq "X64") {
  $triple = "x86_64-pc-windows-msvc"
  $dir = "opencode-windows-x64-baseline"
  $args = @("run", "script/build.ts", "--single", "--baseline", "--skip-install")
}
elseif ($arch -eq "Arm64") {
  $triple = "aarch64-pc-windows-msvc"
  $dir = "opencode-windows-arm64"
  $args = @("run", "script/build.ts", "--single", "--skip-install")
}
else {
  throw "Unsupported Windows architecture: $arch"
}

Write-Host "==> root: $Root"
Write-Host "==> arch: $arch"

if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
  if (-not (Test-Path $env:TAURI_SIGNING_PRIVATE_KEY_PATH)) {
    throw "Missing signing key file: $env:TAURI_SIGNING_PRIVATE_KEY_PATH"
  }
  Write-Host "==> load updater signing key from path"
  $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $env:TAURI_SIGNING_PRIVATE_KEY_PATH -Raw)
}

Set-Location $Root
Write-Host "==> bun install"
bun install

Set-Location (Join-Path $Root "packages\opencode")
Write-Host "==> build sidecar"
& bun @args

$bin = Join-Path $Root "packages\opencode\dist\$dir\bin\opencode.exe"
if (-not (Test-Path $bin)) {
  throw "Missing sidecar binary: $bin"
}

Set-Location (Join-Path $Root "packages\desktop")
Write-Host "==> copy sidecar"
$sidecar = Join-Path $Root "packages\desktop\src-tauri\sidecars"
New-Item -ItemType Directory -Force $sidecar | Out-Null
Copy-Item $bin (Join-Path $sidecar "opencode-cli-$triple.exe") -Force

Write-Host "==> typecheck"
bun run typecheck

Write-Host "==> build frontend"
bun run build

Write-Host "==> tauri prod build"
$args = @("run", "tauri", "build", "--config", "src-tauri/tauri.prod.conf.json")
if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and -not $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
  Write-Host "==> updater signing key missing, disabling updater artifacts"
  $args += @("--config", '{"bundle":{"createUpdaterArtifacts":false}}')
}
& bun @args

Write-Host "==> artifacts"
Get-ChildItem (Join-Path $Root "packages\desktop\src-tauri\target\release\bundle") -Recurse |
  Where-Object { $_.Name -like "WisCode*" -or $_.Extension -in ".exe", ".msi", ".zip" } |
  Select-Object -ExpandProperty FullName
