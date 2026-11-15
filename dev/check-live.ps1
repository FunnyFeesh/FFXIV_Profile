# Live API check for the FfxivProfile plugin.
# Run from the Vencord folder:  .\src\userplugins\ffxivProfile.desktop\dev\check-live.ps1
# Credentials are read with hidden prompts, kept only in this process's environment,
# and removed when the script ends. Leave a prompt empty to skip that service.

param([string]$LodestoneId)

$ErrorActionPreference = "Stop"

function Read-Secret([string]$Label) {
    $secure = Read-Host -AsSecureString $Label
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$names = "FFXIV_FFLOGS_ID", "FFXIV_FFLOGS_SECRET", "FFXIV_TOMESTONE_TOKEN", "FFXIV_LODESTONE_ID"
try {
    $env:FFXIV_FFLOGS_ID = Read-Secret "FFLogs Client ID (Enter to skip FFLogs)"
    if ($env:FFXIV_FFLOGS_ID) { $env:FFXIV_FFLOGS_SECRET = Read-Secret "FFLogs Client Secret" }
    $env:FFXIV_TOMESTONE_TOKEN = Read-Secret "Tomestone API token (Enter to skip Tomestone)"
    if ($LodestoneId) { $env:FFXIV_LODESTONE_ID = $LodestoneId }

    node --import tsx src/userplugins/ffxivProfile.desktop/dev/checkLive.ts
}
finally {
    foreach ($n in $names) { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
}
