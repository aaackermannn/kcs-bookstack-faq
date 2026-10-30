param(
    [string]$CloudflaredPath,
    [string]$RunnerDirectory
)
$ErrorActionPreference = 'Stop'
$repoDirectory = Split-Path -Parent $PSScriptRoot
$workspaceDirectory = Split-Path -Parent (Split-Path -Parent $repoDirectory)
$localDirectory = Join-Path $workspaceDirectory '.work'
if (!$CloudflaredPath) { $CloudflaredPath = Join-Path $localDirectory 'cloudflared.exe' }
if (!$RunnerDirectory) { $RunnerDirectory = Join-Path $localDirectory 'pr7-runner' }
if (!(Test-Path -LiteralPath $CloudflaredPath)) { throw 'Укажите путь к cloudflared через -CloudflaredPath.' }
if (!(Test-Path -LiteralPath (Join-Path $RunnerDirectory '.runner'))) { throw 'Сначала зарегистрируйте runner; укажите его каталог через -RunnerDirectory.' }
Push-Location $repoDirectory
try {
    docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Start-Process -FilePath 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden
        $ready = $false
        foreach ($attempt in 1..30) {
            Start-Sleep -Seconds 2
            docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        }
        if (!$ready) { throw 'Docker не запустился за 60 секунд.' }
    }
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось запустить BookStack.' }
    $tunnelLog = Join-Path $localDirectory 'pr7-tunnel.err.log'
    $existingTunnel = Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Where-Object Path -EQ $CloudflaredPath
    if (!$existingTunnel) {
        Start-Process -FilePath $CloudflaredPath -ArgumentList @('tunnel','--url','http://localhost:6875','--no-autoupdate') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localDirectory 'pr7-tunnel.out.log') -RedirectStandardError $tunnelLog
    }
    $publicUrl = $null
    foreach ($attempt in 1..50) {
        if (Test-Path -LiteralPath $tunnelLog) {
            $match = [regex]::Match((Get-Content -LiteralPath $tunnelLog -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com')
            if ($match.Success) { $publicUrl = $match.Value; break }
        }
        Start-Sleep -Milliseconds 200
    }
    if (!$publicUrl) { throw 'Cloudflare не выдал адрес. Проверьте журнал туннеля.' }
    $envFile = Join-Path $repoDirectory '.env'
    $envText = Get-Content -LiteralPath $envFile -Raw
    $envText = [regex]::Replace($envText, '(?m)^APP_URL=.*$', "APP_URL=$publicUrl")
    [IO.File]::WriteAllText($envFile, $envText, [Text.UTF8Encoding]::new($false))
    docker compose up -d bookstack
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось обновить APP_URL.' }
    # GCM выдаёт реквизиты только дочернему процессу; значения не выводятся.
    $oldToken = $env:GH_TOKEN
    $oldInteractive = $env:GCM_INTERACTIVE
    try {
        $env:GCM_INTERACTIVE = 'never'
        $credentialLines = "protocol=https`nhost=github.com`n`n" | git credential fill
        $passwordLine = $credentialLines | Where-Object { $_.StartsWith('password=') }
        if (!$passwordLine) { throw 'GitHub недоступен: авторизуйтесь в Git Credential Manager.' }
        $env:GH_TOKEN = $passwordLine.Substring(9)
        gh secret set BOOKSTACK_URL --repo aaackermannn/kcs-bookstack-faq --body $publicUrl
        if ($LASTEXITCODE -ne 0) { throw 'Не удалось обновить BOOKSTACK_URL.' }
    } finally {
        $env:GH_TOKEN = $oldToken
        $env:GCM_INTERACTIVE = $oldInteractive
    }
    $runnerExecutable = Join-Path $RunnerDirectory 'bin\Runner.Listener.exe'
    $existingRunner = Get-Process -Name Runner.Listener -ErrorAction SilentlyContinue | Where-Object Path -EQ $runnerExecutable
    if (!$existingRunner) {
        Start-Process -FilePath $runnerExecutable -ArgumentList 'run' -WorkingDirectory $RunnerDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localDirectory 'pr7-runner.out.log') -RedirectStandardError (Join-Path $localDirectory 'pr7-runner.err.log')
    }
    Write-Host "BookStack: $publicUrl"
    Write-Host 'Docker, туннель и GitHub Actions runner запущены.'
} finally { Pop-Location }
