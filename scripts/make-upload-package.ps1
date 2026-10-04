# 產生 S3 上傳包：先 build CSS，再把前台需要的檔案鏡像到「../SCCD-上傳包」
# 用法：右鍵此檔 →「使用 PowerShell 執行」，或在專案根目錄跑 powershell scripts/make-upload-package.ps1
$src  = Split-Path $PSScriptRoot -Parent
$dest = Join-Path (Split-Path $src -Parent) 'SCCD-上傳包'

Push-Location $src
# 先把後台 icon／游標拉成本地 fallback：部署出去的本地檔＝後台最新，開頁不會先閃舊圖（user 2026-10-02）
node scripts/pull-site-assets.cjs
npm run build:css
Pop-Location

$dirs = 'pages','css','js','images','assets','data','generate-app','custom-cursor','website-icons'
foreach ($d in $dirs) {
  # /MIR 鏡像：來源刪了的檔案，上傳包也會跟著刪，保持乾淨
  # /XF *.mp4：影片一律走 HLS CloudFront，本機原始 mp4（images/ 內，gitignore）不上 S3
  robocopy (Join-Path $src $d) (Join-Path $dest $d) /MIR /XF *.mp4 /NFL /NDL /NJH /NJS | Out-Null
}
Copy-Item (Join-Path $src 'index.html') $dest -Force

# 壓縮上傳包內的 JS / CSS / JSON（只動上傳包拷貝、repo 原始碼不變；失敗的檔保留原樣）
node (Join-Path $src 'scripts/minify-package.cjs') $dest

Write-Host "上傳包完成：$dest"
