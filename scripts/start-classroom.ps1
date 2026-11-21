<#
.SYNOPSIS
  Starts the classroom stack on the laptop, each part in its own window with a log in logs\:
  Mosquitto (project config) -> face-api (+ tunnel) -> ingest -> edge.

.USAGE
  powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1
  ... -MqttPort 1884          # if the default Mosquitto Windows service already holds 1883
  ... -NoFaceApi              # face-api already running (or not needed)
  ... -FaceApiPort 8010        # if another program already listens on 8000
  ... -Video apps\edge\samples\walk.mp4   # replay a recording instead of the live gate camera
  ... -Presence               # entry_mode=presence (phone sees only people walking IN)

  Close the windows (or Ctrl+C in each) to stop. Needs the venvs of apps/face-api, apps/ingest, apps/edge
  and each app's .env (see the app READMEs).
#>
param(
  [int]$MqttPort = 1883,
  [switch]$NoFaceApi,
  [int]$FaceApiPort = 8000,
  [string]$Video = "",
  [switch]$Presence
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo "logs"
New-Item -ItemType Directory -Force $logs, (Join-Path $repo "infra\mosquitto\data") | Out-Null

$mosq = (Get-Command mosquitto -ErrorAction SilentlyContinue).Source
if (-not $mosq) { $mosq = "$env:ProgramFiles\mosquitto\mosquitto.exe" }
if (-not (Test-Path $mosq)) { throw "Mosquitto not found. Install it from https://mosquitto.org/download/" }
foreach ($f in "infra\mosquitto\passwd", "apps\ingest\.env", "apps\edge\.env") {
  if (-not (Test-Path (Join-Path $repo $f))) { throw "Missing $f (see PROGRESS.md 'Manual steps')." }
}

$busy = Get-NetTCPConnection -LocalPort $MqttPort -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $owner = (Get-Process -Id $busy[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
  throw "Port $MqttPort is already used by '$owner'. If that is the default Mosquitto Windows service, either run with -MqttPort 1884, or stop it once in an ADMIN PowerShell: Stop-Service mosquitto; Set-Service mosquitto -StartupType Manual"
}

# Runtime copy of the broker config with the chosen port (infra/mosquitto/data is gitignored).
$conf = Join-Path $repo "infra\mosquitto\data\runtime.conf"
(Get-Content (Join-Path $repo "infra\mosquitto\mosquitto.conf")) -replace '^listener 1883 ', "listener $MqttPort " |
  Set-Content -Encoding ascii $conf

function Start-Part([string]$title, [string]$dir, [string]$command) {
  $log = Join-Path $logs "$title.log"
  $inner = "`$host.UI.RawUI.WindowTitle = '$title'; `$env:MQTT_PORT = '$MqttPort'; Set-Location '$dir'; $command 2>&1 | Tee-Object -FilePath '$log' -Append"
  Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $inner | Out-Null
  Write-Host "started $title  (log: logs\$title.log)"
}

Start-Part "mosquitto" $repo "& '$mosq' -c '$conf'"
Start-Sleep -Seconds 2
if (-not $NoFaceApi) {
  Start-Part "face-api" $repo "powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1 -Port $FaceApiPort"
}
Start-Part "ingest" (Join-Path $repo "apps\ingest") ".\.venv\Scripts\python.exe -m ingest"
$edgeArgs = ""
if ($Video) { $edgeArgs += " --video '$((Resolve-Path $Video).Path)'" }
if ($Presence) { $edgeArgs += " --presence" }
Start-Part "edge" (Join-Path $repo "apps\edge") ".\.venv\Scripts\python.exe -m edge$edgeArgs"

Write-Host ""
Write-Host "Classroom stack starting (MQTT port $MqttPort). Watch the 'edge' window for 'session ... gallery N students'." -ForegroundColor Green
Write-Host "No session in the room yet? Admin -> Sections -> 'Start 30-min test session'."
