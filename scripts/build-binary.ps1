# Builds the self-host binary (app embedded) from a Budgero checkout, like selfhost.Dockerfile.
# The checkout defaults to ../budgero next to this project; BUDGERO_REPO overrides it.
param(
  [string]$Repo = $(if ($env:BUDGERO_REPO) { $env:BUDGERO_REPO } else { Join-Path $PSScriptRoot '..\..\budgero' })
)
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\bin\budgero.exe'
$serverDist = Join-Path $Repo 'packages\server\dist'

Push-Location $Repo
try {
  $env:VITE_SELF_HOSTABLE = 'true'
  pnpm --filter @budgero/runtime build
  pnpm --filter @budgero/core build
  pnpm --filter @budgero/app exec vite build --config vite.config.ts
  if (Test-Path $serverDist) { Remove-Item -Recurse -Force $serverDist }
  Copy-Item -Recurse packages\app\dist $serverDist
  Push-Location packages\server
  try {
    $env:CGO_ENABLED = '0'
    go build -o $out ./cmd/selfhost
    if ($LASTEXITCODE -ne 0) { throw "go build failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
} finally {
  # packages/server/dist is not ignored by git: never leave it in the checkout.
  if (Test-Path $serverDist) { Remove-Item -Recurse -Force $serverDist }
  Pop-Location
}
Write-Host "Built $out"
