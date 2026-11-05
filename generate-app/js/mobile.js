// ====================================
// 手機版專用邏輯
// ====================================
// 此文件只在手機模式下運行，與桌面版邏輯互通但 UI 獨立

// ====================================
// 統一的 Canvas Resize 處理機制
// ====================================
let pendingCanvasResize = false; // 標記是否有待處理的 resize
let resizeTransitionListener = null; // transitionend 監聽器引用
let lastResizeTime = 0; // 上次 resize 的時間戳
let resizeDebounceTimer = null; // 防抖計時器
let logoResizeObserver = null; // 容器 ResizeObserver（見 initMobileUI 內註解）
let lastLogoObservedW = 0, lastLogoObservedH = 0; // RO bail 守衛：尺寸沒變不重算

/**
 * 請求 canvas resize（統一入口）
 * @param {boolean} immediate - 是否立即執行（跳過 transition 等待）
 * 使用 transitionend 事件確保在 CSS transition 結束後才執行
 */
function requestCanvasResize(immediate = false) {
  if (!isMobileMode || typeof resizeMobileCanvas !== 'function') return;

  const now = Date.now();
  const timeSinceLastResize = now - lastResizeTime;

  // 防抖：如果距離上次 resize 不到 300ms，延遲執行（即使 immediate=true）
  // 這可以避免在輸入文字時觸發 windowResized 導致抖動
  if (timeSinceLastResize < 300) {
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }
    resizeDebounceTimer = setTimeout(() => {
      requestCanvasResize(immediate);
    }, 300 - timeSinceLastResize); // 等待剩餘時間
    return;
  }

  const logoContainer = document.querySelector('.mobile-logo-container');
  if (!logoContainer || immediate) {
    // 如果沒有 logo container 或要求立即執行，直接執行 resize
    lastResizeTime = Date.now();
    resizeMobileCanvas();
    return;
  }

  // 標記有待處理的 resize
  pendingCanvasResize = true;

  // 移除舊的監聽器（避免重複）
  if (resizeTransitionListener) {
    logoContainer.removeEventListener('transitionend', resizeTransitionListener);
  }

  // 建立新的監聽器
  resizeTransitionListener = (event) => {
    // 只處理 width 的 transition（避免被其他屬性的 transition 觸發）
    if (event.propertyName === 'width' && pendingCanvasResize) {
      pendingCanvasResize = false;
      lastResizeTime = Date.now();
      resizeMobileCanvas();
      logoContainer.removeEventListener('transitionend', resizeTransitionListener);
      resizeTransitionListener = null;
    }
  };

  logoContainer.addEventListener('transitionend', resizeTransitionListener);

  // 保險機制：如果 500ms 後 transitionend 還沒觸發，強制執行
  setTimeout(() => {
    if (pendingCanvasResize) {
      pendingCanvasResize = false;
      lastResizeTime = Date.now();
      resizeMobileCanvas();
      if (resizeTransitionListener) {
        logoContainer.removeEventListener('transitionend', resizeTransitionListener);
        resizeTransitionListener = null;
      }
    }
  }, 500);
}

// 手機版 DOM 元素
let mobileElements = {
  // 底部按鈕列
  inputBtn: null,
  modeBtn: null,
  customBtn: null,
  rotateBtn: null,
  saveBtn: null,

  // 彈出面板
  inputPanel: null,
  colorpickerPanel: null,
  rotatePanel: null,

  // 輸入框
  inputBox: null,

  // Mode 圖標
  modeIcon: null,

  // Rotate 面板內的元素
  bentoCustomIcon: null,
  bentoPlayIcon: null,

  // Sliders (桌面版)
  rSlider: null,
  gSlider: null,
  bSlider: null,
  rAngleLabel: null,
  gAngleLabel: null,
  bAngleLabel: null,

  // 手機版 Custom 調整區
  customAngleControls: null,
  mobileRSlider: null,
  mobileGSlider: null,
  mobileBSlider: null,
  mobileRAngleLabel: null,
  mobileGAngleLabel: null,
  mobileBAngleLabel: null,
  mobileRandomBtn: null,
  mobileResetBtn: null,
  mobileRandomImg: null,
  mobileResetImg: null,

  // Random/Reset 按鈕
  randomBtn: null,
  resetBtn: null,
  randomIcon: null,
  resetIcon: null,

  // Color Picker (桌面版)
  colorpickerContainer: null,
  colorWheelPlayBtn: null,
  colorWheelPlayIcon: null,

  // 手機版 Color Picker Bar
  mobileColorpickerBar: null,
  mobileColorpickerContainer: null,
  mobileColorWheelPlayBtn: null,
  mobileColorWheelPlayIcon: null
};

