// footer 分頁說明文字（user 2026-10-03）：footer_tabs 加一個選填多行文字欄 note。
//   桌面版顯示在該分頁項目區左下角（純文字、不可點、散佈卡避開）；留空＝該分頁不顯示（如關聯單位）。
//   第一行＝粗體標題，其餘照換行顯示（前台 footer-content.js buildNote）。
// 非破壞：只新增欄位；Public 對 footer_tabs 的讀取權限是 fields:* → 新欄自動可讀。
// 首個分頁（dept）note 空著時預填 user 給的示意文字，之後在後台改／清空即可。
// 跑（repo 根目錄）：node scripts/add-footer-tab-note.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const jsonH = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 260) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const SEED = 'Office Hours 辦公時間\nMon - Fri 週一至週五\n19:00 - 19:00; 19:00 - 19:00';

(async () => {
  const { data: fields } = await req('GET', '/fields/footer_tabs');
  if (fields.some((f) => f.field === 'note')) console.log('note 欄位已存在，略過建立');
  else {
    await req('POST', '/fields/footer_tabs', {
      field: 'note',
      type: 'text',
      meta: {
        interface: 'input-multiline', sort: 7, width: 'full',
        translations: [{ language: 'zh-TW', translation: '說明文字' }],
        note: '選填。桌面版顯示在此分頁項目區的左下角（純文字、不可點）。第一行＝粗體標題，其餘照換行顯示；留空＝此分頁不顯示',
      },
      schema: { is_nullable: true },
    });
    await req('PATCH', '/fields/footer_tabs/items', { meta: { sort: 8 } });   // 項目清單排在說明文字之後
    console.log('已建立 footer_tabs.note');
  }
  const { data: tabs } = await req('GET', '/items/footer_tabs?sort=sort&limit=1&fields=id,key' + (DRY ? '' : ',note'));
  const first = tabs[0];
  if (first && !first.note) {
    await req('PATCH', `/items/footer_tabs/${first.id}`, { note: SEED });
    console.log(`已預填 ${first.key} 分頁的說明文字`);
  } else console.log('首個分頁已有說明文字，不覆蓋');
  console.log(DRY ? '\n（dry run：以上 POST/PATCH 未實際送出）' : '\n✅ 完成');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
