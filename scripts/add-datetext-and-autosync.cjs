// 年份搜尋補強＋自動同步（user 2026-09-10）：
//   1) dateText 唯讀欄：日期全文（"2010/09/30"、範圍 "–"、多組逗號串；yearOnly=YYYY、monthOnly=YYYY/MM）
//      → 後台搜「2010」「2010/」「2010/09」全命中；跨年活動兩個年份都搜得到（year 整數欄只存首年）
//   2) year＋dateText 掛 Flow 自動同步（新增/編輯免手動填＝修掉「新 item 搜不到」的不對齊）：
//      - 有 dates repeater 的表：擴充既有「activities dates→startDate 同步」Flow（一併吐 year/dateText、scope 補齊）
//      - 只有 startDate 的表（sessions/DSD events 等）：另建小 Flow 監聽 startDate
//   3) year 欄改唯讀（自動產生、勿手填）；重跑回填補齊既有缺漏（含 year=null 的新 item）
//   4) locations 清單顯示改與 guests 同款：{{ nameZh }} {{ nameEn }}（多個收 N items 點開看中英）
// idempotent；先看：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/add-datetext-and-autosync.cjs --dry
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, path, body) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${path}`); return { data: {} }; }
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// ── 共用組字（flow exec 內是同邏輯的 ES5 版）──
// ⚠️ 有 end 一律帶出範圍（舊資料有 monthOnly+end 的月到月跨年 shape，忽略 end 會讓跨年搜尋漏）
const fmtGroup = g => {
  if (!g || !g.start) return '';
  const s = String(g.start).slice(0, 10).split('-');
  const e = g.end ? String(g.end).slice(0, 10).split('-') : null;
  if (g.yearOnly) return (e && e[0] !== s[0]) ? s[0] + '–' + e[0] : s[0];
  if (g.monthOnly || g.monthRange) {
    const a = s[0] + '/' + s[1];
    return (e && (e[0] !== s[0] || e[1] !== s[1])) ? a + '–' + e[0] + '/' + e[1] : a;
  }
  const sd = s.join('/');
  return (e && g.end !== g.start) ? sd + '–' + e.join('/') : sd;
};
const dateTextOf = it => {
  if (Array.isArray(it.dates) && it.dates.length) return it.dates.map(fmtGroup).filter(Boolean).join(', ');
  return fmtGroup({ start: it.startDate, end: it.endDate });
};
const yearOf = it => {
  if (Array.isArray(it.dates)) { const d = it.dates.find(x => x && x.start); if (d) { const y = +String(d.start).slice(0, 4); if (y) return y; } }
  if (it.startDate) { const y = +String(it.startDate).slice(0, 4); if (y) return y; }
  return null;
};

// flow exec 共用片段（ES5、ASCII-safe；REPEATER 版吃 p.dates、SCALAR 版吃 p.startDate/endDate）
const FMT_ES5 = 'function fmtG(g){ if(!g || !g.start) return ""; var s=String(g.start).slice(0,10).split("-"); var e=g.end?String(g.end).slice(0,10).split("-"):null; if(g.yearOnly) return (e && e[0]!==s[0])? s[0]+"\\u2013"+e[0] : s[0]; if(g.monthOnly || g.monthRange){ var a=s[0]+"/"+s[1]; return (e && (e[0]!==s[0] || e[1]!==s[1]))? a+"\\u2013"+e[0]+"/"+e[1] : a; } var sd=s.join("/"); return (e && g.end!==g.start)? sd+"\\u2013"+e.join("/") : sd; }';
const REPEATER_EXEC = 'module.exports = function(data){ var t = data["$trigger"] || {}; var p = t.payload || {}; var key = (t.key != null) ? t.key : ((t.keys && t.keys.length) ? t.keys[0] : null); ' + FMT_ES5 + ' function norm(x){ return x ? String(x).slice(0,10) : null; } var arr = Array.isArray(p.dates) ? p.dates : []; var first = null; for (var i=0;i<arr.length;i++){ if(arr[i] && arr[i].start){ first = arr[i]; break; } } var year = first ? (parseInt(String(first.start).slice(0,4),10) || null) : null; var text = arr.map(fmtG).filter(Boolean).join(", "); var d0 = arr.length ? arr[0] : null; return { key: key, startDate: d0 ? norm(d0.start) : null, endDate: (d0 && d0.end) ? norm(d0.end) : null, year: year, dateText: text }; };';
const SCALAR_EXEC = 'module.exports = function(data){ var t = data["$trigger"] || {}; var p = t.payload || {}; var key = (t.key != null) ? t.key : ((t.keys && t.keys.length) ? t.keys[0] : null); ' + FMT_ES5 + ' var year = p.startDate ? (parseInt(String(p.startDate).slice(0,4),10) || null) : null; var text = fmtG({ start: p.startDate, end: p.endDate }); return { key: key, year: year, dateText: text }; };';

(async () => {
  const all = (await req('GET', '/fields')).data || [];
  const byCol = {};
  for (const f of all) (byCol[f.collection] ||= new Map()).set(f.field, f);
  const isTarget = c => /^activities_|^admission_summer_camp$/.test(c);
  const targets = Object.keys(byCol).filter(c => isTarget(c) && (byCol[c].has('dates') || byCol[c].has('startDate'))).sort();
  const repeaterCols = targets.filter(c => byCol[c].has('dates'));
  const scalarCols = targets.filter(c => !byCol[c].has('dates'));
  console.log('repeater 表：', repeaterCols.join(', '));
  console.log('scalar 表：', scalarCols.join(', '));

  // ── 1) dateText 欄＋year 改唯讀 ──
  for (const col of targets) {
    if (!byCol[col].has('dateText')) {
      await req('POST', `/fields/${col}`, { field: 'dateText', type: 'text',
        meta: { interface: 'input', readonly: true, width: 'half', note: '日期（自動由日期欄產生；搜尋 2010、2010/、2010/09 皆可命中，勿手改）' }, schema: {} });
      if (!DRY) {
        let ok = false;
        for (let i = 0; i < 5 && !ok; i++) { await new Promise(r => setTimeout(r, 700)); ok = !!(await req('GET', `/fields/${col}/dateText`).catch(() => null))?.data?.field; }
        if (!ok) throw new Error(`${col}.dateText 建欄後驗證不到，中止`);
      }
      console.log(`＋ ${col}.dateText`);
    }
    const yf = byCol[col].get('year');
    if (yf && !yf.meta?.readonly) {
      yf.meta = { ...(yf.meta || {}), readonly: true, note: '年份（自動由日期產生，勿手填；搜尋框輸入年份靠此欄命中）' };
      await req('PATCH', `/fields/${col}/year`, { meta: yf.meta });
      console.log(`✓ ${col}.year → 唯讀`);
    }
  }

  // ── 2) Flow：repeater 版擴充既有 dates→startDate；scalar 版另建 ──
  const flows = (await req('GET', '/flows?fields=id,name,options,operations.id,operations.type')).data || [];
  const dFlow = flows.find(f => /dates→startDate/.test(f.name));
  if (!dFlow) throw new Error('找不到 dates→startDate flow');
  const dExec = dFlow.operations.find(o => o.type === 'exec');
  const dWrite = dFlow.operations.find(o => o.type === 'item-update');
  await req('PATCH', `/operations/${dExec.id}`, { options: { code: REPEATER_EXEC } });
  await req('PATCH', `/operations/${dWrite.id}`, { options: { collection: '{{$trigger.collection}}', key: '{{extract.key}}',
    payload: { startDate: '{{extract.startDate}}', endDate: '{{extract.endDate}}', year: '{{extract.year}}', dateText: '{{extract.dateText}}' },
    emitEvents: false, permissions: '$full' } });
  const scopeNow = dFlow.options?.collections || [];
  const scopeAdd = repeaterCols.filter(c => !scopeNow.includes(c));
  if (scopeAdd.length) {
    await req('PATCH', `/flows/${dFlow.id}`, { options: { ...dFlow.options, collections: [...scopeNow, ...scopeAdd] } });
    console.log('✓ dates flow scope 補：', scopeAdd.join(', '));
  }
  await req('PATCH', `/flows/${dFlow.id}`, { name: 'activities dates→startDate/year/dateText 同步' });
  console.log('✓ dates flow 擴充（吐 year＋dateText）');

  if (scalarCols.length && !flows.some(f => /startDate→year/.test(f.name))) {
    if (DRY) { console.log(`[dry] 建 Flow「startDate→year/dateText 同步」scope：${scalarCols.join(', ')}`); }
    else {
      const flow = (await req('POST', '/flows', { name: 'startDate→year/dateText 同步', icon: 'sync', status: 'active', trigger: 'event', accountability: 'all',
        options: { type: 'action', scope: ['items.create', 'items.update'], collections: scalarCols } })).data;
      const w = (await req('POST', '/operations', { flow: flow.id, name: '寫入 year/dateText', key: 'write_text', type: 'item-update', position_x: 37, position_y: 1,
        options: { collection: '{{$trigger.collection}}', key: '{{extract.key}}', payload: { year: '{{extract.year}}', dateText: '{{extract.dateText}}' }, emitEvents: false, permissions: '$full' } })).data;
      const x = (await req('POST', '/operations', { flow: flow.id, name: '算 year/dateText', key: 'extract', type: 'exec', position_x: 19, position_y: 1,
        options: { code: SCALAR_EXEC }, resolve: w.id })).data;
      const c = (await req('POST', '/operations', { flow: flow.id, name: 'startDate 有變更才跑', key: 'has_src', type: 'condition', position_x: 1, position_y: 1,
        options: { filter: { $trigger: { payload: { startDate: { _nnull: true } } } } }, resolve: x.id })).data;
      await req('PATCH', `/flows/${flow.id}`, { operation: c.id });
      console.log(`✓ scalar flow 建立（${scalarCols.join(', ')}）`);
    }
  } else if (scalarCols.length) console.log('↷ scalar flow 已存在');

  // ── 3) 回填 year＋dateText（含補 year=null 的新 item）──
  for (const col of targets) {
    const flds = ['id', byCol[col].has('dates') && 'dates', byCol[col].has('startDate') && 'startDate', byCol[col].has('endDate') && 'endDate',
      byCol[col].has('year') && 'year', byCol[col].has('dateText') && 'dateText'].filter(Boolean).join(',');
    const rows = (await req('GET', `/items/${col}?limit=-1&fields=${flds}`)).data || [];
    let set = 0;
    for (const it of rows) {
      const y = yearOf(it), t = dateTextOf(it);
      const diff = {};
      if (y && it.year !== y) diff.year = y;
      if ((it.dateText || '') !== t) diff.dateText = t;
      if (Object.keys(diff).length) { await req('PATCH', `/items/${col}/${it.id}`, diff); set++; }
    }
    console.log(`  ${col}：回填 ${set}/${rows.length}`);
  }

  // ── 4) locations 顯示改與 guests 同款（中英、多個收 N items）──
  for (const col of Object.keys(byCol)) {
    const lf = byCol[col].get('locations');
    if (!lf || lf.meta?.interface !== 'list' || !isTarget(col)) continue;
    const want = '{{ nameZh }} {{ nameEn }}';
    if (lf.meta.display_options?.format === want) continue;
    lf.meta.display = 'formatted-json-value';
    (lf.meta.display_options ||= {}).format = want;
    await req('PATCH', `/fields/${col}/locations`, { meta: lf.meta });
    console.log(`✓ ${col}.locations display → 中英`);
  }
  console.log(DRY ? '\n[dry] 以上為預覽，未實際寫入。' : '\n✅ 完成。後台硬重整；搜尋 2010／2010/／2010/09 皆可命中，year/dateText 之後自動同步。');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
