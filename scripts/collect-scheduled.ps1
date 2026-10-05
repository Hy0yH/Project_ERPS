param(
  [int]$Port = 3101,
  [int]$StartupTimeoutSec = 90,
  [int]$CollectTimeoutSec = 7200,
  [int]$SnapshotTimeoutSec = 1800,
  [switch]$SkipServerStart,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$StateDir = Join-Path $ProjectDir ".scheduler"
$LogPath = Join-Path $StateDir "collect.log"
$LockPath = Join-Path $StateDir "collect.lock"
$ServerOutLog = Join-Path $StateDir "next-dev.out.log"
$ServerErrLog = Join-Path $StateDir "next-dev.err.log"
$BaseUrl = "http://localhost:$Port"

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Write-CollectLog {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
  Write-Output $line
}

function Read-DotEnv {
  param([string]$Path)
  $values = @{}
  if (!(Test-Path $Path)) {
    return $values
  }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if (!$line -or $line.TrimStart().StartsWith("#") -or !$line.Contains("=")) {
      continue
    }
    $index = $line.IndexOf("=")
    $key = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }
  return $values
}

function Test-AppServer {
  try {
    $script:ServerHealth = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 10
    return $script:ServerHealth.status -eq "ok"
  } catch {
    return $false
  }
}

function Ensure-AppServer {
  param([hashtable]$EnvValues)
  if (!(Test-AppServer)) { Start-AppServer; return }
  $buildPath = Join-Path $ProjectDir ".next\BUILD_ID"
  $diskBuild = if (Test-Path -LiteralPath $buildPath) { (Get-Content -LiteralPath $buildPath -Raw).Trim() } else { "" }
  $changed = $diskBuild -and $script:ServerHealth.buildId -ne $diskBuild
  foreach ($property in $script:ServerHealth.collectionConfig.PSObject.Properties) {
    if (!$EnvValues.ContainsKey($property.Name)) { continue }
    if ($property.Value -is [string]) {
      if ([string]$EnvValues[$property.Name] -cne [string]$property.Value) { $changed = $true }
    } elseif ($EnvValues[$property.Name] -and [double]$EnvValues[$property.Name] -ne [double]$property.Value) {
      $changed = $true
    }
  }
  if (!$changed) { return }
  if ($SkipServerStart) { throw "Collector build or configuration changed; restart the server." }
  $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  $serverPids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($serverPid in $serverPids) {
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
    if (!$serverProcess -or $serverProcess.CommandLine -notmatch [regex]::Escape($ProjectDir) -or $serverProcess.CommandLine -notmatch 'next.*start') {
      throw "Port $Port belongs to an unverified process; collector restart aborted."
    }
  }
  if (!$serverPids.Count) { throw "Cannot identify the collector process on port $Port." }
  Write-CollectLog "Collector build or configuration changed. Restarting the verified server."
  foreach ($serverPid in $serverPids) { Stop-Process -Id $serverPid -Force }
  Start-AppServer
}

function Start-AppServer {
  if ($SkipServerStart) {
    throw "Server is not running and -SkipServerStart was provided."
  }

  Write-CollectLog "Starting dedicated collector server on $BaseUrl"
  if (!(Test-Path (Join-Path $ProjectDir ".next\BUILD_ID"))) {
    throw "Production build is missing. Run 'pnpm build' before starting scheduled collection."
  }

  $command = "pnpm.cmd exec next start -p $Port 1> `"$ServerOutLog`" 2> `"$ServerErrLog`""
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WorkingDirectory $ProjectDir -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    if (Test-AppServer) {
      Write-CollectLog "Dedicated collector server is ready."
      return
    }
  }

  throw "Collector server did not become ready within $StartupTimeoutSec seconds."
}

function Invoke-CronPost {
  param(
    [string]$Path,
    [int]$TimeoutSec,
    [hashtable]$Headers
  )
  $uri = "$BaseUrl$Path"
  Write-CollectLog "POST $Path"
  $result = Invoke-RestMethod -Method POST -Uri $uri -Headers $Headers -TimeoutSec $TimeoutSec
  Write-CollectLog ("DONE {0}: {1}" -f $Path, ($result | ConvertTo-Json -Compress -Depth 8))
}

