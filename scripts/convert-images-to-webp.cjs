// 批次把 Directus 檔案庫的 raster 圖（jpeg/png）「原地」轉成 webp：同 UUID → /assets/{uuid} 直接吐 webp、前台零改。
// 為何離線轉檔而非伺服器 on-the-fly transform：這台弱 Lightsail 扛不住現場轉檔（多圖頁首訪冷生成 504、連 pre-warm 都把
//   /assets 打到 403，見 2026-08-20 session）。存回成品後伺服器只是「serve 靜態檔」＝零轉檔負載、且檔更小 → 更快。
// ⚠️ 破壞性且不可復原：原檔被 1600px webp 蓋掉、不留備份（user 2026-08-28 定案不需備份，高解析 source 檔另存他處）。
// idempotent：轉過的已是 image/webp，type filter 不會再選到 → 中斷可重跑接續；每天由 GitHub Actions 自動補轉新上傳的圖。
//
// 跑（repo 根目錄，需 scripts/.directus-token；平時掛在 .github/workflows/generate-covers.yml 每日自動跑）：
//   node scripts/convert-images-to-webp.cjs --limit 1 --dry   # 只轉一張看省多少、不寫回（自驗管線）
//   node scripts/convert-images-to-webp.cjs --limit 1         # 真的換一張 → 開該檔 /assets URL 確認是 webp
//   node scripts/convert-images-to-webp.cjs                   # 全轉
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const { chromium } = require('playwright');

const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token };
const BASE = 'https://sccdtest.usc.edu.tw';
const ASSETS = BASE + '/assets';
const MAX_EDGE = 1600;   // 前台最大顯示寬（對齊舊 dsd transform width=1600）；小圖不放大
const QUALITY = 0.8;

const argN = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const LIMIT = argN('--limit') ? parseInt(argN('--limit'), 10) : Infinity;
const DRY = process.argv.includes('--dry');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: 'chrome' }) });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset=utf-8>');

  // 只挑 raster 原圖：jpeg/png。webp（已轉）/svg（向量不可轉）/pdf/影片都跳過。
  const q = encodeURIComponent('image/jpeg,image/png');
  const files = (await (await fetch(`${BASE}/files?filter[type][_in]=${q}&fields=id,type,filename_download,filesize&limit=-1`, { headers: H })).json()).data || [];
  const todo = files.slice(0, LIMIT);
  console.log(`檔案庫 jpeg/png：${files.length} 張，本次處理 ${todo.length} 張${DRY ? '（--dry 不寫回）' : ''}`);

  let ok = 0, skip = 0, fail = 0, saved = 0;
  for (const f of todo) {
    try {
      // 抓原檔 bytes（同時當備份來源、也餵瀏覽器轉檔 → 只下載一次；data URL 來源不會 taint canvas）
      const origBuf = Buffer.from(await (await fetch(`${ASSETS}/${f.id}`, { headers: H })).arrayBuffer());
      const dataUrl = `data:${f.type};base64,${origBuf.toString('base64')}`;

      const b64 = await page.evaluate(async ({ dataUrl, maxEdge, quality }) => {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode fail')); img.src = dataUrl; });
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));  // 小圖不放大
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);   // 不填白底：保留 PNG 透明（webp 支援 alpha）
        return c.toDataURL('image/webp', quality).split(',')[1];
      }, { dataUrl, maxEdge: MAX_EDGE, quality: QUALITY });
      const webpBuf = Buffer.from(b64, 'base64');

      // webp 沒比原檔小就別換（極少數已高度壓縮的小 JPEG 會反增）
      if (webpBuf.length >= origBuf.length) {
        skip++;
        console.log(`  – ${f.filename_download}  webp ${(webpBuf.length/1024).toFixed(0)}KB ≥ 原 ${(origBuf.length/1024).toFixed(0)}KB，跳過`);
        continue;
      }
      console.log(`  ${DRY ? '·' : '✓'} ${f.filename_download}  ${(origBuf.length/1024).toFixed(0)}KB → ${(webpBuf.length/1024).toFixed(0)}KB`);
      saved += origBuf.length - webpBuf.length;
      if (DRY) { ok++; continue; }

      // 原地換內容（同 UUID、不留備份）：PATCH /files/{id} multipart（field=file，同 upload；boundary 交給 FormData）
      const base = (f.filename_download || f.id).replace(/\.[^.]+$/, '');
      const fd = new FormData();
      fd.append('file', new Blob([webpBuf], { type: 'image/webp' }), `${base}.webp`);
      const up = await fetch(`${BASE}/files/${f.id}`, { method: 'PATCH', headers: H, body: fd });
      if (!up.ok) throw new Error(`PATCH ${up.status} ${(await up.text()).slice(0, 150)}`);
      ok++;
    } catch (e) {
      fail++;
      console.log(`  ✗ ${f.filename_download || f.id}: ${e.message}`);
    }
  }
  await browser.close();
  console.log(`\n完成：轉 ${ok}、跳過 ${skip}、失敗 ${fail}；省 ${(saved/1024/1024).toFixed(1)}MB${DRY ? '（預估，未寫回）' : ''}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
