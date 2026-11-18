// 首頁開場 Lottie 匯出後跑：把 AE 圖層樣式「Outer Glow」換成 lottie_light 畫得出來的東西。
//   node scripts/lottie-bake-outer-glow.cjs data/SCCDLoader.json
// 為什麼：Lottie 網頁版不畫圖層樣式（sy）。開場的 Shadow 層（logo 字母的白色剪影）靠白色外光暈蓋住從 logo 後面滑出來的系名左緣，
// 沒畫＝系名直接疊在 logo 旁（user 2026-11-17）。
// 做法：同一份剪影（同 refId，不複製形狀資料）以中心放大成 6 圈、越外越淡，疊出「邊緣往外 S/6 內全白、到 S 線性淡完」的光暈
// （S＝Outer Glow 的 Size，comp px；跟 AE 第 186～205 格逐像素比過）；光暈本身的不透明度動畫（195→200 淡掉）乘進每圈。
// ponytail: 剪影當成圓（半徑＝形狀外框的 0.92 倍，星形尖角比凹處遠），放大≈往外擴；剪影改成長條形要換做法。
// Color Overlay 不處理：Shadow 的字母本來就是白的。只處理 precomp 圖層；跑過的檔沒有 sy 了，重跑不會重複加。
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/lottie-bake-outer-glow.cjs <lottie.json>'); process.exit(1); }
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const BANDS = 6;
const val = (p) => (Array.isArray(p.k) && typeof p.k[0] === 'object' ? p.k[0].s : p.k);

// precomp 裡所有形狀頂點的外框（precomp px）：頂點 → 群組位移 → 圖層 (v − anchor)·scale + position，再加描邊半寬
function precompRadius(asset) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of asset.layers) {
    if (l.ty !== 4) continue;
    const a = val(l.ks.a), s = val(l.ks.s).map(v => v / 100), p = val(l.ks.p);
    const half = Math.max(0, ...l.shapes.filter(x => x.ty === 'st').map(x => val(x.w) / 2));
    const walk = (it, off) => it.forEach(x => {
      if (x.ty === 'gr') { const tr = x.it.find(t => t.ty === 'tr'); const tp = tr ? val(tr.p) : [0, 0]; walk(x.it, [off[0] + tp[0], off[1] + tp[1]]); }
      if (x.ty === 'sh') for (const v of val(x.ks).v) {
        const X = (v[0] + off[0] - a[0]) * s[0] + p[0], Y = (v[1] + off[1] - a[1]) * s[1] + p[1];
        x0 = Math.min(x0, X - half * s[0]); x1 = Math.max(x1, X + half * s[0]); y0 = Math.min(y0, Y - half * s[1]); y1 = Math.max(y1, Y + half * s[1]);
      }
    });
    walk(l.shapes, [0, 0]);
  }
  return ((x1 - x0) + (y1 - y0)) / 4;
}

let maxInd = Math.max(...j.layers.map(l => l.ind));
for (let i = j.layers.length - 1; i >= 0; i--) {
  const L = j.layers[i];
  const glow = L.sy && L.sy.find(s => s.ty === 3);
  if (!glow || L.ty !== 0) continue;
  const asset = j.assets.find(a => a.id === L.refId);
  const scale = val(L.ks.s)[0] / 100;
  const R = precompRadius(asset) * scale * 0.92;   // comp px
  const S = val(glow.s);
  // 第 k 圈涵蓋到離剪影邊 d_k；區間 (d_{k-1}, d_k] 目標覆蓋率＝線性 1→0 取中點；由外往內解每圈的不透明度
  const cover = [...Array(BANDS)].map((_, k) => (k === 0 ? 1 : (11 - 2 * k) / 10));
  const alpha = Array(BANDS); let outside = 1;
  for (let k = BANDS - 1; k >= 0; k--) { alpha[k] = 1 - (1 - cover[k]) / outside; outside *= 1 - alpha[k]; }
  const bands = alpha.map((a, k) => {
    const d = S * (k + 1) / BANDS, f = (R + d) / R;
    const o = JSON.parse(JSON.stringify(glow.o));
    if (o.a) o.k.forEach(kf => { kf.s = kf.s.map(v => v * a); }); else o.k *= a;
    const { sy, ...base } = L;
    return { ...JSON.parse(JSON.stringify(base)), ind: ++maxInd, nm: `${L.nm} glow ${k + 1}`,
      ks: { ...JSON.parse(JSON.stringify(L.ks)), s: { a: 0, k: val(L.ks.s).map((v, n) => (n < 2 ? v * f : v)) }, o } };
  });
  delete L.sy;
  j.layers.splice(i + 1, 0, ...bands);   // 緊接在剪影下面、系名上面
  console.log(`${L.nm}: R=${R.toFixed(1)} S=${S} alpha=${alpha.map(a => a.toFixed(2)).join('/')}`);
}
fs.writeFileSync(file, JSON.stringify(j));
