$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$workbenchUrl = 'http://127.0.0.1:4317'
try { $null = Invoke-RestMethod "$workbenchUrl/api/status" -TimeoutSec 2 } catch {
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'dist/index.html'))) {
        Push-Location $projectDirectory
        try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build failed' } } finally { Pop-Location }
    }
    $nodeExecutable = (Get-Command node.exe).Source
    Start-Process -FilePath $nodeExecutable -ArgumentList @('--env-file-if-exists=.env', 'server.mjs', '--production') -WorkingDirectory $projectDirectory -WindowStyle Hidden
    $serverReady = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        try { $null = Invoke-RestMethod "$workbenchUrl/api/status" -TimeoutSec 1; $serverReady=$true; break } catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $serverReady) { throw 'Workbench did not start. Run npm start to inspect the error.' }
}
Start-Process $workbenchUrl
