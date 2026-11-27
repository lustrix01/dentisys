# Standalone PowerShell 7 unit tests for SMTP helpers in scripts/provision-vps.ps1.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$passed = 0
$failed = 0

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if ($Condition) {
        $script:passed++
    }
    else {
        $script:failed++
        Write-Host "FAIL: $Message"
    }
}

function Assert-Equal {
    param(
        $Expected,
        $Actual,
        [string]$Message
    )
    $isEqual = ($null -eq $Expected -and $null -eq $Actual) -or ($null -ne $Expected -and $null -ne $Actual -and $Expected -eq $Actual)
    if ($isEqual) {
        $script:passed++
    }
    else {
        $script:failed++
        $expStr = if ($null -eq $Expected) { '<null>' } else { "'$Expected'" }
        $actStr = if ($null -eq $Actual) { '<null>' } else { "'$Actual'" }
        Write-Host "FAIL: $Message (expected $expStr, got $actStr)"
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$scriptPath = Join-Path $repoRoot 'scripts\provision-vps.ps1'

# 1. Parse scripts/provision-vps.ps1 with 0 parse errors.
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
Assert-Equal 0 $parseErrors.Count 'scripts/provision-vps.ps1 should parse with 0 errors'

# 2. Extract and dot-evaluate ONLY the three SMTP helper functions.
$targetFunctions = @('ConvertFrom-SmtpReply', 'Resolve-SmtpAuthReply', 'Test-GmailSmtpLogin')
$funcAsts = $ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $targetFunctions
}, $true)

Assert-Equal $targetFunctions.Count $funcAsts.Count 'All 3 SMTP helper functions should be found in AST'

foreach ($fnAst in $funcAsts) {
    . ([scriptblock]::Create($fnAst.Extent.Text))
}

foreach ($fnName in $targetFunctions) {
    Assert-True ([bool](Get-Command $fnName -CommandType Function -ErrorAction SilentlyContinue)) "Function $fnName should be defined"
}

# 3. Unit-test ConvertFrom-SmtpReply.
$r220 = ConvertFrom-SmtpReply @('220 smtp.gmail.com ESMTP')
Assert-Equal $true $r220.Complete '220 greeting should be complete'
Assert-Equal 220 $r220.Code '220 greeting code'

$r235 = ConvertFrom-SmtpReply @('235 2.7.0 Accepted')
Assert-Equal $true $r235.Complete '235 accepted should be complete'
Assert-Equal 235 $r235.Code '235 accepted code'

$r334 = ConvertFrom-SmtpReply @('334 VXNlcm5hbWU6')
Assert-Equal $true $r334.Complete '334 prompt should be complete'
Assert-Equal 334 $r334.Code '334 prompt code'

$rBare = ConvertFrom-SmtpReply @('250')
Assert-Equal $true $rBare.Complete 'Bare 3-digit code should be complete'
Assert-Equal 250 $rBare.Code 'Bare 3-digit code value'

$rEhlo = ConvertFrom-SmtpReply @(
    '250-smtp.gmail.com at your service',
    '250-SIZE 35882577',
    '250 STARTTLS'
)
Assert-Equal $true $rEhlo.Complete 'Multi-line EHLO should be complete'
Assert-Equal 250 $rEhlo.Code 'Multi-line EHLO code'
Assert-True ($rEhlo.Text -match '\bSTARTTLS\b') 'Multi-line EHLO text should contain STARTTLS'

$r535 = ConvertFrom-SmtpReply @(
    '535-5.7.8 Username and Password not accepted.',
    '535 5.7.8  https://support.google.com/mail/?p=BadCredentials'
)
Assert-Equal $true $r535.Complete 'Multi-line 535 should be complete'
Assert-Equal 535 $r535.Code 'Multi-line 535 code'

$rCr = ConvertFrom-SmtpReply @("235 2.7.0 Accepted`r")
Assert-Equal $true $rCr.Complete 'Trailing CR should be complete'
Assert-Equal 235 $rCr.Code 'Trailing CR code'
Assert-True (-not $rCr.Text.Contains("`r")) 'Trailing CR should be stripped from Text'

$rIncomplete = ConvertFrom-SmtpReply @('250-smtp.gmail.com')
Assert-Equal $false $rIncomplete.Complete 'Incomplete multi-line should not be complete'
Assert-Equal $null $rIncomplete.Code 'Incomplete multi-line code should be null'

