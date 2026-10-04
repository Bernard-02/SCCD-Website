/**
 * legal 三頁「頁面說明」（內容欄最上方的粗體說明段，寬 3/4 同 admission；user 2026-10-04）：
 *   - Donate     → support.overviewEn/Zh（欄位早已存在、前台原本沒用）：補後台標籤＋填 placeholder
 *   - Regulations→ regulations.pageDescEn/Zh（新建；regulations.overview 已是規章表卡內說明，不能共用）
 *   - Site Map   → accessibility_statement.overview（已在用，不動）
 *
 *   node scripts/setup-legal-page-desc.cjs --dry   # 只看不寫
 *   node scripts/setup-legal-page-desc.cjs         # 寫線上 test CMS
 *
 * placeholder 只在欄位為空時填（重跑不蓋掉老師改過的文字）。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

function getToken() {
  if (process.env.DIRECTUS_TOKEN) return process.env.DIRECTUS_TOKEN.trim();
  const f = path.join(__dirname, '.directus-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('✗ 找不到 token（scripts/.directus-token 或 DIRECTUS_TOKEN）');
  process.exit(1);
}

const H = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
async function req(method, url, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${url}`, body ? JSON.stringify(body) : ''); return {}; }
  const res = await fetch(BASE + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${url} → HTTP ${res.status}\n${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

const label = (t) => [{ language: 'zh-TW', translation: t }];
const NOTE = '頁面最上方的說明文字（粗體，3/4 寬）；空白＝前台不顯示';

const PLACEHOLDER = {
  support: {
    overviewEn: 'Your support helps SCCD students create, exhibit, and grow. Below are the ways to donate to the department.',
    overviewZh: '您的支持能幫助媒傳系學生創作、展出與成長。以下為捐贈本系的方式。',
  },
  regulations: {
    pageDescEn: 'Department and university regulations, together with the privacy policy of this website.',
    pageDescZh: '本系與校方相關規章辦法，以及本網站的隱私政策。',
  },
};

(async () => {
  // 1) support：既有 overview 欄補標籤（PATCH 只送 meta 片段＝merge）
  for (const [f, t] of [['overviewEn', '頁面說明（英）'], ['overviewZh', '頁面說明（中）']]) {
    await req('PATCH', `/fields/support/${f}`, { meta: { translations: label(t), note: NOTE } });
    console.log(`✓ support.${f} 標籤`);
  }

  // 2) regulations：新建 pageDescEn/Zh（已存在就跳過）；英上中下
  const existing = (await req('GET', '/fields/regulations')).data?.map(f => f.field) || [];
  for (const [f, t, sort] of [['pageDescEn', '頁面說明（英）', 9], ['pageDescZh', '頁面說明（中）', 10]]) {
    if (existing.includes(f)) { console.log(`✓ regulations.${f} 已存在，跳過`); continue; }
    await req('POST', '/fields/regulations', {
      field: f, type: 'text',
      meta: { interface: 'input-multiline', width: 'full', sort, translations: label(t), note: NOTE },
      schema: {},
    });
    console.log(`✓ regulations.${f} 建立`);
  }

  // 3) placeholder：只填空欄
  for (const [col, vals] of Object.entries(PLACEHOLDER)) {
    const cur = DRY && col === 'regulations' && !existing.includes('pageDescEn') ? {}
      : (await req('GET', `/items/${col}?fields=${Object.keys(vals).join(',')}`)).data || {};
    const patch = Object.fromEntries(Object.entries(vals).filter(([k]) => !cur[k]));
    if (!Object.keys(patch).length) { console.log(`✓ ${col} 已有文字，不蓋`); continue; }
    await req('PATCH', `/items/${col}`, patch);
    console.log(`✓ ${col} 填 placeholder：${Object.keys(patch).join(', ')}`);
  }
})().catch(e => { console.error('✗', e.message); process.exit(1); });
