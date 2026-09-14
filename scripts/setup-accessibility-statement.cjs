// 後台 legal 重整（user 2026-09-15）：無障礙聲明從 policy_and_statements 拆成獨立 singleton
// `accessibility_statement`（放 Legal folder）→ 後台結構對應前台分家：
//   regulations 頁＝規章＋隱私政策（policy_and_statements 只剩隱私）；網站導覽頁＝無障礙聲明（新 singleton）。
// 步驟：①建 singleton＋欄位（照 policy_and_statements 同構，去掉 sort）②Public read
//       ③把無障礙 row 內容搬進 singleton（singleton 空才 seed）④刪 policy_and_statements 的無障礙 row
//       ⑤更新 policy_and_statements note。
// ⚠️ 本地 fallback data/policy-and-statements.json 刻意保留無障礙段——CMS 掛掉時前台舊 filter 路徑還能撈到。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/setup-accessibility-statement.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COL = 'accessibility_statement';
const SRC = 'policy_and_statements';
const zh = (t) => [{ language: 'zh-TW', translation: t }];

async function req(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${p}`, body ? JSON.stringify(body).slice(0, 200) : ''); return { data: {} }; }
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return { data: {} };
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

const isA11y = (g) => /accessibility/i.test(g.titleEn || '') || (g.titleZh || '').includes('無障礙');

// points repeater options 照 policy_and_statements 原樣（titleZh/titleEn/desZh/desEn，des 為富文本）
const POINTS_OPTIONS = {
  template: '{{ titleZh }}',
  fields: [
    { field: 'titleZh', name: 'titleZh', type: 'string', meta: { field: 'titleZh', type: 'string', interface: 'input' } },
    { field: 'titleEn', name: 'titleEn', type: 'string', meta: { field: 'titleEn', type: 'string', interface: 'input' } },
    { field: 'desZh', name: 'desZh', type: 'text', meta: { field: 'desZh', type: 'text', interface: 'input-rich-text-html' } },
    { field: 'desEn', name: 'desEn', type: 'text', meta: { field: 'desEn', type: 'text', interface: 'input-rich-text-html' } },
  ],
};

(async () => {
  // 1) collection（singleton，不存在才建；掛在 Legal folder 下）
  const exists = await req('GET', `/collections/${COL}`).then(() => true).catch(() => false);
  if (exists) console.log(`✓ ${COL} 已存在，略過建立`);
  else {
    console.log(`建立 ${COL}（singleton，Legal folder）...`);
    await req('POST', '/collections', {
      collection: COL,
      meta: {
        translations: zh('無障礙聲明 Accessibility'), singleton: true, group: 'Legal', sort: 3,
        note: '無障礙聲明（單獨一段；前台網站導覽頁讀 overview）', icon: 'accessibility',
      },
      schema: {},
      fields: [
        { field: 'id', type: 'integer', meta: { interface: 'input', readonly: true, hidden: true, sort: 1 }, schema: { is_primary_key: true, has_auto_increment: true } },
      ],
    });
  }

  // 2) 欄位（已存在則容錯略過）
  const FIELDS = [
    { field: 'titleEn', type: 'string', meta: { interface: 'input', sort: 2, translations: zh('標題（英）Title EN') } },
    { field: 'titleZh', type: 'string', meta: { interface: 'input', sort: 3, translations: zh('標題（中）Title ZH') } },
    { field: 'overviewEn', type: 'text', meta: { interface: 'input-multiline', sort: 4, translations: zh('綜述（英）Overview EN') } },
    { field: 'overviewZh', type: 'text', meta: { interface: 'input-multiline', sort: 5, translations: zh('綜述（中）Overview ZH') } },
    { field: 'points', type: 'json', meta: { interface: 'list', special: ['cast-json'], options: POINTS_OPTIONS, sort: 6, translations: zh('條款 Points') } },
    { field: 'lastUpdatedEn', type: 'string', meta: { interface: 'input', sort: 7, translations: zh('最後更新（英）') } },
    { field: 'lastUpdatedZh', type: 'string', meta: { interface: 'input', sort: 8, translations: zh('最後更新（中）') } },
  ];
  for (const f of FIELDS) {
    await req('POST', `/fields/${COL}`, { ...f, schema: {} })
      .then(() => console.log(`  欄位 ${f.field} ✓`))
      .catch(e => console.log(`  欄位 ${f.field}（略過：${e.message.slice(0, 80)}）`));
  }

  // 3) Public read（沒開＝前台 401）
  const pols = await req('GET', '/policies?limit=100&fields=id,name,admin_access,app_access').catch(() => ({ data: [] }));
  const pub = (pols.data || []).find(p => p.name === '$t:public_label') || (pols.data || []).find(p => !p.admin_access && !p.app_access);
  if (!pub) console.log('⚠️ 找不到 Public policy，請後台手動開讀權限');
  else {
    const perms = await req('GET', `/permissions?filter[collection][_eq]=${COL}&filter[action][_eq]=read`).catch(() => ({ data: [] }));
    if ((perms.data || []).some(p => p.policy === pub.id)) console.log('✓ Public read 已開');
    else { console.log('開 Public read...'); await req('POST', '/permissions', { policy: pub.id, collection: COL, action: 'read', fields: ['*'] }); }
  }

  // 4) 搬資料：singleton 空才 seed（idempotent）
  const src = (await req('GET', `/items/${SRC}?limit=-1`)).data || [];
  const a11yRow = src.find(isA11y);
  const cur = DRY ? {} : (await req('GET', `/items/${COL}`).catch(() => ({ data: {} }))).data || {};
  if (cur && (cur.titleEn || cur.overviewEn)) console.log('✓ singleton 已有內容，略過 seed');
  else if (!a11yRow) console.log('⚠️ policy_and_statements 找不到無障礙 row（可能已搬過）');
  else {
    console.log(`搬入無障礙 row（src id ${a11yRow.id}）...`);
    await req('PATCH', `/items/${COL}`, {
      titleEn: a11yRow.titleEn, titleZh: a11yRow.titleZh,
      overviewEn: a11yRow.overviewEn, overviewZh: a11yRow.overviewZh,
      points: a11yRow.points, lastUpdatedEn: a11yRow.lastUpdatedEn, lastUpdatedZh: a11yRow.lastUpdatedZh,
    });
  }

  // 5) 刪 policy_and_statements 的無障礙 row（確認 singleton 有資料才刪）
  if (a11yRow) {
    const check = DRY ? { titleEn: 'dry' } : (await req('GET', `/items/${COL}`)).data;
    if (check && (check.titleEn || check.overviewEn)) {
      console.log(`刪除 ${SRC} 無障礙 row（id ${a11yRow.id}）...`);
      await req('DELETE', `/items/${SRC}/${a11yRow.id}`);
    } else console.log('⚠️ singleton 內容未確認，先不刪原 row');
  }

  // 6) 更新 policy_and_statements note（對應現況）
  await req('PATCH', `/collections/${SRC}`, {
    meta: { note: '政策（隱私權與資訊安全政策等）。每列一段，sort 排序；前台 regulations 頁與規章一起渲染。無障礙聲明已拆至 accessibility_statement。' },
  }).catch(e => console.log(`note 更新略過：${e.message.slice(0, 80)}`));

  console.log(`\n✅ ${COL} 完成${DRY ? '（DRY，未寫入）' : ''}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
