/**
 * 版型模式（2026-11-16 user 定案）：iPad 這類「沒 hover 的大螢幕」，library／atlas／create 三頁走手機排版，其餘頁看螢幕大小
 * （橫拿 ≥1024＝桌面排版）。
 *
 * 樣式表與 JS 的寫法是「沒 hover 的橫向一律橫向手機版」（桌面那串帶 and (hover: hover)）。media query 讀不到「現在是哪一頁」，
 * 所以改成整份文件定一次：其餘頁在首繪前把樣式表裡的版型 media 還原成只看寬度（拿掉 hover 條件），JS 的 media 字串
 * 走 SCCDLayout.mq() 同一個換法（helpers.js）。三頁之間、其餘頁之間照常 SPA 換頁；跨兩組＝整頁載入（router.js navigateTo）。
 * 有 hover 的桌面、長邊 <1024 的手機：兩種判法結果相同，什麼都不做。
 *
 * 必須放 <head>、接在 output.css 的 link 後面、不加 defer：同步 script 會等樣式表載完才跑、又擋住首繪＝不會先閃一下手機版。
 * 新頁面的 head 照抄；漏了＝iPad 橫拿那頁變手機排版、而且每次換頁都整頁載入。
 */
(function () {
  // 同 router.js TOUCH_MOBILE_PAGES（route 名 generate＝/create）。網址最後一段可能是真實檔名（library／atlas／create.html）
  // 或這三頁的對外 slug——slug 預設值寫在這、後台可改（js/config/slugs.js 把生效中的整張表存 localStorage，值只會是 a-z0-9-）。
  // 這台第一次來又剛好後台改過＝這裡猜錯，router.js 冷載入會改開真實檔案
  var names = ['library', 'atlas', 'create', 'world'];
  try {
    var saved = JSON.parse(localStorage.getItem('sccd-slugs') || '{}') || {};
    ['page.library', 'page.atlas', 'page.generate'].forEach(function (k) { if (/^[a-z0-9-]+$/.test(saved[k])) names.push(saved[k]); });
  } catch (e) { /* 讀不到 storage＝用預設 */ }
  var MOBILE_PAGES = new RegExp('/(' + names.join('|') + ')(\\.html)?/?$');

  // 一個 term 同時看「橫向」跟 hover＝版型判斷（純互動的 @media (hover: hover) 不帶方向、不會動到）：
  // 「橫向且沒 hover」那項拿掉、桌面那串去掉尾端的 hover 條件
  function widthOnly(q) {
    if (!/hover/.test(q)) return q;   // 沒看 hover 的原樣放行（含空字串＝@media all，別被下面的收尾變成 not all）
    return q.split(',').map(function (t) {
      if (!/orientation:\s*landscape/.test(t)) return t;
      return /\(hover:\s*none\)/.test(t) ? '' : t.replace(/\s+and\s+\(hover:\s*hover\)\s*$/, '');
    }).filter(function (t) { return t.trim(); }).join(',') || 'not all';
  }

  var capable = window.matchMedia('(hover: none)').matches && Math.max(screen.width, screen.height) >= 1024;
  var byWidth = capable && !MOBILE_PAGES.test(location.pathname);
  var seen = new WeakSet();

  function walk(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r instanceof CSSMediaRule) {
        var q = r.media.mediaText, w = widthOnly(q);
        if (w !== q) r.media.mediaText = w;
      }
      if (r.cssRules && r.cssRules.length) walk(r.cssRules);
    }
  }

  window.SCCDLayout = {
    capable: capable,   // 沒 hover 的大螢幕（iPad）
    byWidth: byWidth,   // 這份文件的版型只看寬度
    mq: function (q) { return byWidth ? widthOnly(q) : q; },
    // 還沒處理過的樣式表補做：首繪前（head 的）、body 讀完（頁面 <main> 裡的 <style>）、SPA 換頁後（新 <main>、動態載入的頁面 CSS）
    apply: function () {
      if (!byWidth) return;
      for (var i = 0; i < document.styleSheets.length; i++) {
        var s = document.styleSheets[i];
        if (seen.has(s)) continue;
        seen.add(s);
        try { walk(s.cssRules); } catch (e) { /* 跨網域（Google Fonts）讀不到，裡面也沒有版型 media */ }
      }
    }
  };
  window.SCCDLayout.apply();
})();
