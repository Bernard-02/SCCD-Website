// about_history.entries 的「學制」下拉開 allowOther：
// 新學制不用進資料模型改 choices——ui_labels 加一筆 history.division.<key>，
// 年表下拉選「Other」填同一個 key 即可（前台 divisionHtml 對任何含 '.' 的 key 通用渲染）。
// idempotent、可重跑；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/allow-history-division-other.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}\n  ${JSON.stringify(body).slice(0, 600)}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const NOTE = '大學時期用；留空＝不分學制。新學制：先到 ui_labels 新增一筆 key＝history.division.新代號（填英/中名稱），再回這裡選 Other 輸入同一個 key';

(async () => {
  const f = (await req('GET', '/fields/about_history/entries')).data;
  const div = f?.meta?.options?.fields?.find(s => s.field === 'division');
  if (!div) throw new Error('about_history.entries 找不到 division 子欄');
  console.log('現況 options:', JSON.stringify(div.meta?.options));
  if (div.meta?.options?.allowOther) { console.log('↷ 已開 allowOther，跳過'); return; }
  (div.meta.options ||= {}).allowOther = true;
  div.meta.note = NOTE;
  await req('PATCH', '/fields/about_history/entries', { meta: f.meta });
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。後台硬重整編輯畫面即生效。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
