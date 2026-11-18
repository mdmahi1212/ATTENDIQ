# Writes the Supabase service-role / secret key from the CLIPBOARD into apps/web/.env.local,
# replacing only the SUPABASE_SERVICE_ROLE_KEY= line. Never prints the key (only its length/type).
# Usage: copy the key in the Supabase dashboard, then:  & .\scripts\set-service-key.ps1
$ErrorActionPreference = 'Stop'
$file = Join-Path (Split-Path -Parent $PSScriptRoot) 'apps\web\.env.local'
if (-not (Test-Path $file)) { throw "Not found: $file" }

$key = ''
try { $key = [string](Get-Clipboard -Raw) } catch { $key = '' }
$key = $key.Trim()
if (-not $key) {
    # Clipboard not readable from this terminal: ask for it with masked input (paste with Ctrl+V or right-click).
    $secure = Read-Host -AsSecureString 'Paste the Supabase secret key (input hidden), then press Enter'
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if ($key -notmatch '^(sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$') {
    Write-Host "Clipboard does not look like a Supabase secret key (length $($key.Length)). Nothing written." -ForegroundColor Red
    exit 1
}

$lines = Get-Content $file
$found = $false
$out = foreach ($l in $lines) {
    if ($l -match '^SUPABASE_SERVICE_ROLE_KEY=') { $found = $true; "SUPABASE_SERVICE_ROLE_KEY=$key" } else { $l }
}
if (-not $found) { $out += "SUPABASE_SERVICE_ROLE_KEY=$key" }
# UTF-8 without BOM so every env loader reads it cleanly.
[IO.File]::WriteAllLines($file, [string[]]$out, (New-Object System.Text.UTF8Encoding($false)))

$type = if ($key.StartsWith('sb_secret_')) { 'sb_secret' } else { 'legacy JWT' }
Write-Host "Saved SUPABASE_SERVICE_ROLE_KEY ($type, length $($key.Length)) to apps\web\.env.local" -ForegroundColor Green
