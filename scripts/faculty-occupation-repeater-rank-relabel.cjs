// 2026-08-12：兼任 occupation 由兩個 scalar 欄（occupationZh/En）改成單一 occupations repeater（可多筆）；
//   同時後台顯示名重整（只改 translation label、欄位 key 不動，前台照舊讀 data.titles / data.occupations）：
//     titles     → 顯示「職級 Rank」（全部老師共用，user 2026-08-12）
//     occupation → 顯示「職稱 Title」（新的 occupations repeater）
// 流程：建 occupations 欄 → relabel titles → 遷 39 筆資料 → 驗證 → 驗證過才刪舊 scalar 欄。idempotent、可重跑。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/faculty-occupation-repeater-rank-relabel.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`, body ? JSON.stringify(body).slice(0, 160) + '…' : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 400)}`);
  return out;
}

// translations 陣列裡 upsert 某語言（保留其他語言）
function upsertTr(arr, language, translation) {
  arr = Array.isArray(arr) ? arr.slice() : [];
  const i = arr.findIndex(t => t.language === language);
  if (i >= 0) arr[i] = { ...arr[i], translation }; else arr.push({ language, translation });
  return arr;
}

(async () => {
  const fieldsRes = await req('GET', '/fields/faculty');
  const fields = fieldsRes.data || [];
  const byName = Object.fromEntries(fields.map(f => [f.field, f]));

  // 1) 建 occupations repeater（若不存在）——鏡射 titles 的 list 形狀，parttime-only 條件同舊 scalar。
  if (!byName.occupations) {
    console.log('建立 occupations repeater...');
    await req('POST', '/fields/faculty', {
      field: 'occupations', type: 'json',
      meta: {
        special: ['cast-json'], interface: 'list', sort: 12,
        translations: [{ language: 'zh-TW', translation: '職稱（可多筆）' }, { language: 'en-US', translation: 'Title' }],
        note: '兼任老師的職稱／身份／所屬單位（可多筆），例：藝術家 Artist、公司名。前台顯示在 slide-in 右側。',
        conditions: [{ name: '只兼任顯示', rule: { _and: [{ facultyType: { _neq: 'parttime' } }] }, hidden: true, options: {} }],
        options: {
          template: '{{ occupationZh }} {{ occupationEn }}',
          fields: [
            { field: 'occupationZh', type: 'string', meta: { interface: 'input', translations: [{ language: 'zh-TW', translation: '職稱中' }] } },
            { field: 'occupationEn', type: 'string', meta: { interface: 'input', translations: [{ language: 'zh-TW', translation: '職稱英' }] } },
          ],
        },
      },
    });
  } else {
    console.log('occupations 欄已存在，略過建立。');
  }

  // 2) relabel titles → 「職級 Rank」。讀 live meta 只改 translation（保留 template/country/note）。
  const titles = byName.titles;
  if (titles) {
    console.log('relabel titles → 職級 / Rank...');
    const meta = titles.meta || {};
    meta.translations = upsertTr(upsertTr(meta.translations, 'zh-TW', '職級（可多筆）'), 'en-US', 'Rank');
    if (meta.options && Array.isArray(meta.options.fields)) {
      for (const sf of meta.options.fields) {
        if (sf.field === 'titleZh') { sf.meta = sf.meta || {}; sf.meta.translations = upsertTr(sf.meta.translations, 'zh-TW', '職級中'); }
        if (sf.field === 'titleEn') { sf.meta = sf.meta || {}; sf.meta.translations = upsertTr(sf.meta.translations, 'zh-TW', '職級英'); }
      }
    }
    await req('PATCH', '/fields/faculty/titles', { meta });
  }

  // 3) 遷移：occupationZh/En → occupations[0]。只搬有資料且 occupations 還空的列。
  //    occupations 欄在 dry-run（未實際建立）查不到 → 只在 live 才帶入做冪等判斷。
  const occField = DRY ? '' : ',occupations';
  const itemsRes = await req('GET', `/items/faculty?limit=-1&fields=id,nameZh,occupationZh,occupationEn${occField}`);
  const rows = itemsRes.data || [];
  const src = rows.filter(r => (r.occupationZh && r.occupationZh.trim()) || (r.occupationEn && r.occupationEn.trim()));
  console.log(`遷移 occupation 資料：${src.length} 筆`);
  for (const r of src) {
    if (Array.isArray(r.occupations) && r.occupations.length) { console.log(`  ${r.nameZh} 已有 occupations，略過`); continue; }
    await req('PATCH', `/items/faculty/${r.id}`, {
      occupations: [{ occupationZh: (r.occupationZh || '').trim(), occupationEn: (r.occupationEn || '').trim() }],
    });
  }

  // 4) 驗證：搬過的每列 occupations[0] 要對得上舊 scalar。驗證過才刪。
  if (!DRY) {
    const check = (await req('GET', '/items/faculty?limit=-1&fields=id,nameZh,occupationZh,occupationEn,occupations')).data || [];
    const chk = Object.fromEntries(check.map(r => [r.id, r]));
    const bad = [];
    for (const r of src) {
      const now = chk[r.id];
      const o = now && Array.isArray(now.occupations) && now.occupations[0];
      if (!o || (o.occupationZh || '') !== (r.occupationZh || '').trim() || (o.occupationEn || '') !== (r.occupationEn || '').trim()) bad.push(r.nameZh);
    }
    if (bad.length) throw new Error(`驗證失敗（未刪舊欄）：${bad.join('、')}`);
    console.log('✅ 遷移驗證通過。');
  }

  // 5) 刪舊 scalar 欄
  for (const f of ['occupationZh', 'occupationEn']) {
    if (byName[f]) { console.log(`刪除舊欄 ${f}...`); await req('DELETE', `/fields/faculty/${f}`); }
  }

  console.log('\n✅ 完成。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
