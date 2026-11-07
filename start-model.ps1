param([switch]$Compose, [switch]$Apply, [switch]$Standalone)
$ErrorActionPreference = 'Stop'
$env:OLLAMA_HOST = if ($Standalone) { '127.0.0.1:18758' } elseif ($Apply) { '127.0.0.1:18752' } elseif ($Compose) { '127.0.0.1:18746' } else { '127.0.0.1:18744' }
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_NOPRUNE = '1'
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
$env:OLLAMA_CONTEXT_LENGTH = '4096'
ollama serve
