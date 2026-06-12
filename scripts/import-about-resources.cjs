// 匯入 about Resources（教學空間/圖書館/工廠…）→ Directus about_resources。
// 來源 data/about-resources.json（已把電腦教室/複合媒體圖書館拆成 8 項）。
// 跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-about-resources.cjs [--dry] [--force]
// 轉換：title「English 中文」→ 在第一個中日韓字切成 titleEn/titleZh；text→description；image 不帶（之後上傳）。
// 特例：複合媒體圖書館(Media Library) 只 key title、description 留空（user 指定，內容之後補）。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');

const BASE = 'https://54.116.86.165';
const COLLECTION = 'about_resources';
const SRC = 'data/about-resources.json';
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

// description 留空的項目（比對 titleZh）
const BLANK_DESC = ['複合媒體圖書館'];

function splitTitle(title) {
  const s = (title || '').trim();
  const idx = s.search(/[㐀-鿿]/); // 第一個 CJK
  if (idx <= 0) return { titleEn: s, titleZh: '' };
  return { titleEn: s.slice(0, idx).trim(), titleZh: s.slice(idx).trim() };
}

(async () => {
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const items = src.map((r, i) => {
    const { titleEn, titleZh } = splitTitle(r.title);
    const blank = BLANK_DESC.includes(titleZh);
    return {
      titleEn, titleZh,
      descriptionEn: blank ? '' : (r.textEn || ''),
      descriptionZh: blank ? '' : (r.textZh || ''),
      sort: i + 1,
    };
  });

  console.log('=== 預覽 ===');
  items.forEach(it => console.log(
    `  ${it.sort}. [${it.titleEn}] / [${it.titleZh}]` + (it.descriptionZh ? ` | 說明 ${it.descriptionZh.length} 字` : ' | 說明留空')
  ));

  if (DRY) { console.log('--dry：不上傳。'); return; }

  const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const cur = await fetch(`${BASE}/items/${COLLECTION}?aggregate[count]=*`, { headers }).then(r => r.json());
  const count = Number(cur?.data?.[0]?.count || 0);
  if (count > 0 && !FORCE) { console.log(`⚠️ 已有 ${count} 筆，中止避免重複（--force 覆寫前請先清空）。`); return; }

  const res = await fetch(`${BASE}/items/${COLLECTION}`, { method: 'POST', headers, body: JSON.stringify(items) });
  const out = await res.json();
  if (!res.ok) { console.log('❌ 匯入失敗:', JSON.stringify(out).slice(0, 400)); return; }
  console.log(`✅ 完成，建立 ${Array.isArray(out.data) ? out.data.length : '?'} 筆 resources。`);
})().catch(e => console.log('錯誤:', e.message, e.stack));
