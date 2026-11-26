<#
.SYNOPSIS
  Restart the explainers site from the current working tree.

.DESCRIPTION
  1. Stops anything listening on the port, and any node process running this repo's server.js.
  2. Optionally fast-forwards the current branch (-Pull).
  3. Runs `npm ci` when node_modules is missing or older than package.json / package-lock.json.
  4. Starts `node server.js` on 127.0.0.1 and opens the browser once it answers.
  Ctrl+C stops the server.

  The server reads files from disk on every request and sends `Cache-Control: max-age=0`,
  so a reload always shows the current files; restarting picks up changes to server.js.

.PARAMETER Port
  Port to serve on. Default 3000.

.PARAMETER Pull
  Run `git pull --ff-only` first. Skipped with a warning when the branch has no upstream
  or the pull cannot fast-forward; local changes are never overwritten.

.PARAMETER PrepareOnly
  Stop old servers and install dependencies, then exit. VS Code's "Run app" uses this
  before it starts server.js under the debugger.

.PARAMETER NoBrowser
  Don't open a browser tab.

.EXAMPLE
  ./start.ps1
.EXAMPLE
  ./start.ps1 -Pull -Port 8080
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 3000,
    [switch]$Pull,
    [switch]$PrepareOnly,
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$BindHost = '127.0.0.1'
$ReadyTimeoutSeconds = 20
$PortReleaseTimeoutSeconds = 10
$SystemPids = @(0, 4)

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-PortOwnerIds([int]$LocalPort) {
    $listeners = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) { return @() }
    return @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Get-RepoServerIds {
    $serverPath = Join-Path $Root 'server.js'
    $nodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    return @($nodes | Where-Object {
            $_.CommandLine -and
            $_.CommandLine.IndexOf($serverPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
        } | Select-Object -ExpandProperty ProcessId)
}

function Stop-OldServers([int]$LocalPort) {
    $ids = @(@(Get-PortOwnerIds $LocalPort) + @(Get-RepoServerIds)) |
        Where-Object { $SystemPids -notcontains $_ -and $_ -ne $PID } |
        Sort-Object -Unique
    if (-not $ids) {
        Write-Host '    nothing running'
        return
    }
    foreach ($id in $ids) {
        $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        Write-Host "    stopping $($proc.ProcessName) (PID $id)"
        try {
            Stop-Process -Id $id -Force
        } catch {
            throw "Could not stop $($proc.ProcessName) (PID $id) holding port ${LocalPort}: $($_.Exception.Message). Close it or pass -Port."
        }
    }
    $deadline = (Get-Date).AddSeconds($PortReleaseTimeoutSeconds)
    while (@(Get-PortOwnerIds $LocalPort).Count -gt 0) {
        if ((Get-Date) -gt $deadline) { throw "Port $LocalPort is still in use after stopping its owner." }
        Start-Sleep -Milliseconds 200
    }
}

function Invoke-Pull {
    $ErrorActionPreference = 'Continue'
    $upstream = git -C $Root rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Current branch has no upstream; skipping pull.'
        return
    }
    git -C $Root pull --ff-only
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "git pull --ff-only from $upstream failed (diverged or local edits in the way). Running the local tree as is."
    }
}

function Write-CodeVersion {
    $ErrorActionPreference = 'Continue'
    $branch = git -C $Root rev-parse --abbrev-ref HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { return }
    $sha = git -C $Root rev-parse --short HEAD
    $dirty = @(git -C $Root status --porcelain).Count
    $line = "    $branch @ $sha"
    if ($dirty -gt 0) { $line += " + $dirty uncommitted change(s)" }
    Write-Host $line
    $behind = git -C $Root rev-list --count 'HEAD..@{u}' 2>$null
    if ($LASTEXITCODE -eq 0 -and [int]$behind -gt 0) {
        Write-Warning "$behind commit(s) behind upstream as of the last fetch. Run with -Pull to update."
    }
}

function Test-InstallNeeded {
    $stamp = Join-Path $Root 'node_modules/.package-lock.json'
    if (-not (Test-Path $stamp)) { return $true }
    $installed = (Get-Item $stamp).LastWriteTimeUtc
    foreach ($manifest in 'package.json', 'package-lock.json') {
        if ((Get-Item (Join-Path $Root $manifest)).LastWriteTimeUtc -gt $installed) { return $true }
    }
    return $false
}

function Install-Dependencies {
    if (-not (Test-InstallNeeded)) {
        Write-Host '    up to date'
        return
    }
    Push-Location $Root
    try {
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
}

function Wait-ForServer([string]$Url, [System.Diagnostics.Process]$Server) {
    $deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
    $lastError = $null
    while ((Get-Date) -lt $deadline) {
        if ($Server.HasExited) { throw "Server exited with code $($Server.ExitCode) before it was ready." }
        try {
            $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            return
        } catch {
            # Not listening yet; poll again until the deadline.
            $lastError = $_.Exception.Message
            Start-Sleep -Milliseconds 250
        }
    }
    throw "Server did not answer at $Url within $ReadyTimeoutSeconds s. Last error: $lastError"
}

function Start-Server([int]$LocalPort) {
    $url = "http://${BindHost}:$LocalPort/"
    $savedPort, $savedHost = $env:PORT, $env:HOST
    $env:PORT, $env:HOST = "$LocalPort", $BindHost
    $server = $null
    try {
        $server = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $Root -NoNewWindow -PassThru
        $null = $server.Handle  # keep the handle so ExitCode is readable after exit
        Wait-ForServer $url $server
        Write-Host "    serving $url  (Ctrl+C to stop)" -ForegroundColor Green
        if (-not $NoBrowser) { Start-Process $url }
        $server.WaitForExit()
    } finally {
        if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
        $env:PORT, $env:HOST = $savedPort, $savedHost
    }
}

Write-Step "Stopping old servers (port $Port)"
Stop-OldServers $Port

if ($Pull) {
    Write-Step 'Pulling latest'
    Invoke-Pull
}

Write-Step 'Code'
Write-CodeVersion

Write-Step 'Dependencies'
Install-Dependencies

if ($PrepareOnly) { return }

Write-Step 'Starting server'
Start-Server $Port
