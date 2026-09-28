<#
.SYNOPSIS
  Development only: open the DentiSys dev site from a phone on the same Wi-Fi,
  over HTTPS so the phone's camera (face registration/attendance) works.

.DESCRIPTION
  1. Creates a self-signed certificate for this PC's LAN address(es) in
     frontend/certs (git-ignored), using the existing web image.
  2. Sets FRONTEND_BIND_ADDRESS=0.0.0.0 and VITE_DEV_HTTPS=true in .env
     (only these two keys are touched) and restarts the frontend container.
  3. Prints the phone URL and the one-time firewall command.

  -Disable switches back to this-PC-only HTTP (the default).
#>
[CmdletBinding()]
param(
    [switch] $Disable
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root
$envPath = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw '.env not found; copy .env.example to .env first.' }

function Set-EnvValue([string] $Name, [string] $Value) {
    $lines = @(Get-Content -LiteralPath $envPath)
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$([regex]::Escape($Name))=") { $lines[$i] = "$Name=$Value"; $found = $true }
    }
    if (-not $found) { $lines += "$Name=$Value" }
    Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8
}

if ($Disable) {
    Set-EnvValue 'FRONTEND_BIND_ADDRESS' '127.0.0.1'
    Set-EnvValue 'VITE_DEV_HTTPS' 'false'
    docker compose up -d frontend
    if ($LASTEXITCODE -ne 0) { throw 'Could not restart the frontend container.' }
    Write-Host 'Back to this-PC-only: http://localhost:5173'
    return
}

$addresses = @(Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|Loopback|VirtualBox|VMware' -and
        $_.AddressState -eq 'Preferred'
    } | Select-Object -ExpandProperty IPAddress)
if ($addresses.Count -eq 0) { throw 'No LAN IPv4 address found. Connect this PC to Wi-Fi or Ethernet first.' }

docker compose run --rm --no-deps -v "${root}:/workspace" web php /workspace/scripts/dev-lan-cert.php /workspace/frontend/certs @addresses
if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed.' }

Set-EnvValue 'FRONTEND_BIND_ADDRESS' '0.0.0.0'
Set-EnvValue 'VITE_DEV_HTTPS' 'true'
docker compose up -d frontend
if ($LASTEXITCODE -ne 0) { throw 'Could not restart the frontend container.' }

Write-Host ''
Write-Host 'On your phone (same Wi-Fi), open:' -ForegroundColor Green
foreach ($address in $addresses) { Write-Host "  https://${address}:5173" -ForegroundColor Green }
Write-Host ''
Write-Host 'The browser warns that the certificate is not trusted (it is self-signed): choose Advanced > Proceed.'
Write-Host 'On this PC, https://localhost:5173 now replaces http://localhost:5173.'
Write-Host 'Google sign-in does not work from a LAN address (Google only allows registered origins); sign in with a password.'
Write-Host ''
Write-Host 'If the phone cannot connect, allow the port once in an ADMIN PowerShell:'
Write-Host '  New-NetFirewallRule -DisplayName "DentiSys dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private'
Write-Host ''
Write-Host 'Turn it off again with: .\scripts\dev-lan-https.ps1 -Disable'
