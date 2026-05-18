/**
 * Load And Render
 *
 * 通用 fetch JSON + render 到 container 的 wrapper：統一 try/catch / 404 處理 / empty data 行為。
 * 給「非 list」data-loader 用（list 統一走 loadListInto）。
 *
 * 已有 caller 候選：
 *   - faculty-data-loader.js loadFacultyData
 *   - records-data-loader.js loadRecords
 *   - legal-data-loader.js loadLegalData
 *   - degree-show-data-loader.js loadDegreeShowList / loadDegreeShowDetail
 *
 * 範例：
 *   await loadAndRender('/data/news.json', 'news-container', (data, container) => {
 *     container.innerHTML = data.map(item => itemHTML(item)).join('');
 *   });
 *
 * 不包進 loadListInto：list 模板有結構化 markup（list-item / list-header / list-content / reveal-row），
 * loadAndRender 是純 fetch + 任意 renderFn 的薄殼。兩者職責不同。
 *
 * @template T
 * @param {string} url - JSON URL
 * @param {string | HTMLElement} containerOrId - container element 或其 ID
 * @param {(data: T, container: HTMLElement) => void | Promise<void>} renderFn
 * @returns {Promise<boolean>} true = 成功 render，false = fetch 失敗 / container 不存在
 */
export async function loadAndRender(url, containerOrId, renderFn) {
  const container = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!container) return false;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.error('[loadAndRender] failed to load', url, e);
    return false;
  }

  try {
    await renderFn(data, container);
  } catch (e) {
    console.error('[loadAndRender] renderFn threw for', url, e);
    return false;
  }
  return true;
}
