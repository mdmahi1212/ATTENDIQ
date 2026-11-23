<#
.SYNOPSIS
  One-click live classroom: checks the two phone cameras, starts every part (broker, face API + tunnel, ingest,
  edge with the AI models) in its own window, then opens the live camera view and the website.
  Double-click START-CLASS.bat (repo root) to run it. Running it again reuses the parts that are already running.

  Classes start by themselves from the timetable; for a demo press Admin -> Demo -> 5 / 10 / 15 min / Full class.
#>
param(
  [int]$MqttPort = 1884,     # the Mosquitto Windows service holds 1883 on this laptop
  [int]$FaceApiPort = 8010   # another program holds 8000 on this laptop
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo "apps\edge\.env"
if (-not (Test-Path $envFile)) { throw "apps\edge\.env is missing (see README.md Quick start)." }

function Get-EnvValue([string]$name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if ($line) { ($line -split "=", 2)[1].Trim().Trim('"') } else { "" }
}

# 1. Phone cameras reachable?
Write-Host "Checking the cameras ..." -ForegroundColor Cyan
foreach ($cam in @(@{ n = "Door camera (phone 1)"; v = "GATE_CAMERA_SOURCE" }, @{ n = "Room camera (phone 2)"; v = "INSIDE_CAMERA_SOURCE" })) {
  $src = Get-EnvValue $cam.v
  if ($src -eq "" -or $src -eq "auto") { Write-Host "  $($cam.n): automatic (the edge finds the phone on this Wi-Fi; or choose it on the website: Operator -> camera)"; continue }
  if ($src -notmatch '^https?://([^/:]+):?(\d+)?') { Write-Host "  $($cam.n): $src (local device)"; continue }
  $hostName = $Matches[1]; $port = if ($Matches[2]) { [int]$Matches[2] } else { 80 }
  $tcp = New-Object System.Net.Sockets.TcpClient
  $ok = $tcp.ConnectAsync($hostName, $port).Wait(2000) -and $tcp.Connected
  $tcp.Close()
  if ($ok) { Write-Host "  $($cam.n): OK ($hostName`:$port)" -ForegroundColor Green }
  else { Write-Host "  $($cam.n): NOT reachable at $hostName`:$port - open the camera app and start its server (same Wi-Fi). The edge keeps retrying." -ForegroundColor Yellow }
}

# 2. Every part in its own window (reused when already running).
& (Join-Path $PSScriptRoot "start-classroom.ps1") -MqttPort $MqttPort -FaceApiPort $FaceApiPort

# 3. Open the live camera view (once the edge has loaded its models) and the website.
$site = (Get-EnvValue "API_BASE_URL").TrimEnd("/")
Write-Host "Loading the AI models (up to 1 minute) ..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline -and -not (Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Sleep -Seconds 2
}
if (Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue) {
  Start-Process "http://127.0.0.1:8090"
} else {
  Write-Host "Live camera view not up yet (is liveview.enabled true in apps\edge\config.yaml?). Look at the 'edge' window." -ForegroundColor Yellow
}
if ($site) { Start-Process $site }
Write-Host ""
Write-Host "Ready. Classes start by themselves from the timetable; for a demo: Admin -> Demo." -ForegroundColor Green
