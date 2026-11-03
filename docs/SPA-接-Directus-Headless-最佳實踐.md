# SPA → Directus Headless CMS 最佳實踐

> **這份是走 Directus 路線的權威文件**。任何上 Directus 的工作都以此為主。
> 最後更新：2026-06-02；2026-11-02 刪掉舊 CMS 對照／既有 data/*.json 匯入段落（已完成、來源已不存在）

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
│   前台 SPA 不在這台（S3 + CloudFront，見《前台上線流程》）    │
│   /cms/*         → reverse proxy → Node :8055 (Directus)      │
└────────────────────────────────────────────────────────────────┘
```

### 4 個鐵則

1. **SPA 100% 保留**。Directus 只提供 JSON，不渲染前台。SCCD 所有動畫互動完整保留。
2. **schema 在後台 GUI 建**。不寫 PHP / JSON schema 檔，直接後台 Settings → Data Model 點點點。
3. **Public role 必須開 Read**。最容易忘的設定 — 不開 SPA fetch 全部回 401。
4. **collection 名 = endpoint 名**。建 collection 取名 `news` → fetch `/cms/items/news`，命名一致最好維護。

---

## 1. 為什麼是 Directus

- **GUI 建 schema**：後台 Settings → Data Model 點點點，不寫 code。
- **REST 內建 filter / sort / fields / deep**，回應永遠 `{ data: ... }`。
- **媒體 transformation 內建**（實務上本站改走 CloudFront 直吃 S3，見 CLAUDE.md「檔案交付分流」）。
- **前提**：自己維護一陣子、後台美感優先、不急著交給老師。

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

Bitnami Apache 已在跑，加一個 reverse proxy 把 `/cms` 轉發到 Directus :8055。

```bash
sudo nano /opt/bitnami/apache2/conf/vhosts/<site>-vhost.conf
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

## 3. Schema 建立

### 3.1 建第一個 collection 的步驟（範例：index_news）

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

## 5. SPA 接 Directus — 改 data loader

### 5.1 抽 API base 常數

新建 [js/config/api.js](js/config/api.js)：

```js
// 唯一 Directus REST base URL 注入點
export const CMS_API_BASE = '/cms/items';
export const CMS_ASSETS_BASE = '/cms/assets';

// Dev 本機 SPA + production Directus 跨域時改完整 URL
// export const CMS_API_BASE = 'http://lightsail-ip/cms/items';
```

### 5.2 簡單 1:1 對應 data loader 範例

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

**注意 Directus 回應結構**：永遠是 `{ data: ... }`，要 `.data` 解包。

### 5.3 拆檔對應 — faculty 範例

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

### 5.4 圖片 URL 處理

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

### 5.5 Reference 自動 lookup 邏輯保留

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

### 5.6 漸進改造 — 一次改一個 loader

**不要 16 個一次改**。每個 loader 一個 PR：

1. 改 fetch URL
2. 改 response parsing（加 `.data`）
3. 改圖片 URL 組合（如果需要 transformation）
4. 桌面 + 手機 + 三 mode 全測
5. 後台改一筆資料 → 重整 → 看 SPA 是否反映

跑通一個再改下一個。

---

## 6. 給老師的後台教學

### 6.1 登入

`http://sccd.usc.edu.tw/cms/admin` → 老師帳號密碼。

**Directus 介面預設英文**，後台右下角點頭像 → User Settings → Language → 繁體中文。

### 6.2 必教操作

1. **登入 + 切繁中**
2. **改現有資料**：左側 sidebar 點 collection 名（例如「首頁消息」）→ 列表頁 → 點一筆 → 改 → 右上角「Save」
3. **新增一筆**：列表頁右上角「+」→ 填表 → Save
4. **上傳圖片**：圖片欄位點「Browse」→ 拖檔進去 / 從 File Library 挑 → 確定
5. **刪除**（謹慎）：列表頁勾選 → 右上角「Delete」→ 永久刪除（不是回收桶）

**Directus 沒有回收桶** — 刪了就沒。建議改用「Archive」（設 status field = archived），不要真刪。

### 6.3 不要做的事（教給老師）

- 不要動「Settings」（任何子項都不要點）— 你已經用 permission 鎖住，他點不開
- 不要批次刪除
- 不要改 collection 名 / field 名
- 上傳前壓縮圖片（Directus 雖然會 transformation，但原圖太大佔空間）

### 6.4 教學媒介

- **錄影片**：5-10 分鐘示範登入 → 改一筆 → 看前台變化
- **PDF 手冊**：截圖步驟
- **常用操作 cheat sheet**：A4 一張印出來貼在電腦旁

Directus 後台英文成份多，影片教學更重要。

---

## 7. 已知陷阱

### 7.1 Public role 沒開 Read（最常見）

**症狀**：SPA fetch 全部 401，前端空白
**修法**：Settings → Access Control → Public → 每個 collection 勾 Read All

### 7.2 Response 結構 `{ data: ... }` 沒解包

**症狀**：data loader `items.map is not a function`
**修法**：`const { data } = await response.json();` 或 `.then(x => x.data)`

### 7.3 Repeater 欄位 SPA 拿不到完整資料

**症狀**：`item.titles` 是 undefined / 只有 ID 沒有實體
**修法**：fetch 加 `?fields=*,titles.*` 用 wildcard deep

### 7.4 圖片 URL 用 attachment UUID 直接當 src

**症狀**：`<img src="abc-123-uuid">` 不會載
**修法**：用 `/cms/assets/<uuid>` 組 URL（見 5.4）

### 7.5 reverse proxy 沒設 WebSocket → Realtime 不通

**症狀**：後台 Save 後其他 user 不會 live update
**修法**：Apache vhost 加 RewriteRule for upgrade websocket（見 Phase 7）

### 7.6 PostgreSQL `public` schema 沒給 directus user

**症狀**：bootstrap 報 `permission denied for schema public`
**修法**：`GRANT ALL ON SCHEMA public TO directus;`（見 Phase 2）

### 7.7 PM2 重開機後不自動啟動

**症狀**：Lightsail restart 後 Directus 沒起來
**修法**：必跑 `pm2 startup` + 照印出來的指令再跑一次 + `pm2 save`

### 7.8 Directus 升級可能 break schema

**症狀**：npm update directus 後後台跑不起來
**修法**：升級前 `pg_dump` 備份 + 看 Directus migration guide；major version（10 → 11）必看 breaking changes

---

## 8. 變更管理

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

## 9. 不要做的事（總結）

### 架構層

- ❌ 不要走 Directus 自帶 Studio 渲染前台（Directus 是 headless 不應該管前台）
- ❌ 不要讓老師有 Settings 權限（會誤動 schema 炸前端）

### 部署層

- ❌ 不要直接跑 `npx directus start` 不過 PM2（terminal 關掉 Directus 就掛）
- ❌ 不要忘 Apache mod_proxy（reverse proxy 不通）
- ❌ 不要直接 nginx 取代 Bitnami Apache（Bitnami 環境太多綁定，新裝 nginx 衝突）
- ❌ 不要用 root 跑 Directus（用 bitnami user 跑）

### 維運層

- ❌ 不要不設 cron 備份（DB 掛了救不回）
- ❌ 不要把 Admin 角色給老師（給 Editor 限制權限）
- ❌ 不要不教老師「Archive vs Delete 差別」（Directus delete 是永久刪）

---

## 10. 相關文件 / Memory

- `reference_lightsail_blueprint_comparison_for_sccd.md` — 為什麼是 Directus vs 其他 headless
- `project_lightsail_ssh_deployment_decision.md` — Lightsail SSH 環境細節
- `project_local_dev_requires_http_server_not_file_protocol.md` — 本機 dev 跑 server 不能 file://

---

**結語**：上 Directus 前**整份從頭讀一次**，照 Phase 1-10 順序做。Phase 7 的 reverse proxy + Phase 4 的 .env + Phase 4.1 的 Public Read 是三個最常踩雷點，特別小心。
