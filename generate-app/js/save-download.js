// ========================================
// 儲存 / 下載模組
// Save 按鈕動畫 → 產生 1080x1080 PNG → 組合檔名
// 依賴：variables.js（isDownloading, mode 等）、utils.js（updateIconsForMode）、
//       draw-logo.js 內的 drawLogo、easter-eggs 內的 loadEasterEggDownloadImages
// ========================================

// --- 保存透明PNG函數 ---
function saveTransparentPNG() {
  // 防止重複點擊
  if (isDownloading) return;
  isDownloading = true;

  let animationDuration;

  if (isMobileMode) {
    // 手機版：播放 Save 按鈕動畫
    // 優先使用 mobileElements 中的元素，fallback 到 saveButtonMobile
    let mobileSaveBtn = (typeof mobileElements !== 'undefined' && mobileElements.saveBtn)
      ? mobileElements.saveBtn
      : saveButtonMobile;
    let mobileSaveImg = (typeof mobileElements !== 'undefined' && mobileElements.saveBtn)
      ? select('#save-img-mobile')
      : saveImgMobile;

    if (mobileSaveBtn && mobileSaveImg) {
      animationDuration = animateSaveButton(mobileSaveBtn, mobileSaveImg);
    }
  } else {
    // 桌面版：播放 Save 按鈕動畫
    animationDuration = animateSaveButton(saveButton, saveImg);
  }

  // 動畫結束後開始下載
  setTimeout(() => {
    performDownload();
    // 下載完成後重置狀態
    isDownloading = false;
    // 立即更新icon，確保恢復正確的狀態
    updateIconsForMode();
  }, animationDuration || 2310);
}

// --- 實際執行下載的函數 ---
function performDownload() {
  const saveSize = 1080;

  // 生成檔案名稱
  let fileName = generateFileName();

  if (isEasterEggActive) {
    // 延遲載入彩蛋下載圖片（只在需要下載時載入）
    loadEasterEggDownloadImages();

    // 彩蛋模式：直接保存圖片（已經是 1080x1080）
    let imgToSave;
    if (mode === 'Wireframe') {
      // Wireframe 模式：根據描邊顏色選擇黑色或白色線框版本
      imgToSave = (wireframeStrokeColor && red(wireframeStrokeColor) > 128)
        ? sccdWhiteWireframeImg
        : sccdBlackWireframeImg;
    } else {
      // Standard/Inverse 模式
      imgToSave = (mode === 'Inverse') ? sccdWhiteImg : sccdBlackImg;
    }
    if (imgToSave) {
      // 直接保存圖片，不需要調整大小
      save(imgToSave, fileName);
    }
  } else {
    // 正常模式：創建一個 1080x1080 的高解析度畫布來儲存
    let pg = createGraphics(saveSize, saveSize);
    const scaleFactor = 2; // 放大倍數

    // 設定繪圖參數（保持原本的參數）
    pg.textFont(font);
    pg.textSize(367.5); // 350 * 1.05 = 367.5
    pg.textAlign(CENTER, CENTER);
    pg.imageMode(CENTER);

    // 臨時保存全域的 width 和 height
    let tempWidth = width;
    let tempHeight = height;

    // 暫時修改全域變數為原始canvas尺寸（540），而不是saveSize（1080）
    // 這樣 drawLogo 和 drawCentralCircle 會使用 540/2 = 270 作為中心點
    width = saveSize / scaleFactor; // 540
    height = saveSize / scaleFactor; // 540

    pg.push();
    pg.scale(scaleFactor); // 將整個內容放大2倍

    // 圓圈功能已移除，不再在儲存時繪製圓圈
    // if (showCircle) {
    //   drawCentralCircle(pg, 255); // 使用預設直徑 250
    // }

    // 繪製logo（使用原本的參數）
    drawLogo(pg, 255);

    pg.pop();

    // 恢復原本的 width 和 height
    width = tempWidth;
    height = tempHeight;

    // 保存文件
    pg.save(fileName);
  }
}

// --- 生成檔案名稱的函數 ---
function generateFileName() {
  let textPart = '';

  if (isEasterEggActive) {
    // 彩蛋模式：使用 "SCCD"
    textPart = 'SCCD';
  } else {
    // 正常模式：使用輸入框的文字（移除空格和換行，轉為大寫）
    // 獲取當前活動的輸入框
    let currentInputBox = inputBox;
    if (isMobileMode) {
      // 手機版：直接選取實際的輸入框元素
      let mobileInput = select("#mobile-input-box");
      if (mobileInput) {
        currentInputBox = mobileInput;
      }
    }

    if (currentInputBox) {
      let inputText = currentInputBox.value();
      // 移除所有空格和換行符，轉為大寫
      textPart = inputText.replace(/[\s\n]/g, '').toUpperCase();
    }

    // 如果沒有文字，使用預設名稱
    if (!textPart) {
      textPart = 'LOGO';
    }
  }

  // 模式部分：Standard、Inverse 或 Wireframe
  let modePart = mode; // "Standard"、"Inverse" 或 "Wireframe"

  // 如果是 Wireframe 模式，根據描邊顏色添加 Black 或 White
  if (mode === "Wireframe") {
    // 根據 wireframeStrokeColor 判斷是黑色還是白色
    let strokeColorName = "Black"; // 預設黑色
    if (wireframeStrokeColor && red(wireframeStrokeColor) > 128) {
      strokeColorName = "White";
    }
    modePart = `${strokeColorName} Wireframe`;
  }

  // 組合檔案名稱：文字 - 模式.png
  return `${textPart} - ${modePart}.png`;
}
