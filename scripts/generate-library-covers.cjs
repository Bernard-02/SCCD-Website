// 批次自動產 library 封面（documents + press）：pdf.js headless render 第一頁 → JPEG → 上傳 Directus → 設 cover 欄位。
// press 是網頁長文 PDF → cropAspect 1.5 只取頂部（對齊前台縮圖）；documents 用完整第一頁。
// 前台 mapDirectusFilesRow / mapDirectusPressRow 讀 row.cover：有值就直接用圖、不再現畫 → 面板秒揭示（免 pdf.js 閘門）。
// idempotent：已有 cover 的跳過。--limit N 先測幾本；--force 連已有 cover 也重產。
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/generate-library-covers.cjs --limit 1
// 每天由 GitHub Actions（.github/workflows/generate-covers.yml）自動跑一次補新書封面。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const { chromium } = require('playwright');
// CI（GitHub Actions）讀環境變數 DIRECTUS_TOKEN；本機讀 scripts/.directus-token（gitignore）
const token = (process.env.DIRECTUS_TOKEN || fs.readFileSync('scripts/.directus-token', 'utf8')).trim();
const H = { Authorization: 'Bearer ' + token };
const BASE = 'https://sccdtest.usc.edu.tw';
const ASSETS = BASE + '/assets';
const PDFJS  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
// CID 字型用預定義外部 CMap 的 PDF（中文舊檔常見）→ 沒給 cMapUrl 就整段中文缺字（原生 PDF viewer 有系統中文字型故看起來正常，pdf.js 沒有）。
// cdnjs 不供 cmaps（403）→ 用 jsdelivr pdfjs-dist cmaps。
const CMAPS  = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/';
// 非嵌入標準字型（Helvetica/Times 等）→ 沒 standardFontDataUrl 會缺字（同前台 pdf-cover / library-viewer）。版本對齊此腳本用的 pdf.js 3.11.174。
const STD_FONTS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/';
const LONG_EDGE = 800;         // 封面縮圖不用大
const QUALITY   = 0.8;
const argN = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };
const LIMIT = argN('--limit') ? parseInt(argN('--limit'), 10) : Infinity;
const FORCE = process.argv.includes('--force');

// 要產封面的 collection：documents 用完整第一頁；press 是網頁長文 PDF → cropAspect 1.5 只取頂部（對齊前台縮圖）
const COLLECTIONS = [
  { name: 'library_documents', fields: 'id,titleZh,pdf,pdfLink,cover', cropAspect: 0,   folder: 'document' },
  { name: 'library_press',     fields: 'id,titleZh,pdf,cover',         cropAspect: 1.5, folder: 'press' },
];

// Directus 虛擬資料夾 Cover/document、Cover/press：封面統一收納，上傳時掛 folder。idempotent（有就用、沒有才建）。
async function ensureFolder(name, parent = null) {
  const filt = parent ? `&filter[parent][_eq]=${parent}` : '&filter[parent][_null]=true';
  const got = (await (await fetch(`${BASE}/folders?filter[name][_eq]=${encodeURIComponent(name)}${filt}`, { headers: H })).json()).data;
  if (got?.length) return got[0].id;
  const made = await (await fetch(`${BASE}/folders`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent }),
  })).json();
  if (!made?.data?.id) throw new Error('建資料夾失敗 ' + JSON.stringify(made).slice(0, 200));
  return made.data.id;
}

(async () => {
  // 本機用系統 Chrome（channel:'chrome' 免下載）；CI 用 playwright 自帶 chromium（workflow 已 install，無系統 Chrome）
  const launchOpts = { headless: true };
  if (!process.env.CI) launchOpts.channel = 'chrome';
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset=utf-8>');
  await page.addScriptTag({ url: PDFJS });

  const coverRoot = await ensureFolder('Cover');

  let ok = 0, fail = 0;
  for (const col of COLLECTIONS) {
    col.folderId = await ensureFolder(col.folder, coverRoot);
    const rows = (await (await fetch(`${BASE}/items/${col.name}?fields=${col.fields}&limit=-1`, { headers: H })).json()).data;
    // pdfLink（CloudFront 網址）是 08-18 後主要形態、pdf UUID 是舊/press 形態，兩者有其一就能產
    const todo = rows.filter(r => (r.pdf || r.pdfLink) && (FORCE || !r.cover)).slice(0, LIMIT);
    console.log(`\n[${col.name}] ${rows.length} 筆，需要產封面：${todo.length} 筆${LIMIT !== Infinity ? `（--limit ${LIMIT}）` : ''}`);
    if (!todo.length) continue;

    for (const r of todo) {
      const pdfUrl = r.pdfLink || `${ASSETS}/${r.pdf}`;   // 有 CloudFront link 優先、否則 Directus 原檔
      try {
        const b64 = await page.evaluate(async ({ pdfUrl, WORKER, CMAPS, STD_FONTS, LONG_EDGE, QUALITY, cropAspect }) => {
          pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
          const doc = await pdfjsLib.getDocument({ url: pdfUrl, disableAutoFetch: true, disableStream: true, cMapUrl: CMAPS, cMapPacked: true, standardFontDataUrl: STD_FONTS }).promise;
          const p = await doc.getPage(1);
          const nat = p.getViewport({ scale: 1 });
          const scale = LONG_EDGE / Math.max(nat.width, nat.height);
          const vp = p.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width);
          // cropAspect>0：canvas 設矮到 寬×cropAspect，page 從(0,0)畫、底部裁掉＝只留頂部（同前台 renderPdfCover 裁頂）
          const fullH = Math.round(vp.height);
          c.height = cropAspect ? Math.min(fullH, Math.round(vp.width * cropAspect)) : fullH;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);   // 白底：PDF 透明區轉 JPEG 才不變黑
          await p.render({ canvasContext: ctx, viewport: vp }).promise;
          return c.toDataURL('image/jpeg', QUALITY).split(',')[1];
        }, { pdfUrl, WORKER, CMAPS, STD_FONTS, LONG_EDGE, QUALITY, cropAspect: col.cropAspect });

        // 上傳到 Directus /files（multipart）
        const buf = Buffer.from(b64, 'base64');
        const fd = new FormData();
        fd.append('title', `cover ${r.titleZh || r.id}`);
        fd.append('folder', col.folderId);   // 非 file 欄位必須排在 file 之前，Directus 才吃得到
        fd.append('file', new Blob([buf], { type: 'image/jpeg' }), `cover-${r.id}.jpg`);
        const up = await (await fetch(`${BASE}/files`, { method: 'POST', headers: H, body: fd })).json();
        if (!up?.data?.id) throw new Error('上傳失敗 ' + JSON.stringify(up).slice(0, 200));

        // 設 cover 欄位
        const patch = await fetch(`${BASE}/items/${col.name}/${r.id}`, {
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
  }
  await browser.close();
  console.log(`\n完成：成功 ${ok}、失敗 ${fail}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
