# 全站 icon / cursor 後台集中管理（Directus）

> 2026-09-13 已實作上線（後台 schema + 檔案已匯入；前台程式未 commit）。

## 後台結構

Directus 分類資料夾 **`site_assets`（全站圖示與游標）**，內含兩個 collection：

| collection | 內容 | 筆數 |
|---|---|---|
| `site_icons`（全站圖示） | `website-icons/` 全部根目錄 SVG：icon.css 的 40 顆 mask icon ＋ 6 支 /create 面板圖示 | 46 |
| `site_cursors`（滑鼠游標） | `custom-cursor/` 10 支 ＋ `Award_Icons/` 5 支 award 游標 | 15 |

欄位：`key`（檔名主幹，前台對照用，readonly 勿改）／`file`（SVG 上傳）／`note`（用途說明）／`sort`。
檔案實體集中在 Directus 檔案庫「全站圖示與游標」資料夾。Public read 已開。

**編輯者流程**：後台點該筆 → 換上傳 `file` → 前台重新整理即生效。換檔＝新 UUID，天然繞過 CDN 舊快取。
icon 請上傳**單色黑 SVG**（前台 CSS mask 上色）；cursor 熱點座標寫在前端程式，換圖維持相近圖形大小。

## 前台機制（本地檔即 fallback，免快照）

入口：`js/modules/ui/site-assets.js` 的 `initSiteAssets()`（`main-modular.js` DOMContentLoaded 跑一次）。

1. fetch 兩個 collection（8s abort；失敗/空＝靜默 return → 本地 SVG 照常）
2. 組 `localPath → CDN URL` 對照塞 `window.__SCCD_ASSET_OVERRIDES`
3. **CSS icon**：掃現有 stylesheet 找 `--icon: url(...website-icons/X.svg)` 規則，產同 selector 覆蓋規則塞 `<style id="site-assets-override">`（head 尾＝output.css 之後、cascade 勝）。不手寫 class↔檔名對照，icon.css 新增自動跟上
4. **JS 端路徑**：`sitePath()` 是唯一咽喉點（cursor 全部呼叫點／create 面板圖示／award 游標），兩份實作（`js/utils/helpers.js`、`js/modules/ui/site-base.js`）都先查覆蓋對照
5. `Helpers.refreshCursorVars()` 重建 `--cursor-*` 變數（hotspot/fallback 不變，只換 URL）

## 匯入／維護腳本

- `scripts/build-site-assets.cjs`：建資料夾 + 兩 collection + Public read（idempotent，`--dry`）
- `scripts/import-site-assets.cjs`：parse icon.css 抽對照 + 掃目錄 → 上傳 SVG + 建 items（key 已存在 skip，可重跑；**新增 icon 檔後重跑一次即補上後台**）

## 已驗證（2026-09-13 headless）

- CDN（CloudFront）帶 Origin 回 `Access-Control-Allow-Origin: *`；瀏覽器 CORS fetch 200
- `.icon-*` computed `--icon`＝CDN URL，mask 實際渲染截圖正常（search/menu/mode1-3/share/arrow/play）
- `--cursor-pointer` 變數＝CDN URL + 原 hotspot；award 游標 sitePath＝CDN
- 擋掉 CMS：無注入、全部回本地檔

## 順帶項（另案，未做）

- FA 全站其實只剩 3 顆真用（`mode-color-panel.js` 鉛筆、`video-player.js` compress、`mobile-menu.js` chevron）——補 3 支 SVG 進系統即可讓 16+ 頁 `<head>` 退租 FA CDN
