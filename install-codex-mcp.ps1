$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$serverScript = Join-Path $projectDirectory 'mcp/server.mjs'
$nodeExecutable = (Get-Command node.exe).Source
if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'node_modules/@modelcontextprotocol/sdk'))) { throw 'Run npm install in the project directory first.' }
& codex mcp add figure-workbench -- $nodeExecutable $serverScript
if ($LASTEXITCODE -ne 0) { throw 'Failed to register MCP server' }
Write-Host 'Registered figure-workbench. Reload MCP connections or restart Codex to use it.'
