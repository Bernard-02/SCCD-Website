/**
 * Site Base — 站台根路徑推導
 * 站台可能部署在網域子路徑（GitHub Pages project site、學校網站子目錄），
 * 寫死根目錄絕對路徑（/data/x.json、/custom-cursor/x.svg）會指到網域根而 404。
 * 一律經 sitePath() 換算成「以站台根為基準」的絕對 URL，本地根目錄與子路徑部署都成立。
 *
 * 以本檔案 URL 推導：js/modules/ui/site-base.js → 上三層 = 站台根。
 * classic scripts（generate-app）不能 import，用 helpers.js 的 window.SCCDHelpers.sitePath。
 */

export const SITE_BASE = new URL('../../../', import.meta.url).href;

// pathname 形式的站台根（'/' 或 '/SCCD-Website/'），給 router pushState / 路由比對用
export const SITE_BASE_PATHNAME = new URL(SITE_BASE).pathname;

/** @param {string} path 站內路徑，開頭有無 '/' 皆可（'data/x.json' 或 '/data/x.json'） */
export function sitePath(path) {
  return new URL(String(path).replace(/^\//, ''), SITE_BASE).href;
}
