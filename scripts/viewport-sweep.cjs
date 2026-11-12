// 視口總表：各頁 × 各裝置尺寸逐屏截圖＋自動檢查（JS／console 錯誤、頁面可橫向捲、header・footer 鈕跑出畫面），
// 輸出 ../SCCD-視口總表/index.html（放 repo 外＝不觸發 Live Server 重整、不會被 commit）。版面對不對還是靠人眼掃總表。
// 用法：npm run sweep                      全部（18 尺寸 × 18 列，~14 分鐘）
//       npm run sweep -- --pages about,library --sizes ipad,390x844     只重跑這幾列
//       其他：--mode inverse|color、--browser webkit（近似 Safari）、--screens 8（每頁最多截幾屏）、--jobs 3（同時跑幾個尺寸）
// 總表是累積的：每次只蓋掉這次重跑的那幾列（rows.json 記全部列），其餘留著——不整個清掉，有人可能正開著總表在看。
// --mode／--browser webkit 各自一個資料夾（SCCD-視口總表-color…），不跟預設那份混。
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium, webkit } = require('playwright');

const ROOT = path.join(__dirname, '..');

// [篩選用 tag, 標籤, 寬, 高, 觸控]；尺寸來源＝CLAUDE.md 測試 checklist（Duo＝WebKit 官方 Safari viewport）
const SIZES = [
  ['phone', '手機直', 375, 667, 1], ['phone', '手機直', 390, 844, 1], ['phone', '手機直', 430, 932, 1],
  ['duo', 'Duo 外', 382, 580, 1], ['duo', 'Duo 外橫', 594, 368, 1], ['duo', 'Duo 內直', 669, 867, 1], ['duo', 'Duo 內橫', 951, 585, 1],
  ['landscape', '橫向手機', 667, 375, 1], ['landscape', '橫向手機', 844, 390, 1],
  ['ipad', 'iPad 直', 768, 1024, 1], ['ipad', 'iPad 直', 820, 1180, 1], ['ipad', 'iPad 直', 1032, 1376, 1],
  ['ipad', 'iPad 橫', 1180, 820, 1], ['ipad', 'iPad 橫', 1376, 1032, 1],
  ['desktop', '桌面', 1280, 720, 0], ['desktop', '桌面', 1440, 900, 0], ['desktop', '桌面', 1920, 1080, 0], ['desktop', '桌面', 2560, 1440, 0],
];
// menu-footer＝不是頁面：在 about 上開 menu、開 footer 各截一張（這兩個是跟著尺寸變的全站 chrome）
// alumni 不掃（user 2026-11-12「可以跳過」：頁面暫時隱藏、nav 沒入口）；要掃就加回這裡
// library＝預設分頁 Awards；其餘三個分頁各一列（網址帶分頁 hash 直開，user 2026-11-12）
const PAGES = ['index', 'about', 'faculty', 'curriculum', 'activities', 'admission',
  'library', 'library-press', 'library-files', 'library-album', 'atlas', 'create',
  'degree-show-detail', 'donate', 'regulations', 'sitemap', '404', 'menu-footer'];
const urlOf = p => p === 'index' ? 'index.html' : p === 'menu-footer' ? 'pages/about.html'
  : p.startsWith('library-') ? `pages/library.html#${p.slice(8)}`
  : `pages/${p}.html${p === 'degree-show-detail' ? '?year=2025' : ''}`;

const IGNORE = /youtube|googleapis|doubleclick|compute-pressure|Failed to load resource|ERR_|favicon/i;   // 第三方（compute-pressure＝YouTube embed）與圖片 404 不算
const MIME = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', pdf: 'application/pdf' };

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const pick = (list, key, f) => f ? list.filter(x => f.split(',').some(s => key(x).includes(s))) : list;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 自帶 static server（no-store）：外面那支 server 可能快取舊 JS，量到假的結果
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

