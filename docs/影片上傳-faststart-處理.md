# 影片上傳前的 faststart 處理

自架影片（S3 + CloudFront）要能**秒開＋邊播邊下載**，上傳前每支 mp4 都要是 **faststart**。這份文件講為什麼、以及怎麼用 `scripts/faststart-videos.ps1` 一次搞定「檢查＋修復」。

---

## 一、為什麼要 faststart

mp4 裡有一塊叫 `moov` 的索引資料（記錄影片怎麼解碼、關鍵幀在哪）。

- `moov` 在**檔案前段** → 瀏覽器抓完開頭一小塊就能起播 = **秒開**（這就是 faststart）。
- `moov` 在**檔案最後**（很多剪輯／匯出工具的預設）→ 瀏覽器得把整支下載完才找得到索引 = **不會秒開**。

搭配 CloudFront 預設就有的 byte-range（可只抓開頭、可拖曳），只要檔案是 faststart，就能秒開又邊播邊下。

> ⚠️ **faststart 是「壓檔／匯出時」決定的，CloudFront 事後補不了。** 所以一定要在**上傳前**處理。

> ⚠️ CloudFront／S3 **只發檔、不轉檔、也不做多畫質(ABR)**。單一單畫質 mp4 轉成 HLS 也不會生出多畫質——多畫質要另外從高解析母帶用 ffmpeg／雲端服務預先烤。單畫質 mp4 就維持 mp4 + faststart 最省事。

---

## 二、前置：安裝 ffmpeg（只需一次）

PowerShell 貼一行：

```powershell
winget install Gyan.FFmpeg
```

裝完**關掉終端機再重開**，讓 PATH 生效。沒裝的話腳本會直接提示你。

---

## 三、用腳本一次「檢查＋修復」整個資料夾

腳本：`scripts/faststart-videos.ps1`

**它會做的事：**
1. 掃描你指定資料夾裡的所有影片（`.mp4` / `.mov` / `.m4v`，只掃該層、不進子資料夾）。
2. 自己讀每支的檔案結構判斷有沒有 faststart（這步不需要 ffmpeg）。
3. **已經是 faststart 的 → 跳過不動**；**沒有的 → 用 ffmpeg 無損重封裝修好、就地覆蓋原檔**（`-c copy`，不重壓、不掉畫質，只換 `moov` 的位置）。

**怎麼跑**（`-File` 後是腳本位置，最後參數是你的影片資料夾）：

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Bernard Liew\Documents\實踐大學\SCCD Website\scripts\faststart-videos.ps1" "D:\你的影片資料夾"
```

不帶資料夾參數則掃「目前所在資料夾」。

**輸出怎麼看：**

```
[OK]   a.mp4                    ← 已經 faststart，跳過
[修正] b.mp4 ...
       -> 已改成 faststart      ← 原本沒有，已就地修好
[修正] c.mp4 ...
       -> ffmpeg 失敗，原檔未動  ← 這支要另外查（少見）

完成：已是 faststart 5 支、修正 3 支、失敗 0 支
```

跑完，**整個資料夾就全部保證 faststart**，直接整包上傳 CloudFront。

---

## 四、注意事項

- **就地覆蓋**：修正是覆蓋原檔（只在 ffmpeg 成功時才覆蓋）。重封裝是無損的（內容一樣、只換 atom 順序），所以安全；但若你想保留原始檔，**跑之前先複製一份資料夾備份**。
- **只掃該層資料夾**，不會進子資料夾。影片分在多個子資料夾就各跑一次，或先集中到一個資料夾。
- **冪等**：對已 faststart 的檔再跑一次也無害（腳本會直接標 `[OK]` 跳過，根本不重寫）。

---

## 五、附錄：不想用腳本時的手動指令

**檢查單一支**是不是 faststart：

```powershell
ffmpeg -v trace -i 檔案.mp4 2>&1 | Select-String -Pattern 'moov','mdat' | Select-Object -First 2
```

先印出 `moov` = 已 faststart；先印出 `mdat` = 沒有，要修。

**修單一支**（無損）：

```powershell
ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4
```

**影片只有少少幾支、懶得檢查** → 全部都跑一次也行（產到 `faststart\` 子資料夾、原檔不動）：

```powershell
New-Item -ItemType Directory -Force faststart | Out-Null
Get-ChildItem *.mp4 | ForEach-Object {
  ffmpeg -y -i $_.FullName -c copy -movflags +faststart ("faststart\" + $_.Name)
}
```
