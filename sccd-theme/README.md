# SCCD Theme PoC

Schema-driven WP theme：CPT + CMB2 form + REST endpoint + WP-CLI import 全部從 `schemas/*.json` 自動衍生。

## 架構

```
schemas/courses.json   ←── 唯一要維護的 schema
        │
        ├─→ inc/cpt.php             register_post_type 動態註冊 CPT
        ├─→ inc/cmb2-register.php   動態註冊 CMB2 form fields
        ├─→ inc/rest.php            /wp-json/sccd/v1/courses endpoint
        └─→ inc/cli.php             wp sccd import 命令灌資料
```

改 schema 一處 = 後台 form / endpoint / import 三邊同步。

## PoC 安裝步驟（LocalWP）

1. **裝 LocalWP**：https://localwp.com/ → Create a new site → 起一個 WP 站
2. **裝 CMB2 plugin**：WP 後台 → Plugins → Add New → 搜 "CMB2" → Install → Activate
3. **裝這個 theme**：把整個 `sccd-theme/` 資料夾**複製或 symlink** 到 LocalWP site 的 `wp-content/themes/sccd-theme/`
   - Windows symlink (PowerShell as admin)：`New-Item -ItemType SymbolicLink -Path "<LocalWP-site>/app/public/wp-content/themes/sccd-theme" -Target "<SCCD-Website>/sccd-theme"`
4. **啟用 theme**：WP 後台 → Appearance → Themes → Activate "SCCD Theme"
5. **檢查後台**：左側選單應該看到「課程 Courses」CPT
6. **手動新增測試**：Courses → Add New → 看 form 欄位是否齊全（學制/年級/學期/類型/中英標題/中英說明）

## 一次性灌入 Excel 資料

```bash
# 1. 先在專案根目錄跑 parser 產 JSON
cd <SCCD-Website>
node scripts/parse-courses.js

# 2. 在 LocalWP 開 site shell（Open site shell）
cd wp-content/themes/sccd-theme
wp sccd import courses --reset
```

## 驗證 endpoint

```bash
curl http://<your-localwp-site>/wp-json/sccd/v1/courses
```

應該吐出跟 `data-source/output/courses.json` 一樣 shape 的 JSON。

## 加新 CPT（未來）

1. 寫 `schemas/<name>.json`
2. 寫 parser `scripts/parse-<name>.js` 產出 `data-source/output/<name>.json`
3. 跑 `wp sccd import <name>`

不用改 PHP code。
