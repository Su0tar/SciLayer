$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$nodeExecutable = (Get-Command node.exe).Source
if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'node_modules/@modelcontextprotocol/sdk'))) { throw 'Run npm install in the project directory first.' }
& $nodeExecutable (Join-Path $projectDirectory 'scripts/install.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Failed to register MCP server' }
Write-Host 'Registered SciLayer. Reload MCP connections or restart Codex to use it.'