$rEmpty = ConvertFrom-SmtpReply @()
Assert-Equal $false $rEmpty.Complete 'Empty array should not be complete'
Assert-Equal $null $rEmpty.Code 'Empty array code should be null'

$rNull = ConvertFrom-SmtpReply $null
Assert-Equal $false $rNull.Complete 'Null input should not be complete'
Assert-Equal $null $rNull.Code 'Null input code should be null'

$rWhitespace = ConvertFrom-SmtpReply @('   ')
Assert-Equal $false $rWhitespace.Complete 'Whitespace-only line should not be complete'
Assert-Equal $null $rWhitespace.Code 'Whitespace-only code should be null'

$rMalformed = ConvertFrom-SmtpReply @('NOT-SMTP')
Assert-Equal $false $rMalformed.Complete 'Malformed line should not be complete'
Assert-Equal $null $rMalformed.Code 'Malformed line code should be null'

# 4. Unit-test Resolve-SmtpAuthReply.
$a235 = Resolve-SmtpAuthReply @('235 2.7.0 Accepted')
Assert-Equal 'Ok' $a235.Status '235 Accepted status'
Assert-Equal 235 $a235.Code '235 Accepted code'

$a535 = Resolve-SmtpAuthReply @(
    '535-5.7.8 Username and Password not accepted.',
    '535 5.7.8  https://support.google.com/mail/?p=BadCredentials'
)
Assert-Equal 'Refused' $a535.Status '535 multi-line status'
Assert-Equal 535 $a535.Code '535 multi-line code'

$a534 = Resolve-SmtpAuthReply @('534 5.7.9 Application-specific password required.')
Assert-Equal 'Refused' $a534.Status '534 status'
Assert-Equal 534 $a534.Code '534 code'

$a530 = Resolve-SmtpAuthReply @('530 5.7.0 Authentication Required.')
Assert-Equal 'Refused' $a530.Status '530 status'
Assert-Equal 530 $a530.Code '530 code'

$a454 = Resolve-SmtpAuthReply @('454 4.7.0 Temporary authentication failure.')
Assert-Equal 'Unreachable' $a454.Status '454 temporary failure status'
Assert-Equal 454 $a454.Code '454 temporary failure code'

$a421 = Resolve-SmtpAuthReply @('421 4.3.0 Service not available.')
Assert-Equal 'Unreachable' $a421.Status '421 service unavailable status'
Assert-Equal 421 $a421.Code '421 service unavailable code'

$aIncomplete = Resolve-SmtpAuthReply @('250-smtp.gmail.com')
Assert-Equal 'Unreachable' $aIncomplete.Status 'Incomplete reply status'
Assert-Equal $null $aIncomplete.Code 'Incomplete reply code'

$aEmpty = Resolve-SmtpAuthReply @()
Assert-Equal 'Unreachable' $aEmpty.Status 'Empty reply status'
Assert-Equal $null $aEmpty.Code 'Empty reply code'

$aMalformed = Resolve-SmtpAuthReply @('NOT-SMTP')
Assert-Equal 'Unreachable' $aMalformed.Status 'Malformed reply status'
Assert-Equal $null $aMalformed.Code 'Malformed reply code'

# 5. Unit-test Test-GmailSmtpLogin against a guaranteed-closed ephemeral loopback port.
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$closedPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$secretValue = 's3cr3t-app-pass-should-not-leak'
$secPass = [System.Security.SecureString]::new()
try {
    foreach ($ch in $secretValue.ToCharArray()) {
        $secPass.AppendChar($ch)
    }
    $secPass.MakeReadOnly()

    $res = Test-GmailSmtpLogin -Username 'test@example.invalid' -Password $secPass -SmtpHost '127.0.0.1' -Port $closedPort -TimeoutMs 2000
    Assert-Equal 'Unreachable' $res.Status 'Closed loopback port should return Unreachable'
    Assert-Equal $null $res.Code 'Closed loopback port should return null Code'
    Assert-True (-not [string]::IsNullOrWhiteSpace($res.Detail)) 'Closed loopback port should return non-empty Detail'
    Assert-True (-not $res.Detail.Contains($secretValue)) 'Closed loopback port Detail must never leak the password'
}
finally {
    $secPass.Dispose()
}

if ($failed -gt 0) {
    Write-Host "FAIL: $passed passed, $failed failed."
    exit 1
}

Write-Host "PASS: $passed assertions passed, 0 failed."
exit 0
