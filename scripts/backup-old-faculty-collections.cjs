process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token };
const BASE = 'https://sccdtest.usc.edu.tw';
const COLS = ['faculty_fulltime', 'faculty_parttime', 'faculty_admin', 'faculty_former'];
(async () => {
  const backup = {};
  for (const c of COLS) {
    const [rows, fields] = await Promise.all([
      fetch(`${BASE}/items/${c}?limit=-1`, { headers }).then(r => r.json()).then(o => o.data),
      fetch(`${BASE}/fields/${c}`, { headers }).then(r => r.json()).then(o => o.data),
    ]);
    backup[c] = { rows, fields };
    console.log(`${c}: ${rows.length} rows backed up`);
  }
  fs.writeFileSync('data-source/output/faculty-old-collections-backup-2026-08-04.json', JSON.stringify(backup, null, 2));
  console.log('已寫入 data-source/output/faculty-old-collections-backup-2026-08-04.json');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
