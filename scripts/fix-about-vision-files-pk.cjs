// 修 about_vision.hoverImages（files M2M）上傳報「ID (Hidden): Value is required」。
// 病根：junction about_vision_files 的主鍵 id 是純 string、無自動產生（special:null / 無 auto-increment / 無 default），
// 於是每次加圖存檔 Directus 都要求手填 id。給它 special:['uuid'] → Directus 建 junction row 時 app 端自動產 UUID。
// idempotent（重跑只是再設一次 special）。跑：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fix-about-vision-files-pk.cjs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const BASE = 'https://sccdtest.usc.edu.tw';

(async () => {
  const res = await fetch(`${BASE}/fields/about_vision_files/id`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta: { special: ['uuid'] }, schema: { length: 36 } }),
  });
  console.log(res.ok ? '✅ about_vision_files.id → special uuid（可正常上傳圖片）' : `❌ ${res.status} ${(await res.text()).slice(0, 300)}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
