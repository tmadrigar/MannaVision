$projectDir = Split-Path -Parent $PSScriptRoot
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "MannaVision.lnk"
$targetExe = Join-Path $projectDir "MannaVision.exe"
$iconPath = Join-Path $projectDir "assets\mannavision.ico"

if (-not (Test-Path $targetExe)) {
    Write-Error "MannaVision.exe nao encontrado em $projectDir"
    exit 1
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetExe
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "MannaVision - Interacao Gestual & IA"
$shortcut.Save()

Write-Output "Atalho criado com sucesso em: $shortcutPath"