(async () => {
  const sizes = pick(SIZES, s => `${s[0]} ${s[2]}x${s[3]}`, arg('sizes'));
  const pages = pick(PAGES, p => p, arg('pages'));
  const mode = arg('mode'), screens = +arg('screens', 8), engine = arg('browser', 'chrome');
  const OUT = path.join(ROOT, '..', 'SCCD-視口總表' + (mode ? `-${mode}` : '') + (engine === 'webkit' ? '-webkit' : ''));

  await fetch('https://sccdadmin.usc.edu.tw/items/ui_labels?limit=1', { signal: AbortSignal.timeout(8000) })
    .then(r => { if (!r.ok) throw 0; })
    .catch(() => console.warn('⚠ 後台連不上：截到的會是 COMING SOON，不是真內容'));

  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
  const rows = pages.flatMap(p => sizes.map(s => ({ page: p, label: s[1], w: s[2], h: s[3], shots: [], issues: [], t: Date.now() })));

  async function runSize(s) {
    const [, label, w, h, touch] = s, dir = `${w}x${h}`;
    fs.mkdirSync(path.join(OUT, dir), { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch });
    if (mode) await ctx.addInitScript(m => sessionStorage.setItem('sccd-theme-mode', m), mode);
    for (const p of pages) {
      const row = rows.find(r => r.page === p && r.w === w && r.h === h);
      const page = await ctx.newPage();
      page.on('pageerror', e => row.issues.push('JS 錯誤：' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) row.issues.push('console：' + m.text().slice(0, 160)); });
      const shot = async () => {
        const f = `${dir}/${p}-${row.shots.length}.jpg`;
        await page.screenshot({ path: path.join(OUT, f), type: 'jpeg', quality: 60 });
        row.shots.push(f);
      };
      const click = sel => page.evaluate(q => [...document.querySelectorAll(q)].find(b => b.getClientRects().length)?.click(), sel);
      try {
        await page.goto(base + urlOf(p), { waitUntil: 'load' });
        await page.waitForTimeout(p === 'index' ? 7000 : 2600);   // 首頁多等 intro＋footer 鈕進場
        if (p === 'menu-footer') {
          await click('.mobile-menu-btn'); await page.waitForTimeout(1200); await shot();
          await click('.mobile-menu-btn'); await page.waitForTimeout(1200);
          await click('.footer-btn'); await page.waitForTimeout(1200); await shot();
        } else {
          const out = await page.evaluate(() => ['#header-logo', '#header-logo-mobile', '#mode-btn', '#mode-btn-mobile', '.mobile-menu-btn', '.footer-btn']
            .filter(sel => [...document.querySelectorAll(sel)].some(el => {
              // 鈕在自己的遮罩裡 clip-reveal 進出（收起時停在遮罩外）→ 量遮罩＝鈕的固定落點
              const r = (el.closest('.header-bar-clip, .footer-btn-mask') || el).getBoundingClientRect();
              return el.getClientRects().length && r.width && (r.left < -2 || r.top < -2 || r.right > innerWidth + 2 || r.bottom > innerHeight + 2);
            })));
          if (out.length) row.issues.push('跑出畫面：' + out.join(' '));
          // 先整頁走一趟再回頂、第二趟才截：捲入進場與點開才載的圖先觸發（faculty 逐列等圖，瞬跳後一屏要 ~7s 才出完），
          // 截到的才是落定的版面而不是進場途中
          const step = () => page.evaluate(() => { const y = scrollY; scrollTo({ top: y + innerHeight, behavior: 'instant' }); return scrollY - y; });
          for (let i = 1; i < screens && await step() >= 8; i++) await page.waitForTimeout(400);
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.waitForTimeout(1500);
          await shot();
          while (row.shots.length < screens && await step() >= 8) { await page.waitForTimeout(800); await shot(); }
          const sx = await page.evaluate(() => { const y = scrollY; scrollTo({ left: 9999, top: y, behavior: 'instant' }); const x = scrollX; scrollTo({ left: 0, top: y, behavior: 'instant' }); return x; });
          if (sx > 0) row.issues.push(`頁面可橫向捲 ${sx}px`);
        }
      } catch (e) { row.issues.push('跑不完：' + e.message.split('\n')[0]); }
      row.issues = [...new Set(row.issues)];
      await page.close();
    }
    await ctx.close();
    console.log(`✓ ${label} ${w}x${h}`);
  }
  const queue = [...sizes];
  // ponytail: 預設 3——後台是弱機，同時太多頁在抓偶爾回不完整（樹／playlist 沒出來）；要更穩就 --jobs 1
  await Promise.all(Array.from({ length: +arg('jobs', 3) }, async () => { for (let s; (s = queue.shift());) await runSize(s); }));
  await browser.close();
  server.close();

  // 併進既有總表：這次跑的列蓋掉舊的同一列，其餘留著；順序照 PAGES／SIZES
  const DATA = path.join(OUT, 'rows.json');
  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { /* 第一次跑 */ }
  const key = r => `${r.page}|${r.w}x${r.h}`;
  const fresh = new Set(rows.map(key));
  const sizeIdx = r => SIZES.findIndex(s => s[2] === r.w && s[3] === r.h);
  const all = [...prev.filter(r => PAGES.includes(r.page) && !fresh.has(key(r))), ...rows]   // 已從 PAGES 拿掉的頁（alumni）舊列一併丟
    .sort((x, y) => PAGES.indexOf(x.page) - PAGES.indexOf(y.page) || sizeIdx(x) - sizeIdx(y));
  fs.writeFileSync(DATA, JSON.stringify(all));

  const TH = 240;   // 縮圖高
  const bad = all.filter(r => r.issues.length);
  const name = r => `${r.label} ${r.w}×${r.h}`, id = r => `${r.page}-${r.w}x${r.h}`;
  const hm = t => new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const html = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>SCCD 視口總表</title>
<style>
body{font:14px/1.5 system-ui,"Noto Sans TC",sans-serif;margin:24px;background:#f2f2f2;color:#111}
h2{margin:40px 0 8px;padding:6px 0;position:sticky;top:0;background:#f2f2f2;z-index:1}
.row{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}
.label{flex:0 0 140px}
.label small{display:block;color:#888}
.new small{color:#07a}
.shots{display:flex;gap:6px;overflow-x:auto}
.shots img{display:block;height:${TH}px;width:auto;background:#ddd;outline:1px solid #ccc}
.bad,.bad a{color:#c00}
</style>
<h1>SCCD 視口總表</h1>
<p>${new Date().toLocaleString('zh-TW')}｜${engine}｜mode ${mode || 'standard'}｜這次重跑 ${rows.length} 列（時間藍字）、共 ${all.length} 列｜一列＝一個尺寸、由左到右往下捲；點圖看原尺寸</p>
${bad.length ? `<h3 class="bad">自動檢查：${bad.length} 列有問題</h3><ul class="bad">${bad.map(r => `<li><a href="#${id(r)}">${r.page}｜${name(r)}</a>：${esc(r.issues.join('；'))}</li>`).join('')}</ul>` : '<h3>自動檢查：全過</h3>'}
${PAGES.filter(p => all.some(r => r.page === p)).map(p => `<h2>${p}</h2>` + all.filter(r => r.page === p).map(r => `<div class="row" id="${id(r)}"><div class="label${r.issues.length ? ' bad' : ''}${fresh.has(key(r)) ? ' new' : ''}">${name(r)}<small>${hm(r.t)}</small>${r.issues.length ? '⚠ ' + esc(r.issues.join('；')) : ''}</div><div class="shots">${r.shots.map(f => `<a href="${f}?${r.t}" target="_blank"><img loading="lazy" src="${f}?${r.t}" height="${TH}" width="${Math.round(TH * r.w / r.h)}"></a>`).join('')}</div></div>`).join('')).join('')}
</html>`;
  const index = path.join(OUT, 'index.html');
  fs.writeFileSync(index, html);
  const badNow = rows.filter(r => r.issues.length);
  console.log(`\n這次 ${rows.length} 列、${rows.reduce((n, r) => n + r.shots.length, 0)} 張截圖；自動檢查 ${badNow.length ? badNow.length + ' 列有問題' : '全過'}（總表共 ${all.length} 列）\n${index}`);
  badNow.forEach(r => console.log(`  ⚠ ${r.page}｜${name(r)}：${r.issues.join('；')}`));
  // ponytail: 只支援 Windows 的 start；其他系統自己開上面那個路徑
  if (process.argv.includes('--open')) require('child_process').exec(`start "" "${index}"`);
})();
