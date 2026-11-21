Add-Type -AssemblyName System.Drawing

$srcPath = 'd:\PROJETOS\PYCHARM\MannaVision2\handraw-pipe\public\logo_manna_vision1.png'
$icoPath = 'd:\PROJETOS\PYCHARM\MannaVision2\assets\mannavision.ico'

if (-not (Test-Path $srcPath)) {
    Write-Error "Arquivo fonte nao encontrado: $srcPath"
    exit 1
}

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$canvasSize = 256
$dest = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dest)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

$ratio = [Math]::Min($canvasSize / $src.Width, $canvasSize / $src.Height)
$w = [int]($src.Width * $ratio)
$h = [int]($src.Height * $ratio)
$x = [int](($canvasSize - $w) / 2)
$y = [int](($canvasSize - $h) / 2)

$g.DrawImage($src, $x, $y, $w, $h)
$g.Dispose()
$src.Dispose()

$ms = New-Object System.IO.MemoryStream
$dest.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$dest.Dispose()

$pngBytes = $ms.ToArray()
$ms.Dispose()

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR (6 bytes)
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type (1=Icon)
$bw.Write([uint16]1) # Image count

# ICONDIRENTRY (16 bytes)
$bw.Write([byte]0)   # Width (0 = 256)
$bw.Write([byte]0)   # Height (0 = 256)
$bw.Write([byte]0)   # ColorCount
$bw.Write([byte]0)   # Reserved
$bw.Write([uint16]1) # Color planes
$bw.Write([uint16]32)# Bits per pixel
$bw.Write([uint32]$pngBytes.Length) # Size of image data
$bw.Write([uint32]22) # Offset of image data (6 + 16)

# Image Data (PNG stream)
$bw.Write($pngBytes)

$bw.Close()
$fs.Close()

Write-Output "ICO gerado com sucesso em: $icoPath (Tamanho: $((Get-Item $icoPath).Length) bytes)"
