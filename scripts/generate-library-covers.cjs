// 批次自動產 library_documents 封面：pdf.js headless render 每本第一頁 → JPEG → 上傳 Directus → 設 cover 欄位。
// 前台 mapDirectusFilesRow 讀 row.cover：有值就直接用圖、不再現畫 → Documents 面板秒揭示（免那 1s 封面閘門）。
// idempotent：已有 cover 的跳過。--limit N 先測幾本；--force 連已有 cover 也重產。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/generate-library-covers.cjs --limit 1
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const { chromium } = require('playwright');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const H = { Authorization: 'Bearer ' + token };
const BASE = 'https://sccdtest.usc.edu.tw';
const ASSETS = BASE + '/assets';
const PDFJS  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const LONG_EDGE = 800;         // 封面縮圖不用大
const QUALITY   = 0.8;
const argN = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };
const LIMIT = argN('--limit') ? parseInt(argN('--limit'), 10) : Infinity;
const FORCE = process.argv.includes('--force');

(async () => {
  const rows = (await (await fetch(`${BASE}/items/library_documents?fields=id,titleZh,pdf,pdfLink,cover&limit=-1`, { headers: H })).json()).data;
  // pdfLink（CloudFront 網址）是 08-18 後的主要形態、pdf UUID 是舊形態，兩者有其一就能產
  const todo = rows.filter(r => (r.pdf || r.pdfLink) && (FORCE || !r.cover)).slice(0, LIMIT);
  console.log(`${rows.length} 本，需要產封面：${todo.length} 本${LIMIT !== Infinity ? `（--limit ${LIMIT}）` : ''}`);
  if (!todo.length) { console.log('沒有要做的。'); return; }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset=utf-8>');
  await page.addScriptTag({ url: PDFJS });

  let ok = 0, fail = 0;
  for (const r of todo) {
    const pdfUrl = r.pdfLink || `${ASSETS}/${r.pdf}`;   // 有 CloudFront link 優先、否則 Directus 原檔
    try {
      const b64 = await page.evaluate(async ({ pdfUrl, WORKER, LONG_EDGE, QUALITY }) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
        const doc = await pdfjsLib.getDocument({ url: pdfUrl, disableAutoFetch: true, disableStream: true }).promise;
        const p = await doc.getPage(1);
        const nat = p.getViewport({ scale: 1 });
        const scale = LONG_EDGE / Math.max(nat.width, nat.height);
        const vp = p.getViewport({ scale });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        return c.toDataURL('image/jpeg', QUALITY).split(',')[1];
      }, { pdfUrl, WORKER, LONG_EDGE, QUALITY });

      // 上傳到 Directus /files（multipart）
      const buf = Buffer.from(b64, 'base64');
      const fd = new FormData();
      fd.append('title', `cover ${r.titleZh || r.id}`);
      fd.append('file', new Blob([buf], { type: 'image/jpeg' }), `cover-${r.id}.jpg`);
      const up = await (await fetch(`${BASE}/files`, { method: 'POST', headers: H, body: fd })).json();
      if (!up?.data?.id) throw new Error('上傳失敗 ' + JSON.stringify(up).slice(0, 200));

      // 設 cover 欄位
      const patch = await fetch(`${BASE}/items/library_documents/${r.id}`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover: up.data.id }),
      });
      if (!patch.ok) throw new Error('PATCH cover 失敗 ' + patch.status);
      ok++;
      console.log(`  ✓ ${r.titleZh || r.id}  封面 ${(buf.length / 1024).toFixed(0)}KB → file ${up.data.id}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${r.titleZh || r.id}: ${e.message}`);
    }
  }
  await browser.close();
  console.log(`\n完成：成功 ${ok}、失敗 ${fail}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
