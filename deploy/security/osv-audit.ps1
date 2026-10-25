# M7 依赖漏洞复检：backend(Maven) + frontend(npm) + llm-service(pip)
# 用法：pwsh deploy/security/osv-audit.ps1 [-SkipBackend] [-SkipFrontend] [-SkipPython]
# 依赖：mvn、npm、uv/uvx；需要访问 api.osv.dev 与各自包仓库。
# 退出码：发现 critical/high 漏洞时为 1，便于 CI 阻断。

param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipPython
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$blocking = 0

function Invoke-OsvBatch {
    param([array]$deps)
    $queries = @($deps | ForEach-Object {
        @{ package = @{ name = $_.name; ecosystem = 'Maven' }; version = $_.version }
    })
    $body = @{ queries = $queries } | ConvertTo-Json -Depth 6 -Compress
    $response = Invoke-RestMethod -Uri 'https://api.osv.dev/v1/querybatch' `
        -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 120
    $index = 0
    foreach ($result in $response.results) {
        foreach ($vuln in $result.vulns) {
            $detail = Invoke-RestMethod "https://api.osv.dev/v1/vulns/$($vuln.id)" -TimeoutSec 30
            $score = ($detail.severity | Where-Object { $_.type -eq 'CVSS_V3' } |
                Select-Object -Last 1).score
            $level = if ($score -ge 9.0) { 'CRITICAL' } elseif ($score -ge 7.0) { 'HIGH' }
                     elseif ($score -ge 4.0) { 'MEDIUM' } else { 'LOW' }
            if ($score -ge 7.0) { $script:blocking++ }
            [pscustomobject]@{
                Package = "$($deps[$index].name):$($deps[$index].version)"
                Id      = $vuln.id
                Level   = $level
                Score   = $score
                Summary = $detail.summary
            }
        }
        $index++
    }
}

if (-not $SkipBackend) {
    Write-Host '== backend (Maven / OSV) =='
    $out = Join-Path $env:TEMP 'gitstars-deps.txt'
    Push-Location (Join-Path $root 'backend')
    try {
        mvn -q dependency:list "-DoutputFile=$out" '-DincludeScope=runtime' `
            '-DexcludeTransitive=false' | Out-Null
    } finally {
        Pop-Location
    }
    $deps = Get-Content $out | Where-Object { $_ -match '^\s+\S+:\S+:jar:' } |
        ForEach-Object {
            $parts = ($_ -replace '\[.*', '').Trim().Split(':')
            if ($parts.Count -ge 4) {
                [pscustomobject]@{ name = "$($parts[0]):$($parts[1])"; version = $parts[3] }
            }
        }
    $rows = @(Invoke-OsvBatch $deps)
    if ($rows.Count -eq 0) {
        Write-Host '  no vulnerabilities'
    } else {
        $rows | Format-Table -AutoSize | Out-String | Write-Host
    }
}

if (-not $SkipFrontend) {
    Write-Host '== frontend (npm audit) =='
    Push-Location (Join-Path $root 'frontend')
    try {
        $audit = npm audit --json 2>$null | ConvertFrom-Json
        $audit.metadata.vulnerabilities | Format-List | Out-String | Write-Host
        foreach ($name in $audit.vulnerabilities.PSObject.Properties.Name) {
            $item = $audit.vulnerabilities.$name
            if ($item.severity -in @('high', 'critical')) {
                $script:blocking++
                Write-Host ("  {0} [{1}] via {2}" -f $name, $item.severity, ($item.via -join ', '))
            }
        }
    } finally {
        Pop-Location
    }
}

if (-not $SkipPython) {
    Write-Host '== llm-service (pip-audit) =='
    Push-Location (Join-Path $root 'llm-service')
    try {
        $req = Join-Path $env:TEMP 'gitstars-req.txt'
        uv export --no-hashes --format requirements-txt | Set-Content $req
        uvx pip-audit -r $req
        if ($LASTEXITCODE -ne 0) { $script:blocking++ }
    } finally {
        Pop-Location
    }
}

Write-Host ''
if ($blocking -gt 0) {
    Write-Host "RESULT: $blocking critical/high finding(s) - remediate or record an exception" -ForegroundColor Red
    exit 1
}
Write-Host 'RESULT: no critical/high findings' -ForegroundColor Green
