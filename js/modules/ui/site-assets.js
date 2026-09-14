/**
 * Site Assets — 全站圖示/游標接後台（Directus site_icons / site_cursors）
 *
 * 機制（本地檔即 fallback，免快照）：
 *  - CSS icon（.icon-X 的 --icon mask）：掃現有 stylesheet 找 `--icon: url(...website-icons/X.svg)`
 *    規則，對到後台檔案就產同 selector 覆蓋規則塞 <style>（append 在 head 尾＝output.css 之後、
 *    cascade 勝）。不手寫 class↔檔名對照，icon.css 新增自動跟上。
 *  - JS 端路徑（cursor 全部呼叫點 / create 面板圖示 / award 游標）：全走 sitePath() 這個咽喉點，
 *    這裡填 window.__SCCD_ASSET_OVERRIDES（localPath → CDN URL），sitePath 先查它。
 *    填完 refreshCursorVars() 重建 --cursor-*（helpers.js 開機已建過本地版）。
 *  - fetch 失敗/超時/空 ＝ 什麼都不做 → 本地 SVG 照常渲染。
 */
import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';

export async function initSiteAssets() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const get = (col) =>
      fetch(`${CMS_API_BASE}/${col}?fields=key,file.filename_disk&limit=-1`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => j.data || []);
    const [icons, cursors] = await Promise.all([get('site_icons'), get('site_cursors')]);
    clearTimeout(timer);

    const map = /** @type {Record<string, string>} */ ({});
    icons.forEach((i) => {
      if (i.file?.filename_disk) map[`website-icons/${i.key}.svg`] = `${CMS_CDN_BASE}/${i.file.filename_disk}`;
    });
    // cursor SVG 尺寸統一：上傳檔若沒寫 width/height（Illustrator「響應式」匯出只留 viewBox），
    // 瀏覽器對 cursor 會用預設圖尺寸渲染＝比其他游標大一號。custom-cursor 組本地規格全是 30×30
    // （hotspot 座標也以 30px 為準）→ 抓文字強制 width/height=30 轉 blob URL；抓失敗退回 CDN 原檔。
    // award_cursor 組本地檔本來就只有 viewBox（刻意），不動。
    await Promise.all(cursors.map(async (c) => {
      if (!c.file?.filename_disk) return;
      // award 游標實體放 website-icons/Award_Icons/，其餘 cursor 都在 custom-cursor/
      const isAward = c.key.startsWith('award_cursor');
      const local = isAward
        ? `website-icons/Award_Icons/${c.key}.svg`
        : `custom-cursor/${c.key}.svg`;
      const cdn = `${CMS_CDN_BASE}/${c.file.filename_disk}`;
      map[local] = cdn;
      if (isAward) return;
      try {
        const text = await fetch(cdn).then((r) => (r.ok ? r.text() : Promise.reject(new Error('' + r.status))));
        const fixed = text.replace(/<svg([^>]*)>/, (m, attrs) =>
          `<svg${attrs.replace(/\s(?:width|height)="[^"]*"/g, '')} width="30" height="30">`);
        map[local] = URL.createObjectURL(new Blob([fixed], { type: 'image/svg+xml' }));
      } catch { /* 退回 CDN 原檔＝頂多尺寸不一，不缺游標 */ }
    }));
    if (!Object.keys(map).length) return;
    window.__SCCD_ASSET_OVERRIDES = map;

    let rules = '';
    for (const sheet of document.styleSheets) {
      let cssRules;
      try { cssRules = sheet.cssRules; } catch { continue; } // 跨域 CSS（FA/fonts CDN）讀不了，跳過
      for (const r of cssRules) {
        if (!(r instanceof CSSStyleRule)) continue;
        const v = r.style.getPropertyValue('--icon');
        const m = v && v.match(/website-icons\/([^'")]+)/);
        const cdn = m && map[`website-icons/${m[1]}`];
        if (!cdn) continue;
        // 待上傳類（icon.css 該規則帶 display:none＝本地無檔）：後台有檔了才現身
        const show = r.style.getPropertyValue('display').trim() === 'none' ? ';display:inline-block' : '';
        rules += `${r.selectorText}{--icon:url('${cdn}')${show}}`;
      }
    }
    if (rules) {
      const s = document.createElement('style');
      s.id = 'site-assets-override';
      s.textContent = rules;
      document.head.appendChild(s);
    }
    window.SCCDHelpers?.refreshCursorVars?.();
  } catch { /* CMS 掛＝本地檔照常，靜默 */ }
}
