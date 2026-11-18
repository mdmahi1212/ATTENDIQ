<#
.SYNOPSIS
  Resets the demo data before a presentation: removes every simulation and ad-hoc (non-timetable) class session
  with its attendance, events, verification windows and appeals, and clears device health. People, faces,
  enrollments, timetable sessions and settings are kept.

.USAGE
  powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1          # asks for confirmation
  powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1 -Yes     # no prompt
#>
param([switch]$Yes)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if (-not $Yes) {
  $answer = Read-Host "This permanently deletes all simulation and ad-hoc sessions. Type RESET to continue"
  if ($answer -ne "RESET") { Write-Host "Cancelled."; exit 1 }
}
Push-Location $repo
try { node scripts/reset-demo.mjs } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Done. Start a fresh simulation with: cd apps\simulator; .\.venv\Scripts\python.exe -m simulator run" -ForegroundColor Green
