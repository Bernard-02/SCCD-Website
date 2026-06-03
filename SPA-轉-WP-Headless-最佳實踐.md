# SPA → WordPress Headless 最佳實踐

> **這份是上 WP 時的權威文件**。任何上傳 WP 的工作都以此為主，不要憑記憶或從零想架構。
> 最後更新：2026-06-02 / 作者：基於 sccd-theme/ 現況審計

---

## 0. 一頁版心智模型

**整個系統長這樣**：

```
┌────────────────────────────────────────────────────────────────┐
│  Lightsail (Bitnami WordPress blueprint)                       │
│                                                                │
│  ┌──────────────────────┐         ┌────────────────────────┐  │
│  │ WordPress 後台       │  寫     │ MySQL DB               │  │
│  │ /wp-admin            │ ──────► │ wp_posts / wp_postmeta │  │
│  │ (老師登入改文案)     │         │                        │  │
│  │ CMB2 表單            │         │                        │  │
│  └──────────────────────┘         └──────────┬─────────────┘  │
│                                              │ 讀             │
│  ┌──────────────────────┐                    ▼                │
│  │ SCCD SPA (前台)      │       ┌──────────────────────────┐ │
│  │ /index.html          │  ◄──  │ REST endpoint            │ │
│  │ router.js            │ JSON  │ /wp-json/sccd/v1/<name>  │ │
│  │ 16 data loaders      │       │ (inc/rest.php)           │ │
│  └──────────────────────┘       └──────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**4 個鐵則**：

1. **WP 永遠不渲染前台 HTML**。WP 唯一吐東西的對外口 = `/wp-admin`（給後台人員）+ `/wp-json/sccd/v1/*`（給 SPA 拿 JSON）。
2. **SPA router 100% 由 [js/router.js](js/router.js) 管**。WP 完全不管路由，不要碰 permalinks 也不要寫 page template。
3. **schema-driven**：[sccd-theme/schemas/*.json](sccd-theme/schemas/) 是 single source of truth。CPT / CMB2 / REST endpoint / WP-CLI import 全部自動 derive，絕對不要在 PHP 內手刻 CPT 或欄位。
4. **schema 改、PHP 不改**。新增欄位、改 label、加新 CPT — 都只動 schemas/*.json，不要動 [inc/cpt.php](sccd-theme/inc/cpt.php) / [inc/cmb2-register.php](sccd-theme/inc/cmb2-register.php) / [inc/rest.php](sccd-theme/inc/rest.php)。

---

## 1. 為什麼是 headless 不是傳統 WP theme

### 傳統 WP 跟 SCCD SPA 衝突的 5 個點

5/29 hack WP theme 路線就是踩這 5 個雷被否決：

1. **路由衝突**：WP 把 SPA 的 `<a href="/pages/about.html">` 當 WP 路由解 → 404 或 redirect 到 wp-admin
2. **fetch base URL 飄移**：SPA `fetch('data/news.json')` 相對路徑 — WP theme 的 base 不是 SPA 想的目錄，要寫 v1→v6 修補 8 處 `<base href>` + `window.SCCD_THEME_URL`
3. **wpautop 吃 HTML**：WP 自動塞 `<p>` 包 SPA element 破壞 layout
4. **wp_head / wp_footer 污染**：admin bar / customize-preview.js / emoji script 混進 SPA 殼
5. **trailing slash 不一致**：`/about` vs `/about/` WP 全 redirect，SPA route 對應不上

### Headless 模式怎麼避開

**WP 跟 SPA 是兩條完全獨立路徑**：

| URL pattern | 由誰處理 | 內容 |
|---|---|---|
| `/`、`/pages/*` | Apache → `index.html` → SPA router | SPA 前台 |
| `/wp-admin/*` | WP PHP | WP 原生後台（給老師） |
| `/wp-json/sccd/v1/*` | WP REST API | JSON 資料給 SPA fetch |
| `/wp-content/uploads/*` | Apache | WP 上傳的圖片/影片（SPA 直接 `<img src>` 引用） |

唯一接觸面 = SPA 的 16 個 data loader 從 `fetch('/data/X.json')` 改成 `fetch('/wp-json/sccd/v1/X')`。

**hack 路線（v1→v6）累積的 `<base href>` / `window.SCCD_THEME_URL` 注入全部丟掉**，headless 用相對 / absolute path 跟本地一致。

---

## 2. Lightsail 環境基本盤

### 既有狀態（2026-05-29 確認）

- **Lightsail Bitnami WordPress blueprint**（IT 已預裝，不重建 instance）
- **Web root**：`/opt/bitnami/wordpress/`（vhost DocumentRoot 指這裡，**不是** `/opt/bitnami/apache/htdocs/`）— 用 `sudo grep -r "DocumentRoot" /opt/bitnami/apache2/conf/` 重驗
- **連線**：SSH（學校 SSLVPN → Lightsail firewall 鎖 22 port 來源 IP）+ WinSCP（SFTP）
- **使用者**：`bitnami` + Lightsail 下載的 `.pem` 金鑰

### Apache 必須開的設定

`.htaccess` 才會被吃，sccd-theme 倚賴它做 SPA fallback：

```bash
# SSH 進去檢查
sudo grep -i "AllowOverride" /opt/bitnami/apache2/conf/bitnami/bitnami.conf
# 看到 AllowOverride None 要改 All
sudo nano /opt/bitnami/apache2/conf/bitnami/bitnami.conf
# 改完 restart
sudo /opt/bitnami/ctlscript.sh restart apache
```

### SPA + WP 共存的目錄佈局

```
/opt/bitnami/wordpress/
├── index.html                    ← SCCD SPA 進入點（優先於 index.php）
├── pages/                        ← SPA 各內頁
├── js/ css/ data/ images/        ← SPA assets
├── generate-app/                 ← p5 generator
├── website-icons/                ← rename 後（lowercase + hyphen）
├── custom-cursor/                ← rename 後
├── .htaccess                     ← SPA fallback + WP 既有規則並存
├── wp-admin/                     ← WP 後台（不動）
├── wp-includes/                  ← WP 核心（不動）
├── wp-content/
│   ├── themes/sccd-theme/        ← 從專案 sccd-theme/ 上傳
│   ├── plugins/cmb2/             ← 從 Plugins → Add New 裝
│   └── uploads/                  ← 老師後台上傳的圖/影片
└── wp-config.php                 ← WP 連 DB 設定（不動）
```

**關鍵**：`index.html` 跟 WP 共存。Apache `DirectoryIndex` 預設 `index.html` 在 `index.php` 之前，所以訪問 `/` 自動走 SPA；訪問 `/wp-admin/` 仍走 WP。

### .htaccess

完整檔放 web root，**不要動 WP 自己那段 BEGIN/END WordPress block**，只在前面加 SPA fallback：

```apache
# === SCCD SPA fallback (必須在 WP 之前) ===
<IfModule mod_rewrite.c>
  RewriteEngine On

  # 已存在的檔案/目錄 → 直接 serve（含 wp-admin、wp-content/uploads、SPA assets）
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # WP 後台 / REST API / WP 核心路徑 → 交給 WP
  RewriteRule ^wp-admin($|/) - [L]
  RewriteRule ^wp-login\.php - [L]
  RewriteRule ^wp-json($|/) - [L]
  RewriteRule ^wp-content($|/) - [L]
  RewriteRule ^wp-includes($|/) - [L]

  # 其他全部 → SPA index.html
  RewriteRule ^ /index.html [L]
</IfModule>

# === WP 既有 block 保留在下面（WP 安裝時自動產的，不動）===
# BEGIN WordPress
# ...
# END WordPress
```

---

## 3. sccd-theme 架構（已寫好的不要重寫）

### 檔案職責

| 檔 | 職責 | 改不改 |
|---|---|---|
| [functions.php](sccd-theme/functions.php) | 載入 inc/* 模組 + 檢查 CMB2 plugin 是否裝 | 加新 inc/*.php 才動 |
| [inc/schema-loader.php](sccd-theme/inc/schema-loader.php) | 讀 schemas/*.json → cache → 給其他模組用 | **不要動** |
| [inc/cpt.php](sccd-theme/inc/cpt.php) | 從 schema 自動 register CPT + 後台 menu group + max_posts 限制 | **不要動** |
| [inc/cmb2-register.php](sccd-theme/inc/cmb2-register.php) | 從 schema 自動產 CMB2 metabox + 處理 type 對應（image/video/wysiwyg/country/year/...） | 加新 field type 才動 |
| [inc/rest.php](sccd-theme/inc/rest.php) | 從 schema 自動 register REST endpoint `/wp-json/sccd/v1/<name>` | **不要動** |
| [inc/cli.php](sccd-theme/inc/cli.php) | `wp sccd import` WP-CLI command（灌 JSON 進 DB） | **不要動** |
| [inc/admin-columns.php](sccd-theme/inc/admin-columns.php) | 後台 list 頁的欄位顯示 | 改 list 頁顯示才動 |
| [inc/post-title-template.php](sccd-theme/inc/post-title-template.php) | post_title 預設模板 | 改 default 才動 |
| schemas/*.json | **資料定義單一來源** | 改欄位、加 CPT 都改這 |

### Schema JSON 格式（必懂）

範例：[sccd-theme/schemas/faculty-fulltime.json](sccd-theme/schemas/faculty-fulltime.json)

```json
{
  "cpt": "faculty_fulltime",        ← CPT slug (≤20 chars, WP 硬限制)
  "endpoint": "faculty-fulltime",   ← REST endpoint name → /wp-json/sccd/v1/faculty-fulltime
  "menu_order": 1,                  ← 後台 menu 排序
  "labels": { ... },                ← 後台介面文字
  "menu_group": {                   ← 多個 CPT 收進同個 parent menu
    "slug": "sccd-faculty",
    "label": "師資 Faculty",
    "icon": "dashicons-groups",
    "position": 30.3
  },
  "menu_icon": "dashicons-businessperson",
  "supports": ["title"],            ← WP 內建欄位支援（"title" / "editor" / "thumbnail" / ...）
  "max_posts": 50,                  ← 上限（達到後台 hide「新增」）— 可選
  "singleton": false,               ← 是否唯一（true = endpoint 吐 object 不是 array）— 可選
  "serialize_dict_key": "id",       ← 把 array 重組成 dict by 該 field — 可選
  "fields": [                       ← CMB2 自訂欄位
    {
      "id": "nameEn",
      "name": "姓名（英）",
      "type": "text"
    },
    {
      "id": "titles",
      "name": "職稱（可加多筆）",
      "type": "group",              ← repeater
      "item_label": "職稱",
      "fields": [                   ← group 內子欄位
        { "id": "titleEn", "name": "職稱（英）", "type": "text" },
        { "id": "titleZh", "name": "職稱（中）", "type": "text" }
      ]
    }
  ]
}
```

### 支援的 field type（[inc/cmb2-register.php:52-139](sccd-theme/inc/cmb2-register.php)）

| schema type | CMB2 type | 用途 |
|---|---|---|
| `text` | text | 單行文字 |
| `textarea` | textarea_small | 多行文字（小） |
| `wysiwyg` | wysiwyg | 富文本（TinyMCE） |
| `image` | file (image only) | 單張圖片上傳 |
| `image_list` | file_list (image) | 多張圖片（sortable） |
| `video` | file (video only) | 單個影片 |
| `video_list` | file_list (video) | 多個影片 |
| `file` | file (any mime) | 不限 mime（PDF / docx / zip） |
| `country` | select | ISO 3166-1 alpha-2 國家下拉（emoji flag preview） |
| `year` / `month` / `day` | select | 年/月/日下拉 |
| `group` | group | repeater（內部用 `fields` 子欄位） |
| 其他 | 直接 pass 給 CMB2 | select / radio / checkbox / file / colorpicker / 等原生 CMB2 type |

新增 field type → 改 [inc/cmb2-register.php](sccd-theme/inc/cmb2-register.php) 內 `sccd_build_field_args` 的 switch。

---

## 4. 上傳 WP 的完整流程

### Phase 0：前置（一次性）

#### 0.1 確認本機 sccd-theme/ 是最新

```bash
ls sccd-theme/schemas/         # 應該 38 個 .json
ls sccd-theme/inc/             # 應該 7 個 .php
cat sccd-theme/style.css       # 確認有 WP theme header（Theme Name 等）
```

#### 0.2 確認 schemas 對應到實際 data/ JSON

每個 `sccd-theme/schemas/<name>.json` 應該有對應 `data/<name>.json` 或 `data/<*>.json` 拆分檔。對應表（schema → data 來源）整理一份：

```bash
# 列出 schemas
ls sccd-theme/schemas/

# 對應 data/
ls data/
```

對應**不一致**的情況（之前已知）：
- `faculty.json` → 拆 schema `faculty-fulltime` / `faculty-parttime` / `faculty-admin`（前端 filter by `type`）
- 改 SPA data loader 時要把 fetch 3 個 endpoint 後 merge 回 array，或在 endpoint 端 unify

### Phase 1：本機 staging 驗證（強烈建議，跳過會踩 production 雷）

5/29 部署策略文件（`reference_wp_deployment_strategy_plan.md`）強調**「本地寫 = production 開」靠 staging 驗證**。

#### 1.1 LocalWP（或 Docker WP）跑一份本機 WP

- 安裝 LocalWP（free）→ 建一個 site → 拿到 wp-admin URL
- 把 `sccd-theme/` 整包丟進 LocalWP 的 `wp-content/themes/sccd-theme/`
- 從 LocalWP 後台 → Appearance → Themes → Activate
- 從 Plugins → Add New 搜「CMB2」→ Install + Activate

#### 1.2 確認後台 menu 出現

- 重整 wp-admin
- 左側 menu 應該看到（依 `menu_group.position` 排序）：
  - **首頁 Index**（30.1）
  - **師資 Faculty**（30.3）
  - **About** / **Activities** / **Admission** / **Library** / **Atlas** / ...
- 點進去任一個 → 看到 CMB2 表單 = 成功

#### 1.3 跑 import CLI 灌測試資料

```bash
# 在 LocalWP 內開 Site Shell（LocalWP 右上角 → Open Site Shell）
wp sccd import                   # import 全部 schemas
wp sccd import faculty-fulltime  # 或只 import 單一
wp sccd import courses --reset   # 先刪光該 CPT 再 import
```

**注意**：`inc/cli.php:44` import 從 `data-source/output/<endpoint>.json` 讀，**不是** `data/<name>.json`。要先確認 `data-source/output/` 內檔案存在（這是 parser 從 `data/*.json` 轉成 schema-aligned shape 的中間檔）。

#### 1.4 測 REST endpoint 回得出 JSON

```bash
curl http://localhost:10003/wp-json/sccd/v1/faculty-fulltime
curl http://localhost:10003/wp-json/sccd/v1/index-news
```

回得出 JSON array / object = 成功。

#### 1.5 本機 SPA 連 LocalWP 測一條 data loader

挑最簡單的（例如 `support-data-loader.js`）暫時改：

```js
// 原本
const response = await fetch('/data/support.json');

// 改成
const response = await fetch('http://localhost:10003/wp-json/sccd/v1/support');
```

跑 SCCD SPA local server → 開 /support 頁 → 看資料有沒有正確渲染。

**OK 後改回原本路徑**（這只是驗證 endpoint）。真正切換在 Phase 3。

### Phase 2：上傳 Lightsail WP

#### 2.1 打 sccd-theme zip（必用 Python，**不要** PowerShell Compress-Archive）

```bash
# 在專案根
python -c "
import zipfile, os
root = 'sccd-theme'
with zipfile.ZipFile('sccd-theme.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirs, files in os.walk(root):
        for f in files:
            full = os.path.join(dirpath, f)
            arc = os.path.relpath(full, '.').replace(os.sep, '/')
            z.write(full, arc)
print('done')
"
```

PowerShell `Compress-Archive` 會把 `\` 寫進 zip header，WP `ZipArchive` 解出 `sccd-theme\style.css` 找不到 → 報「missing style.css」。

#### 2.2 確認 zip 內分隔符

```bash
python -c "import zipfile; print(zipfile.ZipFile('sccd-theme.zip').namelist()[:5])"
# 看到的應該是 'sccd-theme/style.css' 不是 'sccd-theme\\style.css'
```

#### 2.3 上傳 + Activate

1. WinSCP 上傳 `sccd-theme.zip` 到 `/tmp/`（或本機留著）
2. 瀏覽器開 `http://<lightsail-ip>/wp-admin` 登入
3. Appearance → Themes → Add New → Upload Theme → 選 `sccd-theme.zip` → Install Now → Activate
4. Plugins → Add New → 搜「CMB2」→ Install Now → Activate
5. 重整 wp-admin → 確認左側 menu 出現 SCCD 各 CPT

#### 2.4 用 WP-CLI 灌資料

SSH 進 Lightsail：

```bash
ssh -i ~/Downloads/LightsailDefaultKey.pem bitnami@<lightsail-ip>
cd /opt/bitnami/wordpress

# 確認 WP-CLI 裝了（Bitnami 預設裝）
wp --info

# 把 data-source/output/*.json 也傳上來
# WinSCP 同步 data-source/output/ → /opt/bitnami/wordpress/data-source/output/

# 跑 import
sudo wp sccd import --allow-root
# 看到 Imported X faculty_fulltime posts 等訊息 = 成功
```

#### 2.5 測 production REST endpoint

```bash
curl http://<lightsail-ip>/wp-json/sccd/v1/faculty-fulltime
curl http://<lightsail-ip>/wp-json/sccd/v1/index-news
```

### Phase 3：切換 SPA data loader

#### 3.1 全域 fetch base URL 抽常數

新建 [js/config/api.js](js/config/api.js)：

```js
// 唯一 WP REST base URL 注入點
// 改路線（換 host / 加 staging / 回 static JSON）只動這裡
export const WP_API_BASE = '/wp-json/sccd/v1';
// 開發時 local SPA + production WP 跨域 → 改成完整 URL
// export const WP_API_BASE = 'http://localhost:10003/wp-json/sccd/v1';
```

#### 3.2 改 16 個 data loader

每個 loader 一個 PR 漸進改，**不要 16 個一次 commit**。

範例 [js/modules/pages/faculty-data-loader.js:11-13](js/modules/pages/faculty-data-loader.js):

```js
// 原本
export async function loadFacultyData() {
  try {
    const response = await fetch('/data/faculty.json');
    const data = await response.json();
    // ...

// 改成（faculty 特殊，因為 schema 拆三個）
import { WP_API_BASE } from '../../config/api.js';

export async function loadFacultyData() {
  try {
    const [ft, pt, ad] = await Promise.all([
      fetch(`${WP_API_BASE}/faculty-fulltime`).then(r => r.json()),
      fetch(`${WP_API_BASE}/faculty-parttime`).then(r => r.json()),
      fetch(`${WP_API_BASE}/faculty-admin`).then(r => r.json()),
    ]);
    // 補回 type field（前端 filter 還在用）+ merge
    const data = [
      ...ft.map(x => ({ ...x, type: 'fulltime' })),
      ...pt.map(x => ({ ...x, type: 'parttime' })),
      ...ad.map(x => ({ ...x, type: 'admin' })),
    ];
    // ... 後面渲染邏輯不變
```

簡單情況（schema 1:1 對應 data/X.json）：

```js
// 原本
const response = await fetch('/data/support.json');

// 改成
import { WP_API_BASE } from '../../config/api.js';
const response = await fetch(`${WP_API_BASE}/support`);
```

#### 3.3 圖片 URL 處理

CMB2 image / image_list / file 欄位存的是 **attachment URL 字串**（不是 ID），格式：
```
http://<lightsail-ip>/wp-content/uploads/2026/06/photo.jpg
```

SPA 不需要改 `<img src>` 邏輯，直接用回傳值即可。

**注意**：如果 SPA 跨域跑（dev 本機 SPA fetch production WP），`<img>` 不受 CORS 影響但會看到 production 圖；不要混亂以為是 bug。

#### 3.4 一個 loader 改完 → 完整測該頁

- 桌面 / 手機 / mode-1/2/3 全測
- 老師後台改一筆資料 → SPA 重整應該看到新資料

### Phase 4：產品化收尾

#### 4.1 縮 CORS

[inc/rest.php:9-16](sccd-theme/inc/rest.php) 寫死 `Access-Control-Allow-Origin: *` 是 PoC 期 — production 改成：

```php
add_filter('rest_pre_serve_request', function ($value) {
    $allowed = ['https://sccd.usc.edu.tw', 'https://www.sccd.usc.edu.tw'];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowed)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, OPTIONS');
    }
    return $value;
});
```

但**如果 SPA + WP 同 origin**（都在 lightsail-ip 下 / 同網域），根本不需要 CORS header，整段可以拔。

#### 4.2 Bundle CMB2 進 vendor/（避免老師誤刪 plugin）

```bash
# 下載 CMB2 latest
cd sccd-theme/
mkdir -p vendor
cd vendor
git clone https://github.com/CMB2/CMB2.git cmb2
# 或 wget release tarball
```

改 [functions.php](sccd-theme/functions.php)：

```php
// 取代「假設 user 已裝 CMB2 plugin」的 admin_notices block
if (file_exists(SCCD_THEME_DIR . '/vendor/cmb2/init.php')) {
    require_once SCCD_THEME_DIR . '/vendor/cmb2/init.php';
}
```

這樣老師就算誤把 CMB2 plugin disable 也不影響後台。

#### 4.3 static JSON fallback（可選）

如果擔心 WP API 偶爾掛（例如 WP 升級失敗），可在 data loader 加 fallback：

```js
let data;
try {
    const r = await fetch(`${WP_API_BASE}/support`);
    if (!r.ok) throw new Error('REST fail');
    data = await r.json();
} catch {
    // fallback 到打包進 static JSON（git 內仍保留一份做 snapshot）
    data = await fetch('/data/support.json').then(r => r.json());
}
```

**Trade-off**：fallback JSON 會過期，老師後台改了不會反映。只給「絕對不能 down」的關鍵頁用（首頁 / 招生）。一般頁可省。

---

## 5. 給「後人/老師」的後台教學重點

寫一份 **`給老師看的-後台使用手冊.md`** 放專案 root，內容簡化：

### 必備教學項

1. **登入**：`http://sccd.tw/wp-admin` 帳號密碼
2. **修改文字內容**：
   - 範例：首頁跑馬燈 → 左側 menu「首頁 Index」→ 點「首頁消息」→ 找到那筆 → 改「跑馬燈文字」欄位 → 按右側「更新」按鈕
3. **上傳圖片**：
   - 任何欄位寫「照片」「海報」「圖片」等 → 點該欄位的「選擇 / 上傳圖片」→ Media Library 跳出 → 拖檔上傳 / 從既有圖庫挑 → 「Insert」
4. **新增一筆**：
   - 例如新增 News → 左側 menu「首頁 Index」→「新增消息」→ 填表 → 「發佈」
5. **刪除**：
   - 列表頁 hover 該筆 → 「移至回收桶」
6. **回收桶恢復**：
   - 列表頁上方 tab「Trash」→ Restore
7. **不要做的事**：
   - 不要動「Appearance → Themes」（會破壞前台）
   - 不要動「Plugins」（會破壞後台表單）
   - 不要動「Settings → Permalinks」（會破壞 REST endpoint URL）
   - 不要新增超過 max_posts 上限的 CPT（會 hide「新增」按鈕，表示該類別已滿）

### 一個 PDF + 一段截錄影片

老師看文字會跳行，**建議錄 5 分鐘螢幕影片**示範一遍（登入 → 改一筆 → 看前台變化），比 markdown 強 10 倍。

---

## 6. 已知陷阱（踩過的雷整理）

### 6.1 zip 分隔符（5/28 踩過）

PowerShell Compress-Archive 把 `\` 寫進 zip header → WP 解 zip 報「missing style.css」。**必用 Python zipfile**，見 Phase 2.1。

### 6.2 asset 路徑空格 / 大寫（5/29 踩過）

`Website Icons/` 等含空格大寫資料夾在 Linux Apache 下載不到 → 已 rename `website-icons/` + `huashan-floating/`。新增 asset 一律 lowercase + hyphen。

### 6.3 CPT slug ≤ 20 chars（WP 硬限）

WP `register_post_type` slug 超過 20 chars silent fail。[inc/cpt.php:12-19](sccd-theme/inc/cpt.php) 已加 admin_notices warning。新增 schema 時 `cpt` 欄位先數字數。

### 6.4 schema endpoint 跟 data/X.json 命名對不齊

- schema `faculty-fulltime` → endpoint `/wp-json/sccd/v1/faculty-fulltime` → 但對應 `data/faculty.json`（filter by type）
- 改 SPA data loader 時要特別處理

對應表（要在 Phase 0.2 整理一份）：

| Schema | Endpoint | 對應 data/*.json | 備註 |
|---|---|---|---|
| faculty-fulltime | faculty-fulltime | faculty.json (filter type=fulltime) | 拆三個 |
| faculty-parttime | faculty-parttime | faculty.json (filter type=parttime) | 拆三個 |
| faculty-admin | faculty-admin | faculty.json (filter type=admin) | 拆三個 |
| index-news | index-news | news.json | 1:1 |
| activities-* | activities-* | general-activities.json / workshops.json / lectures.json / industry.json | 多對多 |
| library-* | library-* | library.json (分 panel) | 多對多 |
| ... | ... | ... | 上傳前先全部列完 |

### 6.5 vhost DocumentRoot 不是 htdocs（5/29 確診）

Bitnami WP blueprint 真正 web root = `/opt/bitnami/wordpress/`（vhost 指這），**不是** `/opt/bitnami/apache/htdocs/`。傳檔案進 htdocs 等於沒上線。

```bash
sudo grep -r "DocumentRoot" /opt/bitnami/apache2/conf/
```

### 6.6 admin bar 跑進 SPA 殼

如果登入 wp-admin 後再切去前台，WP 預設會在前台插 admin bar 黑條 → 破壞 SPA layout。

修法：[functions.php](sccd-theme/functions.php) 加：

```php
add_filter('show_admin_bar', '__return_false');
```

或者 SPA 完全不渲染 WP 的東西（headless 模式下 admin bar 注入的是 PHP 模板，不會出現在 `index.html` 上）— 但如果有人從 wp-admin 點「View Site」按鈕進來，那條 URL 走 WP 渲染就會有 admin bar。建議加 filter 杜絕。

### 6.7 image 欄位存 URL 不存 attachment ID

[inc/cmb2-register.php:68-73](sccd-theme/inc/cmb2-register.php) 的 `image` 型別目前存 URL 字串（CMB2 `file` type 預設）。**好處**：SPA 直接 `<img src>` 用；**壞處**：圖片改 URL（搬 host / 改 CDN）後 DB 內 URL 全失效。

`reference_wp_deployment_strategy_plan.md` 提過「正式版 D」應改存 attachment ID — 目前 PoC 階段先 URL，未來搬 host 前必須改。

---

## 7. 變更管理

### 加新 CPT

1. 在 `sccd-theme/schemas/` 新增 `<name>.json`（複製既有 schema 改）
2. 重整 wp-admin → 自動出現新 menu / metabox
3. 若需要新 field type → 改 [inc/cmb2-register.php](sccd-theme/inc/cmb2-register.php)
4. 前端加對應 data loader（複製既有改）

### 改 schema（加欄位 / 改 label）

1. 改 `schemas/<name>.json`
2. 重整 wp-admin → 即時生效，**不需重啟**
3. 已存資料：欄位若是 `add only`（新增的欄位）→ 舊資料 meta 內沒有該 key → 前端 fallback `''`/`undefined`；欄位若是 `rename`（改 id）→ 舊 meta 仍存舊 key → 寫 migration 改 meta key 或前端兩個 key 都讀

### 修 WP 版升級破壞

WP 升級偶爾會改 hook 行為。如果升級後 sccd-theme 異常：

1. 看 `error_log`（`/opt/bitnami/wordpress/wp-content/debug.log` 如果有開 WP_DEBUG）
2. 翻 CMB2 changelog 看有沒有 breaking change
3. 必要時 WP downgrade（Bitnami 有版本回滾）

---

## 8. 不要做的事（總結）

### 架構層

- ❌ **不要走傳統 WP theme**（讓 WP 渲染前台 HTML）— 5/29 已踩雷否決
- ❌ **不要保留 hack v1→v6 的 `<base href>` / `window.SCCD_THEME_URL`** — headless 完全不需要
- ❌ **不要在 PHP 內手刻 CPT 或 CMB2 metabox** — 一切走 schema JSON
- ❌ **不要改 [inc/cpt.php](sccd-theme/inc/cpt.php) / [inc/rest.php](sccd-theme/inc/rest.php) / [inc/schema-loader.php](sccd-theme/inc/schema-loader.php) 邏輯**（除非 deliberate 改框架行為）

### 部署層

- ❌ **不要用 PowerShell Compress-Archive 打 zip** — 用 Python zipfile
- ❌ **不要直接傳到 production 不過 staging** — LocalWP 驗 1 個流程後再上
- ❌ **不要 16 個 data loader 一次切換** — 一個 PR 一個漸進
- ❌ **不要設 `Access-Control-Allow-Origin: *` 進 production** — 縮 origin allowlist

### 教學層

- ❌ **不要叫老師動 Appearance / Plugins / Settings → Permalinks** — 寫進手冊 + production 用 user role 限制
- ❌ **不要讓老師雙擊 index.html 看「本機預覽」** — 一律走 production wp-admin
- ❌ **不要寄望文字手冊** — 錄影片才有用

---

## 9. 相關文件 / Memory

- `reference_wp_deployment_strategy_plan.md` — 環境一致性 10 根因 + 正式版 checklist
- `reference_lightsail_blueprint_comparison_for_sccd.md` — 為什麼是 WP 不是其他 CMS
- `project_lightsail_ssh_deployment_decision.md` — Lightsail SSH 部署細節
- `project_sccd_theme_poc_no_spa_frontend.md` — sccd-theme PoC 階段紀錄
- `feedback_powershell_compress_archive_backslash_breaks_wp.md` — zip 分隔符雷
- `feedback_avoid_spaces_in_asset_paths.md` — asset 命名規範
- `feedback_dynamic_website_term_means_content_updates_not_ssr.md` — 「動態網站」字眼歧義
- `project_local_dev_requires_http_server_not_file_protocol.md` — 本機 dev 必須跑 server

---

**結語**：上 WP 前**整份從頭讀一次**，照 Phase 0 → 1 → 2 → 3 → 4 順序做。漏哪一步補回去比硬幹便宜 10 倍。
