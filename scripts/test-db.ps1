# Runs the SQL tests against the linked Supabase project. Every test file runs in one
# transaction that is rolled back, so nothing is left behind.
#   scripts\test-db.ps1            -> pgTAP rule-engine + RLS tests
#   scripts\test-db.ps1 -Replay    -> also prove all migrations + seed apply from zero (rolled back)
# Needs SUPABASE_DB_URL in the repo-root .env (session pooler string).
param([switch]$Replay)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dbDir = Join-Path $PSScriptRoot 'db'

if (-not (Test-Path (Join-Path $dbDir 'node_modules'))) {
    Push-Location $dbDir
    try { npm ci --no-audit --no-fund } finally { Pop-Location }
}

Push-Location $root
try {
    node scripts/db/run-sql.mjs tests
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($Replay) {
        node scripts/db/run-sql.mjs replay
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
} finally { Pop-Location }
