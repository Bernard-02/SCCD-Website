/**
 * Utility Helper Functions for SCCD Website
 * 共用的輔助函數，供多個模組使用
 *
 * 使用方式：在 HTML 中先載入此檔案，再載入 main.js
 * <script src="js/utils/helpers.js"></script>
 * <script src="js/main.js"></script>
 */

// 創建全域命名空間，避免污染全域變數
window.SCCDHelpers = window.SCCDHelpers || {};

(function(Helpers) {
  'use strict';

  // ===== 響應式判斷 =====

  /**
   * 判斷是否為手機版（寬度 < 768px）
   * @returns {boolean}
   */
  Helpers.isMobile = function() {
    return window.innerWidth < 768;
  };

  /**
   * 判斷是否為桌面版（寬度 >= 768px）
   * @returns {boolean}
   */
  Helpers.isDesktop = function() {
    return window.innerWidth >= 768;
  };

  /**
   * 判斷是否為平板版（768px <= 寬度 < 1024px）
   * @returns {boolean}
   */
  Helpers.isTablet = function() {
    return window.innerWidth >= 768 && window.innerWidth < 1024;
  };

  // ===== DOM 操作 =====

  /**
   * 滾動到指定元素
   * @param {HTMLElement|string} target - 元素或選擇器
   * @param {number} offset - 垂直偏移量（預設 0）
   * @param {string} behavior - 滾動行為（預設 'smooth'）
   */
  Helpers.scrollToElement = function(target, offset, behavior) {
    offset = offset || 0;
    behavior = behavior || 'smooth';

    let element;
    if (typeof target === 'string') {
      // 確保是 ID 選擇器，避免一般網址報錯
      if (!target.startsWith('#')) return;
      try {
        element = document.querySelector(target);
      } catch (e) {
        return;
      }
    } else {
      element = target;
    }
    
    if (!element) return;

    const y = element.getBoundingClientRect().top + window.pageYOffset + offset;
    window.scrollTo({
      top: y,
      behavior: behavior
    });
  };

  /**
   * 設定單一元素為 active，移除其他兄弟元素的 active
   * @param {HTMLElement} activeElement - 要設為 active 的元素
   * @param {NodeList|Array} siblings - 所有兄弟元素
   * @param {string} activeClass - active 類別名稱（預設 'active'）
   */
  Helpers.setActive = function(activeElement, siblings, activeClass) {
    if (!activeElement) return;

    activeClass = activeClass || 'active';

    siblings.forEach(function(el) {
      el.classList.remove(activeClass);
    });
    activeElement.classList.add(activeClass);
  };

  /**
   * 切換元素的類別
   * @param {HTMLElement} element - 目標元素
   * @param {string} className - 要切換的類別名稱
   * @returns {boolean} - 切換後是否包含該類別
   */
  Helpers.toggleClass = function(element, className) {
    if (!element) return false;
    element.classList.toggle(className);
    return element.classList.contains(className);
  };

  /**
   * 篩選顯示/隱藏元素
   * @param {NodeList|Array} elements - 要篩選的元素列表
   * @param {string} filterValue - 篩選值（'all' 表示全部顯示）
   * @param {string} displayStyle - 顯示樣式（預設 'block'）
   * @param {string} dataAttribute - 資料屬性名稱（預設 'data-category'）
   */
  Helpers.filterElements = function(elements, filterValue, displayStyle, dataAttribute) {
    displayStyle = displayStyle || 'block';
    dataAttribute = dataAttribute || 'data-category';

    elements.forEach(function(el) {
      const category = el.getAttribute(dataAttribute);

      if (filterValue === 'all' || category === filterValue) {
        el.style.display = displayStyle;
      } else {
        el.style.display = 'none';
      }
    });
  };

  // ===== 網路請求 =====

  /**
   * 載入外部 HTML 檔案
   * @param {string} url - HTML 檔案路徑
   * @returns {Promise<string>} - HTML 內容
   */
  Helpers.fetchHTML = async function(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('HTTP error! status: ' + response.status);
      }
      return await response.text();
    } catch (error) {
      console.error('Failed to fetch ' + url + ':', error);
      return '';
    }
  };

  /**
   * 載入 HTML 並插入到容器中
   * @param {string} url - HTML 檔案路徑
   * @param {string|HTMLElement} container - 容器選擇器或元素
   * @param {Function} callback - 載入完成後的回調函數
   */
  Helpers.loadHTMLInto = async function(url, container, callback) {
    const element = typeof container === 'string' ? document.querySelector(container) : container;
    if (!element) return;

    const html = await Helpers.fetchHTML(url);
    if (html) {
      element.innerHTML = html;
      if (typeof callback === 'function') {
        callback();
      }
    }
  };

  // ===== 效能優化 =====

  /**
   * 防抖函數（Debounce）- 延遲執行，只執行最後一次
   * @param {Function} func - 要執行的函數
   * @param {number} wait - 等待時間（毫秒）
   * @returns {Function}
   */
  Helpers.debounce = function(func, wait) {
    wait = wait || 300;
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      const later = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  /**
   * 節流函數（Throttle）- 限制執行頻率
   * @param {Function} func - 要執行的函數
   * @param {number} limit - 時間限制（毫秒）
   * @returns {Function}
   */
  Helpers.throttle = function(func, limit) {
    limit = limit || 300;
    let inThrottle;
    return function() {
      const context = this;
      const args = arguments;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(function() {
          inThrottle = false;
        }, limit);
      }
    };
  };

  // ===== GSAP 動畫輔助函數 =====

  /**
   * GSAP 高度動畫（展開/收合）
   * @param {HTMLElement} element - 目標元素
   * @param {string|number} targetHeight - 目標高度（'auto' 或數字）
   * @param {number} duration - 動畫時長（秒）
   * @param {string} ease - 緩動函數
   * @param {Function} onComplete - 完成後的回調
   */
  Helpers.animateHeight = function(element, targetHeight, duration, ease, onComplete) {
    if (typeof gsap === 'undefined' || !element) return;

    duration = duration || 0.5;
    ease = ease || "power2.out";

    gsap.to(element, {
      height: targetHeight,
      duration: duration,
      ease: ease,
      onComplete: onComplete
    });
  };

  /**
   * GSAP 旋轉動畫
   * @param {HTMLElement} element - 目標元素
   * @param {number} rotation - 旋轉角度
   * @param {number} duration - 動畫時長（秒）
   * @param {string} ease - 緩動函數
   */
  Helpers.animateRotation = function(element, rotation, duration, ease) {
    if (typeof gsap === 'undefined' || !element) return;

    duration = duration || 0.3;
    ease = ease || "power2.out";

    gsap.to(element, {
      rotation: rotation,
      duration: duration,
      ease: ease
    });
  };

  /**
   * GSAP 淡入淡出
   * @param {HTMLElement} element - 目標元素
   * @param {number} opacity - 目標透明度（0-1）
   * @param {number} duration - 動畫時長（秒）
   * @param {Function} onComplete - 完成後的回調
   */
  Helpers.animateOpacity = function(element, opacity, duration, onComplete) {
    if (typeof gsap === 'undefined' || !element) return;

    duration = duration || 0.3;

    gsap.to(element, {
      opacity: opacity,
      duration: duration,
      onComplete: onComplete
    });
  };

  // ===== 資料處理 =====

  /**
   * 從 URL 獲取查詢參數
   * @param {string} param - 參數名稱
   * @returns {string|null} - 參數值
   */
  Helpers.getURLParam = function(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  };

  /**
   * 設定 URL 查詢參數（不重新載入頁面）
   * @param {string} param - 參數名稱
   * @param {string} value - 參數值
   */
  Helpers.setURLParam = function(param, value) {
    const url = new URL(window.location);
    url.searchParams.set(param, value);
    window.history.pushState({}, '', url);
  };

  // ===== 表單驗證 =====

  /**
   * 簡易 Email 驗證
   * @param {string} email - Email 地址
   * @returns {boolean}
   */
  Helpers.isValidEmail = function(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  /**
   * 檢查元素是否在視窗中
   * @param {HTMLElement} element - 目標元素
   * @returns {boolean}
   */
  Helpers.isInViewport = function(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };

})(window.SCCDHelpers);
