<#
.SYNOPSIS
  Recorded-video demo class: plays two phone recordings as the door and inside cameras of a live class.

.USAGE
  1. Admin -> Sections -> IOT401-01 -> "Video demo class (10 min)"   (starts a real 10-minute class, demo timing)
  2. powershell -ExecutionPolicy Bypass -File scripts\run-video-demo.ps1 -Door C:\videos\door.mp4 -Room C:\videos\room.mp4
     The edge waits for the live class, then plays both recordings together in real time (live view:
     http://127.0.0.1:8090), keeps their last frames when they end, and stops when the class ends.

  Camera settings (rotation, exit line, seat area) come from apps\edge\config.demo.yaml when it exists
  (gitignored; made for your recordings), else from apps\edge\config.yaml.
  Events go straight to the website (--direct): no Mosquitto or ingest needed.
#>
param(
  [Parameter(Mandatory = $true)][string]$Door,
  [Parameter(Mandatory = $true)][string]$Room
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$edge = Join-Path $repo "apps\edge"
$py = Join-Path $edge ".venv\Scripts\python.exe"
foreach ($f in @($Door, $Room)) {
  if (-not (Test-Path $f)) { throw "Video not found: $f" }
}
if (-not (Test-Path $py)) { throw "apps\edge\.venv is missing (see apps\edge\README.md)" }
if (-not (Test-Path (Join-Path $edge ".env"))) { throw "apps\edge\.env is missing (device key + API address)" }

$demoCfg = Join-Path $edge "config.demo.yaml"
if (Test-Path $demoCfg) { $env:EDGE_CONFIG_PATH = $demoCfg; $cfgName = "config.demo.yaml" } else { $cfgName = "config.yaml" }
$logs = Join-Path $repo "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs ("video-demo-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

Write-Host "AttendIQ video demo"
Write-Host "  door video : $Door"
Write-Host "  room video : $Room"
Write-Host "  settings   : apps\edge\$cfgName"
Write-Host "  live view  : http://127.0.0.1:8090"
Write-Host "  log        : $log"
Write-Host "Waiting for the class: press 'Video demo class (10 min)' on the website (Admin -> Sections)."
Start-Process "http://127.0.0.1:8090"

Push-Location $edge
try {
  & $py -m edge --direct --demo --video (Resolve-Path $Door).Path --room-video (Resolve-Path $Room).Path 2>&1 |
    Tee-Object -FilePath $log
} finally {
  Pop-Location
}
