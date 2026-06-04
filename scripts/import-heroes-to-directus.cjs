/**
 * 把 4 頁的 hero JSON 匯入 Directus（各為一個 Singleton collection）。
 * 在你自己電腦跑（不需 server / SSH 權限，走 Directus API）：
 *
 *     node scripts/import-heroes-to-directus.cjs
 *
 * 前置：
 *   ① Directus 已建好 4 個 Singleton：faculty_hero / curriculum_hero /
 *      activities_hero / admission_hero，欄位都是
 *      titleEn / titleZh（String）、subtitleEn / subtitleZh（Text）、bannerImage（File，可空）
 *   ② static token：Directus 後台 → 右上你的使用者 → Token → 產生 → 存檔 → 複製，
 *      貼到 scripts/.directus-token（單行純 token，已被 .gitignore）
 *      ── 或設環境變數 DIRECTUS_TOKEN
 *   ③ Node 18+（用內建 fetch）
 *
 * 備註：
 *   - bannerImage 不在 JSON 內 → 不會動到該欄；banner 真圖請之後在後台各 hero 直接上傳。
 *   - singleton 用 PATCH /items/{collection}（那一筆不存在會自動建立）。
 *
 * 跑完後：瀏覽器開 http://54.116.86.165:8055/items/faculty_hero 等 4 個確認文字進去了，
 * 再回報我，我寫共用 hero loader 把這 4 頁接到 Directus。
 */
const fs = require('fs');
const path = require('path');

const DIRECTUS_URL = 'http://54.116.86.165:8055';

// Directus collection 名（Singleton）→ 本地 data/ 檔名（不含 .json）
const MAP = {
  faculty_hero: 'faculty-hero',
  curriculum_hero: 'curriculum-hero',
  activities_hero: 'activities-hero',
  admission_hero: 'admission-hero',
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
  for (const [collection, file] of Object.entries(MAP)) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${file}.json`), 'utf8'));
    // singleton：PATCH /items/{collection} 直接更新那一筆（不存在會自動建立）
    const res = await fetch(`${DIRECTUS_URL}/items/${collection}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      console.log(`✓ ${collection}：匯入成功（${data.titleEn} / ${data.titleZh}）`);
    } else {
      console.error(`✗ ${collection}：HTTP ${res.status}\n${await res.text()}`);
    }
  }
})();
