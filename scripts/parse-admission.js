// Parse data/admission.json + data/summer-camp.json → data-source/output/{admission-hero,admission-announcement,admission-summer-camp}.json

const fs = require('fs');
const path = require('path');

const SRC_ANNOUNCEMENT = path.join(__dirname, '..', 'data', 'admission.json');
const SRC_SUMMER_CAMP = path.join(__dirname, '..', 'data', 'summer-camp.json');
const OUT_DIR = path.join(__dirname, '..', 'data-source', 'output');
const OUT_HERO = path.join(OUT_DIR, 'admission-hero.json');
const OUT_ANNOUNCEMENT = path.join(OUT_DIR, 'admission-announcement.json');
const OUT_SUMMER_CAMP = path.join(OUT_DIR, 'admission-summer-camp.json');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Hero (empty placeholder, user 後台填) ───
fs.writeFileSync(OUT_HERO, JSON.stringify({
  titleEn: 'Admission',
  subtitleZh: '',
  subtitleEn: '',
  announcementDescZh: '',
  announcementDescEn: '',
  summerCampDescZh: '',
  summerCampDescEn: '',
  bannerImage: '',
}, null, 2), 'utf8');
console.log(`✓ admission-hero → ${OUT_HERO}`);

// ─── Announcement: 中文 title / titleEn / subtitleEn / content / images / videos / attachments ───
const announcementSrc = JSON.parse(fs.readFileSync(SRC_ANNOUNCEMENT, 'utf8'));
const announcement = announcementSrc.map(item => ({
  titleEn: '',
  dates: parseAnnouncementDate(item.date),
  content: item.content || '',
  images: Object.fromEntries((item.images || []).map((img, i) => [String(i), img])),
  videos: (item.videos || []).map(v => ({ videoUrl: v })),
  attachments: (item.attachments || []).map(a => ({
    titleZh: a.titleZh || '',
    titleEn: a.titleEn || '',
    file: a.url || '',
  })),
  _post_title: item.title || '',
}));

// "2026.02.04" → 單日 dates entry
function parseAnnouncementDate(s) {
  if (!s) return [];
  const m = String(s).match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return [];
  const y = m[1], mo = pad(m[2]), d = pad(m[3]);
  return [{ startYear: y, startMonth: mo, startDay: d, endYear: y, endMonth: mo, endDay: d }];
}
fs.writeFileSync(OUT_ANNOUNCEMENT, JSON.stringify(announcement, null, 2), 'utf8');
console.log(`✓ admission-announcement → ${OUT_ANNOUNCEMENT} (${announcement.length} items)`);

// ─── Summer Camp: 中文 title / titleEn / dates / locations / desc / poster / images / videos ───
const summerCampSrc = JSON.parse(fs.readFileSync(SRC_SUMMER_CAMP, 'utf8'));
const summerCamp = [];
for (const yearGroup of summerCampSrc) {
  const yearVal = String(yearGroup.year || '');
  for (const item of (yearGroup.items || [])) {
    summerCamp.push({
      titleEn: item.title_en || '',
      dates: parseSummerCampDate(item.date, yearVal),
      locations: item.location ? [{ nameZh: item.location, nameEn: '', country: 'tw' }] : [],
      descriptionZh: item.descriptionZh || '',
      descriptionEn: item.description || '',
      poster: item.poster || '',
      images: Object.fromEntries((item.images || []).map((img, i) => [String(i), img])),
      videos: (item.videos || []).map(v => ({ videoUrl: v })),
      _post_title: item.title || '',
    });
  }
}
fs.writeFileSync(OUT_SUMMER_CAMP, JSON.stringify(summerCamp, null, 2), 'utf8');
console.log(`✓ admission-summer-camp → ${OUT_SUMMER_CAMP} (${summerCamp.length} items)`);

// ─── helpers ───
function parseSummerCampDate(s, yearStr) {
  if (!s || !yearStr) return [];
  const m = String(s).match(/^(\d{1,2})\.(\d{1,2})\s*[-–~]\s*(\d{1,2})\.(\d{1,2})/);
  if (!m) {
    const m2 = String(s).match(/^(\d{1,2})\.(\d{1,2})/);
    if (!m2) return [];
    const mo = pad(m2[1]), d = pad(m2[2]);
    return [{ startYear: yearStr, startMonth: mo, startDay: d, endYear: yearStr, endMonth: mo, endDay: d }];
  }
  return [{
    startYear: yearStr, startMonth: pad(m[1]), startDay: pad(m[2]),
    endYear: yearStr, endMonth: pad(m[3]), endDay: pad(m[4]),
  }];
}
function pad(n) { return String(n).padStart(2, '0'); }