// 初始化手機版 UI
function initMobileUI() {
  if (!isMobileMode) return;

  // 選取所有元素
  mobileElements.inputBtn = _p5.select('.mobile-input-btn');
  mobileElements.modeBtn = _p5.select('.mobile-mode-btn');
  mobileElements.customBtn = _p5.select('.mobile-custom-btn');
  mobileElements.rotateBtn = _p5.select('.mobile-rotate-btn');
  mobileElements.saveBtn = _p5.select('.mobile-save-btn');

  mobileElements.inputPanel = _p5.select('.mobile-input-panel');
  mobileElements.colorpickerPanel = _p5.select('.mobile-colorpicker-panel');
  mobileElements.rotatePanel = _p5.select('.mobile-rotate-panel');

  mobileElements.inputBox = _p5.select('#mobile-input-box');
  mobileElements.modeIcon = _p5.select('#mobile-mode-icon');

  // 容器「高度」被鄰居擠壓（面板出現吃掉 flex 空間、真機 iOS dvh 收斂）時沒有 width transition
  // 可等、也沒有任何事件會呼叫 requestCanvasResize → canvas 停在舊大尺寸置中溢出容器，
  // mode3 全面板時疊到輸入文字上。ResizeObserver 兜底：容器怎麼變就重算；防抖走 requestCanvasResize 內建
  const logoEl = document.querySelector('.mobile-logo-container');
  if (logoEl && typeof ResizeObserver !== 'undefined') {
    if (logoResizeObserver) logoResizeObserver.disconnect();
    logoResizeObserver = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1].contentRect;
      if (Math.abs(r.width - lastLogoObservedW) < 1 && Math.abs(r.height - lastLogoObservedH) < 1) return;
      lastLogoObservedW = r.width;
      lastLogoObservedH = r.height;
      requestCanvasResize(true);
    });
    logoResizeObserver.observe(logoEl);
  }

  mobileElements.bentoCustomIcon = _p5.select('#mobile-custom-icon');
  mobileElements.bentoPlayIcon = _p5.select('#mobile-rotate-icon');

  mobileElements.rSlider = _p5.select('.mobile-r-slider');
  mobileElements.gSlider = _p5.select('.mobile-g-slider');
  mobileElements.bSlider = _p5.select('.mobile-b-slider');
  mobileElements.rAngleLabel = _p5.select('.mobile-r-angle-label');
  mobileElements.gAngleLabel = _p5.select('.mobile-g-angle-label');
  mobileElements.bAngleLabel = _p5.select('.mobile-b-angle-label');

  mobileElements.randomBtn = _p5.select('.mobile-random-button');
  mobileElements.resetBtn = _p5.select('.mobile-reset-button');
  mobileElements.randomIcon = _p5.select('.mobile-random-img');
  mobileElements.resetIcon = _p5.select('.mobile-reset-img');

  mobileElements.colorpickerContainer = _p5.select('#mobile-colorpicker-container');
  mobileElements.colorWheelPlayBtn = _p5.select('#mobile-colorwheel-play-button');
  mobileElements.colorWheelPlayIcon = _p5.select('#mobile-colorwheel-play-icon');

  // 手機版 Color Picker Bar 元素
  mobileElements.mobileColorpickerBar = _p5.select('.mobile-colorpicker-bar');
  mobileElements.mobileColorpickerContainer = _p5.select('#mobile-colorpicker-container');
  mobileElements.mobileColorWheelPlayBtn = _p5.select('#mobile-colorwheel-play-button');
  mobileElements.mobileColorWheelPlayIcon = _p5.select('#mobile-colorwheel-play-icon');

  // 手機版 Custom 調整區元素
  mobileElements.customAngleControls = _p5.select('.mobile-custom-angle-controls');
  mobileElements.mobileRSlider = _p5.select('#mobile-r-slider');
  mobileElements.mobileGSlider = _p5.select('#mobile-g-slider');
  mobileElements.mobileBSlider = _p5.select('#mobile-b-slider');
  mobileElements.mobileRAngleLabel = _p5.select('#mobile-r-angle-label');
  mobileElements.mobileGAngleLabel = _p5.select('#mobile-g-angle-label');
  mobileElements.mobileBAngleLabel = _p5.select('#mobile-b-angle-label');
  mobileElements.mobileRandomBtn = _p5.select('#mobile-random-button');
  mobileElements.mobileResetBtn = _p5.select('#mobile-reset-button');
  mobileElements.mobileRandomImg = _p5.select('#mobile-random-img');
  mobileElements.mobileResetImg = _p5.select('#mobile-reset-img');

  // 綁定事件
  bindMobileEvents();
  updateMobileKbBase();

  // 進頁時同步 Color Picker Bar 顯隱：若是在別頁切成 mode3 再進 create，targetMode 已是 Wireframe
  // → bar 要預設出現（對齊桌面色環邏輯）；cycleModeButton 只在點 mode 鈕時跑、進頁時不會跑（user 2026-06-11）
  applyMobileColorpickerVisibility();
}

