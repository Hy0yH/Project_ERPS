param(
  [ValidateRange(30, 240)]
  [int]$IntervalMinutes = 120,
  [ValidateRange(1024, 65535)]
  [int]$Port = 3101,
  [string]$TaskName = "Project_ERPS_Data_Collection",
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$ProjectDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ScriptPath = Join-Path $ProjectDir "scripts\collect-scheduled.ps1"

if (!(Test-Path $ScriptPath)) {
  throw "Missing scheduler script: $ScriptPath"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -Port $Port"

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Collect Eternal Return ranker data and rebuild Project_ERPS snapshots every $IntervalMinutes minutes." `
  -Force | Out-Null

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Output "Registered scheduled task '$TaskName' every $IntervalMinutes minutes on collector port $Port."
Write-Output "RunNow=$([bool]$RunNow)"
Write-Output "Run once now:"
Write-Output "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Output "View logs:"
Write-Output "  Get-Content `"$ProjectDir\.scheduler\collect.log`" -Tail 80"
