param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Run-Npm([string[]]$Arguments) {
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm $($Arguments -join ' ') basarisiz. Cikis: $LASTEXITCODE" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22 LTS (en az 22.12) veya 24 LTS kurulu olmali: https://nodejs.org/' }
$nodeVersion = [version]((& node -p "process.versions.node").Trim())
if ($nodeVersion -lt [version]'22.12.0') { throw "Node.js surumu $nodeVersion. En az 22.12 gerekli." }
Write-Host '1/4 Kilitli bagimliliklar yukleniyor...' -ForegroundColor Cyan
Run-Npm -Arguments @('ci','--no-fund')
Write-Host '2/4 Tip denetimi ve testler...' -ForegroundColor Cyan
Run-Npm -Arguments @('run','typecheck')
if (-not $SkipTests) { Run-Npm -Arguments @('test') }
Write-Host '3/4 Windows x64 portable EXE olusturuluyor...' -ForegroundColor Cyan
Run-Npm -Arguments @('run','build')
Write-Host '4/4 Yayin dosyasi hazirlaniyor...' -ForegroundColor Cyan
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$name = "Oyun-Siralayici-$version-Portable.exe"
$artifact = Join-Path $PSScriptRoot "..\.cache\oyun-package\$name"
if (-not (Test-Path $artifact)) { throw "EXE bulunamadi: $artifact" }
$destination = Join-Path $PSScriptRoot 'Yayin'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item $artifact (Join-Path $destination $name) -Force
$hash = (Get-FileHash (Join-Path $destination $name) -Algorithm SHA256).Hash.ToLower()
"$hash  $name" | Set-Content (Join-Path $destination 'SHA256.txt') -Encoding ascii
Write-Host "Tamamlandi: $destination\$name" -ForegroundColor Green
Write-Host 'Bu imzasiz portable pakettir. Derleme basarisi Windows kabul testinin yerine gecmez.'
