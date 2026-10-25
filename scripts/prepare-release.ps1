<#
.SYNOPSIS
Prepares the private no-install Tamhees Windows x64 website archive.

.DESCRIPTION
Validates an output boundary outside the repository, a local Windows x64 Node
runtime with its complete license/notices, the minimal compiled application,
portable launchers, manifest integrity, deterministic ZIP metadata, and every
archive entry. Dry-run mode creates no directory or archive.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  [switch]$DryRun,
  [switch]$Force,
  [string]$NodeRuntimeDirectory
)

$ErrorActionPreference = 'Stop'
$releaseVersion = '1.0.0-rc.2'
$portableName = 'Tamhees-Portable-Website-v1.0.0-rc.2-Windows-x64.zip'
$packageRootName = 'Tamhees-Portable-Website-v1.0.0-rc.2-Windows-x64'
$fixedZipTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
$utf8 = [System.Text.UTF8Encoding]::new($false)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$portablePath = Join-Path $outputRoot $portableName
$partialPath = $portablePath + '.partial'

function Test-IsInside([string]$Candidate, [string]$Parent) {
  $prefix = $Parent.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  return $Candidate.Equals($Parent, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-SafeRelativePath([string]$Parent, [string]$Candidate) {
  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
  $candidateFull = [System.IO.Path]::GetFullPath($Candidate)
  $prefix = $parentFull + [System.IO.Path]::DirectorySeparatorChar
  if (-not $candidateFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release source path escaped its verified parent.'
  }
  return $candidateFull.Substring($prefix.Length).Replace('\', '/')
}

function Assert-RegularFile([string]$Path, [string]$Description) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Description is missing: $Path" }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Description must not be a link or reparse point: $Path"
  }
}

function Get-EntryBytes($Item) {
  if ($null -ne $Item.Bytes) { return [byte[]]$Item.Bytes }
  return [System.IO.File]::ReadAllBytes($Item.SourcePath)
}

function Get-Sha256Hex([byte[]]$Bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([System.BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function New-DeterministicZip([string]$Destination, [array]$Entries) {
  $stream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($item in @($Entries | Sort-Object ArchivePath)) {
        $entry = $archive.CreateEntry($item.ArchivePath.Replace('\', '/'), [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = $fixedZipTime
        $entryStream = $entry.Open()
        try {
          $bytes = Get-EntryBytes $item
          $entryStream.Write($bytes, 0, $bytes.Length)
        } finally { $entryStream.Dispose() }
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }
}

function Assert-SafeArchive([string]$ArchivePath, [int]$ExpectedCount) {
  $stream = [System.IO.File]::OpenRead($ArchivePath)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
    try {
      if ($archive.Entries.Count -ne $ExpectedCount) { throw 'Portable archive entry count differs from the reviewed manifest.' }
      $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
      $executables = @()
      foreach ($entry in $archive.Entries) {
        $name = $entry.FullName
        $segments = $name.Split('/')
        if ([string]::IsNullOrWhiteSpace($name) -or [System.IO.Path]::IsPathRooted($name) -or $name -match '^[A-Za-z]:' -or $name.Contains('\') -or $segments -contains '..' -or $segments -contains '.') {
          throw "Portable archive contains an unsafe path: $name"
        }
        if (-not $name.StartsWith($packageRootName + '/', [System.StringComparison]::Ordinal)) {
          throw "Portable archive entry is outside its single package root: $name"
        }
        if (-not $seen.Add($name)) { throw "Portable archive contains a duplicate path: $name" }
        if ($name -match '(?i)(^|/)(\.git|node_modules|test|tests|coverage|\.tamhees|\.gptbrain|memory|docs)(/|$)|(^|/)\.env($|\.)|\.(zip|7z|rar|tar|gz|log|map|ts)$') {
          throw "Portable archive contains a prohibited development, storage, archive, or temporary path: $name"
        }
        if ($name.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) { $executables += $name }
      }
      $expectedExecutable = "$packageRootName/runtime/node.exe"
      if ($executables.Count -ne 1 -or $executables[0] -cne $expectedExecutable) {
        throw 'Portable archive must contain only the intended runtime/node.exe executable.'
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }
}

if (Test-IsInside $outputRoot $repoRoot) { throw 'Release output must be outside the source repository.' }
if ((Test-Path -LiteralPath $outputRoot) -and ((Get-Item -LiteralPath $outputRoot -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Release output must not be a link or reparse point.'
}
foreach ($target in @($portablePath, $partialPath)) {
  if ((Test-Path -LiteralPath $target) -and -not $Force) { throw "Refusing to overwrite existing release output: $target" }
}

$distRoot = Join-Path $repoRoot 'dist\src'
$benchmarkPath = Join-Path $repoRoot 'benchmark\results\v1.0.0-rc.2.json'
$launcherPath = Join-Path $repoRoot 'scripts\portable\Start-Tamhees.ps1'
$cmdPath = Join-Path $repoRoot 'scripts\portable\Open Tamhees Website.cmd'
$projectNoticesPath = Join-Path $repoRoot 'THIRD_PARTY_NOTICES.md'
foreach ($required in @(
  @($distRoot, 'Compiled application directory'),
  @($benchmarkPath, 'Integrity-pinned benchmark artifact'),
  @($launcherPath, 'Portable PowerShell launcher'),
  @($cmdPath, 'Portable double-click launcher'),
  @($projectNoticesPath, 'Project third-party notices')
)) {
  if ($required[0] -eq $distRoot) {
    if (-not (Test-Path -LiteralPath $distRoot -PathType Container)) { throw 'Run npm run build before preparing portable output.' }
  } else { Assert-RegularFile $required[0] $required[1] }
}

$runtimeRoot = $null
$runtimeNode = $null
$runtimeLicense = $null
$runtimeVersion = '(not supplied)'
$runtimeArch = '(not supplied)'
$runtimeHash = '(not supplied)'
if ($NodeRuntimeDirectory) {
  $runtimeRoot = [System.IO.Path]::GetFullPath($NodeRuntimeDirectory)
  if (Test-IsInside $runtimeRoot $repoRoot) { throw 'The supplied Node runtime must be outside the repository.' }
  if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) { throw 'The supplied Node runtime directory does not exist.' }
  if (((Get-Item -LiteralPath $runtimeRoot -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'The supplied Node runtime directory must not be a link or reparse point.' }
  $runtimeNode = Join-Path $runtimeRoot 'node.exe'
  Assert-RegularFile $runtimeNode 'Windows x64 Node runtime'
  $runtimeLicense = @('LICENSE', 'LICENSE.txt') | ForEach-Object { Join-Path $runtimeRoot $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $runtimeLicense) { throw 'The supplied Node runtime does not include LICENSE or LICENSE.txt.' }
  Assert-RegularFile $runtimeLicense 'Node license and third-party notices'
  $licenseText = [System.IO.File]::ReadAllText($runtimeLicense)
  if ($licenseText.Length -lt 10000 -or $licenseText -notmatch 'Node\.js is licensed for use as follows:' -or $licenseText -notmatch 'The MIT License') {
    throw 'The supplied Node licensing material is incomplete or not recognizable as the complete Node.js license/notices.'
  }
  $runtimeVersion = ([string](& $runtimeNode --version)).Trim()
  $runtimeArch = ([string](& $runtimeNode -p 'process.arch')).Trim()
  if ($LASTEXITCODE -ne 0 -or $runtimeVersion -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$' -or $runtimeArch -cne 'x64') {
    throw 'The supplied runtime must be a working Windows x64 Node executable.'
  }
  $runtimeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeNode).Hash.ToLowerInvariant()
}

$productionExtensions = @('.css', '.html', '.js')
$compiledFiles = @(Get-ChildItem -LiteralPath $distRoot -Recurse -File | Where-Object { $productionExtensions -ccontains $_.Extension } | Sort-Object FullName)
$requiredProductionFiles = @(
  (Join-Path $distRoot 'dashboard\server.js'),
  (Join-Path $distRoot 'dashboard\public\index.html'),
  (Join-Path $distRoot 'dashboard\public\dashboard.css'),
  (Join-Path $distRoot 'dashboard\public\dashboard.js'),
  (Join-Path $distRoot 'dashboard\public\start.html'),
  (Join-Path $distRoot 'dashboard\public\start.css'),
  (Join-Path $distRoot 'dashboard\public\start.js')
)
if ($compiledFiles.Count -eq 0 -or @($requiredProductionFiles | Where-Object { $compiledFiles.FullName -notcontains $_ }).Count -ne 0) {
  throw 'The minimal compiled dashboard application and static assets are incomplete.'
}

Write-Output "Repository: $repoRoot"
Write-Output "Output: $outputRoot"
Write-Output "Version: $releaseVersion"
Write-Output "Portable archive: $portablePath"
Write-Output "Compiled production files: $($compiledFiles.Count)"
Write-Output "Runtime version: $runtimeVersion"
Write-Output "Runtime architecture: $runtimeArch"
Write-Output "Runtime SHA-256: $runtimeHash"
if (-not $runtimeRoot) { Write-Output 'Runtime: planned only; provide -NodeRuntimeDirectory containing node.exe and its complete LICENSE file.' }
if ($DryRun) { Write-Output 'DRY_RUN_OK: no directory or archive was created.'; exit 0 }
if (-not $runtimeRoot) { throw 'A licensed local Windows x64 Node runtime is required for a real portable archive.' }

$portableEntries = @()
foreach ($file in $compiledFiles) {
  $relative = Get-SafeRelativePath $distRoot $file.FullName
  $portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/application/dist/src/$relative"; SourcePath = $file.FullName; Bytes = $null }
}
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/application/benchmark/results/v1.0.0-rc.2.json"; SourcePath = $benchmarkPath; Bytes = $null }
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/runtime/node.exe"; SourcePath = $runtimeNode; Bytes = $null }
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/Open Tamhees Website.cmd"; SourcePath = $cmdPath; Bytes = $null }
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/Start-Tamhees.ps1"; SourcePath = $launcherPath; Bytes = $null }

$readmeFirst = @"
TAMHEES $releaseVersion - README FIRST

1. Copy this ZIP to a private Windows x64 computer.
2. Verify the ZIP SHA-256 supplied by the owner who created it.
3. Extract the complete ZIP to a new local directory. Do not run it from inside the ZIP.
4. Double-click "Open Tamhees Website.cmd".
5. Keep the launcher window open while viewing the exact 127.0.0.1 page.
6. Return to the launcher window and press Enter to stop Tamhees.
7. Delete the extracted directory to remove the portable demonstration.

The launcher uses only the packaged runtime\node.exe. It does not install software,
request administrator access, change execution policy permanently, add firewall
rules, access the internet, use telemetry, or create an account.
"@
$versionText = @"
Tamhees: $releaseVersion
Package: private portable website release candidate
Node.js: $runtimeVersion
Node architecture: $runtimeArch
Node executable SHA-256: $runtimeHash
Benchmark SHA-256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $benchmarkPath).Hash.ToLowerInvariant())
Project license: UNLICENSED; all rights reserved
"@
$projectNotices = [System.IO.File]::ReadAllText($projectNoticesPath)
$nodeLicenseText = [System.IO.File]::ReadAllText($runtimeLicense)
$noticesText = @"
TAMHEES $releaseVersion - THIRD-PARTY NOTICES

Tamhees is UNLICENSED and has zero runtime package dependencies. TypeScript,
@types/node, and undici-types are development-only and are not included in this
portable archive. The embedded executable is Node.js $runtimeVersion x64.

The complete Node.js license and bundled third-party notices below were extracted
from the matching local Node.js distribution material and are included verbatim.

----- BEGIN NODE.JS LICENSE AND THIRD-PARTY NOTICES -----
$nodeLicenseText
----- END NODE.JS LICENSE AND THIRD-PARTY NOTICES -----

----- TAMHEES DEVELOPMENT-TOOL NOTICE SUMMARY -----
$projectNotices
"@
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/README-FIRST.txt"; SourcePath = $null; Bytes = $utf8.GetBytes($readmeFirst) }
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/VERSION.txt"; SourcePath = $null; Bytes = $utf8.GetBytes($versionText) }
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/THIRD-PARTY-NOTICES.txt"; SourcePath = $null; Bytes = $utf8.GetBytes($noticesText) }

$manifestLines = foreach ($entry in @($portableEntries | Sort-Object ArchivePath)) {
  $relative = $entry.ArchivePath.Substring($packageRootName.Length + 1)
  $hash = Get-Sha256Hex (Get-EntryBytes $entry)
  "$hash  $relative"
}
$manifestText = ($manifestLines -join "`n") + "`n"
$portableEntries += [pscustomobject]@{ ArchivePath = "$packageRootName/SHA256SUMS.txt"; SourcePath = $null; Bytes = $utf8.GetBytes($manifestText) }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
try {
  if ($Force) {
    foreach ($target in @($portablePath, $partialPath)) {
      if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
    }
  }
  New-DeterministicZip $partialPath $portableEntries
  Assert-SafeArchive $partialPath $portableEntries.Count
  Move-Item -LiteralPath $partialPath -Destination $portablePath
} finally {
  if (Test-Path -LiteralPath $partialPath -PathType Leaf) { Remove-Item -LiteralPath $partialPath -Force }
}
$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $portablePath).Hash.ToLowerInvariant()
Write-Output "PORTABLE_ARCHIVE_CREATED=$portablePath"
Write-Output "PORTABLE_FILE_COUNT=$($portableEntries.Count)"
Write-Output "PORTABLE_ZIP_SHA256=$zipHash"