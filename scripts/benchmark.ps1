# Fixed, repeatable benchmark of the DEMO server or a throwaway LOCAL stack. Never production. Contract: docs/benchmark.md.
#   ./scripts/benchmark.ps1 -Target demo [-Repeat 3] [-Compare benchmarks/results/<earlier>.json] [-Force]
#   ./scripts/benchmark.ps1 -Target local              (builds the current code in its own Docker project "dentisys-bench")
#   ./scripts/benchmark.ps1 -CaptureFace <selfie-video.mp4>   (one-time: face frames into ~/.dentisys/benchmark-face)
# demo: ~/.dentisys/demo.env (DEMO_BASE_URL, DEMO_SSH_*, DEMO_FACULTY_*, DEMO_STUDENT_*). Passwords are never printed.
[CmdletBinding()]
param(
    [ValidateSet('demo', 'local')][string]$Target,
    [ValidateRange(1, 9)][int]$Repeat = 1,
    [string]$Compare,
    [switch]$Force,
    [string]$CaptureFace
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bench = Join-Path $PSScriptRoot 'benchmark'
$demoVps = Join-Path $PSScriptRoot 'demo-vps.ps1'
$faceDir = Join-Path $HOME '.dentisys\benchmark-face'
$Prof = [IO.File]::ReadAllText((Join-Path $bench 'profile.json')) | ConvertFrom-Json
$utf8 = New-Object Text.UTF8Encoding $false
$OutputEncoding = $utf8   # PowerShell 5.1 would otherwise prepend a BOM when piping text to native programs
$LocalProject = 'dentisys-bench'   # the ONLY compose project this script may create or remove
$LocalPort = 18080
$remoteSh = 'sudo -n bash /tmp/dsb/bench-remote.sh'
$tableList = 'user_accounts', 'students', 'enrollments', 'class_sections', 'attendance_records', 'assessment_scores', 'audit_events'

if ($Compare -and -not (Test-Path -LiteralPath $Compare) -and -not (Test-Path -LiteralPath (Join-Path $root $Compare))) { throw "-Compare file not found: $Compare" }
if (-not $Target -and -not $CaptureFace) { throw 'Usage: benchmark.ps1 -Target demo|local [-Repeat N] [-Compare file] [-Force]   or   -CaptureFace <video>' }
if ($CaptureFace -and $Target -and $Target -ne 'demo') { throw '-CaptureFace works on the demo server only.' }

# ---- helpers ----
# Run a native program: its stderr must not abort the script under 'Stop'. Output is returned; check $LASTEXITCODE after.
function Native([scriptblock]$Block) {
    $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $Block } finally { $ErrorActionPreference = $saved }
}
function Ok([string]$What) { if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)." } }
function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function WriteJson($Object, [string]$Path) { [IO.File]::WriteAllText($Path, ($Object | ConvertTo-Json -Depth 8), $utf8) }

function Read-EnvFile([string]$Path) {
    $v = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in [IO.File]::ReadAllLines($Path)) {
            $t = $line.Trim()
            if ($t -eq '' -or $t.StartsWith('#')) { continue }
            $eq = $t.IndexOf('=')
            if ($eq -ge 1) { $v[$t.Substring(0, $eq).Trim()] = $t.Substring($eq + 1).Trim().Trim('"', "'") }
        }
    }
    return $v
}

function Get-UrlHost([string]$Url) { return ([Uri]$Url).Host.ToLowerInvariant() }

