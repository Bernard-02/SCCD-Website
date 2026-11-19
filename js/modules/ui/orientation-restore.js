/**
 * 轉向重載保留當前狀態（user 2026-11-19「手機旋轉時應該是當前頁旋轉，World 的 list 不該變回星雲」）。
 * 手機轉向＝orientation-reload.js 的 reloadCurrentRoute（SPA 軟重載：cleanup＋swap＋重 init），頁面模組 init 當下定案的
 * 狀態（World 的 view／分類、四個分頁頁的分頁、about／alumni 捲到哪一段…）會回預設。網址帶的狀態（library hash、DSD ?year）
 * 本來就留著；分頁頁的 ?section=／?program= 呈現完就被清掉（user 2026-06-04 定案）＝也要靠這裡。
 *
 * 用法：init 時 keepOnOrientationReload(key, getState)＝重載前（orientation:reload 事件）把 getState() 存 sessionStorage；
 * 同一個 init 開頭 takeOrientationRestore(key) 讀回（讀完即刪＝只有緊接著的那次重載吃得到）。
 * 存不進去／壞資料＝當沒有、回預設。
 */
import { registerPageCleanup } from './page-cleanup.js';

const PREFIX = 'sccd:orient:';

/** @param {string} key @param {() => any} getState */
export function keepOnOrientationReload(key, getState) {
  const h = () => { try { sessionStorage.setItem(PREFIX + key, JSON.stringify(getState())); } catch (e) { /* 存不進去＝重載回預設 */ } };
  document.addEventListener('orientation:reload', h);
  registerPageCleanup(() => document.removeEventListener('orientation:reload', h));
}

/** @param {string} key @returns {any} */
export function takeOrientationRestore(key) {
  try {
    const v = sessionStorage.getItem(PREFIX + key);
    if (v == null) return null;
    sessionStorage.removeItem(PREFIX + key);
    return JSON.parse(v);
  } catch (e) { return null; }
}
