<#
  掃描資料夾內所有影片，檢查是否 faststart（moov atom 在檔案前段＝可秒開/邊播邊下），
  只對「不是 faststart」的檔案做無損重封裝修正（-c copy，不重壓、不掉畫質）。

  用法：
    .\faststart-videos.ps1              # 掃目前資料夾
    .\faststart-videos.ps1 "D:\影片"    # 掃指定資料夾

  前置：需先安裝 ffmpeg —— winget install Gyan.FFmpeg（裝完重開終端機讓 PATH 生效）
#>

param([string]$Dir = ".")

# faststart 判定不需要 ffmpeg：直接讀 mp4/mov 的頂層 box 順序。
# box header = 4 bytes 大端 size + 4 bytes type；逐個頂層 box 跳，先遇到 moov＝faststart、先遇到 mdat＝不是。
# （為何自己讀不靠 ffmpeg：ffmpeg 沒有直接回報 moov 位置的旗標，parse trace 輸出脆弱又慢）
function Test-Faststart {
    param([string]$Path)
    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $len = $fs.Length
        $pos = [int64]0
        while ($pos -lt $len) {
            $fs.Position = $pos
            $hdr = New-Object byte[] 8
            if ($fs.Read($hdr, 0, 8) -lt 8) { break }
            $size = ([int64]$hdr[0] -shl 24) -bor ([int64]$hdr[1] -shl 16) -bor ([int64]$hdr[2] -shl 8) -bor [int64]$hdr[3]
            $type = [System.Text.Encoding]::ASCII.GetString($hdr, 4, 4)
            if ($type -eq 'moov') { return $true }
            if ($type -eq 'mdat') { return $false }
            if ($size -eq 1) {
                # 64-bit largesize（超大檔的 mdat 常見）：size 藏在後 8 bytes
                $big = New-Object byte[] 8
                $fs.Read($big, 0, 8) | Out-Null
                $size = [int64]0
                for ($i = 0; $i -lt 8; $i++) { $size = ($size -shl 8) -bor [int64]$big[$i] }
            } elseif ($size -eq 0) {
                break   # box 一路到檔尾，前面沒出現 moov
            }
            if ($size -lt 8) { break }   # 壞 box 防護：避免 0/負值造成死迴圈
            $pos += $size
        }
        return $false   # mdat 前沒找到 moov → 保守當非 faststart
    } finally { $fs.Close() }
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "找不到 ffmpeg。請先安裝：winget install Gyan.FFmpeg（裝完重開終端機）" -ForegroundColor Red
    return
}

$vids = Get-ChildItem -Path $Dir -File | Where-Object { $_.Extension -in '.mp4', '.mov', '.m4v' }
if (-not $vids) { Write-Host "資料夾內沒有影片檔（.mp4/.mov/.m4v）：$Dir" -ForegroundColor Yellow; return }

$fixed = 0; $ok = 0; $failed = 0
foreach ($v in $vids) {
    if (Test-Faststart $v.FullName) {
        Write-Host ("[OK]   {0}" -f $v.Name) -ForegroundColor Green
        $ok++
        continue
    }
    Write-Host ("[修正] {0} ..." -f $v.Name) -ForegroundColor Yellow
    $tmp = Join-Path $v.DirectoryName ($v.BaseName + ".faststart.tmp" + $v.Extension)
    & ffmpeg -v error -y -i $v.FullName -c copy -movflags +faststart $tmp
    # ponytail: 成功才就地覆蓋原檔（重封裝無損＝內容相同、只換 atom 順序，故覆蓋安全）；失敗保留原檔
    if ($LASTEXITCODE -eq 0 -and (Test-Path $tmp)) {
        Move-Item -Force $tmp $v.FullName
        Write-Host ("       -> 已改成 faststart") -ForegroundColor Green
        $fixed++
    } else {
        if (Test-Path $tmp) { Remove-Item $tmp -Force }
        Write-Host ("       -> ffmpeg 失敗，原檔未動") -ForegroundColor Red
        $failed++
    }
}
Write-Host ("`n完成：已是 faststart {0} 支、修正 {1} 支、失敗 {2} 支" -f $ok, $fixed, $failed) -ForegroundColor Cyan
