# SPA → Directus Headless CMS 最佳實踐

> **這份是走 Directus 路線的權威文件**。任何上 Directus 的工作都以此為主。
> 對照路線：[SPA-轉-WP-Headless-最佳實踐.md](SPA-轉-WP-Headless-最佳實踐.md)（WP 路線）
> 最後更新：2026-06-02

---

## 0. 一頁版心智模型

```
┌────────────────────────────────────────────────────────────────┐
│  Lightsail (學校 IT 提供，Bitnami 環境 + Node.js 可用)         │
│                                                                │
│  ┌────────────────────┐         ┌────────────────────────┐    │
│  │ Directus 後台 UI   │  寫     │ PostgreSQL DB          │    │
│  │ /cms/admin         │ ──────► │ collections + items    │    │
│  │ (老師登入改文案)   │         │                        │    │
│  └────────────────────┘         └──────────┬─────────────┘    │
│                                            │ 讀               │
│  ┌────────────────────┐                    ▼                  │
│  │ SCCD SPA (前台)    │       ┌──────────────────────────┐   │
│  │ /index.html        │  ◄──  │ Directus REST API        │   │
│  │ router.js          │ JSON  │ /cms/items/<collection>  │   │
│  │ 16 data loaders    │       │ (內建)                   │   │
│  └────────────────────┘       └──────────────────────────┘   │
│                                                                │
│   Apache (Bitnami 既有)：                                      │
│   /              → /opt/bitnami/wordpress/index.html (SPA)    │
│   /cms/*         → reverse proxy → Node :8055 (Directus)      │
│   /wp-admin/*    → WP（如保留）                                │
└────────────────────────────────────────────────────────────────┘
```

### 4 個鐵則

1. **SPA 100% 保留**。Directus 只提供 JSON，不渲染前台。SCCD 所有動畫互動完整保留。
2. **schema 在後台 GUI 建**。不寫 PHP / JSON schema 檔，直接後台 Settings → Data Model 點點點。
3. **Public role 必須開 Read**。最容易忘的設定 — 不開 SPA fetch 全部回 401。
4. **collection 名 = endpoint 名**。建 collection 取名 `news` → fetch `/cms/items/news`，命名一致最好維護。

---

## 1. 為什麼是 Directus（不是 Strapi / Payload / WP）

| | Directus | Strapi | Payload | WP headless |
|---|---|---|---|---|
| schema 建立 | GUI 點點點 | GUI 點點點 | TypeScript code | JSON schema（sccd-theme 已做） |
| 媒體 transformation | ✅ 內建（resize / WebP / quality） | ⚠️ 要 plugin | ⚠️ 要 plugin | ⚠️ 要 plugin（Imsanity 等） |
| 後台 UI 現代度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 中文後台 | ✅ 切繁中 | ✅ 切繁中 | ⚠️ 部分 | ✅ 原生 |
| DB 支援 | PG / MySQL / SQLite / MSSQL | PG / MySQL / SQLite | MongoDB / PG | MySQL（綁死） |
| 學習曲線 | 低 | 中 | 中-高 | 中（要懂 WP 生態） |
| 老師熟悉度 | ⭐ 全新 | ⭐ 全新 | ⭐ 全新 | ⭐⭐⭐⭐⭐ 壓倒性熟 |
| schema 老師會誤動 | ⚠️ 要 permission 鎖 Settings | ⚠️ 要 permission 鎖 | ❌ schema 寫 code 老師動不到 | ❌ schema 寫 JSON 老師動不到 |

**Directus 對 SCCD 的優勢**：
- **GUI 建 schema** — 38 個 collection 後台點 1-2 天，不寫 code
- **媒體 transformation 內建** — 老師傳大圖自動產縮圖 / WebP / 不同尺寸，SPA 加 query param 拿
- **REST + GraphQL 都有** — 開箱即用，查詢功能比 WP REST 強（filter / sort / fields / deep）

