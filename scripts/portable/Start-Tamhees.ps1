[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$StopAfterHealthCheck,
  [ValidateRange(0, 65535)]
  [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$packageRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$nodePath = Join-Path $packageRoot 'runtime\node.exe'
$serverPath = Join-Path $packageRoot 'application\dist\src\dashboard\server.js'
$manifestPath = Join-Path $packageRoot 'SHA256SUMS.txt'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$stateLeaf = "Tamhees-Portable-$PID"
$stateRoot = [System.IO.Path]::GetFullPath((Join-Path $tempRoot $stateLeaf))
$child = $null

function Test-IsInside([string]$Candidate, [string]$Parent) {
  $prefix = $Parent.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  return $Candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-PackageIntegrity {
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'SHA256SUMS.txt is missing. Re-copy or re-extract the complete Tamhees package.'
  }
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($line in Get-Content -LiteralPath $manifestPath) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $match = [regex]::Match($line, '^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9 ._/-]*)$')
    if (-not $match.Success) { throw 'SHA256SUMS.txt contains an invalid entry.' }
    $expected = $match.Groups[1].Value
    $relative = $match.Groups[2].Value
    $segments = $relative.Split('/')
    if ([System.IO.Path]::IsPathRooted($relative) -or $relative.Contains('\') -or $relative.Contains(':') -or $segments -contains '..' -or $segments -contains '.') {
      throw 'SHA256SUMS.txt contains an unsafe path.'
    }
    if (-not $seen.Add($relative)) { throw 'SHA256SUMS.txt contains a duplicate path.' }
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $packageRoot ($relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar))))
    if (-not (Test-IsInside $candidate $packageRoot)) { throw 'A manifest path escaped the extracted package.' }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "A required package file is missing: $relative" }
    $item = Get-Item -LiteralPath $candidate -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "A package file is a link or reparse point: $relative" }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash.ToLowerInvariant()
    if ($actual -cne $expected) { throw "Integrity verification failed for: $relative" }
  }
  if ($seen.Count -lt 8) { throw 'SHA256SUMS.txt is incomplete.' }
}

try {
  Assert-PackageIntegrity
  foreach ($required in @($nodePath, $serverPath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required runtime file is missing: $required" }
  }
  if (Test-Path -LiteralPath $stateRoot) { throw "Temporary launcher state already exists: $stateRoot" }
  if (-not (Test-IsInside $stateRoot $tempRoot) -or ([System.IO.Path]::GetFileName($stateRoot) -cne $stateLeaf)) {
    throw 'The launcher temporary-state path is unsafe.'
  }
  New-Item -ItemType Directory -Path $stateRoot | Out-Null
  $pidPath = Join-Path $stateRoot 'server.pid'
  $argumentText = '"' + $serverPath + '" --port ' + $Port.ToString([System.Globalization.CultureInfo]::InvariantCulture)

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $nodePath
  $startInfo.Arguments = $argumentText
  $startInfo.WorkingDirectory = Join-Path $packageRoot 'application'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $child = New-Object System.Diagnostics.Process
  $child.StartInfo = $startInfo
  if (-not $child.Start()) { throw 'The packaged Tamhees runtime could not start.' }
  [System.IO.File]::WriteAllText($pidPath, $child.Id.ToString([System.Globalization.CultureInfo]::InvariantCulture), [System.Text.UTF8Encoding]::new($false))
  $outputLineTask = $child.StandardOutput.ReadLineAsync()
  $errorLineTask = $child.StandardError.ReadLineAsync()

  $url = $null
  $healthy = $false
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($child.HasExited) { break }
    if ($null -eq $url -and $outputLineTask.IsCompleted) {
      $outputLine = $outputLineTask.Result
      if ($null -ne $outputLine) {
        $urlMatch = [regex]::Match($outputLine, 'http://127\.0\.0\.1:[0-9]{1,5}/')
        if ($urlMatch.Success) { $url = $urlMatch.Value }
      }
    }
    if ($null -ne $url) {
      try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $healthy = $true; break }
      } catch {}
    }
    Start-Sleep -Milliseconds 200
  }
  if (-not $healthy -or -not $url) {
    $details = ''
    if ($errorLineTask.IsCompleted) {
      $errorLine = $errorLineTask.Result
      if ($null -ne $errorLine) { $details = $errorLine.Trim() }
    }
    if ($details.Length -gt 500) { $details = $details.Substring(0, 500) }
    if ($Port -ne 0) { throw "Tamhees could not start on 127.0.0.1:$Port. The port may be occupied. $details" }
    throw "Tamhees did not become healthy on loopback. $details"
  }

  Write-Output "TAMHEES_URL=$url"
  Write-Output "TAMHEES_CHILD_PID=$($child.Id)"
  Write-Output "TAMHEES_NODE_PATH=$nodePath"
  Write-Host ''
  Write-Host 'Keep this window open while viewing Tamhees.' -ForegroundColor Cyan
  Write-Host "Tamhees is available only on this computer at $url"
  if (-not $NoBrowser) { Start-Process -FilePath $url | Out-Null }
  if ($StopAfterHealthCheck) {
    Write-Output 'TAMHEES_SMOKE_READY'
  } else {
    Read-Host 'Press Enter to stop Tamhees' | Out-Null
  }
} finally {
  if ($null -ne $child -and -not $child.HasExited) {
    Stop-Process -Id $child.Id -ErrorAction SilentlyContinue
    if (-not $child.WaitForExit(5000)) {
      Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
      $child.WaitForExit(5000) | Out-Null
    }
  }
  $resolvedState = [System.IO.Path]::GetFullPath($stateRoot)
  $safeState = (Test-IsInside $resolvedState $tempRoot) -and ([System.IO.Path]::GetFileName($resolvedState) -ceq $stateLeaf)
  if ($safeState -and (Test-Path -LiteralPath $resolvedState -PathType Container)) {
    Remove-Item -LiteralPath $resolvedState -Recurse -Force
  }
}