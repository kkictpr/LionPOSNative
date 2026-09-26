param([string]$cmd="boot")
if ($cmd -eq "boot") {
    Clear-Host
    Write-Host "==============================" -ForegroundColor Yellow
    Write-Host "      SAKU AI OS v2.0" -ForegroundColor Cyan
    Write-Host "==============================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Project    : LionPOSNative"
    Write-Host "Controller : ChatGPT"
    Write-Host "Worker     : Ollama"
    $branch = git branch --show-current 2>$null
    if ($branch) { Write-Host "Branch     : $branch" }
    Write-Host ""
    Write-Host "Sprint: Continue"
    Write-Host "Next:"
    Write-Host " - GPU Master Plan"
    Write-Host " - LionPOS Sprint"
    Write-Host " - Saku Launcher"
    Write-Host ""
    Write-Host "Ready." -ForegroundColor Green
}