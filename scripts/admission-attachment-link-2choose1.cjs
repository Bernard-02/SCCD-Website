// admission_attachments 每筆附件 2 選 1：上傳 PDF（file）或貼外部連結（link，如 Google Drive）。
// attachments o2m slot 已存在、天生可多筆；這裡只補 link 欄 + 兩欄互鎖（比照 documents/press）。
// 互鎖用 readonly 非 hidden：有上傳 file→link readonly、有填 link→file readonly，清掉已填那邊即解鎖。
// 前台判型：有 link 就開新分頁、否則當上傳檔 download。
// idempotent。跑：node scripts/admission-attachment-link-2choose1.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const jsonH = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const COL = 'admission_attachments';
const DRY = process.argv.includes('--dry');
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const LOCK_WHEN = (otherField, msg) => [{ name: msg, rule: { [otherField]: { _nnull: true } }, readonly: true, hidden: false }];

async function setConditions(field, conditions) {
  const cur = (await req('GET', `/fields/${COL}/${field}`)).data;
  await req('PATCH', `/fields/${COL}/${field}`, { meta: { ...cur.meta, conditions } });
  console.log(`  ⚙︎ ${COL}.${field} 加互鎖條件`);
}

(async () => {
  // 1. 補 link 欄（若無）
  const fields = new Set((await req('GET', `/fields/${COL}`)).data.map(f => f.field));
  if (!fields.has('link')) {
    await req('POST', `/fields/${COL}`, {
      field: 'link', type: 'string',
      meta: { interface: 'input', sort: 7, width: 'full',
              options: { placeholder: 'https://drive.google.com/...' },
              note: '貼外部連結（如 Google Drive）。有填就用它、前台點擊開新分頁；要改成上傳檔請先清空此欄。',
              translations: zh('外部連結') },
    });
    console.log(`  ＋ ${COL}.link`);
  } else { console.log(`  ${COL}.link 已存在，跳過`); }

  // 2. 兩欄互鎖
  await setConditions('file', LOCK_WHEN('link', '有填外部連結時鎖定（要改上傳先清空連結）'));
  await setConditions('link', LOCK_WHEN('file', '有上傳檔案時鎖定（要改連結先清除上傳的檔案）'));
  console.log('✅ 完成：admission_attachments link 欄 + 上傳／連結 2 選 1。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