# Production guard: the benchmark address must be the demo's, never the production address or server.
function Assert-DemoBase($Demo) {
    $url = $Demo['DEMO_BASE_URL']
    if (-not $url) { throw 'Add DEMO_BASE_URL=https://demo.bu-dentisys.com to ~/.dentisys/demo.env (the demo site address).' }
    $uri = $null
    if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne 'https') { throw 'DEMO_BASE_URL must be an https:// address.' }
    if ($uri.Host -in 'localhost', '127.0.0.1', '::1') { throw 'DEMO_BASE_URL points at this PC, not at the demo.' }
    foreach ($name in 'prod.env', 'prod-test.env') {
        $prod = Read-EnvFile (Join-Path $HOME ".dentisys\$name")
        if ($prod['PROD_BASE_URL'] -and (Get-UrlHost $prod['PROD_BASE_URL']) -eq $uri.Host.ToLowerInvariant()) { throw "Refusing: $url is the PRODUCTION address ($name). The benchmark never runs against production." }
        if ($prod['PROD_SSH_HOST'] -and $prod['PROD_SSH_HOST'] -eq $Demo['DEMO_SSH_HOST']) { throw "Refusing: DEMO_SSH_HOST equals the production server ($name)." }
    }
    return $url.TrimEnd('/')
}

function Invoke-Remote([string]$Command) {
    $out = @(Native { & $demoVps run $Command })
    if ($LASTEXITCODE -ne 0) { throw "Remote command failed (exit code $LASTEXITCODE): $(@($out | Where-Object { $_ -is [string] } | Select-Object -Last 3) -join ' | ')" }
    return $out
}
function Get-Lines($Out, [string]$Key) { return @($Out | Where-Object { $_ -is [string] -and $_.StartsWith("$Key ") } | ForEach-Object { $_.Substring($Key.Length + 1) }) }
function ConvertTo-ImageMap($Lines) {   # "name image-id restarts" lines -> @{ name = "image-id restarts" }
    $m = @{}
    foreach ($l in $Lines) { $p = $l.Split(' ', 2); $m[$p[0]] = $p[1] }
    return $m
}
function Get-Replicas($Names) {
    $r = @{}
    foreach ($n in $Names) { if ($n -match '^dentisys(?:-bench)?-(.+)-\d+$') { $r[$Matches[1]] = 1 + [int]$r[$Matches[1]] } }
    return $r
}

function Invoke-LoadGen([string]$Base, $Creds, [string]$OutFile) {
    try {
        $env:BENCH_FACULTY_EMAIL = $Creds.FacultyEmail; $env:BENCH_FACULTY_PASSWORD = $Creds.FacultyPassword
        $env:BENCH_STUDENT_EMAIL = $Creds.StudentEmail; $env:BENCH_STUDENT_PASSWORD = $Creds.StudentPassword
        Native { & node (Join-Path $bench 'load.mjs') --base $Base --out $OutFile }
        Ok 'Load generator'
    } finally {
        foreach ($n in 'FACULTY_EMAIL', 'FACULTY_PASSWORD', 'STUDENT_EMAIL', 'STUDENT_PASSWORD') { Remove-Item "env:BENCH_$n" -ErrorAction SilentlyContinue }
    }
}

# Remote files are made on Windows: .sh needs LF (also forced by .gitattributes); the bundle is one upload.
function New-Bundle([string]$Dir, [bool]$WithFace) {
    New-Item -ItemType Directory -Force $Dir | Out-Null
    [IO.File]::WriteAllText((Join-Path $Dir 'bench-remote.sh'), ([IO.File]::ReadAllText((Join-Path $bench 'bench-remote.sh')) -replace "`r`n", "`n"), $utf8)
    Copy-Item (Join-Path $bench 'face.py') $Dir
    if ($WithFace) { Copy-Item -Recurse $faceDir (Join-Path $Dir 'face') }
    $tgz = Join-Path (Split-Path $Dir) 'dsb.tgz'
    Native { & (Join-Path $env:SystemRoot 'System32\tar.exe') -czf $tgz -C $Dir . }
    Ok 'tar'
    return $tgz
}

