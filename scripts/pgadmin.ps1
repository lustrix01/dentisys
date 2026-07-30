[CmdletBinding()]
param(
    [ValidateSet('Up', 'Down', 'Status')]
    [string] $Action = 'Up'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root
$files = @('-f', 'docker-compose.yml', '-f', 'docker-compose.override.yml', '-f', 'docker-compose.pgadmin.yml')

switch ($Action) {
    'Up' {
        & docker compose @files up -d pgadmin
        if ($LASTEXITCODE -ne 0) { throw 'Unable to start pgAdmin.' }
        $port = if ([string]::IsNullOrWhiteSpace($env:PGADMIN_HTTP_PORT)) { '5050' } else { $env:PGADMIN_HTTP_PORT }
        Write-Host "pgAdmin is available at http://127.0.0.1:$port"
    }
    'Down' { & docker compose @files stop pgadmin }
    'Status' { & docker compose @files ps pgadmin }
}
