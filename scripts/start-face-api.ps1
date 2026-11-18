<#
.SYNOPSIS
  Starts apps/face-api (uvicorn, 127.0.0.1:8000) and a Cloudflare quick tunnel to it, then publishes the
  tunnel URL to Supabase (private.app_config 'face_api_url') so the deployed web app can reach it.

.USAGE
  powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1
  powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1 -NoTunnel      # local only
  powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1 -TunnelName face  # named tunnel (needs a Cloudflare account + `cloudflared tunnel login`)

  Ctrl+C stops both. Needs: apps/face-api/.venv (see apps/face-api/README.md), cloudflared, and apps/edge/.env with
  EDGE_DEVICE_KEY + API_BASE_URL (to publish the tunnel URL to the web app).
#>
param(
  [switch]$NoTunnel,
  [string]$TunnelName = "",
  [string]$PublicUrl = "",  # with -TunnelName: the hostname routed to the tunnel, e.g. https://face.example.com
  [int]$Port = 8000
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$api = Join-Path $repo "apps\face-api"
$python = Join-Path $api ".venv\Scripts\python.exe"
$logDir = Join-Path $api "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null

if (-not (Test-Path $python)) { throw "Missing $python. Create the venv first (apps/face-api/README.md)." }
if (-not (Test-Path (Join-Path $api ".env"))) { throw "Missing apps/face-api/.env (copy .env.example and set FACE_API_SECRET)." }

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) {
  $guess = "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe"
  if (Test-Path $guess) { $cloudflared = $guess }
}

# The tunnel URL is published through the web app with this laptop's EDGE device key
# (apps/edge/.env: EDGE_DEVICE_KEY + API_BASE_URL). No Supabase credentials on the laptop.
function Read-DotEnv([string]$path) {
  $vals = @{}
  if (Test-Path $path) {
    foreach ($line in Get-Content $path) {
      if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $vals[$Matches[1]] = $Matches[2].Trim('"', "'") }
    }
  }
  return $vals
}
$edgeEnv = Read-DotEnv (Join-Path $repo "apps\edge\.env")

function Publish-Url([string]$url) {
  $key = $edgeEnv["EDGE_DEVICE_KEY"]; $base = $edgeEnv["API_BASE_URL"]
  if (-not $key -or -not $base -or $base -match '<app>') {
    Write-Warning "apps/edge/.env needs EDGE_DEVICE_KEY and API_BASE_URL to publish the URL. Set it by hand instead (admin SQL): select public.set_app_config('face_api_url', '$url');"
    return
  }
  try {
    Invoke-RestMethod -Method Post -Uri "$($base.TrimEnd('/'))/api/edge/v1/face-api-url" `
      -Headers @{ Authorization = "Bearer $key" } -ContentType "application/json" `
      -Body (@{ url = $url } | ConvertTo-Json) | Out-Null
    Write-Host "Published face_api_url = $url (via $base)" -ForegroundColor Green
  } catch {
    Write-Warning "Publishing the URL failed: $($_.Exception.Message)"
  }
}

Write-Host "Starting face-api on 127.0.0.1:$Port (model load takes ~10 s)..."
$apiProc = Start-Process -FilePath $python -WorkingDirectory $api -PassThru -NoNewWindow `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port" `
  -RedirectStandardOutput (Join-Path $logDir "face-api.out.log") -RedirectStandardError (Join-Path $logDir "face-api.err.log")

$ready = $false
for ($i = 0; $i -lt 90 -and -not $ready; $i++) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
    $ready = $h.model_loaded
  } catch { }
  if ($apiProc.HasExited) { throw "face-api exited; see $logDir\face-api.err.log" }
}
if (-not $ready) { Stop-Process $apiProc -Force; throw "face-api did not become ready in 90 s" }
Write-Host "face-api ready (local): http://127.0.0.1:$Port/health" -ForegroundColor Green

$tunnelProc = $null
try {
  if (-not $NoTunnel) {
    if (-not $cloudflared) { throw "cloudflared not found. Install: winget install --id Cloudflare.cloudflared" }
    $tlog = Join-Path $logDir "tunnel.log"
    Remove-Item $tlog -ErrorAction SilentlyContinue
    if ($TunnelName) {
      if (-not $PublicUrl) { throw "-TunnelName needs -PublicUrl (the hostname you routed to it)" }
      $tunnelProc = Start-Process -FilePath $cloudflared -PassThru -NoNewWindow `
        -ArgumentList "tunnel", "--no-autoupdate", "--logfile", $tlog, "run", "--url", "http://127.0.0.1:$Port", $TunnelName
      $url = $PublicUrl.TrimEnd("/")
    } else {
      # Quick tunnel: free, no account, random *.trycloudflare.com URL that changes on every start.
      $tunnelProc = Start-Process -FilePath $cloudflared -PassThru -NoNewWindow `
        -ArgumentList "tunnel", "--no-autoupdate", "--logfile", $tlog, "--url", "http://127.0.0.1:$Port"
      $url = $null
      for ($i = 0; $i -lt 60 -and -not $url; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $tlog) {
          $m = Select-String -Path $tlog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
          if ($m) { $url = $m.Matches[0].Value }
        }
        if ($tunnelProc.HasExited) { throw "cloudflared exited; see $tlog" }
      }
      if (-not $url) { throw "no tunnel URL after 60 s; see $tlog" }
    }

    # Wait until the tunnel actually serves /health (DNS for a fresh quick tunnel can take a few seconds).
    $ok = $false
    for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
      try { $ok = (Invoke-RestMethod "$url/health" -TimeoutSec 5).model_loaded } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $ok) { Write-Warning "Tunnel URL $url is not answering /health yet; publishing anyway." }
    else { Write-Host "face-api ready (tunnel): $url/health" -ForegroundColor Green }
    Publish-Url $url
  }

  Write-Host "Running. Press Ctrl+C to stop." -ForegroundColor Cyan
  while (-not $apiProc.HasExited) { Start-Sleep -Seconds 2 }
  Write-Warning "face-api exited; see $logDir\face-api.err.log"
} finally {
  if ($tunnelProc -and -not $tunnelProc.HasExited) { Stop-Process $tunnelProc -Force }
  if (-not $apiProc.HasExited) { Stop-Process $apiProc -Force }
  Write-Host "Stopped."
}
