param(
    [Parameter(Mandatory = $true)]
    [string]$BinaryPath
)

$ErrorActionPreference = "Stop"

$installDir = Join-Path $HOME ".wiscode\bin"
$targetPath = Join-Path $installDir "wiscode.exe"

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath $BinaryPath -Destination $targetPath -Force

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$entries = @()
if ($currentPath) {
    $entries = $currentPath.Split(";") | Where-Object { $_ -and $_.Trim() -ne "" }
}

$normalizedInstallDir = $installDir.TrimEnd("\")
$exists = $entries | Where-Object { $_.TrimEnd("\") -ieq $normalizedInstallDir }
if (-not $exists) {
    $nextPath = @($entries + $installDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $nextPath, "User")
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd,
    uint Msg,
    UIntPtr wParam,
    string lParam,
    uint fuFlags,
    uint uTimeout,
    out UIntPtr lpdwResult
  );
}
"@

$result = [UIntPtr]::Zero
[void][Win32]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, "Environment", 0x0002, 5000, [ref]$result)

Write-Output $targetPath
