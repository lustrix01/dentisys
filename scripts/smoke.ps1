param(
    [string] $BackendUrl = "http://localhost:8080",
    [string] $PgAdminUrl = "http://127.0.0.1:5050",
    [switch] $CheckPgAdmin
)

$ErrorActionPreference = "Stop"

function Test-Health {
    param([string] $Url)

    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url
    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -ne 200) {
        throw "$Url returned HTTP $($response.StatusCode)."
    }

    if ($body.status -ne "ok" -or $body.database -ne "up") {
        throw "$Url did not confirm application and database health."
    }

    Write-Host "PASS: $Url confirmed database health."
}

Test-Health "$BackendUrl/api/health"
Test-Health "$BackendUrl/healthcheck.php"

if ($CheckPgAdmin) {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $PgAdminUrl
    if ($response.StatusCode -ne 200) {
        throw "$PgAdminUrl returned HTTP $($response.StatusCode)."
    }
    Write-Host "PASS: pgAdmin responded at $PgAdminUrl."
}
