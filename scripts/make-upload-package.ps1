# 產生 S3 上傳包：先 build CSS，再把前台需要的檔案鏡像到「../SCCD-上傳包」
# 用法：右鍵此檔 →「使用 PowerShell 執行」，或在專案根目錄跑 powershell scripts/make-upload-package.ps1
$src  = Split-Path $PSScriptRoot -Parent
$dest = Join-Path (Split-Path $src -Parent) 'SCCD-上傳包'

Push-Location $src
npm run build:css
Pop-Location

$dirs = 'pages','css','js','images','assets','data','generate-app','custom-cursor','website-icons'
foreach ($d in $dirs) {
  # /MIR 鏡像：來源刪了的檔案，上傳包也會跟著刪，保持乾淨
  robocopy (Join-Path $src $d) (Join-Path $dest $d) /MIR /NFL /NDL /NJH /NJS | Out-Null
}
Copy-Item (Join-Path $src 'index.html') $dest -Force

Write-Host "上傳包完成：$dest"
