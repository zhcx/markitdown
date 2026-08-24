$ErrorActionPreference = 'Stop'

$repo = 'zhcx/zeditor'
$branch = 'fix/block-editor-reliability-command-center'
$baseCommit = 'cae7b36bcc17d5216df0554346a372d8bb9b6d0b'
$localHead = (git rev-parse HEAD).Trim()
$commits = @(git rev-list --reverse "$baseCommit..$localHead")

function Invoke-GhJson {
  param(
    [Parameter(Mandatory = $true)][string]$Endpoint,
    [Parameter(Mandatory = $true)][hashtable]$Body
  )

  $json = $Body | ConvertTo-Json -Depth 20 -Compress
  $responseLines = @($json | gh api -X POST $Endpoint --input -)
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub API request failed: $Endpoint"
  }
  return (($responseLines -join "`n") | ConvertFrom-Json)
}

function Get-GitBlobBytes {
  param(
    [Parameter(Mandatory = $true)][string]$Commit,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $spec = "$Commit`:$Path"
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'git'
  $startInfo.Arguments = "cat-file blob `"$spec`""
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $memory = [System.IO.MemoryStream]::new()
  $process.StandardOutput.BaseStream.CopyTo($memory)
  $errorText = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "git cat-file failed for $spec`: $errorText"
  }
  return $memory.ToArray()
}

$baseObject = (gh api "repos/$repo/git/commits/$baseCommit" | ConvertFrom-Json)
$remoteCommit = $baseCommit
$remoteTree = $baseObject.tree.sha
$mapping = @()

foreach ($commit in $commits) {
  $treeEntries = @()
  $changes = @(git diff-tree --no-commit-id --name-status -r $commit)

  foreach ($change in $changes) {
    $parts = $change -split "`t"
    $status = $parts[0]

    if ($status -eq 'D') {
      $treeEntries += [ordered]@{
        path = $parts[1]
        mode = '100644'
        type = 'blob'
        sha = $null
      }
      continue
    }

    if ($status.StartsWith('R')) {
      $treeEntries += [ordered]@{
        path = $parts[1]
        mode = '100644'
        type = 'blob'
        sha = $null
      }
      $path = $parts[2]
    } else {
      $path = $parts[1]
    }

    $treeLine = (git ls-tree $commit -- $path)
    if ($treeLine -notmatch '^(\d+)\s+(\w+)\s+([0-9a-f]+)\t') {
      throw "Cannot parse tree entry for $commit $path"
    }
    $mode = $Matches[1]
    $type = $Matches[2]
    if ($type -ne 'blob') {
      throw "Unsupported changed tree type $type for $path"
    }

    $bytes = Get-GitBlobBytes -Commit $commit -Path $path
    $blobObject = Invoke-GhJson -Endpoint "repos/$repo/git/blobs" -Body @{
      content = [Convert]::ToBase64String($bytes)
      encoding = 'base64'
    }
    $treeEntries += [ordered]@{
      path = $path
      mode = $mode
      type = 'blob'
      sha = $blobObject.sha
    }
  }

  $treeObject = Invoke-GhJson -Endpoint "repos/$repo/git/trees" -Body @{
    base_tree = $remoteTree
    tree = $treeEntries
  }
  $expectedTree = (git rev-parse "$commit^{tree}").Trim()
  if ($treeObject.sha -ne $expectedTree) {
    throw "Tree SHA mismatch for $commit. Expected $expectedTree, got $($treeObject.sha)"
  }

  $message = ((git show -s --format=%B $commit) -join "`n").TrimEnd("`r", "`n")
  $commitObject = Invoke-GhJson -Endpoint "repos/$repo/git/commits" -Body @{
    message = $message
    tree = $treeObject.sha
    parents = @($remoteCommit)
    author = @{
      name = ((git show -s --format=%an $commit) -join "`n").Trim()
      email = ((git show -s --format=%ae $commit) -join "`n").Trim()
      date = ((git show -s --format=%aI $commit) -join "`n").Trim()
    }
    committer = @{
      name = ((git show -s --format=%cn $commit) -join "`n").Trim()
      email = ((git show -s --format=%ce $commit) -join "`n").Trim()
      date = ((git show -s --format=%cI $commit) -join "`n").Trim()
    }
  }

  $mapping += [pscustomobject]@{
    local = $commit
    remote = $commitObject.sha
    exact = ($commit -eq $commitObject.sha)
    subject = ((git show -s --format=%s $commit) -join "`n").Trim()
  }
  $remoteCommit = $commitObject.sha
  $remoteTree = $treeObject.sha
}

$refObject = Invoke-GhJson -Endpoint "repos/$repo/git/refs" -Body @{
  ref = "refs/heads/$branch"
  sha = $remoteCommit
}

$remoteHeadObject = (gh api "repos/$repo/git/commits/$remoteCommit" | ConvertFrom-Json)
$localTree = (git rev-parse 'HEAD^{tree}').Trim()
if ($remoteHeadObject.tree.sha -ne $localTree) {
  throw "Remote head tree mismatch. Expected $localTree, got $($remoteHeadObject.tree.sha)"
}

[pscustomobject]@{
  branch = $branch
  localHead = $localHead
  remoteHead = $remoteCommit
  localTree = $localTree
  remoteTree = $remoteHeadObject.tree.sha
  ref = $refObject.ref
  exactCommitCount = @($mapping | Where-Object exact).Count
  totalCommitCount = $mapping.Count
} | ConvertTo-Json -Depth 5

$mapping | Format-Table -AutoSize
