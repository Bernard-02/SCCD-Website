// 匯入全站圖示/游標到 Directus：上傳 SVG → 建 site_icons / site_cursors items。
// 對照不手寫：icons 直接 parse css/components/icon.css 抽「class ↔ 檔名」；
// icon.css 沒引用的 website-icons 根目錄檔（create 面板圖示）也一併收，key 一律＝檔名主幹。
// idempotent：key 已存在就 skip，可重跑。
//
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/import-site-assets.cjs [--dry]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const AUTH = { Authorization: 'Bearer ' + token };
const H = { ...AUTH, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');

async function req(method, p, body) {
  const res = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const out = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

async function uploadFile(folderId, absPath, filename) {
  const fd = new FormData();
  fd.append('folder', folderId);
  fd.append('file', new Blob([fs.readFileSync(absPath)], { type: 'image/svg+xml' }), filename);
  const res = await fetch(`${BASE}/files`, { method: 'POST', headers: AUTH, body: fd });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`upload ${filename} → ${res.status} ${JSON.stringify(out).slice(0, 200)}`);
  return out.data.id;
}

const CURSOR_NOTES = {
  default: '一般游標', pointer: '可點擊', typing: '文字輸入', ban: '禁用/不可操作',
  'zoom-in': '放大', 'zoom-out': '縮小', drag_1: '可抓取', drag_2: '抓取中',
  left: '往左（resize/翻頁）', right: '往右（resize/翻頁）',
};

(async () => {
  // 1) 收集清單
  const css = fs.readFileSync('css/components/icon.css', 'utf8');
  const classByFile = {}; // 'arrow_left.svg' → 'icon-arrow-left'
  for (const m of css.matchAll(/\.(icon-[\w-]+)\s*\{\s*--icon:\s*url\('\.\.\/website-icons\/([^']+)'\)/g)) {
    classByFile[m[2]] = m[1];
  }
  const icons = fs.readdirSync('website-icons').filter(f => f.endsWith('.svg')).map(f => ({
    key: f.replace(/\.svg$/, ''), file: path.join('website-icons', f), filename: f,
    note: classByFile[f] ? `CSS class .${classByFile[f]}` : '/create 面板圖示',
  }));
  const cursors = [
    ...fs.readdirSync('custom-cursor').filter(f => f.endsWith('.svg')).map(f => ({
      key: f.replace(/\.svg$/, ''), file: path.join('custom-cursor', f), filename: f,
      note: CURSOR_NOTES[f.replace(/\.svg$/, '')] || '',
    })),
    ...fs.readdirSync('website-icons/Award_Icons').filter(f => f.endsWith('.svg')).map(f => ({
      key: f.replace(/\.svg$/, ''), file: path.join('website-icons/Award_Icons', f), filename: f,
      note: 'library 得獎清單游標',
    })),
  ];
  console.log(`icons ${icons.length} 筆（icon.css 對到 ${Object.keys(classByFile).length}）／cursors ${cursors.length} 筆`);
  if (DRY) {
    icons.forEach(i => console.log(`  [icon]   ${i.key}  ←  ${i.file}  （${i.note}）`));
    cursors.forEach(c => console.log(`  [cursor] ${c.key}  ←  ${c.file}  （${c.note}）`));
    return console.log('（DRY，未寫入）');
  }

  // 2) 檔案資料夾（idempotent）
  const found = await req('GET', `/folders?filter[name][_eq]=${encodeURIComponent('全站圖示與游標')}&fields=id`);
  const folderId = found.data?.[0]?.id || (await req('POST', '/folders', { name: '全站圖示與游標' })).data.id;

  // 3) 逐筆上傳 + 建 item（key 已存在 skip）
  for (const [col, list] of [['site_icons', icons], ['site_cursors', cursors]]) {
    const existing = new Set((await req('GET', `/items/${col}?limit=-1&fields=key`)).data.map(i => i.key));
    let n = 0, sort = 0;
    for (const it of list) {
      sort += 1;
      if (existing.has(it.key)) { console.log(`  ✓ ${col}/${it.key} 已存在，skip`); continue; }
      const fileId = await uploadFile(folderId, it.file, it.filename);
      await req('POST', `/items/${col}`, { key: it.key, note: it.note, file: fileId, sort });
      n += 1;
      console.log(`  ↑ ${col}/${it.key}`);
    }
    console.log(`✅ ${col}：新增 ${n}／共 ${list.length}`);
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