// 綁定手機版事件
function bindMobileEvents() {
  // 輸入框事件
  if (mobileElements.inputBox) {
    mobileElements.inputBox.input(handleInput);

    // 阻擋空白鍵和 Enter 換行
    mobileElements.inputBox.elt.addEventListener('keydown', function(e) {
      // 阻擋空白鍵
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
      }
      // Enter＝收鍵盤＋開轉（user 2026-11-04；同 ▶ 鈕，已在轉就不暫停）。選字中的 Enter 是確認候選字、不算
      if ((e.key === 'Enter' || e.keyCode === 13) && !e.isComposing) {
        e.preventDefault();
        if (!(isAutoRotateMode && autoRotate)) toggleAutoRotate();
        this.blur();
      }
    });

    // 防止鍵盤彈出時自動滾動
    mobileElements.inputBox.elt.addEventListener('focus', function(e) {
      // 使用 scrollIntoView 防止自動滾動行為
      setTimeout(() => {
        mobileElements.inputBox.elt.scrollIntoView({
          behavior: 'instant',
          block: 'nearest',
          inline: 'nearest'
        });
      }, 0);
    }, { passive: true });
  }

  // 底部按鈕事件
  if (mobileElements.inputBtn) {
    mobileElements.inputBtn.mousePressed(toggleInputPanel);
  }

  if (mobileElements.modeBtn) {
    mobileElements.modeBtn.mousePressed(cycleModeButton);
  }

  if (mobileElements.customBtn) {
    mobileElements.customBtn.mousePressed(toggleMobileCustomPanel);
  }

  if (mobileElements.rotateBtn) {
    mobileElements.rotateBtn.mousePressed(toggleAutoRotate);
  }

  if (mobileElements.saveBtn) {
    mobileElements.saveBtn.mousePressed(() => {
      if (letters.length > 0 || isEasterEggActive) {
        saveTransparentPNG();
      }
    });
  }


  // Slider 事件
  if (mobileElements.rSlider) {
    mobileElements.rSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('r', mobileElements.rSlider.value());
      }
    });
  }

  if (mobileElements.gSlider) {
    mobileElements.gSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('g', mobileElements.gSlider.value());
      }
    });
  }

  if (mobileElements.bSlider) {
    mobileElements.bSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('b', mobileElements.bSlider.value());
      }
    });
  }

  // Random/Reset 按鈕
  if (mobileElements.randomBtn) {
    mobileElements.randomBtn.mousePressed(handleRandomButton);
  }

  if (mobileElements.resetBtn) {
    mobileElements.resetBtn.mousePressed(handleResetButton);
  }

  // 手機版 Color Wheel Play 按鈕
  // 對齊桌面 sketch.js:399-430：必須 call site sccdStartColorLoop/sccdStopColorLoop 才會啟動 RAF；
  // Pause 時還要清 #create-app / canvas-container inline `transition:none`（draw() 每幀 disableTransition=true 留下），
  // 不清 → 下次 Play 跑出來的 bg 變化 snap snap 不平滑，跟桌面 fade 速度感不一致
  if (mobileElements.mobileColorWheelPlayBtn) {
    mobileElements.mobileColorWheelPlayBtn.mousePressed(() => {
      if (mode === "Wireframe") {
        const _running = (typeof window.sccdIsColorLoopRunning === 'function') && window.sccdIsColorLoopRunning();
        if (_running) {
          if (typeof window.sccdStopColorLoop === 'function') window.sccdStopColorLoop();
          isColorWheelRotating = false;
        } else {
          if (typeof window.sccdStartColorLoop === 'function') window.sccdStartColorLoop();
          isColorWheelRotating = true;
        }
        updateColorWheelIcon();

        // 從 Play 切換到 Pause：恢復 transition（讓 CSS 預設 transition 接管 fade）
        if (!isColorWheelRotating) {
          let body = _p5.select('#create-app');
          let canvasContainer = _p5.select('#canvas-container');
          let desktopCanvasContainer = _p5.select('#desktop-canvas-container');
          if (body) body.elt.style.transition = '';
          if (canvasContainer) canvasContainer.elt.style.transition = '';
          if (desktopCanvasContainer) desktopCanvasContainer.elt.style.transition = '';
        }
      }
    });
  }

  // 手機版 Custom 調整區的 Slider 事件
  if (mobileElements.mobileRSlider) {
    mobileElements.mobileRSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('r', mobileElements.mobileRSlider.value());
      }
    });
  }

  if (mobileElements.mobileGSlider) {
    mobileElements.mobileGSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('g', mobileElements.mobileGSlider.value());
      }
    });
  }

  if (mobileElements.mobileBSlider) {
    mobileElements.mobileBSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('b', mobileElements.mobileBSlider.value());
      }
    });
  }

  // 手機版 Random/Reset 按鈕
  if (mobileElements.mobileRandomBtn) {
    mobileElements.mobileRandomBtn.mousePressed(handleRandomButton);
  }

  if (mobileElements.mobileResetBtn) {
    mobileElements.mobileResetBtn.mousePressed(handleResetButton);
  }

  // Angle Label 事件（簡化版，只支援輸入數字）
  bindMobileAngleLabelEvents();
}

