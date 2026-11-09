<#
.SYNOPSIS
  Runs HaftDast on this PC and exposes it on the internet through a free tunnel,
  so friends can join your room from anywhere. No server or account needed.

.DESCRIPTION
  1. Installs dependencies / builds the app if needed.
  2. Starts the production server on localhost.
  3. Opens a tunnel (Cloudflare quick tunnel by default, localtunnel as fallback)
     and prints the public https URL to share.
  Press Ctrl+C to stop everything.

.PARAMETER Rebuild   Force a fresh production build.
.PARAMETER Tunnel    'cloudflare' (default) or 'localtunnel'.
.PARAMETER Port      Local port (default 3000).
.PARAMETER Yes       Don't ask before downloading cloudflared into .\tools.
#>
param(
  [switch]$Rebuild,
  [ValidateSet('cloudflare', 'localtunnel')] [string]$Tunnel = 'cloudflare',
  [int]$Port = 3000,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Wait-Port([int]$p, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $c = New-Object Net.Sockets.TcpClient
      $c.Connect('127.0.0.1', $p); $c.Close(); return $true
    } catch { Start-Sleep -Milliseconds 400 }
  }
  return $false
}
function Wait-Match([string]$file, [string]$pattern, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $file) {
      $m = Select-String -Path $file -Pattern $pattern -AllMatches -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($m) { return $m.Matches[0].Value }
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

# Note: keep this file ASCII-only. Windows PowerShell 5 reads BOM-less scripts as ANSI and
# some UTF-8 bytes of characters like arrows turn into quote marks, breaking the parser.
Say ''
Say '  HaftDast - online play' 'Yellow'
Say ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Say 'Node.js is not installed. Get it from https://nodejs.org and run this again.' 'Red'
  exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Say '> Installing dependencies (first run only)...' 'Cyan'
  & npm install
}

# Rebuild when there is no build yet, or when any source file is newer than the last build.
$buildId = Join-Path $root '.next\BUILD_ID'
$stale = $false
if (Test-Path $buildId) {
  $builtAt = (Get-Item $buildId).LastWriteTimeUtc
  $newest = Get-ChildItem -Path (Join-Path $root 'src'), (Join-Path $root 'public'), (Join-Path $root 'server.ts') -Recurse -File |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($newest -and $newest.LastWriteTimeUtc -gt $builtAt) { $stale = $true }
}
if ($Rebuild -or $stale -or -not (Test-Path $buildId)) {
  Say '> Building the app (takes about a minute)...' 'Cyan'
  & npm run build
  if ($LASTEXITCODE -ne 0) { Say 'Build failed.' 'Red'; exit 1 }
}

$logDir = Join-Path $root '.online'
New-Item -ItemType Directory -Force $logDir | Out-Null
$serverLog = Join-Path $logDir 'server.log'
$tunnelOut = Join-Path $logDir 'tunnel.out.log'
$tunnelErr = Join-Path $logDir 'tunnel.err.log'
Remove-Item $serverLog, $tunnelOut, $tunnelErr -Force -ErrorAction SilentlyContinue

$server = $null
$tunnelProc = $null
try {
  Say "> Starting the game server on http://localhost:$Port ..." 'Cyan'
  $env:PORT = "$Port"
  $env:NODE_ENV = 'production'
  $server = Start-Process -FilePath 'npx.cmd' -ArgumentList 'tsx', 'server.ts' `
    -WorkingDirectory $root -NoNewWindow -PassThru `
    -RedirectStandardOutput $serverLog -RedirectStandardError (Join-Path $logDir 'server.err.log')
  if (-not (Wait-Port $Port 60)) {
    Say 'The server did not start. See .online\server.err.log' 'Red'
    exit 1
  }

  $url = $null
  if ($Tunnel -eq 'cloudflare') {
    $cf = Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    $local = Join-Path $root 'tools\cloudflared.exe'
    if (-not $cf -and (Test-Path $local)) { $cf = $local }
    if (-not $cf) {
      $ok = $Yes
      if (-not $ok) {
        $answer = Read-Host 'cloudflared is not installed. Download it (official, ~40 MB) into .\tools? [Y/n]'
        $ok = ($answer -eq '' -or $answer -match '^[yY]')
      }
      if ($ok) {
        Say '> Downloading cloudflared...' 'Cyan'
        New-Item -ItemType Directory -Force (Split-Path $local) | Out-Null
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $local
        $cf = $local
      } else {
        Say '> Falling back to localtunnel.' 'Yellow'
        $Tunnel = 'localtunnel'
      }
    }
    if ($cf) {
      Say '> Opening a Cloudflare tunnel...' 'Cyan'
      $tunnelProc = Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', "http://localhost:$Port", '--no-autoupdate' `
        -NoNewWindow -PassThru -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr
      $url = Wait-Match $tunnelErr 'https://[a-z0-9-]+\.trycloudflare\.com' 60
      if (-not $url) { $url = Wait-Match $tunnelOut 'https://[a-z0-9-]+\.trycloudflare\.com' 5 }
    }
  }

  $password = $null
  if ($Tunnel -eq 'localtunnel') {
    Say '> Opening a localtunnel...' 'Cyan'
    $tunnelProc = Start-Process -FilePath 'npx.cmd' -ArgumentList '--yes', 'localtunnel', '--port', "$Port" `
      -NoNewWindow -PassThru -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr
    $url = Wait-Match $tunnelOut 'https://[a-z0-9-]+\.loca\.lt' 90
    try { $password = (Invoke-RestMethod 'https://loca.lt/mytunnelpassword').Trim() } catch { }
  }

  if (-not $url) {
    Say 'Could not open a tunnel. Check your internet connection and see the .online folder logs.' 'Red'
    exit 1
  }

  try { Set-Clipboard -Value $url } catch { }
  Say ''
  Say '  ==================================================' 'DarkYellow'
  Say "   Share this link:   $url" 'Green'
  if ($password) { Say "   localtunnel password (your public IP): $password" 'Yellow' }
  Say '  ==================================================' 'DarkYellow'
  Say ''
  Say '   The link is copied to your clipboard.'
  Say "   You can play from http://localhost:$Port or from the same link."
  Say '   Online -> Create room -> send the 4-letter code to your friend.'
  Say '   Keep this window open while playing. Ctrl+C stops the game.'
  Say ''

  while ($true) {
    if ($server.HasExited) { Say 'Server stopped.' 'Red'; break }
    if ($tunnelProc -and $tunnelProc.HasExited) { Say 'Tunnel closed.' 'Red'; break }
    Start-Sleep -Seconds 1
  }
} finally {
  foreach ($p in @($tunnelProc, $server)) {
    if ($p -and -not $p.HasExited) {
      # kill the whole tree (npx -> node)
      & taskkill /PID $p.Id /T /F 2>$null | Out-Null
    }
  }
  Say 'Stopped.' 'Gray'
}