**Directus 對 SCCD 的代價**：
- 丟掉 sccd-theme 40 schemas（1-2 天重建）
- 老師熟悉度輸 WP（要更多教學）
- 託管 9 步 vs WP 一鍵

**選 Directus 的前提**：你願意「自己維護一陣子、後台美感優先、不急著交給老師」。如果短期就要交老師接手，去看 [SPA-轉-WP-Headless-最佳實踐.md](SPA-轉-WP-Headless-最佳實踐.md)。

---

## 2. 部署 — 在學校 Lightsail 上裝 Directus

### Phase 1：環境檢查

SSH 進 Lightsail：

```bash
ssh -i ~/Downloads/LightsailKey.pem bitnami@<lightsail-ip>

# 確認 Node.js
node -v          # 要 18+，若 < 18 用 nvm 升
npm -v

# 確認 Apache 在跑（Bitnami 既有）
sudo /opt/bitnami/ctlscript.sh status apache

# 確認連得到 internet
curl -s https://registry.npmjs.org/directus | head
```

若 Node < 18：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
```

### Phase 2：裝 PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# 確認 service
sudo systemctl status postgresql

# 建 Directus 專用 DB + user
sudo -u postgres psql <<EOF
CREATE DATABASE directus;
CREATE USER directus WITH PASSWORD '改成強密碼-記下來';
GRANT ALL PRIVILEGES ON DATABASE directus TO directus;
\c directus
GRANT ALL ON SCHEMA public TO directus;
EOF
```

### Phase 3：建 Directus 專案

```bash
cd ~
mkdir directus-cms && cd directus-cms
npm init -y
npm install directus
```

### Phase 4：設定 .env

```bash
nano .env
```

貼進去（密碼換成你的）：

```env
# 一定要改的
KEY=用 uuidgen 產一個 UUID
SECRET=再用 uuidgen 產另一個 UUID

# DB
DB_CLIENT=pg
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=directus
DB_USER=directus
DB_PASSWORD=你 Phase 2 設的密碼

# Admin 帳號（首次 bootstrap 用）
ADMIN_EMAIL=你的 email
ADMIN_PASSWORD=管理員密碼

# Public URL（reverse proxy 後 SPA 看到的 URL）
PUBLIC_URL=http://<lightsail-ip>/cms

# CORS（同 origin 可省，跨域才要）
CORS_ENABLED=true
CORS_ORIGIN=*

# 上傳檔限制（SCCD 影片可能大，給 500 MB）
FILES_MAX_UPLOAD_SIZE=524288000
```

產 UUID：

```bash
uuidgen
# 或 node -e "console.log(crypto.randomUUID())"
```

### Phase 5：初始化 + 啟動

```bash
# 建 schema（建 directus_* 系統 table）
npx directus bootstrap

# 跑起來測試
npx directus start
# 看到 "Server started at http://0.0.0.0:8055" = 成功
# Ctrl+C 停下，下一步用 PM2 跑
```

### Phase 6：PM2 常駐

```bash
sudo npm install -g pm2

cd ~/directus-cms
pm2 start "npx directus start" --name directus

# 開機自動啟動
pm2 startup
# 照印出來的指令再跑一次（會印 sudo env PATH=... pm2 startup ...）
pm2 save

# 確認
pm2 status
pm2 logs directus --lines 50
```

### Phase 7：Apache reverse proxy

Bitnami Apache 已在跑（負責 WP 或 SPA 靜態檔），加一個 reverse proxy 把 `/cms` 轉發到 Directus :8055。

```bash
sudo nano /opt/bitnami/apache2/conf/vhosts/wordpress-vhost.conf
```

在 `<VirtualHost>` 內加：

```apache
# Directus reverse proxy
ProxyPreserveHost On
ProxyPass /cms http://localhost:8055
ProxyPassReverse /cms http://localhost:8055

# WebSocket（Directus realtime / live preview 用）
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/cms/websocket/(.*) ws://localhost:8055/websocket/$1 [P,L]
```

