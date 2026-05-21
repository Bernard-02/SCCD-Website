// Parse activities source JSONs → data-source/output/activities-*.json
// Source data shapes 跟 schema 不對應，大部分 source 有 category/visitType 等分類欄位
// 但實際上 sample data 很少（很多 sample 沒 category）。Parser 策略：
//   - lectures.json → activities-lecture.json
//   - industry.json → activities-industry.json
//   - permanent-exhibitions.json → 跳過（user 說晚點處理）
//   - students-present.json → activities-students-present.json
//   - general-activities.json → 依 category 拆 visit-outbound / visit-inbound / competition / conference / workshop / exhibition-special；沒有 category 都丟給 workshop (default fallback)
// Hero (singleton) 輸出空殼讓 user 後台填

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Hero (empty singleton) ───
const hero = {
  titleEn: 'Activities',
  subtitleZh: '',
  subtitleEn: '',
  exhibitionSpecialDescZh: '',
  exhibitionSpecialDescEn: '',
  workshopDescZh: '',
  workshopDescEn: '',
  lectureDescZh: '',
  lectureDescEn: '',
  visitsDescZh: '',
  visitsDescEn: '',
  competitionDescZh: '',
  competitionDescEn: '',
  conferenceDescZh: '',
  conferenceDescEn: '',
  studentsPresentDescZh: '',
  studentsPresentDescEn: '',
  industryDescZh: '',
  industryDescEn: '',
  bannerImage: '',
};
write('activities-hero', hero);

// ─── 通用 entry transform ───
function transformItem(item) {
  return {
    titleEn: item.title_en || '',
    subtitleZh: item.subtitle_zh || '',
    subtitleEn: item.subtitle || '',
    dates: parseDateString(item.date),
    locations: item.location ? [{ nameZh: item.location, nameEn: '', country: item.flag || 'tw' }] : [],
    guests: (item.guests || []).map(g => ({
      nameZh: g.name_zh || '',
      nameEn: g.name || '',
      country: '',
      orgZh: g.affiliation_zh || '',
      orgEn: g.affiliation || '',
      orgCountry: '',
      isAlumni: g.isAlumni ? 'on' : '',
    })),
    descriptionZh: item.descriptionZh || item.intro_zh || '',
    descriptionEn: item.description || item.intro || '',
    poster: item.poster || '',
    images: Object.fromEntries((item.images || []).map((img, i) => [String(i), img])),
    videos: (item.videos || []).map(v => ({ videoUrl: v })),
    _post_title: item.title || item.title_zh || '',
  };
}

// "2024.03.15" / "2024.03.15-03.20" / "2024.03.15 - 2024.03.20" → dates group
function parseDateString(s) {
  if (!s) return [];
  const str = String(s);
  // Pattern: YYYY.MM.DD - YYYY.MM.DD or YYYY.MM.DD-YYYY.MM.DD
  let m = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[-–~]\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (m) return [{
    startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]),
    endYear: m[4], endMonth: pad(m[5]), endDay: pad(m[6]),
  }];
  // Pattern: YYYY.MM.DD - MM.DD (same year implicit)
  m = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[-–~]\s*(\d{1,2})\.(\d{1,2})/);
  if (m) return [{
    startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]),
    endYear: m[1], endMonth: pad(m[4]), endDay: pad(m[5]),
  }];
  // Pattern: YYYY.MM.DD (single day)
  m = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (m) return [{
    startYear: m[1], startMonth: pad(m[2]), startDay: pad(m[3]),
    endYear: m[1], endMonth: pad(m[2]), endDay: pad(m[3]),
  }];
  return [];
}
function pad(n) { return String(n).padStart(2, '0'); }

// ─── lectures.json → activities-lecture ───
write('activities-lecture', loadAndTransform('lectures.json'));

// ─── industry.json → activities-industry ───
write('activities-industry', loadAndTransform('industry.json'));

// ─── students-present.json → activities-students-present ───
write('activities-students-present', loadAndTransform('students-present.json'));