$demo = $null
if ($Target -eq 'demo' -or $CaptureFace) {
    $demo = Read-EnvFile (Join-Path $HOME '.dentisys\demo.env')
    if (-not $demo['DEMO_SSH_HOST']) { throw 'Missing or empty ~/.dentisys/demo.env.' }
    $demoBase = Assert-DemoBase $demo
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("dentisys-benchmark-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $tmp | Out-Null

# ---- -CaptureFace: selfie video -> frames in ~/.dentisys/benchmark-face (never in the repo) ----
if ($CaptureFace) {
    if (-not (Test-Path -LiteralPath $CaptureFace -PathType Leaf)) { throw "Video not found: $CaptureFace" }
    $captured = $false
    try {
        Write-Host 'Uploading the video and the face tool (the video is deleted from the server afterwards) ...'
        $tgz = New-Bundle (Join-Path $tmp 'bundle') $false
        Native { & $demoVps upload $tgz '/tmp/dsb.tgz' }; Ok 'Upload of the tool'
        Native { & $demoVps upload (Resolve-Path -LiteralPath $CaptureFace).Path '/tmp/dsb-video' }; Ok 'Upload of the video'
        Write-Host 'Extracting and checking frames on the server (about 1-2 minutes) ...'
        $out = Invoke-Remote ("rm -rf /tmp/dsb; mkdir /tmp/dsb && tar -xzf /tmp/dsb.tgz -C /tmp/dsb && mv /tmp/dsb-video /tmp/dsb/video && $remoteSh capture video; rc=`$?; $remoteSh abort; rm -f /tmp/dsb-video; exit `$rc")
        $line = @($out | Where-Object { $_ -is [string] -and $_.StartsWith('TGZB64:') }) | Select-Object -First 1
        if (-not $line) { throw 'The server returned no frames (see the messages above).' }
        $archive = Join-Path $tmp 'frames.tgz'
        [IO.File]::WriteAllBytes($archive, [Convert]::FromBase64String($line.Substring(7)))
        if (Test-Path $faceDir) { Remove-Item -Recurse -Force $faceDir }
        New-Item -ItemType Directory -Force $faceDir | Out-Null
        Native { & (Join-Path $env:SystemRoot 'System32\tar.exe') -xzf $archive -C $faceDir }; Ok 'tar'
        Write-Host "Face frames saved to $faceDir ($((Get-ChildItem $faceDir).Count) files, validated by one enrol + verify + revoke on the demo)."
        $captured = $true
    } finally {
        if (-not $captured) { Native { & $demoVps run "[ -f /tmp/dsb/bench-remote.sh ] && $remoteSh abort || true" } | Out-Null }   # delete the video, revoke leftovers
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
    return
}

# ---- run ----
$creds = $null
$composeArgs = $null
$envFile = $null
if ($Target -eq 'demo') {
    foreach ($k in 'DEMO_FACULTY_EMAIL', 'DEMO_FACULTY_PASSWORD', 'DEMO_STUDENT_EMAIL', 'DEMO_STUDENT_PASSWORD') { if (-not $demo[$k]) { throw "~/.dentisys/demo.env: $k is empty." } }
    $creds = @{ FacultyEmail = $demo['DEMO_FACULTY_EMAIL']; FacultyPassword = $demo['DEMO_FACULTY_PASSWORD']; StudentEmail = $demo['DEMO_STUDENT_EMAIL']; StudentPassword = $demo['DEMO_STUDENT_PASSWORD'] }
    $base = $demoBase
} else {
    $creds = @{ FacultyEmail = 'faculty@bicol-u.edu.ph'; FacultyPassword = 'Faculty123!'; StudentEmail = 'student@bicol-u.edu.ph'; StudentPassword = 'Student123!' }   # docs/demo-accounts.md (seed data)
    $base = "http://localhost:$LocalPort"
}

Push-Location $root
$startedUtc = (Get-Date).ToUniversalTime()
$sha = (Native { git rev-parse --short=7 HEAD }) | Select-Object -First 1
$dirty = [bool](Native { git status --porcelain --untracked-files=no })
$hasFace = Test-Path -LiteralPath (Join-Path $faceDir 'manifest.json')
$ok = $false
$samplerJob = $null
try {
    if ($Target -eq 'local') {
        # Throwaway stack: own project name, own volumes, own images, own env file with random secrets; removed in 'finally'.
        Native { & docker info *> $null }; Ok 'Docker (is Docker Desktop running?)'
        if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) { throw "Port $LocalPort is in use." }
        $assets = Join-Path (Split-Path $root) 'dentisys-biometric-assets'
        $model = @{ MEDIAPIPE_FACE_LANDMARKER = 'face_landmarker.task'; BIOMETRIC_YUNET = 'face_detection_yunet_2023mar.onnx'; BIOMETRIC_SFACE = 'face_recognition_sface_2021dec.onnx' }
        $rand = { $b = New-Object byte[] 32; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [Convert]::ToBase64String($b) }
        $e = [ordered]@{
            APP_BASE_URL = $base; APP_HTTP_PORT = "$LocalPort"; APP_IS_HTTPS = 'false'; STUDENT_AUTH_ENABLED = 'true'; ALLOWED_EMAIL_DOMAINS = 'bicol-u.edu.ph'
            DB_NAME = 'dentisys'; DB_USER = 'dentisys'; DB_PASS = (& $rand); DB_ADMIN_USER = 'postgres'; DB_ADMIN_PASS = (& $rand)
            SMTP_HOST = 'smtp.invalid'; SMTP_FROM = 'benchmark@bicol-u.edu.ph'
            JWT_SIGNING_KEY_B64 = (& $rand); MFA_ENCRYPTION_KEY_B64 = (& $rand); AUDIT_MAC_KEY_B64 = (& $rand)
            BIOMETRIC_SIDECAR_SHARED_SECRET = (& $rand); BIOMETRIC_STORAGE_KEY_B64 = (& $rand)
            # Calibration of the development stack (.env) on 2026-11-04.
            BIOMETRIC_YUNET_SCORE_THRESHOLD = '0.9'; BIOMETRIC_MIN_FACE_PX = '120'; BIOMETRIC_QUALITY_LAPLACIAN_VARIANCE = '60.0'
            BIOMETRIC_SFACE_COSINE_THRESHOLD = '0.44'; BIOMETRIC_MATCH_COUNT = '3'; BIOMETRIC_BLINK_THRESHOLD = '0.21'; BIOMETRIC_HEAD_TURN_RATIO = '0.15'
            # Own image names: building must not retag the development stack's images.
            WEB_IMAGE = 'dentisys-bench-web:local'; BIOMETRIC_IMAGE = 'dentisys-bench-biometric:local'; FRONTEND_IMAGE = 'dentisys-bench-frontend:local'
        }
        foreach ($m in $model.Keys) {
            $file = Join-Path $assets $model[$m]
            if (-not (Test-Path -LiteralPath $file)) { throw "Missing model file: $file" }
            $e["${m}_MODEL_HOST_PATH"] = $file.Replace('\', '/')
            $e["${m}_SHA256"] = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
        }
        $envFile = Join-Path $tmp 'bench.env'
        [IO.File]::WriteAllText($envFile, (($e.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n") + "`n", $utf8)
        $composeArgs = @('--project-directory', $root, '--env-file', $envFile, '-p', $LocalProject, '-f', 'docker-compose.web.yml', '-f', 'docker-compose.database.yml', '-f', 'scripts/benchmark/docker-compose.benchmark.yml')
        function Dc { & docker compose @composeArgs @args }

        $cfg = (@(Native { Dc config --format json }) -join "`n") | ConvertFrom-Json
        $volume = $cfg.volumes.dentisys_postgres_18_data.name
        if ($cfg.name -ne $LocalProject -or $volume -eq 'dentisys_dentisys_postgres_18_data') { throw "Safety check failed: project '$($cfg.name)', database volume '$volume'." }
        Write-Host "Local stack: project $LocalProject, database volume $volume (development stack uses dentisys_dentisys_postgres_18_data, untouched)."
        Native { Dc down -v --remove-orphans *> $null }   # an earlier crashed benchmark, same project only
        Native { Dc up -d --wait db }; Ok 'Starting the database'
        $ready = $false
        for ($i = 0; $i -lt 90 -and -not $ready; $i++) {
            Native { Dc exec -T db pg_isready -h 127.0.0.1 -U postgres -d dentisys *> $null }
            if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep -Seconds 2 }
        }
        if (-not $ready) { throw 'PostgreSQL did not finish starting.' }
        Native { Dc cp database/seeds/development-demo.sql db:/tmp/seed.sql }; Ok 'Copying the seed'
        Native { Dc exec -T db psql -U postgres -d dentisys -v ON_ERROR_STOP=1 -q -f /tmp/seed.sql *> $null }; Ok 'Loading the seed'
        Write-Host 'Building the current code and starting the stack (first build takes several minutes) ...'
        Native { Dc up -d --build --wait }; Ok 'Starting the stack'
    }

    $runFiles = @()
    $stamp = $startedUtc.ToString('yyyyMMdd-HHmmss')
    for ($r = 1; $r -le $Repeat; $r++) {
        $work = Join-Path $tmp "run$r"
        New-Item -ItemType Directory $work | Out-Null
        Write-Host "`n=== Run $r of $Repeat ($Target) ==="
        $faceSkipped = $null
        $offsetMs = 0
        $fp = @{}
        $rows = @{}
        $names = @()

        # -- begin: fingerprint, outside-activity check (demo), start sampling --
        if ($Target -eq 'demo') {
            if ($r -eq 1) {
                $tgz = New-Bundle (Join-Path $tmp 'bundle') $hasFace
                Native { & $demoVps upload $tgz '/tmp/dsb.tgz' }; Ok 'Upload of the benchmark tool'
            }
            $out = Invoke-Remote ("rm -rf /tmp/dsb; mkdir /tmp/dsb && tar -xzf /tmp/dsb.tgz -C /tmp/dsb && $remoteSh start " + $(if ($Force) { 'force' } else { 'noforce' }))
            $t1 = NowMs
            $outside = [int]((Get-Lines $out 'OUTSIDE') | Select-Object -First 1)
            if ($outside -gt 0 -and -not $Force) {
                Write-Host "Refusing to start: the demo's audit log shows $outside event(s) from someone else in the last 15 minutes (ip | user agent | count):"
                Get-Lines $out 'OUTSIDE_DETAIL' | ForEach-Object { Write-Host "  $_" }
                throw 'Wait 15 minutes, or run again with -Force.'
            }
            if (-not (Get-Lines $out 'STARTED')) { throw 'The server sampler did not start.' }
            $serverNow = [double]::Parse((Get-Lines $out 'NOW' | Select-Object -First 1), [Globalization.CultureInfo]::InvariantCulture)
            $offsetMs = [long]($serverNow * 1000 - $t1)
            foreach ($l in Get-Lines $out 'FP') { $p = $l.Split(' ', 2); $fp[$p[0]] = $p[1] }
            foreach ($l in Get-Lines $out 'ROWS') { $p = $l.Split(' '); $rows[$p[0]] = [long]$p[1] }
            $imgStart = ConvertTo-ImageMap (Get-Lines $out 'IMG_START')
            $fingerprint = @{ vcpu = [int]$fp.vcpu; cpuModel = $fp.cpuModel; ramMb = [int]$fp.ramMb; swapMb = [int]$fp.swapMb; diskGb = [int]$fp.diskGb; cap = $null }
        } else {
            $names = @(Native { docker ps -a --filter "label=com.docker.compose.project=$LocalProject" --format '{{.Names}}' })
            $imgStart = ConvertTo-ImageMap (@(Native { docker inspect -f '{{.Name}} {{.Image}} {{.RestartCount}}' @names }) | ForEach-Object { $_.TrimStart('/') })
            if ($r -eq 1) {
                $q = ($tableList | ForEach-Object { "SELECT '$_', count(*) FROM $_" }) -join ' UNION ALL '
                foreach ($l in @(Native { Dc exec -T db psql -U postgres -d dentisys -qtAX -F ' ' -c $q })) { $p = $l.Split(' '); if ($p.Count -eq 2) { $rows[$p[0]] = [long]$p[1] } }
                # The cap as Docker applies it, read back from the containers.
                $limits = @(Native { docker inspect -f '{{.Name}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} cpuset={{.HostConfig.CpusetCpus}}' @names })
                $memMb = ($limits | ForEach-Object { [long]$_.Split(' ')[1] / 1MB } | Measure-Object -Sum).Sum
                $swapMb = ($limits | ForEach-Object { ([long]$_.Split(' ')[2] - [long]$_.Split(' ')[1]) / 1MB } | Measure-Object -Sum).Sum
                $localFingerprint = @{
                    vcpu = 1; cpuModel = "$((Get-CimInstance Win32_Processor | Select-Object -First 1).Name) (host; capped to one core)"; ramMb = [int]$memMb; swapMb = [int]$swapMb
                    diskGb = [int]((Get-PSDrive -Name ($root.Substring(0, 1))).Used / 1GB)
                    cap = @{ cpus = '1 (all containers cpuset 0)'; memoryMbTotal = [int]$memMb; limits = @($limits | ForEach-Object { $_.TrimStart('/') }) }
                }
            }
            $fingerprint = $localFingerprint
            # Container CPU/memory every 5 s with `docker stats` (the Docker Desktop VM's system CPU/memory are not visible from here).
            $sampleFile = Join-Path $work 'samples.txt'
            $samplerJob = Start-Job -ArgumentList $sampleFile, $LocalProject, $Prof.sampleSeconds -ScriptBlock {
                param($file, $project, $seconds)
                $inv = [Globalization.CultureInfo]::InvariantCulture
                while ($true) {
                    $began = Get-Date
                    $parts = foreach ($l in @(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' 2>$null)) {
                        $f = "$l".Split('|')
                        if ($f.Count -lt 3 -or -not $f[0].StartsWith("$project-")) { continue }
                        $m = [regex]::Match($f[2], '^([\d.]+)\s*(B|KiB|MiB|GiB)')
                        $mult = @{ B = 1 / 1MB; KiB = 1 / 1024; MiB = 1; GiB = 1024 }[$m.Groups[2].Value]
                        "c.$($f[0])=$([double]::Parse($f[1].TrimEnd('%'), $inv)):$([math]::Round([double]::Parse($m.Groups[1].Value, $inv) * $mult, 1))"
                    }
                    Add-Content -LiteralPath $file -Value ("T=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) " + ($parts -join ' '))
                    $wait = $seconds - ((Get-Date) - $began).TotalSeconds
                    if ($wait -gt 0) { Start-Sleep -Seconds $wait }
                }
            }
        }
        $fingerprint.replicas = Get-Replicas $(if ($Target -eq 'demo') { $imgStart.Keys } else { $names })
        $fingerprint.rowCounts = $rows
        $fingerprint.profile = $Prof.profile

        # -- phases 1-3: warm-up, read load, sign-in --
        Write-Host "Load phases from this PC to $base (about 7 minutes) ..."
        $loadFile = Join-Path $work 'load.json'
        Invoke-LoadGen $base $creds $loadFile

        # -- phase 4: face check-ins --
        if (-not $hasFace) { $faceSkipped = 'no face frames' }
        else {
            Write-Host 'Face check-ins ...'
            $faceArgs = "$($Prof.face.seconds) $($Prof.face.concurrency -join ',') $($Prof.face.guidanceCallsPerCheckin) $($Prof.face.guidanceIntervalMs) $($Prof.face.limitSeconds)"
            try {
                if ($Target -eq 'demo') {
                    $json = Get-Lines (Invoke-Remote "$remoteSh face $faceArgs") 'FACE_JSON' | Select-Object -First 1
                } else {
                    try {
                        Native { Dc exec -T -u root biometric rm -rf /tmp/dsb-face }
                        Native { Dc cp $faceDir biometric:/tmp/dsb-face }; Ok 'Copying the face frames'
                        Native { Dc cp (Join-Path $bench 'face.py') biometric:/tmp/dsb-face/face.py }; Ok 'Copying face.py'
                        $faceList = $faceArgs.Split(' ')
                        $json = (@(Native { Dc exec -T -u root biometric python /tmp/dsb-face/face.py run /tmp/dsb-face @faceList }) -join '')
                        Ok 'Face phase'
                    } finally {
                        Native { Dc exec -T -u root biometric python /tmp/dsb-face/face.py revoke-leftover /tmp/dsb-face *> $null }
                        Native { Dc exec -T -u root biometric rm -rf /tmp/dsb-face *> $null }
                    }
                }
                if (-not $json) { throw 'no result' }
                [IO.File]::WriteAllText((Join-Path $work 'face.json'), $json, $utf8)
            } catch { $faceSkipped = "failed: $($_.Exception.Message)"; Write-Warning "Face phase $faceSkipped" }
        }

        # -- phase 5: idle --
        Write-Host "Idle $($Prof.idleSeconds) s ..."
        $idle = @{ start = NowMs }
        Start-Sleep -Seconds $Prof.idleSeconds
        $idle.end = NowMs

        # -- end: stop sampling, read images again --
        if ($Target -eq 'demo') {
            $out = Invoke-Remote ("$remoteSh finish " + $(if ($r -eq $Repeat) { 'remove' } else { 'keep' }))
            $imgEnd = ConvertTo-ImageMap (Get-Lines $out 'IMG_END')
            $at = [array]::IndexOf($out, 'SAMPLES')
            [IO.File]::WriteAllText((Join-Path $work 'samples.txt'), ((@($out | Select-Object -Skip ($at + 1)) | Where-Object { $_ -is [string] }) -join "`n"), $utf8)
        } else {
            Stop-Job $samplerJob; Remove-Job $samplerJob -Force; $samplerJob = $null
            $imgEnd = ConvertTo-ImageMap (@(Native { docker inspect -f '{{.Name}} {{.Image}} {{.RestartCount}}' @names }) | ForEach-Object { $_.TrimStart('/') })
        }

        WriteJson @{ target = $Target; startedUtc = $startedUtc.ToString('o'); gitSha = $sha; dirty = $dirty; fingerprint = $fingerprint; imagesStart = $imgStart; imagesEnd = $imgEnd
            offsetMs = $offsetMs; idle = $idle; faceSkipped = $faceSkipped } (Join-Path $work 'meta.json')
        $runJson = Join-Path $work 'run.json'
        Native { & node (Join-Path $bench 'report.mjs') build $work $runJson }; Ok 'Building the result'
        $runFiles += $runJson
    }

    $resultsDir = Join-Path $root 'benchmarks\results'
    New-Item -ItemType Directory -Force $resultsDir | Out-Null
    $final = Join-Path $resultsDir "$stamp-$Target-$sha.json"
    if ($runFiles.Count -eq 1) { Copy-Item $runFiles[0] $final } else { Native { & node (Join-Path $bench 'report.mjs') median $final @runFiles }; Ok 'Median' }
    Native { & node (Join-Path $bench 'report.mjs') table $final }
    Write-Host "`nResult: benchmarks/results/$(Split-Path $final -Leaf)"
    if ($Compare) {
        $old = if (Test-Path -LiteralPath $Compare) { (Resolve-Path -LiteralPath $Compare).Path } else { Join-Path $root $Compare }
        Native { & node (Join-Path $bench 'report.mjs') compare $old $final }
    }
    $ok = $true
} finally {
    if ($samplerJob) { Stop-Job $samplerJob -ErrorAction SilentlyContinue; Remove-Job $samplerJob -Force -ErrorAction SilentlyContinue }
    if ($Target -eq 'local' -and $composeArgs) {
        Write-Host "Removing the throwaway stack ($LocalProject) and its volumes ..."
        if ($composeArgs[$composeArgs.IndexOf('-p') + 1] -eq $LocalProject) { Native { Dc down -v --remove-orphans *> $null } }
    }
    if ($Target -eq 'demo' -and -not $ok) { Native { & $demoVps run "[ -f /tmp/dsb/bench-remote.sh ] && $remoteSh abort || true" } | Out-Null }   # stop the sampler, revoke leftovers, delete uploads
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    Pop-Location
}