// 綁定角度輸入框事件
function bindMobileAngleLabelEvents() {
  const filterAngleInput = function(e) {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Home', 'End'];
    if (allowedKeys.includes(e.key)) return;
    if (!/^[0-9\-+]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  // 使用陣列迴圈設定事件監聽器
  const mobileAngleLabelElements = [
    { label: mobileElements.rAngleLabel, slider: mobileElements.rSlider, channel: 'r', index: 0 },
    { label: mobileElements.gAngleLabel, slider: mobileElements.gSlider, channel: 'g', index: 1 },
    { label: mobileElements.bAngleLabel, slider: mobileElements.bSlider, channel: 'b', index: 2 }
  ];

  mobileAngleLabelElements.forEach(({ label, slider, channel, index }) => {
    if (label) {
      label.elt.addEventListener('keydown', filterAngleInput);
      label.elt.addEventListener('input', function(e) {
        if (!isEasterEggActive && !autoRotate) {
          let angle = convertAngleInput(e.target.value);
          slider.value(angle);
          if (sliders[index]) sliders[index].value(angle);
          handleMobileSliderChange(channel, angle);
        }
      });
    }
  });
}

// 關閉所有面板
function closeAllMobilePanels() {
  if (mobileElements.inputPanel) mobileElements.inputPanel.removeClass('active');
  if (mobileElements.colorpickerPanel) mobileElements.colorpickerPanel.removeClass('active');
  if (mobileElements.rotatePanel) mobileElements.rotatePanel.removeClass('active');
}

// 切換 Input 面板
function toggleInputPanel() {
  if (mobileElements.inputPanel.hasClass('active')) {
    mobileElements.inputPanel.removeClass('active');
  } else {
    closeAllMobilePanels();
    mobileElements.inputPanel.addClass('active');
    // Focus 到輸入框
    if (mobileElements.inputBox) {
      setTimeout(() => {
        mobileElements.inputBox.elt.focus();
      }, 300);
    }
  }
}

// 循環切換模式（Mode 按鈕）
function cycleModeButton() {
  // 與桌面 colormodeBox.mousePressed 對齊：直接 call site setSiteMode，讓 site mode + create-app 同步
  // 不自己 cycle local targetMode；targetMode 由 'theme:changed' listener 更新（sketch.js 末段）
  // 否則手機版只切 local targetMode，body .mode-* class 沒換 → header 顏色不變、mode-color 整套不啟動
  const _siteCycle = { Standard: 'inverse', Inverse: 'color', Wireframe: 'standard' };
  const _nextSiteMode = _siteCycle[targetMode] || 'standard';
  if (typeof window.sccdSetMode === 'function') {
    window.sccdSetMode(_nextSiteMode);
  }

  // 根據模式自動顯示/隱藏 Color Picker Bar（抽成共用函式：進頁時若已是 mode3 也要同步 → 見 applyMobileColorpickerVisibility）
  applyMobileColorpickerVisibility();

  // 處理 custom-open class（只在 Wireframe 模式且 Custom 打開時有效）
  if (targetMode !== 'Wireframe' && mobileElements.inputBox) {
    // 離開 Wireframe 模式：移除 custom-open class
    mobileElements.inputBox.removeClass('custom-open');
  } else if (targetMode === 'Wireframe' && mobileElements.inputBox &&
             mobileElements.customAngleControls &&
             !mobileElements.customAngleControls.hasClass('hidden')) {
    // 進入 Wireframe 模式且 Custom 區塊已打開：添加 custom-open class
    mobileElements.inputBox.addClass('custom-open');
  }

  updateUI();

  // 模式切換後，調整輸入框的 padding（延遲以等待 DOM 更新）
  if (mobileElements.inputBox) {
    setTimeout(() => {
      const currentText = mobileElements.inputBox.value();
      updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
    }, 350); // 等待模式切換動畫完成（300ms）+ 50ms 緩衝
  }
}

// 依當前 targetMode 同步手機 Color Picker Bar 顯隱（Wireframe=mode3 才顯示）。
// cycleModeButton（點 mode 鈕）與 initMobileUI（在別頁切 mode3 後進 create，targetMode 已是 Wireframe）共用 →
// 否則 bar 只在點 mode 鈕時才出現，「進頁時已是 mode3」永遠藏著（user 2026-06-11 報的 bug）。
// bar 顯示後 colorpicker canvas 由 updateUI/draw 在 container 有尺寸時自建，thumb 跟 site colorLoop 的 hue 動（draw 每幀讀）。
function applyMobileColorpickerVisibility() {
  if (!mobileElements.mobileColorpickerBar) return;
  const logoContainer = document.querySelector('.mobile-logo-container');
  const inputArea = document.querySelector('.mobile-input-area');
  const isWireframe = targetMode === "Wireframe";

  if (isWireframe) {
    mobileElements.mobileColorpickerBar.removeClass('hidden');
    if (logoContainer) logoContainer.classList.add('has-colorpicker');
    if (inputArea) inputArea.classList.add('has-colorpicker');
  } else {
    mobileElements.mobileColorpickerBar.addClass('hidden');
    if (logoContainer) logoContainer.classList.remove('has-colorpicker');
    if (inputArea) inputArea.classList.remove('has-colorpicker');
  }
  // 顯隱後檢查輸入框最滿狀態 + 重算 canvas（logo-container 寬度變了）
  setTimeout(() => checkInputOverflow(), 50);
  requestCanvasResize();
}

// 輸入框一行（全 mode，create.css）：字超過框寬＝靠左（置中的超寬一行左半截捲不到）；先拿掉再量＝置中時的寬
function checkInputOverflow() {
  if (!mobileElements.inputBox) return;
  const inputElement = mobileElements.inputBox.elt;
  inputElement.classList.remove('overflowing');
  inputElement.classList.toggle('overflowing', inputElement.scrollWidth > inputElement.clientWidth);
}

// 手機版：Toggle Custom 調整區
function toggleMobileCustomPanel() {
  if (letters.length === 0 || isEasterEggActive) return;

  // 檢查調整區當前是否顯示
  const isHidden = mobileElements.customAngleControls.hasClass('hidden');

  // 選取 logo 和 input-area 元素
  const logoContainer = document.querySelector('.mobile-logo-container');
  const inputArea = document.querySelector('.mobile-input-area');

  if (isHidden) {
    // 如果調整區隱藏，需要先切換到 Custom 模式（如果還在 Auto 模式）
    if (isAutoRotateMode) {
      switchToCustomMode();
    }
    // 顯示調整區
    mobileElements.customAngleControls.removeClass('hidden');

    // 為 logo 和 input-area 添加 has-custom 類
    if (logoContainer) logoContainer.classList.add('has-custom');
    if (inputArea) inputArea.classList.add('has-custom');

    // Wireframe 模式下，給輸入框添加 custom-open class（單行顯示）
    if (mode === 'Wireframe' && mobileElements.inputBox) {
      mobileElements.inputBox.addClass('custom-open');
      // 檢查是否需要滾動
      setTimeout(() => checkInputOverflow(), 50); // 延遲一點讓 CSS 生效
    }

    // Custom 開啟後，調整輸入框的 padding
    if (mobileElements.inputBox) {
      setTimeout(() => {
        const currentText = mobileElements.inputBox.value();
        updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
      }, 350); // 等待動畫完成
    }

    // 重新調整 canvas 尺寸（因為 logo-container 縮小了）
    requestCanvasResize();

    // 更新按鈕狀態
    updateCustomRotateButtonStates();
  } else {
    // 如果調整區顯示，隱藏它（但保持在 Custom 模式）
    mobileElements.customAngleControls.addClass('hidden');

    // 移除 has-custom 類
    if (logoContainer) logoContainer.classList.remove('has-custom');
    if (inputArea) inputArea.classList.remove('has-custom');

    // 移除 custom-open class，恢復原樣
    if (mobileElements.inputBox) {
      mobileElements.inputBox.removeClass('custom-open');
      mobileElements.inputBox.elt.classList.remove('overflowing');
    }

    // 離開最滿狀態，檢查輸入框
    setTimeout(() => checkInputOverflow(), 50);

    // Custom 關閉後，調整輸入框的 padding
    if (mobileElements.inputBox) {
      setTimeout(() => {
        const currentText = mobileElements.inputBox.value();
        updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
      }, 350); // 等待動畫完成
    }

    // 重新調整 canvas 尺寸（因為 logo-container 變大了）
    requestCanvasResize();

    // 更新按鈕狀態（custom 關閉後應該回到 inactive 狀態 60%）
    updateCustomRotateButtonStates();
  }
}


// 切換到 Custom 模式
function switchToCustomMode() {
  if (letters.length === 0 || isEasterEggActive) return;

  // 如果已經在 Custom 模式，不做任何事
  if (!isAutoRotateMode) return;

  // 切換到 Custom 模式
  isAutoRotateMode = false;
  autoRotate = false;

  // 正規化角度
  for (let i = 0; i < rotationAngles.length; i++) {
    if (rotationAngles[i] !== undefined) {
      rotationAngles[i] = normalizeAngle(rotationAngles[i]);
    }
  }

  // 計算回到 0° 的最短路徑（使用陣列迴圈）
  for (let i = 0; i < 3; i++) {
    const diff = getShortestRotation(rotationOffsets[i], 0);
    targetRotationOffsets[i] = rotationOffsets[i] + diff;
    targetSliderValues[i] = 0;
  }

  isEasingCustomRotation = true;
  isEasingSlider = true;
  shouldResetToZero = true;

  // 不自動顯示調整區，由用戶通過按鈕控制

  updateRotateIcon();
  updateUI();
}

// 切換自動旋轉（與桌面版相同的邏輯）
function toggleAutoRotate() {
  if (letters.length === 0 || isEasterEggActive) return;

  // 從 Custom 模式切換到 Auto 模式
  if (!isAutoRotateMode) {
    isAutoRotateMode = true;
    autoRotate = true;
    resetRotationOffsets();

    // 手機版：隱藏 Custom 調整區並清理 Layout
    if (isMobileMode && mobileElements.customAngleControls) {
      mobileElements.customAngleControls.addClass('hidden');

      // 移除 has-custom class，讓 Layout 調整
      const logoContainer = document.querySelector('.mobile-logo-container');
      const inputArea = document.querySelector('.mobile-input-area');
      if (logoContainer) logoContainer.classList.remove('has-custom');
      if (inputArea) inputArea.classList.remove('has-custom');

      // 移除 custom-open class
      if (mobileElements.inputBox) {
        mobileElements.inputBox.removeClass('custom-open');
        mobileElements.inputBox.elt.classList.remove('overflowing');
      }

      // 調整輸入框的 padding
      if (mobileElements.inputBox) {
        setTimeout(() => {
          const currentText = mobileElements.inputBox.value();
          updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
        }, 350); // 等待動畫完成
      }

      // 重新調整 canvas 尺寸（因為 logo-container 變大了）
      requestCanvasResize();

      // 更新按鈕狀態
      updateCustomRotateButtonStates();
    }
  } else {
    // 已經在 Auto 模式，只是 toggle
    autoRotate = !autoRotate;
    if (autoRotate) {
      resetRotationOffsets();
    }
  }

  updateRotateIcon();
  updateUI();

  // 更新按鈕狀態
  updateCustomRotateButtonStates();
}

// 處理 Slider 變化
function handleMobileSliderChange(channel, value) {
  // 停止 easing
  isEasingCustomRotation = false;
  isEasingSlider = false;

  // 根據 channel 決定陣列索引
  const channelIndex = { 'r': 0, 'g': 1, 'b': 2 }[channel];
  if (channelIndex === undefined) return;

  // 更新對應的 offset（使用陣列）
  rotationOffsets[channelIndex] = value;
  targetRotationOffsets[channelIndex] = value;
  currentSliderValues[channelIndex] = value;
  targetSliderValues[channelIndex] = value;

  // 同步桌面版 slider
  if (sliders[channelIndex]) sliders[channelIndex].value(value);

  updateUI();
}

// Random 按鈕
function handleRandomButton() {
  if (letters.length === 0 || autoRotate || isEasterEggActive) return;

  const letterCount = letters.length;

  // 使用陣列迴圈處理 R/G/B（簡化重複邏輯）
  for (let i = 0; i < 3; i++) {
    const newAngle = (letterCount >= MIN_LETTERS_FOR_CHANNELS[i]) ? _p5.floor(_p5.random(ROTATION_ANGLE_MIN, ROTATION_ANGLE_MAX)) : 0;
    const diff = getShortestRotation(rotationOffsets[i], newAngle);
    targetRotationOffsets[i] = rotationOffsets[i] + diff;
    targetSliderValues[i] = normalizeAngle(targetRotationOffsets[i]);
  }

  isEasingCustomRotation = true;
  isEasingSlider = true;
  updateUI();
}

// Reset 按鈕
function handleResetButton() {
  if (letters.length === 0 || autoRotate || isEasterEggActive) return;

  // 使用陣列迴圈處理 R/G/B（簡化重複邏輯）
  for (let i = 0; i < 3; i++) {
    const diff = getShortestRotation(rotationOffsets[i], 0);
    targetRotationOffsets[i] = rotationOffsets[i] + diff;
    targetSliderValues[i] = 0;
  }

  isEasingCustomRotation = true;
  isEasingSlider = true;
  updateUI();
}

// 更新手機版 UI 狀態
function updateMobileUI() {
  if (!isMobileMode) return;

  const hasText = letters.length > 0;
  const isWireframe = mode === "Wireframe";

  // 更新 Mode 圖標
  updateMobileModeIcon();

  // 更新 Rotate 圖標（使用共用函數）
  updateRotateIcon();

  // 更新 Sliders 狀態
  updateMobileSliders();

  // 更新按鈕狀態
  updateMobileButtons();

  // 更新圖標顏色
  updateMobileIcons();

  // 同步桌面版的 sliders（如果存在）
  syncDesktopSliders();
}

// 更新手機版 Sliders
function updateMobileSliders() {
  if (!mobileElements.rSlider) return;

  const hasText = letters.length > 0;
  const letterCount = letters.length;

  // 使用陣列迴圈處理 R/G/B 三個 slider（簡化重複邏輯）
  const sliderConfigs = [
    { slider: mobileElements.rSlider, label: mobileElements.rAngleLabel, minLetters: 1, offsetIndex: 0 }, // R
    { slider: mobileElements.gSlider, label: mobileElements.gAngleLabel, minLetters: 2, offsetIndex: 1 }, // G
    { slider: mobileElements.bSlider, label: mobileElements.bAngleLabel, minLetters: 3, offsetIndex: 2 }  // B
  ];

  sliderConfigs.forEach(({ slider, label, minLetters, offsetIndex }) => {
    const shouldEnable = hasText && letterCount >= minLetters && !autoRotate && !isEasterEggActive;

    if (shouldEnable) {
      slider.removeAttribute('disabled');
      slider.addClass('enabled');
      if (label) {
        label.addClass('enabled');
        label.value(Math.round(rotationOffsets[offsetIndex]));
      }
    } else {
      slider.attribute('disabled', '');
      slider.removeClass('enabled');
      if (label) {
        label.removeClass('enabled');
        label.value('0');
      }
    }
  });
}

// 更新 Custom 和 Rotate 按鈕的 active/inactive 狀態
function updateCustomRotateButtonStates() {
  if (!mobileElements.customBtn || !mobileElements.rotateBtn) return;

  const hasText = letters.length > 0;
  if (!hasText) return; // 沒有文字時不處理

  // 檢查 custom panel 是否打開
  const isCustomPanelOpen = mobileElements.customAngleControls &&
                            !mobileElements.customAngleControls.hasClass('hidden');

  if (isCustomPanelOpen) {
    // Custom panel 打開：custom active, rotate inactive
    mobileElements.customBtn.addClass('active');
    mobileElements.customBtn.removeClass('inactive');
    mobileElements.rotateBtn.addClass('inactive');
    mobileElements.rotateBtn.removeClass('active');
  } else {
    // Custom panel 關閉：rotate active, custom inactive
    mobileElements.customBtn.addClass('inactive');
    mobileElements.customBtn.removeClass('active');
    mobileElements.rotateBtn.addClass('active');
    mobileElements.rotateBtn.removeClass('inactive');
  }
}

// 更新手機版按鈕狀態
function updateMobileButtons() {
  const hasText = letters.length > 0;

  // 更新底部按鈕的 disabled 狀態
  // Mode 按鈕始終啟用

  // Rotation group 的顯示/隱藏狀態
  const rotationGroup = document.querySelector('.mobile-rotation-group');
  const bottomBar = document.querySelector('.mobile-bottom-bar');

  if (rotationGroup) {
    // SCCD 彩蛋時隱藏 rotation group，讓按鈕列只剩 mode 和 save
    if (isEasterEggActive) {
      rotationGroup.style.display = 'none';
      // 給底部按鈕列添加 easter-egg-active class，讓按鈕靠攏到中間
      if (bottomBar) bottomBar.classList.add('easter-egg-active');
    } else {
      rotationGroup.style.display = '';
      // 移除 easter-egg-active class，恢復正常布局
      if (bottomBar) bottomBar.classList.remove('easter-egg-active');
      // Rotation group 的 disabled 狀態（控制外框的 opacity）
      if (!hasText) {
        rotationGroup.classList.add('disabled');
      } else {
        rotationGroup.classList.remove('disabled');
      }
    }
  }

  // Custom 按鈕：手機版只在沒有文字時禁用（與桌面版不同）
  if (mobileElements.customBtn) {
    if (!hasText) {
      mobileElements.customBtn.elt.disabled = true;
      mobileElements.customBtn.removeClass('active');
      mobileElements.customBtn.removeClass('inactive');
    } else {
      mobileElements.customBtn.elt.disabled = false;
      // 更新 active/inactive 狀態
      updateCustomRotateButtonStates();
    }
  }

  // Rotate 按鈕：沒有文字時禁用
  if (mobileElements.rotateBtn) {
    if (!hasText) {
      mobileElements.rotateBtn.elt.disabled = true;
      mobileElements.rotateBtn.removeClass('active');
      mobileElements.rotateBtn.removeClass('inactive');
    } else {
      mobileElements.rotateBtn.elt.disabled = false;
      // 更新 active/inactive 狀態
      updateCustomRotateButtonStates();
    }
  }

  // Save 按鈕：啟用條件 - 有文字 或 彩蛋激活中
  if (mobileElements.saveBtn) {
    const canSave = hasText || isEasterEggActive;
    mobileElements.saveBtn.elt.disabled = !canSave;
  }

}

// 更新手機版圖標
function updateMobileIcons() {
  const isWireframe = mode === "Wireframe";
  const suffix = getIconSuffix();

  // Random/Reset 圖標（舊的 Bento 面板）
  if (mobileElements.randomIcon) {
    mobileElements.randomIcon.attribute('src', panelIcon(`Random${suffix}`));
  }
  if (mobileElements.resetIcon) {
    mobileElements.resetIcon.attribute('src', panelIcon(`Reset${suffix}`));
  }

  // Random/Reset 圖標（新的 Custom 調整區）
  if (mobileElements.mobileRandomImg) {
    mobileElements.mobileRandomImg.attribute('src', panelIcon(`Random${suffix}`));
  }
  if (mobileElements.mobileResetImg) {
    mobileElements.mobileResetImg.attribute('src', panelIcon(`Reset${suffix}`));
  }

  // Custom 圖標
  if (mobileElements.bentoCustomIcon) {
    mobileElements.bentoCustomIcon.attribute('src', panelIcon(`Custom${suffix}`));
  }

  // Play/Pause 圖標（Bento 面板）
  updateMobileBentoPlayIcon();

  // 更新邊框顏色
  const borderColor = isWireframe ? getWireframeBorderColor() : null;
  const elements = [
    ..._p5.selectAll('.mobile-bottom-btn'),
  ];
  updateElementsBorderColor(elements, borderColor);
}

// 更新 Bento Play 圖標
function updateMobileBentoPlayIcon() {
  if (!mobileElements.bentoPlayIcon) return;

  const hasText = letters.length > 0;
  const suffix = getIconSuffix();

  let iconSrc = '';

  if (!hasText) {
    iconSrc = panelIcon(`Rotate${suffix}`);
  } else if (isAutoRotateMode) {
    if (autoRotate) {
      iconSrc = panelIcon(`Pause${suffix}`);
    } else {
      iconSrc = panelIcon(`Play${suffix}`);
    }
  } else {
    iconSrc = panelIcon(`Rotate${suffix}`);
  }

  mobileElements.bentoPlayIcon.attribute('src', iconSrc);
}

// 注意：getSuffixForMode 已移至 utils.js 的 getIconSuffix()

// 同步桌面版 Sliders
function syncDesktopSliders() {
  if (!sliders[0] || !sliders[1] || !sliders[2]) return;

  // 同步數值（使用陣列迴圈）
  const mobileSliderElements = [mobileElements.rSlider, mobileElements.gSlider, mobileElements.bSlider];
  mobileSliderElements.forEach((mobileSlider, i) => {
    if (mobileSlider && sliders[i]) {
      sliders[i].value(mobileSlider.value());
    }
  });
}

// 更新手機版 Mode 圖標（使用 utils.js 的共用函數）
function updateMobileModeIcon() {
  if (!mobileElements.modeIcon) return;
  mobileElements.modeIcon.attribute('src', getModeIconSrc());
}

// ====================================
// 手機鍵盤模式（user 2026-11-04 重寫）
// ====================================
// 鍵盤開著＝只留 logo＋輸入框、整個 app 縮成鍵盤上方的可視高（create.css #create-app.create-kb-mobile）；
// canvas 由 logo 容器 ResizeObserver 依新高度重算一次。舊版每個 visualViewport resize 都重寫一整套 inline 排版＋重畫 canvas：
//   鍵盤滑動中 resize 連發＝打字卡、畫面一直抖（Chrome 開鍵盤連 innerHeight 都縮，觸發更多）；收鍵盤途中 vv 漸高、
//   logo 高＝可視高 75% 跟著長＝先變大、收完回正常排版又變小；logo 高沒扣 header＝小手機頂部被切。
// ① 開：等 vv 高停住（MOBILE_KB_SETTLE）才套一次 ② 收：失焦立刻收（不等 vv 長回來）
// ③ 基準高＝同寬度下沒開鍵盤時看過的最大 vv 高（舊版 script 載入時抓一次，轉向／工具列伸縮後就不準）
const MOBILE_KB_SETTLE = 150;   // ms：vv resize 停這麼久＝鍵盤動完
let mobileKbOpen = false, mobileKbBaseH = 0, mobileKbBaseW = 0, mobileKbTimer = 0;

function setMobileKeyboard(open) {
  const app = document.getElementById('create-app');
  if (open && app) app.style.setProperty('--create-vv-h', `${Math.round(window.visualViewport.height)}px`);
  if (open === mobileKbOpen) return;
  mobileKbOpen = open;
  if (app) {
    // 輸入區高度平常有過渡（開關 custom 用）；這次一步到位：過渡中 logo 容器連續變高、canvas 跟著縮了又長
    const area = app.querySelector('.mobile-input-area');
    if (area) area.style.transition = 'none';
    app.classList.toggle('create-kb-mobile', open);
    if (area) { void area.offsetHeight; area.style.transition = ''; }
  }
  // 鎖 body：Safari 會把整頁往上推去露出輸入框（下方露空白）
  const s = document.body.style;
  s.position = open ? 'fixed' : '';
  s.width = open ? '100%' : '';
  s.height = open ? `${mobileKbBaseH}px` : '';
}

// 進頁、點輸入框（鍵盤還沒升起）、每次 vv resize 都更新；寬變＝轉向重抓。
// app 高吃這個值（create.css --create-base-h）不吃 100dvh：Chrome 開鍵盤連 dvh 都縮 → 鍵盤升降途中整組排版跟著擠（logo 先縮成一小塊再長回來）。
// 沒在打字＝跟著可視高走（工具列伸縮）；打字中＝鍵盤可能正在升起，只升不降
function updateMobileKbBase() {
  if (!window.visualViewport) return;
  const vvH = window.visualViewport.height;
  const focused = !!mobileElements.inputBox && document.activeElement === mobileElements.inputBox.elt;
  if (window.innerWidth !== mobileKbBaseW) { mobileKbBaseW = window.innerWidth; mobileKbBaseH = 0; }
  if (!focused) mobileKbBaseH = vvH;
  else if (!mobileKbOpen) mobileKbBaseH = Math.max(mobileKbBaseH, vvH);
  document.getElementById('create-app')?.style.setProperty('--create-base-h', `${Math.round(mobileKbBaseH)}px`);
}

function syncMobileKeyboard() {
  if (!isMobileMode || !_p5 || !window.visualViewport) return;
  updateMobileKbBase();
  const focused = !!mobileElements.inputBox && document.activeElement === mobileElements.inputBox.elt;
  setMobileKeyboard(focused && mobileKbBaseH - window.visualViewport.height > 100);
}

// _p5 為 null＝已離開 /create（cleanupCreateApp 跑過）：top-level listener 移不掉（script 載入時就綁）、靠 guard 不動其他頁
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if (!isMobileMode || !_p5) return;
    clearTimeout(mobileKbTimer);
    mobileKbTimer = setTimeout(syncMobileKeyboard, MOBILE_KB_SETTLE);
  });

  // 鍵盤把頁面往上推＝捲回頂（已經在頂就不動，免得跟 Safari 搶捲動位置一直抖）
  window.visualViewport.addEventListener('scroll', () => {
    if (!isMobileMode || !_p5) return;
    if (window.scrollY !== 0 || window.visualViewport.offsetTop !== 0) window.scrollTo(0, 0);
  });
}

// 寬沒變、只是變矮且正在打字＝鍵盤，不是轉向（Chrome 開鍵盤連 innerHeight 都縮，直向手機會變成「寬＞高」）。
// sketch.js handleOrientationChange 用；CSS 矮橫向 gate 看 .create-typing
function isMobileTypingResize() {
  return !!mobileElements.inputBox && document.activeElement === mobileElements.inputBox.elt && window.innerWidth === mobileKbBaseW;
}

document.addEventListener('focusin', (e) => {
  if (!isMobileMode || !_p5 || !mobileElements.inputBox || e.target !== mobileElements.inputBox.elt) return;
  updateMobileKbBase();
  document.getElementById('create-app')?.classList.add('create-typing');
});
document.addEventListener('focusout', (e) => {
  if (!mobileElements.inputBox || e.target !== mobileElements.inputBox.elt) return;
  document.getElementById('create-app')?.classList.remove('create-typing');
  if (mobileKbOpen) {
    clearTimeout(mobileKbTimer);
    setMobileKeyboard(false);
  }
});
