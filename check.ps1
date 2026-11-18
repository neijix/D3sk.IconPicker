# The gate before every commit (twin of check.sh): dotnet test, npm test, then the code-health
# ratchet when its skill is installed. -Full adds `npm pack --dry-run`.
param([switch]$Full)
$ErrorActionPreference = 'Stop'

function Invoke-Step([string]$Name, [scriptblock]$Block) {
    Write-Host "== $Name"
    & $Block
    if ($LASTEXITCODE -ne 0) { throw "check: '$Name' failed (exit $LASTEXITCODE)" }
}

Push-Location $PSScriptRoot
try {
    Invoke-Step 'dotnet test' { dotnet test D3sk.IconPicker.slnx -c Release }
    Push-Location packages/icon-picker
    try {
        if (-not (Test-Path node_modules)) {
            Invoke-Step 'npm ci' { npm ci --no-audit --no-fund }
        }
        Invoke-Step 'npm test' { npm test }
        if ($Full) {
            Invoke-Step 'npm pack --dry-run' { npm pack --dry-run }
        }
    }
    finally {
        Pop-Location
    }
    $ch = Join-Path $HOME '.agents/skills/code-health/scripts/code_health.py'
    if (Test-Path $ch) {
        Invoke-Step 'code-health' { uv run -q $ch check }
    }
    else {
        Write-Host 'code-health: skill not installed, skipped'
    }
    Write-Host 'check: OK'
}
finally {
    Pop-Location
}
