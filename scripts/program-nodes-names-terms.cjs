// program_nodes 加「獨立樹名 nameEn/nameZh」＋「期程 termEn/termZh」，並解開 tree ↔ ui_labels 耦合（user 2026-09-11）。
//  - 需求1：tree 文字改吃 program_nodes.nameEn/nameZh（不再與下方 division nav 共用 ui_labels）；
//           seed = 各節點「當下 ui_labels 值」＝老師想要的樹名（含刻意打成 "BFA, DCD" 等）；
//           然後把被污染的 ui_labels（about.group.bfa / about.program.mdes，餵下方 nav）還原成 data/ui-labels.json 正本。
//  - 需求2：SCAIDC（bpaidc）拿掉 wordmarkFile（原本借 SCCD 占位）→ 前台無 logo 檔＝整塊不畫（見 about-structure acronymHtml）。
//  - 需求3：期程 termEn/termZh 掛在 degree 節點（bfa 4 年、mdes 2 年；bpaidc 籌備中先留空、老師可補）。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/program-nodes-names-terms.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'program_nodes';
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// ui_labels 正本（餵下方 division nav 的兩個被污染 key）＝data/ui-labels.json
const UI_CANON = {
  'about.group.bfa':    { en: 'Bachelor of Fine Art (BFA)', zh: '學士班' },
  'about.program.mdes': { en: 'Master of Design (MDES)',    zh: '碩士班' },
};
// 期程 seed（依 labelKey）；bpaidc 籌備中先留空
const TERM = {
  'about.group.bfa':    { en: '4 Years', zh: '4 年' },
  'about.program.mdes': { en: '2 Years', zh: '2 年' },
};

(async () => {
  // 1) 加 4 個字串欄（已存在 POST 400 → 容錯略過，維持冪等）
  const fields = [
    { field: 'nameEn', type: 'string', meta: { interface: 'input', sort: 8, width: 'half', translations: zh('樹名（英，獨立於 ui_labels）'), note: '學制樹上顯示的英文名；空＝退回 labelKey 對應的 ui_labels' } },
    { field: 'nameZh', type: 'string', meta: { interface: 'input', sort: 9, width: 'half', translations: zh('樹名（中，獨立於 ui_labels）'), note: '學制樹上顯示的中文名；空＝退回 ui_labels' } },
    { field: 'termEn', type: 'string', meta: { interface: 'input', sort: 10, width: 'half', translations: zh('期程（英，可空）'), note: '如 4 Years／2 Years；掛在 degree 節點（bfa/mdes…），hover tree 才展開' } },
    { field: 'termZh', type: 'string', meta: { interface: 'input', sort: 11, width: 'half', translations: zh('期程（中，可空）'), note: '如 4 年／2 年' } },
  ];
  console.log('1) 加欄位 nameEn/nameZh/termEn/termZh...');
  for (const f of fields) await req('POST', `/fields/${COL}`, f).catch(e => console.log(`   （略過 ${f.field}：${e.message.slice(0, 80)}）`));

  // 2) 取現有節點：先只查既有欄位（dry 模式新欄尚未建），再嘗試補讀 nameEn/termEn 做冪等判斷（欄未建則當空＝首跑）
  const nodes = (await req('GET', `/items/${COL}?limit=-1&fields=id,labelKey,wordmarkFile`)).data || [];
  const vals = await req('GET', `/items/${COL}?limit=-1&fields=id,nameEn,nameZh,termEn`).then(r => r.data || []).catch(() => []);
  const valById = Object.fromEntries(vals.map(v => [v.id, v]));
  nodes.forEach(n => { const v = valById[n.id] || {}; n.nameEn = v.nameEn; n.nameZh = v.nameZh; n.termEn = v.termEn; });

  // 3) 取「當下」ui_labels（＝老師目前想要的樹名，seed 用），必須在還原 ui_labels 之前讀
  const keys = nodes.map(n => n.labelKey).filter(Boolean);
  const ui = (await req('GET', `/items/ui_labels?limit=-1&fields=id,key,en,zh&filter[key][_in]=${encodeURIComponent(keys.join(','))}`)).data || [];
  const uiByKey = Object.fromEntries(ui.map(r => [r.key, r]));

  // 4) seed nameEn/nameZh（只在 nameEn 空時，不覆蓋日後手動編輯）＝當下 ui_labels 值
  console.log('\n2) seed 樹名 nameEn/nameZh（= 當下 ui_labels，空才寫）...');
  for (const n of nodes) {
    if (n.nameEn) { console.log(`   ${n.labelKey}：已有 nameEn，略過`); continue; }
    const src = uiByKey[n.labelKey];
    if (!src) { console.log(`   ⚠️ ${n.labelKey}：ui_labels 找不到，略過`); continue; }
    console.log(`   ${n.labelKey} → nameEn=${JSON.stringify(src.en)} nameZh=${JSON.stringify(src.zh)}`);
    await req('PATCH', `/items/${COL}/${n.id}`, { nameEn: src.en || '', nameZh: src.zh || '' });
  }

  // 5) seed 期程（只 bfa/mdes；空才寫）
  console.log('\n3) seed 期程 termEn/termZh（bfa 4年 / mdes 2年，空才寫）...');
  for (const n of nodes) {
    const t = TERM[n.labelKey];
    if (!t || n.termEn) continue;
    console.log(`   ${n.labelKey} → termEn=${JSON.stringify(t.en)} termZh=${JSON.stringify(t.zh)}`);
    await req('PATCH', `/items/${COL}/${n.id}`, { termEn: t.en, termZh: t.zh });
  }

  // 6) bpaidc 拿掉 wordmarkFile（原借 SCCD 占位）→ 前台無 logo 檔＝整塊不畫
  console.log('\n4) bpaidc 清除 wordmarkFile（SCAIDC 無真 logo，不再借 SCCD 占位）...');
  const bpaidc = nodes.find(n => n.labelKey === 'about.program.bpaidc');
  if (bpaidc && bpaidc.wordmarkFile) { console.log(`   ${bpaidc.labelKey}：wordmarkFile ${bpaidc.wordmarkFile} → null`); await req('PATCH', `/items/${COL}/${bpaidc.id}`, { wordmarkFile: null }); }
  else console.log('   （bpaidc 無 wordmarkFile，略過）');

  // 7) 還原被污染的 ui_labels（餵下方 nav 的 bfa/mdes）→ data/ui-labels.json 正本
  console.log('\n5) 還原 ui_labels（下方 nav 用）bfa/mdes → 正本...');
  for (const [key, v] of Object.entries(UI_CANON)) {
    const row = uiByKey[key];
    if (!row) { console.log(`   ⚠️ ui_labels ${key} 找不到，略過`); continue; }
    if (row.en === v.en && row.zh === v.zh) { console.log(`   ${key}：已是正本，略過`); continue; }
    console.log(`   ${key}: ${JSON.stringify(row.en)}/${JSON.stringify(row.zh)} → ${JSON.stringify(v.en)}/${JSON.stringify(v.zh)}`);
    await req('PATCH', `/items/ui_labels/${row.id}`, { en: v.en, zh: v.zh });
  }

  console.log(`\n✅ 完成${DRY ? '（DRY，未寫入）' : ''}。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
