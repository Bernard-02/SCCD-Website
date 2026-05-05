/**
 * Atlas Page
 * 由各種名稱（在職／離職教師、產學公司、校友任職企業、工作營合作對象、城市、講者）
 * 排列成 SCCD logo 形狀的互動字雲。
 *
 * 每個名稱顯示英文 + 中文（短的可一行；長的中文換到第二行）。
 * Hover 時：同一 group（工作營／產學專案）成員一起 highlight + 顯示共用 detail。
 */

const PALETTE = {
  green: '#00FF80',
  pink:  '#FF448A',
  blue:  '#26BCFF',
  black: '#000000',
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;         // 字小（9px），靠 zoom 放大閱讀
const ZOOM_SPEED = 0.0015;

const PLACE_ATTEMPTS = 400;        // 每個名稱最多嘗試多少次找空位
const OVERLAP_PADDING = 2;         // 名稱間最小間距（px）
const ALPHA_THRESHOLD = 120;       // 像素 alpha 過濾門檻（含部分抗鋸齒邊緣）
const SHORT_EN_LIMIT = 14;         // 短英文判定（短則允許單行）
const SHORT_ZH_LIMIT = 8;

let cleanupFns = [];

export function cleanupAtlas() {
  cleanupFns.forEach(fn => { try { fn(); } catch (_) { /* ignore */ } });
  cleanupFns = [];
}

export async function initAtlas() {
  const main = document.getElementById('atlas-main');
  if (!main) return;

  const canvas  = /** @type {HTMLCanvasElement} */ (document.getElementById('atlas-mask-canvas'));
  const stage   = document.getElementById('atlas-stage');
  const zoomEl  = document.getElementById('atlas-zoom');
  const content = document.getElementById('atlas-content');
  const detail  = document.getElementById('atlas-detail');
  if (!canvas || !stage || !zoomEl || !content || !detail) return;

  // ── 1. 載入 logo 取像素資料 ─────────────────────────────
  let img;
  try {
    img = await loadImage(absURL('images/sccd_black.png'));
  } catch (e) {
    console.error('[Atlas] Failed to load logo image', e);
    return;
  }
  const W = img.naturalWidth || 800;
  const H = img.naturalHeight || 800;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  let pixelData;
  try {
    pixelData = ctx.getImageData(0, 0, W, H).data;
  } catch (e) {
    console.error('[Atlas] Canvas tainted, cannot read pixels.', e);
    return;
  }

  // ── 2. 平行載入所有資料來源 ─────────────────────────────
  const [facultyCurrent, facultyFormer, workshops, industry, companies, lectures] = await Promise.all([
    fetchJson('data/faculty.json'),
    fetchJson('data/faculty-former.json'),
    fetchJson('data/workshops.json'),
    fetchJson('data/industry.json'),
    fetchJson('data/atlas-companies.json'),
    fetchJson('data/lectures.json'),
  ]);

  // ── 3. 構建 items + groups ─────────────────────────────
  const items = [];
  const groups = new Map(); // groupId -> { detail, members:[itemId] }
  let idCounter = 0;
  const uid = (prefix) => `${prefix}-${++idCounter}`;

  // 在職教師
  (facultyCurrent || []).forEach(f => {
    if (!f.nameEn && !f.nameZh) return;
    items.push({
      id: uid('fc'),
      textEn: f.nameEn || '',
      textZh: f.nameZh || '',
      labelEn: 'Current Faculty',
      labelZh: '在職教師',
      detail: '目前任職於本系，從事教學、研究與創作實務。',
      groups: [],
    });
  });

  // 離職教師
  (facultyFormer || []).forEach(f => {
    if (!f.nameEn && !f.nameZh) return;
    const years = f.yearsActive ? `（${f.yearsActive}）` : '';
    const field = f.fieldZh || f.fieldEn || '';
    items.push({
      id: uid('ff'),
      textEn: f.nameEn || '',
      textZh: f.nameZh || '',
      labelEn: 'Former Faculty',
      labelZh: '離職教師',
      detail: `曾任職於本系${years}${field ? '，' + field + '領域' : ''}。`,
      groups: [],
    });
  });

  // 工作營：guests + city（不含 title 本身，依使用者規格）
  const cityIndex = new Map();
  (workshops || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(ws => {
      const wsGroupId = ws.id;
      if (!wsGroupId) return;
      const detail = (ws.intro_zh || ws.intro || '').trim().slice(0, 140) ||
                     '本系與外部單位合作之工作營。';
      const memberIds = [];

      (ws.guests || []).forEach(g => {
        const en = g.name || g.affiliation || '';
        const zh = g.name_zh || g.affiliation_zh || '';
        if (!en && !zh) return;
        const it = {
          id: uid('wsg'),
          textEn: en,
          textZh: zh,
          labelEn: 'Workshop Partner',
          labelZh: '工作營合作單位',
          detail,
          groups: [wsGroupId],
        };
        items.push(it);
        memberIds.push(it.id);
      });

      // 城市（並列拆 location / location_zh，可能多個）
      const cities = parseCities(ws);
      cities.forEach(({ en, zh }) => {
        const key = `${en}|${zh}`;
        if (cityIndex.has(key)) {
          const existingId = cityIndex.get(key);
          const cityItem = items.find(i => i.id === existingId);
          if (cityItem && !cityItem.groups.includes(wsGroupId)) {
            cityItem.groups.push(wsGroupId);
          }
          memberIds.push(existingId);
        } else {
          const it = {
            id: uid('city'),
            textEn: en,
            textZh: zh,
            labelEn: 'City',
            labelZh: '城市',
            detail,
            groups: [wsGroupId],
          };
          items.push(it);
          memberIds.push(it.id);
          cityIndex.set(key, it.id);
        }
      });

      groups.set(wsGroupId, { detail, members: memberIds });
    });
  });

  // 講座 guests（與工作營類似但獨立 group）
  (lectures || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(lec => {
      const lecGroupId = lec.id;
      if (!lecGroupId) return;
      const detail = (lec.description_zh || lec.description || '').trim().slice(0, 140) ||
                     '本系邀請業界與學界專家進行專題講座。';
      const memberIds = [];

      (lec.guests || []).forEach(g => {
        const en = g.name || g.affiliation || '';
        const zh = g.name_zh || g.affiliation_zh || '';
        if (!en && !zh) return;
        const it = {
          id: uid('lecg'),
          textEn: en,
          textZh: zh,
          labelEn: 'Lecture Speaker',
          labelZh: '講座講者',
          detail,
          groups: [lecGroupId],
        };
        items.push(it);
        memberIds.push(it.id);
      });

      if (memberIds.length > 0) groups.set(lecGroupId, { detail, members: memberIds });
    });
  });

  // 產學合作：guests（不含 title）
  (industry || []).forEach(yearGroup => {
    (yearGroup.items || []).forEach(ind => {
      const indGroupId = ind.id;
      if (!indGroupId) return;
      const detail = '本系產學合作計畫，與業界共同推動實務研究與創新設計。';
      const memberIds = [];

      (ind.guests || []).forEach(g => {
        const en = g.name || '';
        const zh = g.name_zh || '';
        if (!en && !zh) return;
        const it = {
          id: uid('indg'),
          textEn: en,
          textZh: zh,
          labelEn: 'Industry Partner',
          labelZh: '產學合作公司',
          detail,
          groups: [indGroupId],
        };
        items.push(it);
        memberIds.push(it.id);
      });

      if (memberIds.length > 0) groups.set(indGroupId, { detail, members: memberIds });
    });
  });

  // 校友任職企業（無連動 group）
  (companies || []).forEach(c => {
    if (!c.nameEn && !c.nameZh && !c.name) return;
    items.push({
      id: uid('co'),
      textEn: c.nameEn || c.name || '',
      textZh: c.nameZh || '',
      labelEn: 'Alumni Employer',
      labelZh: '校友任職企業',
      detail: '本系畢業生曾任職、實習或合作之企業。',
      groups: [],
    });
  });

  if (items.length === 0) {
    console.warn('[Atlas] No items to render');
    return;
  }

  // ── 4. 建立 DOM（隱藏）並批次量測尺寸 ─────────────────────
  shuffle(items);

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const anchor = document.createElement('div');
    anchor.className = 'atlas-anchor';
    anchor.style.left = '0%';
    anchor.style.top = '0%';
    anchor.style.visibility = 'hidden';

    const span = document.createElement('span');
    span.className = 'atlas-name';
    span.dataset.itemId = item.id;
    if (isShort(item.textEn, item.textZh)) span.classList.add('atlas-name-compact');

    if (item.textEn) {
      const enEl = document.createElement('span');
      enEl.className = 'atlas-name-en';
      enEl.textContent = item.textEn;
      span.appendChild(enEl);
    }
    if (item.textZh && item.textZh !== item.textEn) {
      const zhEl = document.createElement('span');
      zhEl.className = 'atlas-name-zh';
      zhEl.textContent = item.textZh;
      span.appendChild(zhEl);
    }

    anchor.appendChild(span);
    fragment.appendChild(anchor);
    item._anchor = anchor;
    item._span = span;
  });

  content.innerHTML = '';
  content.appendChild(fragment);

  // 強制 layout（一次 reflow），後續 offsetWidth 都是 cached
  void content.offsetWidth;

  items.forEach(item => {
    const r = item._span.getBoundingClientRect();
    item._w = r.width;
    item._h = r.height;
  });

  // ── 5. 不重疊放置 ─────────────────────────────
  const cw = content.offsetWidth || content.getBoundingClientRect().width;
  const ch = content.offsetHeight || content.getBoundingClientRect().height;
  const placedRects = [];
  const elementById = new Map();
  let placedCount = 0;

  items.forEach(item => {
    let placed = false;

    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const pos = findValidPixel(pixelData, W, H, ALPHA_THRESHOLD);
      if (!pos) continue;

      const px = (pos.x / W) * cw;
      const py = (pos.y / H) * ch;

      const halfW = item._w / 2;
      const halfH = item._h / 2;
      if (px - halfW < -OVERLAP_PADDING || px + halfW > cw + OVERLAP_PADDING) continue;
      if (py - halfH < -OVERLAP_PADDING || py + halfH > ch + OVERLAP_PADDING) continue;

      const rect = {
        x: px - halfW - OVERLAP_PADDING,
        y: py - halfH - OVERLAP_PADDING,
        w: item._w + OVERLAP_PADDING * 2,
        h: item._h + OVERLAP_PADDING * 2,
      };

      if (anyOverlap(rect, placedRects)) continue;

      // 放置 ✓
      const accent = classifyColor(pos.r, pos.g, pos.b);
      item._anchor.style.left = `${(pos.x / W) * 100}%`;
      item._anchor.style.top  = `${(pos.y / H) * 100}%`;
      item._span.style.color = accent;
      // 標記黑色名稱（落在中央黑圓內）：inverse 模式下要用 CSS 反轉成白色
      if (accent === PALETTE.black) item._span.classList.add('atlas-name--dark');
      item._span.style.setProperty('--tx', `${rand(-2.5, 2.5).toFixed(2)}px`);
      item._span.style.setProperty('--ty', `${rand(-2.5, 2.5).toFixed(2)}px`);
      item._span.style.setProperty('--base-rot', `${rand(-3, 3).toFixed(2)}deg`);
      item._span.style.setProperty('--rot-delta', `${rand(-1, 1).toFixed(2)}deg`);
      item._span.style.setProperty('--dur', `${rand(4, 8).toFixed(2)}s`);
      item._span.style.animationDelay = `${rand(-6, 0).toFixed(2)}s`;
      item._anchor.style.visibility = '';
      placedRects.push(rect);
      elementById.set(item.id, item._span);
      placed = true;
      placedCount++;
      break;
    }

    if (!placed) item._anchor.remove();   // 找不到不重疊位置 → 丟棄
  });

  console.log(`[Atlas] placed ${placedCount} / ${items.length} items (logo ${cw.toFixed(0)}×${ch.toFixed(0)}px)`);

  // ── 6. Hover 連動 + 細節面板 ─────────────────────────────
  const itemMap = new Map(items.map(i => [i.id, i]));
  const labelEl = detail.querySelector('[data-atlas-detail-label]');
  const nameEl  = detail.querySelector('[data-atlas-detail-name]');
  const descEl  = detail.querySelector('[data-atlas-detail-desc]');

  function showDetail(item, ids) {
    content.classList.add('atlas-dimmed');
    elementById.forEach((el, id) => {
      el.classList.toggle('atlas-highlight', ids.has(id));
    });
    if (labelEl) labelEl.textContent = `${item.labelEn || ''}${item.labelZh ? ' / ' + item.labelZh : ''}`;
    if (nameEl) {
      nameEl.innerHTML = '';
      if (item.textEn) {
        const en = document.createElement('div');
        en.textContent = item.textEn;
        nameEl.appendChild(en);
      }
      if (item.textZh && item.textZh !== item.textEn) {
        const zh = document.createElement('div');
        zh.className = 'atlas-detail-name-zh';
        zh.textContent = item.textZh;
        nameEl.appendChild(zh);
      }
    }
    if (descEl) descEl.textContent = item.detail || '';
    detail.classList.add('atlas-detail-visible');
  }
  function clearDetail() {
    content.classList.remove('atlas-dimmed');
    elementById.forEach(el => el.classList.remove('atlas-highlight'));
    detail.classList.remove('atlas-detail-visible');
  }

  function onMouseOver(e) {
    const target = e.target && e.target.closest && e.target.closest('.atlas-name');
    if (!target) return;
    const fromName = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.atlas-name');
    if (target === fromName) return;

    const id = target.dataset.itemId;
    const item = itemMap.get(id);
    if (!item) return;

    const ids = new Set([id]);
    item.groups.forEach(gid => {
      const g = groups.get(gid);
      if (g) g.members.forEach(m => ids.add(m));
    });
    showDetail(item, ids);
  }

  function onMouseOut(e) {
    const from = e.target && e.target.closest && e.target.closest('.atlas-name');
    const to   = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.atlas-name');
    if (from && !to) clearDetail();
  }

  content.addEventListener('mouseover', onMouseOver);
  content.addEventListener('mouseout',  onMouseOut);
  cleanupFns.push(() => {
    content.removeEventListener('mouseover', onMouseOver);
    content.removeEventListener('mouseout',  onMouseOut);
  });

  // ── 7. Wheel zoom（cursor-anchored）─────────────────────
  let scale = 1, tx = 0, ty = 0;

  function applyTransform() {
    zoomEl.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`;
  }
  function clampOffsets() {
    if (scale <= MIN_SCALE + 0.0001) { tx = 0; ty = 0; return; }
    const baseW = content.offsetWidth;
    const baseH = content.offsetHeight;
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const maxX = Math.max(0, (baseW * scale - stageW) / 2);
    const maxY = Math.max(0, (baseH * scale - stageH) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }
  function onWheel(e) {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width  / 2;
    const cy = e.clientY - rect.top  - rect.height / 2;

    const oldScale = scale;
    const factor = Math.exp(-e.deltaY * ZOOM_SPEED);
    let newScale = oldScale * factor;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (newScale === oldScale) return;

    const realFactor = newScale / oldScale;
    tx = cx - (cx - tx) * realFactor;
    ty = cy - (cy - ty) * realFactor;
    scale = newScale;
    clampOffsets();
    applyTransform();
  }

  applyTransform();
  stage.addEventListener('wheel', onWheel, { passive: false });
  cleanupFns.push(() => stage.removeEventListener('wheel', onWheel));

  // ── 7b. Drag pan（zoom 後可拖動畫面）─────────────────────
  let dragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartTx = 0, dragStartTy = 0;

  function onMouseDown(e) {
    if (e.button !== 0) return;        // 只處理左鍵
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTx = tx;
    dragStartTy = ty;
    document.body.style.cursor = 'grabbing';   // 拖動時 cursor 改手掌（握）
    e.preventDefault();                        // 避免 drag-select 文字
  }
  function onMouseMove(e) {
    if (!dragging) return;
    tx = dragStartTx + (e.clientX - dragStartX);
    ty = dragStartTy + (e.clientY - dragStartY);
    clampOffsets();
    applyTransform();
  }
  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';   // 還原預設 cursor
  }

  stage.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup',   onMouseUp);
  cleanupFns.push(() => {
    stage.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
    document.body.style.cursor = '';   // SPA 換頁時若還在拖動，還原 cursor
  });

  function onResize() { clampOffsets(); applyTransform(); }
  window.addEventListener('resize', onResize);
  cleanupFns.push(() => window.removeEventListener('resize', onResize));

  // ── 8. 整體 logo 呼吸動畫 ─────────────────────────────
  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(content);
    const breath = gsap.to(content, {
      scale: 1.012,
      duration: 4.5,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      transformOrigin: '50% 50%',
    });
    cleanupFns.push(() => breath.kill());
  }
}

// ── Helpers ────────────────────────────────────────────

function absURL(rel) { return new URL(rel, window.location.origin).href; }

function fetchJson(rel) {
  return fetch(absURL(rel)).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch ${rel}: ${r.status}`);
    return r.json();
  }).catch(e => { console.warn('[Atlas]', e.message); return null; });
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function rand(a, b) { return a + Math.random() * (b - a); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function findValidPixel(data, W, H, alphaThreshold) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * H);
    const i = (y * W + x) * 4;
    if (data[i + 3] > alphaThreshold) {
      return { x, y, r: data[i], g: data[i + 1], b: data[i + 2] };
    }
  }
  return null;
}

