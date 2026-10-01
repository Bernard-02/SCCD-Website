// footer 資訊架構 v3（user 2026-10-01）：
//   - 項目類型收斂成 social（社群圖示）／text（文字：標題＋內文＋選填連結）；連結一律後台自填（地址不再前台自動生地圖連結）
//   - copyright 改後台設定：footer_settings 單例（自訂文字 或 自動年份 二選一；「Copyright ©」前綴前台固定）
// 非破壞：既有 items 讀現值原地 PATCH（不重灌）。phone 三欄併入英文內文後清空＋隱藏（欄位保留不刪＝可回退）；
//   address 的 url 空著就預填原本前台自動生成的 Google 地圖連結（外觀不變、改成可編輯）。
// 前台 footer-content.js 新舊 type 都吃 → 先跑後跑都不壞版。
// 跑（repo 根目錄）：node scripts/migrate-footer-v3.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const jsonH = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const PUBLIC_POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

async function req(method, urlPath, body, { ignoreMissing } = {}) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 220) : ''); return { data: { id: 'dry-id' } }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: jsonH, body: body ? JSON.stringify(body) : undefined });
  if ((res.status === 404 || res.status === 403) && ignoreMissing) return null;   // Directus 對不存在的 collection 回 403
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const zh = (t) => [{ language: 'zh-TW', translation: t }];
const showWhen = (types) => [{ name: '此類型隱藏', rule: { type: { _nin: types } }, hidden: true, options: {} }];
const mapsUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

(async () => {
  // 1) 資料：舊類型 → text（讀現值轉換）
  console.log('轉換 footer_items...');
  const { data: items } = await req('GET', '/items/footer_items?limit=-1&fields=id,type,labelEn,labelZh,textEn,textZh,phoneCountry,phoneNumber,phoneExt,url');
  for (const it of items) {
    if (it.type === 'social' || it.type === 'text') continue;
    const patch = { type: 'text' };
    if (it.type === 'phone') {
      if (!it.textEn && it.phoneNumber) patch.textEn = `${it.phoneCountry || ''} ${it.phoneNumber}`.trim() + (it.phoneExt ? ` #${it.phoneExt}` : '');
      Object.assign(patch, { phoneCountry: null, phoneNumber: null, phoneExt: null });
    }
    if (it.type === 'address' && !it.url) {
      const q = (it.textEn || it.textZh || '').trim();
      if (q) patch.url = mapsUrl(q);
    }
    console.log(`  ${it.type} → text｜${it.labelEn || ''} ${it.labelZh || ''}`, JSON.stringify(patch).slice(0, 160));
    await req('PATCH', `/items/footer_items/${it.id}`, patch);
  }

  // 2) 欄位：type 只剩兩種、文字欄位依 text 顯示、url 兩種都顯示、phone 三欄隱藏
  console.log('更新 footer_items 欄位...');
  await req('PATCH', '/fields/footer_items/type', {
    meta: { options: { choices: [
      { text: '文字（標題／內文＋選填連結）', value: 'text' },
      { text: '社群圖示', value: 'social' },
    ] } },
    schema: { default_value: 'text' },
  });
  const fieldMeta = {
    labelEn: { conditions: showWhen(['text']), translations: zh('標題（英）'), note: '粗體標題。只填標題、不填內文＝兩行卡（如關聯單位，整卡連到網址）' },
    labelZh: { conditions: showWhen(['text']), translations: zh('標題（中）'), note: '粗體標題。只填標題、不填內文＝兩行卡（如關聯單位，整卡連到網址）' },
    textEn: { conditions: showWhen(['text']), translations: zh('內文（英）'), note: '如電話「+886 2 2538 1111 #7211」、Email、英文地址' },
    textZh: { conditions: showWhen(['text']), translations: zh('內文（中）'), note: '如中文地址（桌面版整行不換行）' },
    url: { conditions: null, translations: zh('連結網址'), note: '社群必填；文字選填。https://… 開新分頁；mailto: / tel: 也可以。前台不會自動產生連結' },
    itemKey: { conditions: showWhen(['text']) },
    phoneCountry: { hidden: true },
    phoneNumber: { hidden: true },
    phoneExt: { hidden: true },
  };
  for (const [field, meta] of Object.entries(fieldMeta)) await req('PATCH', `/fields/footer_items/${field}`, { meta });

  // 3) footer_settings 單例（footer 集合資料夾內）＋ Public 讀取
  console.log('footer_settings...');
  const exists = await req('GET', '/collections/footer_settings', null, { ignoreMissing: true });
  if (!exists) {
    await req('POST', '/collections', {
      collection: 'footer_settings',
      meta: { singleton: true, group: 'footer', icon: 'copyright', translations: zh('頁尾設定'), note: '頁尾 Copyright 文字與年份', accountability: 'all' },
      schema: {},
      fields: [{ field: 'id', type: 'uuid', meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, length: 36, has_auto_increment: false } }],
    });
    // 二選一：開自動年份＝「Copyright © 2026」（每年自動換），文字欄隱藏；關＝「Copyright © <文字>」
    await req('POST', '/fields/footer_settings', { field: 'copyright_auto_year', type: 'boolean', meta: { interface: 'boolean', special: ['cast-boolean'], sort: 2, width: 'half', translations: zh('自動年份'), note: '開啟＝「Copyright © 2026」，每年自動更新（不顯示下方文字）' }, schema: { default_value: false } });
    await req('POST', '/fields/footer_settings', { field: 'copyright_text', type: 'string', meta: { interface: 'input', sort: 3, width: 'half', translations: zh('版權文字'), note: '接在「Copyright ©」之後，如 SCCD（Copyright © 固定）', conditions: [{ name: '自動年份時隱藏', rule: { copyright_auto_year: { _eq: true } }, hidden: true, options: {} }] }, schema: { default_value: 'SCCD' } });
    await req('POST', '/permissions', { collection: 'footer_settings', action: 'read', fields: ['*'], policy: PUBLIC_POLICY });
    await req('PATCH', '/items/footer_settings', { copyright_text: 'SCCD', copyright_auto_year: false });
  } else console.log('  已存在，略過');

  console.log(DRY ? '\n（dry run：以上 PATCH/POST 未實際送出）' : '\n✅ footer v3 遷移完成');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
