/**
 * Faculty Data Loader
 * 讀取師資 JSON 並依 type (fulltime/parttime/admin) 分類渲染。
 *
 * 資料結構（對齊 WP CMB2 schema：faculty-fulltime / parttime / admin）：
 *   - fulltime/parttime: titles[]（repeater，至少 1 筆）
 *   - admin: titleEn/titleZh 單字段
 * Card 顯示用 titles[0]（fulltime/parttime）或 titleEn/titleZh（admin）。
 */

export async function loadFacultyData() {
  try {
    const response = await fetch('/data/faculty.json');
    const data = await response.json();

    const fulltime = data.filter(item => item.type === 'fulltime');
    const parttime = data.filter(item => item.type === 'parttime');
    const admin = data.filter(item => item.type === 'admin');

    renderFacultyList('faculty-fulltime-list', fulltime);
    renderFacultyList('faculty-parttime-list', parttime);
    renderFacultyList('faculty-admin-list', admin);

  } catch (error) {
    console.error('Error loading faculty data:', error);
  }
}

const CARD_COLORS = ['#FF448A', '#00FF80', '#26BCFF'];
// 圖片進場用：4 個方向 random 抽，filter 用 setupFacultyCardAnim 讀 data-img-dir
const IMG_ENTRY_DIRS = ['top', 'right', 'bottom', 'left'];

function randomImgDir() {
  return IMG_ENTRY_DIRS[Math.floor(Math.random() * IMG_ENTRY_DIRS.length)];
}

// 卡片圖片依「實際上傳比例」自適應（不鎖死 4:5、不裁切）：
// 圖載入後把 wrapper 的 aspect-ratio 設成圖片自然比例 → object-cover 等比填滿 = 完整不裁切。
// HTML 預設的 aspect-[4/5] 只當「載入中 / 進場 clip 動畫」的佔位 fallback（避免 wrapper 0 高度、reveal 不可見）。
// 後台改上傳比例（如 1:1 → 4:3）前台自動跟著變，不用改 code。
function applyNaturalAspect(img) {
  const apply = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const wrap = img.closest('.faculty-card-image-wrapper');
    if (wrap) wrap.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
  };
  if (img.complete) apply();
  else img.addEventListener('load', apply, { once: true });
}

/**
 * 取得 card 顯示用的「第一個」 title（中英）
 * fulltime/parttime: titles[0]；admin: 用 titleEn/titleZh
 */
function pickCardTitle(item) {
  if (item.type === 'admin') {
    return { en: item.titleEn || '', zh: item.titleZh || '' };
  }
  const first = (item.titles || [])[0] || {};
  return { en: first.titleEn || '', zh: first.titleZh || '' };
}

function renderFacultyList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '<p class="text-gray-5 col-span-full">No data available.</p>';
    return;
  }

  container.innerHTML = items.map((item, index) => {
    const color = CARD_COLORS[index % CARD_COLORS.length];
    const sign = Math.random() < 0.5 ? -1 : 1;
    const initDeg = (sign * (3 + Math.random() * 3)).toFixed(2);
    const imgDir = randomImgDir();
    const t = pickCardTitle(item);
    return `
    <div class="faculty-card group ${item.type === 'parttime' ? 'cursor-default' : 'cursor-pointer'} p-[6px]" data-category="${item.type}" data-faculty-id="${item.id}" data-img-dir="${imgDir}" style="--card-color: ${color}; --init-deg: ${initDeg}deg">
      <div class="faculty-card-image-wrapper overflow-hidden mb-md aspect-[4/5] bg-gray-2 relative">
        <img src="${item.image}" alt="${item.nameEn}" loading="lazy" class="faculty-card-image w-full h-full object-cover">
      </div>
      <div class="text-left">
        <div class="faculty-card-name">
          <h5>${item.nameEn}</h5>
          <h5>${item.nameZh}</h5>
        </div>
        <div class="faculty-card-title mt-xs">
          <p class="text-p2">${t.en}</p>
          <p class="text-p2">${t.zh}</p>
        </div>
      </div>
    </div>
  `;
  }).join('');

  // 每張卡圖載入後依自然比例調整框形（覆蓋 aspect-[4/5] fallback）
  container.querySelectorAll('.faculty-card-image').forEach(applyNaturalAspect);
}
