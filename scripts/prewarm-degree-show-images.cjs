#!/usr/bin/env node
/*
 * Pre-warm Directus webp transform 變體（畢展 degree-show 全年份圖片）。
 *
 * 為何：transform 變體是「第一次被請求時才現場生成」（Lightsail CPU decode→resize→encode，
 *   依原圖大小 ~1.2~4.5s/張），所以每個年份的「第一位訪客」會卡。生成後永久快取（之後 ~1s）。
 *   這支把每張圖的 transform URL 各打一次，先讓伺服器把變體生成好，真正訪客都吃暖快取。
 *
 * 何時跑：內容更新後（新增年份 / 換圖 / 重傳）重跑即可。純讀 + 觸發生成，不寫任何資料。
 *
 * ⚠️ 變體參數 IMG_TX 必須跟 js/modules/pages/degree-show-source.js 的 IMG_TX 完全一致，
 *    否則暖到的是不同 variant、前台照樣冷。改一邊要同步另一邊。
 *
 * 用法：node scripts/prewarm-degree-show-images.cjs
 */
const { execSync } = require('child_process');

const API = 'https://sccdtest.usc.edu.tw';
const IMG_TX = 'width=1600&format=webp&quality=80&withoutEnlargement=true'; // ⚠️ 同步 degree-show-source.js IMG_TX

// 跟 degree-show-source.js 同一份 M2A collection 清單（linked 活動的照片也要暖）
const ACTIVITY_COLLECTIONS = [
  'activities_competitions', 'activities_conferences', 'activities_exhibitions_special',
  'activities_exhibitions_permanent', 'activities_industry', 'activities_lectures',
  'activities_students_present', 'activities_visits_inbound', 'activities_visits_outbound',
  'activities_workshops',
];
// 只抓「圖片欄位」→ 回應裡的 UUID 就只有 record id + 檔案 id，靠 walk 精準挑檔案 id
const activityDeep = ACTIVITY_COLLECTIONS.map(c => `events.activity.item:${c}.images.directus_files_id`).join(',');
const FIELDS = `coverImage,bannerImage,poster.directus_files_id,events.images.directus_files_id,${activityDeep}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// 遞迴挑「檔案 UUID」：directus_files_id 值（junction）＋ 頂層 coverImage/bannerImage 字串
function walk(node, out) {
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'directus_files_id') { const id = typeof v === 'string' ? v : v && v.id; if (id) out.add(id); }
    else if ((k === 'coverImage' || k === 'bannerImage') && typeof v === 'string' && v) out.add(v);
    else walk(v, out);
  }
}

const NULL_DEV = process.platform === 'win32' ? 'NUL' : '/dev/null'; // cmd.exe 沒有 /dev/null
function curl(args) { return execSync(`curl -s -g ${args}`, { maxBuffer: 1 << 27 }).toString(); }

console.log('抓取畢展所有圖片 UUID…');
const url = `${API}/items/activities_degree_show?limit=-1&fields=${FIELDS}`;
const rows = JSON.parse(curl(`"${url}"`)).data || [];
const files = new Set();
walk(rows, files);
const uuids = [...files].filter(u => UUID_RE.test(u));
console.log(`共 ${uuids.length} 張待暖（${rows.length} 個年份）\n`);

let cold = 0, warm = 0, fail = 0, coldMs = 0;
uuids.forEach((u, i) => {
  const out = curl(`-o ${NULL_DEV} -w "%{http_code} %{time_total}" "${API}/assets/${u}?${IMG_TX}"`);
  const [code, t] = out.trim().split(' ');
  const ms = Math.round(parseFloat(t) * 1000);
  const isCold = ms > 1500;              // >1.5s ≈ 現場生成；≤1.5s ≈ 已暖/命中
  if (code !== '200') { fail++; }
  else if (isCold) { cold++; coldMs += ms; }
  else { warm++; }
  const tag = code !== '200' ? `FAIL ${code}` : isCold ? `冷 ${ms}ms` : `暖 ${ms}ms`;
  console.log(`  [${String(i + 1).padStart(3)}/${uuids.length}] ${u.slice(0, 8)} ${tag}`);
});

console.log(`\n完成：${warm} 已暖 / ${cold} 這次現場生成${cold ? `（省下未來訪客約 ${Math.round(coldMs / 1000)}s 累積等待）` : ''} / ${fail} 失敗`);
if (fail) console.log('（失敗多為非圖片 UUID 或已刪檔，可忽略）');