// 用「主導通道」分類，比 RGB 距離更可靠地把粉色撈出來
function classifyColor(r, g, b) {
  const max = Math.max(r, g, b);
  if (max < 70) return PALETTE.black;            // 暗 → 黑
  if (r >= g && r >= b) return PALETTE.pink;     // R 主導 → 粉
  if (g >= b)           return PALETTE.green;    // G 主導 → 綠
  return PALETTE.blue;                            // B 主導 → 藍
}

function anyOverlap(rect, placed) {
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (rect.x < p.x + p.w && rect.x + rect.w > p.x &&
        rect.y < p.y + p.h && rect.y + rect.h > p.y) {
      return true;
    }
  }
  return false;
}

function isShort(en, zh) {
  const enLen = (en || '').length;
  const zhLen = (zh || '').length;
  if (!en || !zh) return true;             // 只有一語 → 自然單行
  return enLen <= SHORT_EN_LIMIT && zhLen <= SHORT_ZH_LIMIT;
}

function parseCities(ws) {
  const out = [];
  // 1. 優先 cityEn / cityZh（單城市）
  if (ws.cityEn || ws.cityZh) {
    const en = (ws.cityEn || '').trim();
    const zh = (ws.cityZh || '').trim();
    if (en || zh) out.push({ en, zh });
    return out;
  }
  // 2. 由 location / location_zh 並列拆解（"/" 分隔多城市，", " 取首段為 city）
  const partsEn = (ws.location    || '').split('/').map(s => s.trim().split(',')[0].trim());
  const partsZh = (ws.location_zh || '').split('/').map(s => s.trim().split(',')[0].trim());
  const n = Math.max(partsEn.length, partsZh.length);
  for (let i = 0; i < n; i++) {
    const en = partsEn[i] || '';
    const zh = partsZh[i] || '';
    if (en || zh) out.push({ en, zh });
  }
  return out;
}
