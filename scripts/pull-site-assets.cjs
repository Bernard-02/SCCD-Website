// 後台 site_icons / site_cursors → 本地 fallback 檔（website-icons/、custom-cursor/）同步。
// 為什麼：前台開頁先畫本地檔，site-assets.js 約 1 秒後才換成後台檔 → 本地是舊稿＝每次重整閃一下舊圖
// （user 2026-10-02 default 游標案）。部署前跑一次＝部署出去的 fallback 跟後台一致，就沒有閃。
// make-upload-package.ps1 會先跑這支；GitHub 版 push 前跑 `npm run sync:assets`。
//
// 只覆蓋「本地已有同名檔」的 key：本地刻意刪掉的舊 slot（例：time.svg）不會被撈回來，沒對到的列出來給人看。
// 游標照 site-assets.js 同一套：強制 width/height=30（hotspot 以 30px 為準）。不需 token（兩個 collection 開 Public read）。
//
// 跑（repo 根目錄）：node scripts/pull-site-assets.cjs
// 學校主機沒送中繼憑證：瀏覽器/curl 會自己補、Node 不會（UNABLE_TO_VERIFY_LEAF_SIGNATURE）→ 同 scripts/ 其他 Directus 腳本關驗證
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

const API = 'https://sccdtest.usc.edu.tw/items';                 // 同 js/config/api.js CMS_API_BASE
const CDN = 'https://d2df28pyzslt2v.cloudfront.net/Directus';    // 同 js/config/api.js CMS_CDN_BASE
const ROOT = path.join(__dirname, '..');

const localPath = (col, key) =>
  col === 'site_icons' ? `website-icons/${key}.svg`
    : key.startsWith('award_cursor') ? `website-icons/Award_Icons/${key}.svg`
      : `custom-cursor/${key}.svg`;

const sized30 = (svg) => svg.replace(/<svg([^>]*)>/, (m, attrs) =>
  `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, '')} width="30" height="30">`);

const same = (a, b) => a.replace(/\r/g, '') === b.replace(/\r/g, '');

async function main() {
  const changed = [], unmatched = [];
  for (const col of ['site_icons', 'site_cursors']) {
    const res = await fetch(`${API}/${col}?fields=key,file.filename_disk&limit=-1`);
    if (!res.ok) throw new Error(`${col} → HTTP ${res.status}`);
    for (const { key, file } of (await res.json()).data) {
      const disk = file?.filename_disk;
      if (!disk) continue;                                   // 空 slot＝前台本來就吃本地檔
      const rel = localPath(col, key);
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs) || !disk.endsWith('.svg')) { unmatched.push(`${col}/${key} (${disk})`); continue; }
      const r = await fetch(`${CDN}/${disk}`);
      if (!r.ok) throw new Error(`${rel} ← ${disk} → HTTP ${r.status}`);
      let svg = await r.text();
      let local = fs.readFileSync(abs, 'utf8');
      // 兩邊都正規化再比：只差 width/height 屬性順序＝同一張圖，不改檔（免 9 個游標每次空轉出 diff）
      if (col === 'site_cursors' && !key.startsWith('award_cursor')) { svg = sized30(svg); local = sized30(local); }
      if (same(svg, local)) continue;
      fs.writeFileSync(abs, svg);
      changed.push(rel);
    }
  }
  console.log(changed.length ? `已更新 ${changed.length} 個本地檔：\n  ${changed.join('\n  ')}` : '本地檔已跟後台一致');
  if (unmatched.length) console.log(`後台有檔、本地沒對應（未同步）：\n  ${unmatched.join('\n  ')}`);
}

main().catch((e) => {
  // 不擋出包：抓不到後台＝沿用現有本地檔，但要讓人看到
  console.warn(`⚠️ 後台 icon/游標同步失敗，沿用現有本地檔：${e.message}`);
});
