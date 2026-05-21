// Parse data/news.json → data-source/output/index-theater.json + index-news.json
// news.json 不是從 Excel 來（手 key），直接拆 2 個輸出檔對齊 schemas/index-{theater,news}.json

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'news.json');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
const OUT_THEATER = path.join(OUT_DIR, 'index-theater.json');
const OUT_NEWS = path.join(OUT_DIR, 'index-news.json');

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// Theater：singleton object（importer 端會包成 array）
const theater = {
  videoUrl: src.videoUrl || '',
  videoThumb: src.videoThumb || '',
};

// News：array of items（text/url/poster），過濾掉沒 text 的空 row
const news = (Array.isArray(src.items) ? src.items : [])
  .filter(it => it && it.text)
  .map(it => ({
    text: it.text,
    url: it.url || '',
    poster: it.poster || '',
  }));

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_THEATER, JSON.stringify(theater, null, 2), 'utf8');
fs.writeFileSync(OUT_NEWS, JSON.stringify(news, null, 2), 'utf8');

console.log(`✓ theater → ${OUT_THEATER}`);
console.log(`  videoUrl: ${theater.videoUrl ? '✓' : '(empty)'}`);
console.log(`  videoThumb: ${theater.videoThumb ? '✓' : '(empty)'}`);
console.log(`✓ news → ${OUT_NEWS}`);
console.log(`  ${news.length} items`);
