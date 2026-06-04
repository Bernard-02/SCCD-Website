/**
 * 把結構化的 legal JSON 匯入 Directus（singleton collection）。
 * 在你自己電腦跑（不需 server / SSH 權限，走 Directus API）：
 *
 *     node scripts/import-legal-to-directus.cjs
 *
 * 前置：
 *   ① Directus 已建好 accessibility / regulations collection
 *      （都設 Singleton，欄位跟 privacy_policy 一模一樣：
 *       titleEn/titleZh String、overviewEn/overviewZh Text、
 *       points Repeater{titleEn/titleZh String, desEn/desZh WYSIWYG}、lastUpdatedEn/lastUpdatedZh String）
 *   ② 一組 static token：Directus 後台 → 右上你的使用者 → Token 欄位 → 產生 → 存檔 → 複製，
 *      貼到 scripts/.directus-token（單行純 token，已被 .gitignore 不會入庫）
 *      ── 或設環境變數 DIRECTUS_TOKEN
 *   ③ Node 18+（用內建 fetch）
 *
 * 跑完後：瀏覽器開 http://54.116.86.165:8055/items/accessibility 確認 points 進去了，
 * 再回報我，我把 legal-data-loader 的 CMS_COLLECTIONS 加上這兩頁切到 Directus。
 */
const fs = require('fs');
const path = require('path');

const DIRECTUS_URL = 'http://54.116.86.165:8055';

// 本地 JSON 檔名 → Directus collection 名（singleton）。privacy/accessibility/regulations 已匯過。
// 跑前確認對應 collection 已在 Directus 建好（Singleton + 同欄位）。已匯過的可留著（PATCH 會覆蓋成相同內容，無害）。
const MAP = {
  support: 'support',
};

function getToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN.trim();
  const f = path.join(__dirname, '.directus-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('✗ 找不到 token。請把 static token 貼到 scripts/.directus-token（單行），或設環境變數 DIRECTUS_TOKEN。');
  process.exit(1);
}

(async () => {
  const token = getToken();
  for (const [file, collection] of Object.entries(MAP)) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${file}.json`), 'utf8'));
    // singleton：PATCH /items/{collection} 直接更新那一筆（不存在會自動建立）
    const res = await fetch(`${DIRECTUS_URL}/items/${collection}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      console.log(`✓ ${collection}：匯入成功（${data.points.length} 條 point）`);
    } else {
      console.error(`✗ ${collection}：HTTP ${res.status}\n${await res.text()}`);
    }
  }
})();