確認 mod_proxy 有開：

```bash
grep -i "LoadModule proxy" /opt/bitnami/apache2/conf/httpd.conf
# 應看到 proxy_module / proxy_http_module 都 uncomment
```

restart：

```bash
sudo /opt/bitnami/ctlscript.sh restart apache
```

### Phase 8：測試訪問

```bash
# 內部測試
curl http://localhost:8055/server/info | head

# 外部測試（從你電腦）
curl http://<lightsail-ip>/cms/server/info
```

瀏覽器開 `http://<lightsail-ip>/cms/admin` → 看到登入頁 → 用 .env 的 ADMIN_EMAIL / ADMIN_PASSWORD 登入。

### Phase 9：SSL（option，但強烈建議）

學校網域接過來後跑 Let's Encrypt：

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d sccd.usc.edu.tw
```

之後 PUBLIC_URL 改 `https://sccd.usc.edu.tw/cms`。

### Phase 10：備份策略

```bash
# DB 備份 cron（每天凌晨 3 點）
sudo crontab -e
# 加：
0 3 * * * sudo -u postgres pg_dump directus | gzip > /home/bitnami/backups/directus-$(date +\%Y\%m\%d).sql.gz

# uploads/ 備份（同步到本機 / S3）
0 4 * * * tar czf /home/bitnami/backups/uploads-$(date +\%Y\%m\%d).tar.gz /home/bitnami/directus-cms/uploads/

mkdir -p /home/bitnami/backups
```

---

## 3. Schema 建立 — 38 個 collection 對應 sccd-theme

### 3.1 對應表（依 sccd-theme/schemas/ 列出）

