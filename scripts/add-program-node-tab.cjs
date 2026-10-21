// program_nodes 加「點擊跳到 Programs 分頁」下拉（M2O → about_divisions）（user 2026-10-21）：
//  有選＝樹上這個方塊可點，點了捲到 Programs 並切到該分頁；空＝不可點。
//  選單排除 bfa（Design Fundamental 只在 Works 有內容，Programs 沒有該分頁）。
//  遷移：三個 division 方塊（動畫／創媒／碩士）預填自己的分頁；DCD／學士班留空（要可點再到後台選）。
// 跑（repo 根目錄）：node scripts/add-program-node-tab.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const PREFILL = { 'about.program.animation': 'animation', 'about.program.creative-media': 'creative-media', 'about.program.mdes': 'mdes' };

(async () => {
  const has = await req('GET', '/fields/program_nodes/programTab').then(() => true, () => false);
  if (has) console.log('✓ programTab 已存在');
  else {
    console.log('加 program_nodes.programTab...');
    await req('POST', '/fields/program_nodes', {
      field: 'programTab', type: 'uuid', schema: {},
      meta: {
        interface: 'select-dropdown-m2o', special: ['m2o'], sort: 8, width: 'full',
        translations: [{ language: 'zh-TW', translation: '點擊跳到 Programs 分頁' }],
        note: '選了＝這個方塊可以點，點了捲到 Programs 並切到這個分頁；空＝不可點',
        options: { template: '{{ nameZh }}（{{ nameEn }}）', filter: { divisionKey: { _neq: 'bfa' } } },
        display: 'related-values', display_options: { template: '{{ nameZh }}' },
      },
    });
    await req('POST', '/relations', { collection: 'program_nodes', field: 'programTab', related_collection: 'about_divisions', schema: { on_delete: 'SET NULL' } });
  }

  const divs = (await req('GET', '/items/about_divisions?limit=-1&fields=id,divisionKey')).data || [];
  const nodes = (await req('GET', `/items/program_nodes?limit=-1&fields=id,nameZh,labelKey${DRY && !has ? '' : ',programTab'}`)).data || [];
  for (const n of nodes) {
    const key = PREFILL[n.labelKey];
    const div = key && divs.find((d) => d.divisionKey === key);
    if (!div || n.programTab) continue;
    console.log(`  ${n.nameZh} → ${key}`);
    await req('PATCH', `/items/program_nodes/${n.id}`, { programTab: div.id });
  }
  console.log(`✅ 完成${DRY ? '（DRY，未寫入）' : ''}`);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
