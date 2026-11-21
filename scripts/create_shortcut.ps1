$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "MannaVision.lnk"
$targetExe = "d:\PROJETOS\PYCHARM\MannaVision2\MannaVision.exe"
$iconPath = "d:\PROJETOS\PYCHARM\MannaVision2\assets\mannavision.ico"
$workingDir = "d:\PROJETOS\PYCHARM\MannaVision2"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetExe
$shortcut.WorkingDirectory = $workingDir
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "MannaVision - Interacao Gestual & IA"
$shortcut.Save()

Write-Output "Atalho criado com sucesso em: $shortcutPath"
