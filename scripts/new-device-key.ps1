# Creates a new API key for an edge_devices row. The plaintext key is printed ONCE and never stored;
# only its SHA-256 (hex) goes into edge_devices.api_key_hash.
#   scripts\new-device-key.ps1 -DeviceId e0000000-0000-4000-8000-000000000001          # print key + SQL
#   scripts\new-device-key.ps1 -DeviceId e0000000-0000-4000-8000-000000000001 -Apply   # also write the hash (needs SUPABASE_DB_URL)
# Seeded devices: ...0001 edge-B204, ...0002 ingest-B204, ...0003 simulator-B204.
# (Phase 5 extends this script to create the matching Mosquitto user.)
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F-]{36}$')][string]$DeviceId,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$key = 'sadev_' + ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'))

$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | ForEach-Object { $_.ToString('x2') })
$sha.Dispose()

$sql = "update public.edge_devices set api_key_hash = '$hash' where id = '$DeviceId' returning id, name;"

Write-Host ''
Write-Host "Device id : $DeviceId"
Write-Host "API key   : $key" -ForegroundColor Yellow
Write-Host '            ^ copy it now into the device .env (EDGE_DEVICE_KEY / INGEST_DEVICE_KEY / SIM_DEVICE_KEY). It is not stored anywhere.'
Write-Host ''

if ($Apply) {
    $root = Split-Path -Parent $PSScriptRoot
    $dbDir = Join-Path $PSScriptRoot 'db'
    if (-not (Test-Path (Join-Path $dbDir 'node_modules'))) {
        Push-Location $dbDir
        try { npm ci --no-audit --no-fund } finally { Pop-Location }
    }
    Push-Location $root
    try { node scripts/db/run-sql.mjs exec $sql } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'failed to store the key hash' }
    Write-Host 'Hash stored in edge_devices.api_key_hash.'
} else {
    Write-Host 'Run this in the Supabase SQL editor to activate the key (or re-run with -Apply):'
    Write-Host $sql
}
