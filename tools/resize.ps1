Add-Type -AssemblyName System.Drawing

function Get-JpegEncoder {
  [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
}

function Convert-Img {
  param(
    [string]$InPath,
    [string]$OutPath,
    [int]$MaxSide,
    [string]$Format = 'jpg',   # jpg | png
    [int]$Quality = 80
  )
  $bytes = [System.IO.File]::ReadAllBytes($InPath)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $img = [System.Drawing.Image]::FromStream($ms)
  $w = $img.Width; $h = $img.Height
  $scale = [Math]::Min([Math]::Min($MaxSide / $w, $MaxSide / $h), 1.0)
  $nw = [int][Math]::Round($w * $scale); $nh = [int][Math]::Round($h * $scale)
  if ($nw -lt 1) { $nw = 1 }; if ($nh -lt 1) { $nh = 1 }
  $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $nw, $nh)
  $g.Dispose(); $img.Dispose(); $ms.Dispose()

  if ($Format -eq 'jpg') {
    $enc = Get-JpegEncoder
    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
    $bmp.Save($OutPath, $enc, $ep)
  } else {
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $bmp.Dispose()
  "{0} -> {1}  ({2}x{3}, {4}KB)" -f (Split-Path $InPath -Leaf), (Split-Path $OutPath -Leaf), $nw, $nh, [math]::Round((Get-Item $OutPath).Length/1KB,1)
}

$g = 'assets\games'

# Game covers: re-encode to JPEG, max 600px longest side
foreach ($f in 'bgmi.jpg','mobile-legends.jpg','pubg-mobile.jpg','pokemon-unite.jpg','free-fire.jpg','valorant.jpg','genshin-impact.jpg') {
  $p = Join-Path $g $f
  if (Test-Path $p) { Convert-Img -InPath $p -OutPath $p -MaxSide 600 -Format jpg -Quality 80 }
}
# wild-rift / honkai already small (webp left as-is)

# clash-royale.png (heavy) -> resized PNG, 480px
Convert-Img -InPath (Join-Path $g 'clash-royale.png') -OutPath (Join-Path $g 'clash-royale.png') -MaxSide 480 -Format png

# Brand logo: small, keep PNG (transparency), max 220px
Convert-Img -InPath 'assets\brand\brandlogo.png' -OutPath 'assets\brand\brandlogo.png' -MaxSide 220 -Format png

# Hero banners: photos -> JPEG, max width 1600. Produce .jpg, remove .png.
foreach ($n in '1','2','3') {
  $png = Join-Path $g ("banner{0}.png" -f $n)
  $jpg = Join-Path $g ("banner{0}.jpg" -f $n)
  if (Test-Path $png) {
    Convert-Img -InPath $png -OutPath $jpg -MaxSide 1600 -Format jpg -Quality 82
    Remove-Item $png
  }
}