if ($DryRun) {
  $envValues = Read-DotEnv (Join-Path $ProjectDir ".env.local")
  $required = @(
    "ETERNAL_RETURN_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ER_SEASON_ID"
  )
  $missing = @($required | Where-Object { !$envValues[$_] })
  if (!$envValues["CRON_SECRET"] -and !$envValues["ADMIN_TOKEN"]) {
    $missing += "CRON_SECRET"
  }
  if ($missing.Count -gt 0) {
    throw "Missing scheduler configuration: $($missing -join ', ')"
  }
  Write-Output "Collection scheduler configuration is valid."
  Write-Output "Port=$Port"
  Write-Output "Season=$($envValues['ER_SEASON_ID'])"
  Write-Output "TargetPatch=$($envValues['ER_TARGET_PATCH'])"
  Write-Output "MinimumMMR=$($envValues['ER_MIN_MMR'])"
  Write-Output "BatchLimit=$($envValues['ER_BATCH_LIMIT'])"
  Write-Output "RankerMatchLimit=$($envValues['ER_RANKER_MATCH_LIMIT'])"
  Write-Output "MaxNewMatches=$($envValues['ER_COLLECTION_MAX_NEW_MATCHES'])"
  Write-Output "DiscoveryRankersPerRun=$($envValues['ER_DISCOVERY_RANKERS_PER_RUN'])"
  Write-Output "DiscoveryTimeBudgetMinutes=$($envValues['ER_DISCOVERY_TIME_BUDGET_MINUTES'])"
  Write-Output "CollectionTimeBudgetMinutes=$($envValues['ER_COLLECTION_TIME_BUDGET_MINUTES'])"
  Write-Output "RequestTimeoutMs=$($envValues['ER_REQUEST_TIMEOUT_MS'])"
  Write-Output "CollectionStatePath=$($envValues['ER_COLLECTION_STATE_PATH'])"
  Write-Output "RequestDelayMs=$($envValues['ER_REQUEST_DELAY_MS'])"
  exit 0
}

$lockMaxAge = [TimeSpan]::FromSeconds($CollectTimeoutSec + $SnapshotTimeoutSec + 1800)
if (Test-Path $LockPath) {
  $lockText = Get-Content -LiteralPath $LockPath -Raw
  $lockOwnerAlive = $false
  if ($lockText -match '^pid=(\d+);') {
    $lockProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($Matches[1])" -ErrorAction SilentlyContinue
    $lockOwnerAlive = $lockProcess -and $lockProcess.CommandLine -match [regex]::Escape($PSCommandPath)
  }
  $lockAge = (Get-Date) - (Get-Item $LockPath).LastWriteTime
  if ($lockOwnerAlive -or (!$lockText -and $lockAge -lt $lockMaxAge)) {
    Write-CollectLog "Another collection appears to be running. Skipping this schedule tick."
    exit 0
  }
  Write-CollectLog "Removing lock file left by a stopped collection process."
  Remove-Item -LiteralPath $LockPath -Force
}

try {
  $lockStream = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
} catch [System.IO.IOException] {
  if (!(Test-Path -LiteralPath $LockPath)) { throw }
  Write-CollectLog "Another process acquired the collection lock. Skipping this schedule tick."
  exit 0
}

try {
  $lockBytes = [System.Text.Encoding]::UTF8.GetBytes(("pid={0}; started={1}" -f $PID, (Get-Date).ToString("o")))
  $lockStream.Write($lockBytes, 0, $lockBytes.Length)
  $lockStream.Flush()

  $envValues = Read-DotEnv (Join-Path $ProjectDir ".env.local")
  $secret = $envValues["CRON_SECRET"]
  if (!$secret) {
    $secret = $envValues["ADMIN_TOKEN"]
  }
  if (!$secret) {
    throw "CRON_SECRET or ADMIN_TOKEN is required in .env.local."
  }
  $headers = @{ Authorization = "Bearer $secret" }

  Ensure-AppServer -EnvValues $envValues

  Write-CollectLog (
    "Scheduled collection started. season={0} minMmr={1} batch={2} perRanker={3} maxNew={4} discoveryRankers={5} discoveryMinutes={6} targetPatch={7}" -f `
      $envValues["ER_SEASON_ID"],
      $envValues["ER_MIN_MMR"],
      $envValues["ER_BATCH_LIMIT"],
      $envValues["ER_RANKER_MATCH_LIMIT"],
      $envValues["ER_COLLECTION_MAX_NEW_MATCHES"],
      $envValues["ER_DISCOVERY_RANKERS_PER_RUN"],
      $envValues["ER_DISCOVERY_TIME_BUDGET_MINUTES"],
      $envValues["ER_TARGET_PATCH"]
  )
  Invoke-CronPost -Path "/api/cron/collect-rankers" -TimeoutSec $CollectTimeoutSec -Headers $headers
  try {
    Invoke-CronPost -Path "/api/cron/build-snapshots" -TimeoutSec $SnapshotTimeoutSec -Headers $headers
  } catch {
    Write-CollectLog ("Snapshot failed; retrying once: " + $_.Exception.Message)
    Start-Sleep -Seconds 15
    Invoke-CronPost -Path "/api/cron/build-snapshots" -TimeoutSec $SnapshotTimeoutSec -Headers $headers
  }
  Write-CollectLog "Scheduled collection finished."
} catch {
  Write-CollectLog ("ERROR: " + $_.Exception.Message)
  exit 1
} finally {
  $lockStream.Dispose()
  if (Test-Path $LockPath) {
    Remove-Item -LiteralPath $LockPath -Force
  }
}