// ─── general-activities.json 依 category 拆 ───
const general = loadJson('general-activities.json');
const buckets = {
  'activities-visit-outbound': [],
  'activities-visit-inbound': [],
  'activities-competition': [],
  'activities-conference': [],
  'activities-workshop': [],
  'activities-exhibition-special': [],
};
for (const item of general) {
  const cat = item.category;
  const vt = item.visitType;
  let key = 'activities-workshop'; // default fallback for uncategorized
  if (cat === 'visits') {
    key = vt === 'inbound' ? 'activities-visit-inbound' : 'activities-visit-outbound';
  } else if (cat === 'competitions') {
    key = 'activities-competition';
  } else if (cat === 'conferences') {
    key = 'activities-conference';
  } else if (cat === 'workshops') {
    key = 'activities-workshop';
  } else if (cat === 'exhibitions') {
    key = 'activities-exhibition-special';
  }
  buckets[key].push(transformItem(item));
}
for (const [endpoint, items] of Object.entries(buckets)) {
  write(endpoint, items);
}

// ─── degree-show.json: dict by year → activities-degree-show flat array ───
const ds = loadJson('degree-show.json');
const degreeShowItems = [];
for (const [year, entry] of Object.entries(ds)) {
  if (!entry || typeof entry !== 'object') continue;
  // events 內每筆 time 格式 "MM / DD - MM / DD" 配 outer year
  const events = (entry.events || []).map(ev => {
    const parsed = parseEventTime(ev.time, year);
    return {
      ...parsed, // startYear/Month/Day + endYear/Month/Day
      nameZh: ev.name || '',
      nameEn: ev.nameEn || '',
      locationZh: ev.location || '',
      locationEn: ev.locationEn || '',
      cityZh: ev.city || '',
      cityEn: ev.cityEn || '',
    };
  });
  // 若 source 沒 events 但有 year，建 1 筆 placeholder event 對齊「list 主年份從 events[0] 取」邏輯
  if (events.length === 0) {
    events.push({
      startYear: year, startMonth: '', startDay: '',
      endYear: year, endMonth: '', endDay: '',
      nameZh: '', nameEn: '', locationZh: '', locationEn: '', cityZh: '', cityEn: '',
    });
  }
  degreeShowItems.push({
    titleEn: entry.title_en || '',
    descriptionZh: entry.descCn || '',
    descriptionEn: entry.descEn || '',
    coverImage: entry.coverImage || '',
    bannerImage: '',
    mainVideoUrl: entry.videoUrl || '',
    documentaryUrl: entry.documentaryUrl || '',
    // image_list CMB2 file_list 存 dict `{attachment_id: url}`；parser 用 fake key（user 重新上傳會換真實 id）
    albumImages: Object.fromEntries((entry.images || []).map((img, i) => [String(i), img])),
    events,
    _post_title: entry.title || '',
  });
}
// 依 events[0].startYear 降序（最新在上）
degreeShowItems.sort((a, b) => {
  const ya = parseInt(a.events?.[0]?.startYear || 0, 10);
  const yb = parseInt(b.events?.[0]?.startYear || 0, 10);
  return yb - ya;
});
write('activities-degree-show', degreeShowItems);

// "05 / 17 - 05 / 20" + year → { startYear, Month, Day, endYear, Month, Day }
function parseEventTime(s, yearStr) {
  if (!s) return { startYear: yearStr, startMonth: '', startDay: '', endYear: yearStr, endMonth: '', endDay: '' };
  const m = String(s).match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m) {
    return {
      startYear: yearStr, startMonth: pad(m[1]), startDay: pad(m[2]),
      endYear: yearStr, endMonth: pad(m[3]), endDay: pad(m[4]),
    };
  }
  const m2 = String(s).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m2) {
    return {
      startYear: yearStr, startMonth: pad(m2[1]), startDay: pad(m2[2]),
      endYear: yearStr, endMonth: pad(m2[1]), endDay: pad(m2[2]),
    };
  }
  return { startYear: yearStr, startMonth: '', startDay: '', endYear: yearStr, endMonth: '', endDay: '' };
}

// ─── helpers ───
function loadJson(filename) {
  const p = path.join(DATA, filename);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function loadAndTransform(filename) {
  return loadJson(filename).map(transformItem);
}
function write(endpoint, data) {
  const out = path.join(OUT_DIR, endpoint + '.json');
  fs.writeFileSync(out, JSON.stringify(data, null, 2), 'utf8');
  const count = Array.isArray(data) ? data.length : 1;
  console.log(`✓ ${endpoint} → ${count} ${Array.isArray(data) ? 'items' : 'entry'}`);
}
