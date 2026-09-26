param([string]$mode="ai")
switch ($mode) {
    "ai" { ollama run qwen2.5:1.5b }
    "code" { ollama run qwen2.5-coder:1.5b }
    default { & "$PSScriptRoot\boot.ps1" boot }
}