| Directus collection | 對應 sccd-theme schema | 對應 SPA data loader / data/*.json |
|---|---|---|
| `faculty_fulltime` | faculty-fulltime.json | faculty.json (filter type=fulltime) |
| `faculty_parttime` | faculty-parttime.json | faculty.json (filter type=parttime) |
| `faculty_admin` | faculty-admin.json | faculty.json (filter type=admin) |
| `faculty_former` | atlas-faculty-former.json | faculty-former.json |
| `index_news` | index-news.json | news.json |
| `index_theater` | index-theater.json | (首頁 theater section) |
| `about_class` | about-class.json | about-class-images.json |
| `about_history` | about-history.json | about-history.json（原 timeline.json） |
| `about_resources` | about-resources.json | about-resources.json（原 resources.json） |
| `about_vision` | about-vision.json | (about 頁 vision section) |
| `about_works` | about-works.json | (about 頁 works section) |
| `courses_hero` | courses-hero.json | courses.json (hero 區) |
| `bfa_animation` | bfa-animation.json | bfa-works.json (filter category) |
| `bfa_cmd` | bfa-cmd.json | bfa-works.json (filter category) |
| `mdes` | mdes.json | mdes-works.json |
| `activities_hero` | activities-hero.json | (activities 頁 hero) |
| `activities_workshop` | activities-workshop.json | workshops.json |
| `activities_industry` | activities-industry.json | industry.json |
| `activities_lecture` | activities-lecture.json | lectures.json |
| `activities_students_present` | activities-students-present.json | students-present.json |
| `activities_competition` | activities-competition.json | general-activities.json (cat) |
| `activities_conference` | activities-conference.json | general-activities.json (cat) |
| `activities_exhibition_permanent` | activities-exhibition-permanent.json | permanent-exhibitions.json |
| `activities_exhibition_special` | activities-exhibition-special.json | general-activities.json (cat) |
| `activities_visit_inbound` | activities-visit-inbound.json | general-activities.json (cat) |
| `activities_visit_outbound` | activities-visit-outbound.json | general-activities.json (cat) |
| `activities_degree_show` | activities-degree-show.json | degree-show.json |
| `admission_hero` | admission-hero.json | admission.json (hero) |
| `admission_announcement` | admission-announcement.json | admission.json (announcements) |
| `admission_summer_camp` | admission-summer-camp.json | summer-camp.json |
| `library_award_logos` | library-award-logos.json | library.json (logos panel) |
| `library_awards` | library-awards.json | library.json (awards panel) |
| `library_press` | library-press.json | press.json |
| `library_documents` | library-documents.json | library.json (files panel) |
| `library_album` | library-album.json | library.json (album panel) |
| `atlas_alumni_careers` | atlas-alumni-careers.json | atlas-companies.json (subset) |
| `atlas_alumni_employment` | atlas-alumni-employment.json | atlas-companies.json (subset) |
| `atlas_alumni_hosting` | atlas-alumni-hosting.json | atlas-companies.json (subset) |

實際上傳前再對一次（schema 可能有增刪）。

### 3.2 Field type 對照表（sccd-theme schema → Directus）

對應 [sccd-theme/inc/cmb2-register.php:52-139](sccd-theme/inc/cmb2-register.php) 的 12 種 type：

| sccd-theme type | Directus field type | 後台介面 |
|---|---|---|
| `text` | String / Input | 單行 |
| `textarea` | Text / Textarea | 多行 |
| `wysiwyg` | WYSIWYG | 富文本 |
| `image` | File / Image | 單張上傳 |
| `image_list` | M2M relation to `directus_files` 或 Files (Multiple) | 多張 sortable |
| `video` | File | 單影片 |
| `video_list` | Files (Multiple) | 多影片 |
| `file` | File | 任何 mime |
| `country` | Dropdown | options 自填 ISO code |
| `year` | Integer / Dropdown | 1950-2040 options |
| `month` | Dropdown | 01-12 options |
| `day` | Dropdown | 01-31 options |
| `group` (repeater) | Repeater 或 O2M relation 子 collection | 多筆子項目 |

**注意 `group` (repeater)**：sccd-theme 的 `group` 例如 faculty 的 `titles[]` / `educations[]` — Directus 有兩種對應做法：

1. **Repeater 內建 interface**（簡單）：直接用 Directus Repeater interface，所有子項目存進**單一 JSON 欄位**。優點快、SPA 取得就是 array；缺點不能跨 collection 查詢。
2. **O2M 子 collection**（正規）：建 `faculty_fulltime_titles` 子 collection，跟 `faculty_fulltime` 用 foreign key 關聯。優點可獨立查詢、reorder；缺點 SPA fetch 要加 `?fields=titles.*` deep。

**SCCD 推薦用 Repeater interface** — 簡單、跟 sccd-theme JSON 結構一致。

### 3.3 建第一個 collection 的步驟（範例：index_news）

1. 後台 → Settings → Data Model → **+ Create Collection**
2. Name: `index_news`
3. Primary Key Field: Generated UUID 或 Auto-Incremented Integer（推 Integer 簡單）
4. Optional Fields: 全開（status / sort / date_created / date_updated）
5. 進 collection → **+ Create Field**：
   - `text`: Type = Text, Interface = Textarea
   - `url`: Type = String, Interface = Input
   - `poster`: Type = UUID (file), Interface = File Image, Folder = (option)
6. 設 **Sort Field**：用 `sort` 欄位（拖拽排序），不然就用 `date_created DESC`
7. Save

重整 → 左側 sidebar 看到 「Index News」 collection。

### 3.4 38 collection 工時

- 簡單 collection（3-5 個 field）：5 分鐘
- 中等（5-10 field + 1 repeater）：15 分鐘
- 複雜（10+ field + 多個 repeater）：30 分鐘

平均 15 分 × 38 = **9.5 小時** ≈ **1-2 天**。

**加速建議**：寫一個 schema migration script 用 Directus SDK 批次建：

```js
import { createDirectus, rest, authentication, createCollection, createField } from '@directus/sdk';
import fs from 'fs';

const client = createDirectus('http://localhost:8055')
  .with(rest())
  .with(authentication());

await client.login('admin@email', 'password');

// 讀 sccd-theme 既有 schema JSON
const schemas = fs.readdirSync('sccd-theme/schemas')
  .map(f => JSON.parse(fs.readFileSync(`sccd-theme/schemas/${f}`)));

for (const s of schemas) {
  const collectionName = s.cpt;
  // 建 collection
  await client.request(createCollection({
    collection: collectionName,
    schema: { name: collectionName },
    meta: { hidden: false, singleton: !!s.singleton },
  }));
  // 建 fields
  for (const f of s.fields) {
    await client.request(createField(collectionName, {
      field: f.id,
      type: mapType(f.type),  // 寫 mapping 函數
      meta: { interface: mapInterface(f.type), special: [] },
    }));
  }
  console.log(`✓ ${collectionName}`);
}
```

這 script 1-2 小時寫好跑一次 30 分鐘，比手動 9.5 小時划算。

---

## 4. 權限設定（最容易忘）

### 4.1 Public role 開 Read（必做）

後台 → Settings → Access Control → **Public** role → 對**每個** SCCD collection 點 Read → 勾「All Access」。

**不開**：SPA fetch 回 401 → 前端全空白 → 排查半天才發現是這個。

### 4.2 Editor role 給老師

新建 role「老師」：

- Permissions: 每個 collection 給 Read / Create / Update（**不要 Delete** — 刪錯救不回）
- **Settings 全鎖**（包含 Data Model / Roles & Permissions / Project Settings）→ 老師不能改 schema 不能改權限
- Files / Folders：Read + Create + Update（不給 Delete）

### 4.3 Admin role 留給你自己

預設 Admin 全權限，**不要把 Admin 給老師**。

### 4.4 鎖 IP / 雙因素（option）

- IP whitelist：學校網段
- 2FA：後台帳號設定 → Multi-Factor Authentication

---

## 5. 匯入既有 data/*.json

### 5.1 SCCD data 跟 schema 不 1:1 對應的處理

sccd-theme schema 拆得比 `data/*.json` 細，例如：
- `data/faculty.json` 1 檔包含 fulltime / parttime / admin 三種（filter by `type`）→ 對應 3 個 collection
- `data/general-activities.json` 1 檔包含 competitions / conferences / visits / exhibitions（filter by category）→ 對應 4-5 個 collection

匯入時要拆檔。

### 5.2 通用匯入 script 範本

```js
// scripts/import-to-directus.js
import { createDirectus, rest, authentication, createItems, uploadFiles } from '@directus/sdk';
import fs from 'fs';

const DIRECTUS_URL = 'http://localhost:8055';
const ADMIN = { email: 'admin@email', password: 'password' };

const client = createDirectus(DIRECTUS_URL).with(rest()).with(authentication());
await client.login(ADMIN.email, ADMIN.password);

// 簡單 1:1 對應：news.json → index_news
async function importNews() {
  const items = JSON.parse(fs.readFileSync('data/news.json'));
  await client.request(createItems('index_news', items));
  console.log(`✓ ${items.length} news`);
}

// 拆檔對應：faculty.json filter by type → 3 個 collection
async function importFaculty() {
  const all = JSON.parse(fs.readFileSync('data/faculty.json'));
  const byType = {
    fulltime: 'faculty_fulltime',
    parttime: 'faculty_parttime',
    admin: 'faculty_admin',
  };
  for (const [type, collection] of Object.entries(byType)) {
    const items = all.filter(x => x.type === type).map(({ type, ...rest }) => rest);
    await client.request(createItems(collection, items));
    console.log(`✓ ${items.length} ${collection}`);
  }
}

await importNews();
await importFaculty();
// ...
```

### 5.3 圖片處理

`data/*.json` 內的 `image` / `poster` 欄位是 URL 字串（指向 `/images/X.jpg`）。Directus 期望的是 attachment ID（UUID）。

**兩種做法**：

**A. 先上傳所有圖到 Directus**（推薦）：
```js
import { uploadFiles } from '@directus/sdk';

async function uploadImage(localPath) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(localPath));
  const result = await client.request(uploadFiles(formData));
  return result.id;  // attachment UUID
}

// 匯入前先處理圖片
for (const item of items) {
  if (item.image && item.image.startsWith('/images/')) {
    item.image = await uploadImage(`./public${item.image}`);
  }
}
```

**B. 保留 URL 字串**（簡單但有限制）：
- Directus field 用 String 而非 File
- SPA `<img src>` 直接用字串
- 缺點：失去 Directus 媒體 transformation（不能 `?width=400`）

SCCD 推薦做法 A，雖然麻煩但解鎖 transformation。

### 5.4 跑匯入

```bash
cd ~/directus-cms
node scripts/import-to-directus.js
```

---

## 6. SPA 接 Directus — 改 data loader

### 6.1 抽 API base 常數

新建 [js/config/api.js](js/config/api.js)：

```js
// 唯一 Directus REST base URL 注入點
export const CMS_API_BASE = '/cms/items';
export const CMS_ASSETS_BASE = '/cms/assets';

// Dev 本機 SPA + production Directus 跨域時改完整 URL
// export const CMS_API_BASE = 'http://lightsail-ip/cms/items';
```

### 6.2 簡單 1:1 對應 data loader 範例

原本 [js/modules/pages/support-data-loader.js](js/modules/pages/support-data-loader.js)：

```js
const response = await fetch('/data/support.json');
const data = await response.json();
```

改成：

```js
import { CMS_API_BASE } from '../../config/api.js';

const response = await fetch(`${CMS_API_BASE}/support?fields=*&sort=sort`);
const { data } = await response.json();  // ⚠️ Directus 回 { data: [...] } 要解
```

**注意 Directus 回應結構**：永遠是 `{ data: ... }`，要 `.data` 解包。WP REST 直接回 array，所以兩個結構不同。

### 6.3 拆檔對應 — faculty 範例

原本 [js/modules/pages/faculty-data-loader.js](js/modules/pages/faculty-data-loader.js)：

```js
const response = await fetch('/data/faculty.json');
const data = await response.json();
const fulltime = data.filter(item => item.type === 'fulltime');
// ...
```

改成：

```js
import { CMS_API_BASE } from '../../config/api.js';

const [ft, pt, ad] = await Promise.all([
  fetch(`${CMS_API_BASE}/faculty_fulltime?fields=*,image.*,titles,educations,experiences,awards`).then(r => r.json()).then(x => x.data),
  fetch(`${CMS_API_BASE}/faculty_parttime?fields=*,image.*`).then(r => r.json()).then(x => x.data),
  fetch(`${CMS_API_BASE}/faculty_admin?fields=*,image.*`).then(r => r.json()).then(x => x.data),
]);

// 補回 type 給前端 filter 用
const data = [
  ...ft.map(x => ({ ...x, type: 'fulltime' })),
  ...pt.map(x => ({ ...x, type: 'parttime' })),
  ...ad.map(x => ({ ...x, type: 'admin' })),
];
```

### 6.4 圖片 URL 處理

Directus 圖片回傳是 attachment UUID（或 file object），不是 URL。SPA 要組 URL：

```js
function imageUrl(file, options = {}) {
  if (!file) return '';
  const id = typeof file === 'string' ? file : file.id;
  const query = new URLSearchParams(options).toString();
  return `/cms/assets/${id}${query ? '?' + query : ''}`;
}

// 用法
<img src="${imageUrl(item.image)}">                              // 原圖
<img src="${imageUrl(item.image, { width: 400, format: 'webp' })}">  // 縮 400px WebP
<img src="${imageUrl(item.image, { key: 'thumbnail' })}">       // 預設 thumbnail
```

**Directus transformation 參數**：
- `width` / `height` / `fit` (cover/contain/inside/outside)
- `format` (webp / jpg / png)
- `quality` (1-100)
- `key` (預設 preset，後台 Settings → Project Settings → Storage Assets 內定義)

預先在後台定義常用 preset（thumbnail / card / hero）→ SPA 用 `?key=card` 就好，不用每次寫 width=...&fit=...。

### 6.5 Reference 自動 lookup 邏輯保留

`activities-data-loader.js` 有 ref `{ section, itemId }` 自動 lookup 機制（[js/modules/pages/activities-data-loader.js:12-26](js/modules/pages/activities-data-loader.js)）。改 Directus 後：

```js
const SECTION_DATA_URL = {
  workshop:           `${CMS_API_BASE}/activities_workshop`,
  industry:           `${CMS_API_BASE}/activities_industry`,
  lectures:           `${CMS_API_BASE}/activities_lecture`,
  // ...
};

async function getSectionData(section) {
  const url = SECTION_DATA_URL[section];
  const r = await fetch(`${url}?fields=*`).then(r => r.json());
  return r.data;
}
```

### 6.6 漸進改造 — 一次改一個 loader

**不要 16 個一次改**。每個 loader 一個 PR：

1. 改 fetch URL
2. 改 response parsing（加 `.data`）
3. 改圖片 URL 組合（如果需要 transformation）
4. 桌面 + 手機 + 三 mode 全測
5. 後台改一筆資料 → 重整 → 看 SPA 是否反映

跑通一個再改下一個。

---

## 7. 給老師的後台教學

### 7.1 登入

`http://sccd.usc.edu.tw/cms/admin` → 老師帳號密碼。

**Directus 介面預設英文**，後台右下角點頭像 → User Settings → Language → 繁體中文。

### 7.2 必教操作

1. **登入 + 切繁中**
2. **改現有資料**：左側 sidebar 點 collection 名（例如「首頁消息」）→ 列表頁 → 點一筆 → 改 → 右上角「Save」
3. **新增一筆**：列表頁右上角「+」→ 填表 → Save
4. **上傳圖片**：圖片欄位點「Browse」→ 拖檔進去 / 從 File Library 挑 → 確定
5. **刪除**（謹慎）：列表頁勾選 → 右上角「Delete」→ 永久刪除（不是回收桶）

**Directus 沒有回收桶** — 刪了就沒。建議改用「Archive」（設 status field = archived），不要真刪。

### 7.3 不要做的事（教給老師）

- 不要動「Settings」（任何子項都不要點）— 你已經用 permission 鎖住，他點不開
- 不要批次刪除
- 不要改 collection 名 / field 名
- 上傳前壓縮圖片（Directus 雖然會 transformation，但原圖太大佔空間）

### 7.4 教學媒介

- **錄影片**：5-10 分鐘示範登入 → 改一筆 → 看前台變化
- **PDF 手冊**：截圖步驟
- **常用操作 cheat sheet**：A4 一張印出來貼在電腦旁

Directus 英文成份比 WP 多，影片更重要。

---

## 8. 已知陷阱

### 8.1 Public role 沒開 Read（最常見）

**症狀**：SPA fetch 全部 401，前端空白
**修法**：Settings → Access Control → Public → 每個 collection 勾 Read All

### 8.2 Response 結構 `{ data: ... }` 沒解包

**症狀**：data loader `items.map is not a function`
**修法**：`const { data } = await response.json();` 或 `.then(x => x.data)`

### 8.3 Repeater 欄位 SPA 拿不到完整資料

**症狀**：`item.titles` 是 undefined / 只有 ID 沒有實體
**修法**：fetch 加 `?fields=*,titles.*` 用 wildcard deep

### 8.4 圖片 URL 用 attachment UUID 直接當 src

**症狀**：`<img src="abc-123-uuid">` 不會載
**修法**：用 `/cms/assets/<uuid>` 組 URL（見 6.4）

### 8.5 reverse proxy 沒設 WebSocket → Realtime 不通

**症狀**：後台 Save 後其他 user 不會 live update
**修法**：Apache vhost 加 RewriteRule for upgrade websocket（見 Phase 7）

### 8.6 PostgreSQL `public` schema 沒給 directus user

**症狀**：bootstrap 報 `permission denied for schema public`
**修法**：`GRANT ALL ON SCHEMA public TO directus;`（見 Phase 2）

### 8.7 PM2 重開機後不自動啟動

**症狀**：Lightsail restart 後 Directus 沒起來
**修法**：必跑 `pm2 startup` + 照印出來的指令再跑一次 + `pm2 save`

### 8.8 Directus 升級可能 break schema

**症狀**：npm update directus 後後台跑不起來
**修法**：升級前 `pg_dump` 備份 + 看 Directus migration guide；major version（10 → 11）必看 breaking changes

---

## 9. 變更管理

### 加新 collection

1. 後台 → Data Model → Create Collection（或寫 script 批次）
2. 建 fields
3. 設 Public role Read 權限（**不要忘**）
4. 前端加 data loader / 改既有 loader

### 改既有 collection

- **加 field**：後台直接點 + Create Field，舊資料該 field 是 null
- **改 field 名**：影響前端 → 同步改 data loader
- **改 field type**：謹慎，可能要寫 migration

### Directus 升級

```bash
cd ~/directus-cms

# 備份
sudo -u postgres pg_dump directus > backup-$(date +%Y%m%d).sql
tar czf uploads-$(date +%Y%m%d).tar.gz uploads/

# 升級
npm update directus

# 重啟
pm2 restart directus
pm2 logs directus --lines 100  # 看有沒有 migration error
```

---

## 10. 不要做的事（總結）

### 架構層

- ❌ 不要走 Directus 自帶 Studio 渲染前台（Directus 是 headless 不應該管前台）
- ❌ 不要把 sccd-theme 40 schemas 砍掉前就決定走 Directus — schema 比較完再拍板（Directus 用 GUI 重建 1-2 天）
- ❌ 不要讓老師有 Settings 權限（會誤動 schema 炸前端）

### 部署層

- ❌ 不要直接跑 `npx directus start` 不過 PM2（terminal 關掉 Directus 就掛）
- ❌ 不要忘 Apache mod_proxy（reverse proxy 不通）
- ❌ 不要直接 nginx 取代 Bitnami Apache（Bitnami 環境太多綁定，新裝 nginx 衝突）
- ❌ 不要用 root 跑 Directus（用 bitnami user 跑）

### 資料層

- ❌ 不要不寫匯入 script 手動建 38 collection 幾百筆資料（極慢）
- ❌ 不要把 `data/*.json` 圖片 URL 直接寫進 Directus String field（失去 transformation）
- ❌ 不要 16 個 data loader 一次切換（一個 PR 一個漸進）

### 維運層

- ❌ 不要不設 cron 備份（DB 掛了救不回）
- ❌ 不要把 Admin 角色給老師（給 Editor 限制權限）
- ❌ 不要不教老師「Archive vs Delete 差別」（Directus delete 是永久刪）

---

## 11. 相關文件 / Memory

- [SPA-轉-WP-Headless-最佳實踐.md](SPA-轉-WP-Headless-最佳實踐.md) — 對照路線（WP）
- `reference_lightsail_blueprint_comparison_for_sccd.md` — 為什麼是 Directus vs 其他 headless
- `project_lightsail_ssh_deployment_decision.md` — Lightsail SSH 環境細節
- `feedback_no_headless_term_ambiguous_clarify_first.md` — headless / WP 等字眼歧義 disambiguation pattern
- `project_local_dev_requires_http_server_not_file_protocol.md` — 本機 dev 跑 server 不能 file://

---

**結語**：上 Directus 前**整份從頭讀一次**，照 Phase 1-10 順序做。Phase 7 的 reverse proxy + Phase 4 的 .env + Phase 4.1 的 Public Read 是三個最常踩雷點，特別小心。
