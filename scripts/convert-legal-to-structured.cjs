/**
 * 一次性工具：把 legal 頁的舊 blob content（帶 class 的 HTML 字串）轉成結構化
 * { titleEn, titleZh, overviewEn, overviewZh, points:[{titleEn,titleZh,desEn,desZh}], lastUpdated* }
 *
 * 穩健策略：按 `<div class="legal-section">` 切段（不靠 regex 平衡 div）；每段只抽 <p>/<ul>/<ol>
 * 內容（忽略所有 div soup，含 num div 與 space-y-xs 聯絡區塊 wrapper）；去掉所有 class；
 * 用是否含 CJK 把每個 block 分到 desEn / desZh。des 保留 <strong>/<a href> 等語意標記。
 * 跑完即可刪。
 */
const fs = require('fs');

const FILES = ['accessibility', 'regulations'];
const hasCJK = s => /[㐀-鿿豈-﫿]/.test(s);
const stripClasses = h => h.replace(/\s+class="[^"]*"/g, '');
const stripTags = h => h.replace(/<[^>]+>/g, '').trim();

// 從一段 HTML 抽出所有 top-level <p>/<ul>/<ol>（無巢狀 ul，非貪婪到對應結束標籤）
function extractBlocks(html) {
  const out = [];
  const re = /<(p|ul|ol)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[0].trim());
  return out;
}

for (const name of FILES) {
  const d = JSON.parse(fs.readFileSync(`data/${name}.json`, 'utf8'));
  const parts = d.content.split('<div class="legal-section">');

  // 綜述：第一段（intro）裏的 <p>，分 EN/ZH，存純文字
  const introPs = extractBlocks(parts[0]).map(stripTags).filter(Boolean);
  let overviewEn = '', overviewZh = '';
  for (const t of introPs) {
    if (hasCJK(t)) overviewZh = overviewZh ? overviewZh + ' ' + t : t;
    else overviewEn = overviewEn ? overviewEn + ' ' + t : t;
  }

  // 每個 legal-section → 一個 point
  const points = parts.slice(1).map(sec => {
    const titleEn = ((sec.match(/<h4 class="legal-section-title-en">([\s\S]*?)<\/h4>/) || [])[1] || '').trim();
    const titleZh = ((sec.match(/<h4 class="legal-section-title-zh">([\s\S]*?)<\/h4>/) || [])[1] || '').trim();
    const body = sec
      .replace(/<h4 class="legal-section-title-en">[\s\S]*?<\/h4>/, '')
      .replace(/<h4 class="legal-section-title-zh">[\s\S]*?<\/h4>/, '');
    const blocks = extractBlocks(stripClasses(body));
    const en = [], zh = [];
    for (const b of blocks) (hasCJK(b) ? zh : en).push(b);
    return { titleEn, titleZh, desEn: en.join(''), desZh: zh.join('') };
  });

  const out = {
    titleEn: d.titleEn,
    titleZh: d.titleZh,
    overviewEn,
    overviewZh,
    points,
    lastUpdatedEn: d.lastUpdatedEn,
    lastUpdatedZh: d.lastUpdatedZh,
  };
  fs.writeFileSync(`data/${name}.json`, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✓ ${name}: ${points.length} points | overviewEn ${overviewEn.length}c / overviewZh ${overviewZh.length}c`);
}
