// ========================================
// UI 狀態機模組
// updateUI 主要狀態同步（模式切換、按鈕啟用、滑桿顏色、手機版 UI）/ updateSliders / getRotationFor
// 依賴：variables.js（所有狀態變數）、utils.js（getDisabledColor, updateIconsForMode, updateRotateIcon）、
//       mobile.js（updateMobileUI, mobileElements）、color-picker.js 內的 drawColorWheel/updateBackgroundColor/event handlers
// ========================================

// --- 完全參照 ref.js:278-346 重寫 updateUI ---
function updateUI() {
    const hasText = letters.length > 0;
    const isStandardTarget = (targetMode === "Standard");
    const isInverseTarget = (targetMode === "Inverse");
    const isInverseMode = mode === "Inverse";
    const activeColor = isInverseMode ? "white" : "black";
    const activeBorder = isInverseMode ? "2px solid white" : "2px solid black";
    const body = select('body');

    // 更新 disabledColor 根據當前模式
    disabledColor = getDisabledColor();

    // 更新 Body Class（使用 targetMode 而不是 mode，確保立即更新）
    const isWireframeMode = (targetMode === "Wireframe");

    if (isWireframeMode) {
        body.removeClass('standard-mode');
        body.removeClass('inverse-mode');
        body.addClass('wireframe-mode');
        // Wireframe 模式下，背景顏色使用 CSS 變數 --wireframe-bg
        // 確保在 window resize（如手機轉向）時也能保持當前的背景顏色
        if (wireframeColor) {
            updateBackgroundColor(wireframeColor);
        }

        // 淡入 color picker box（容器展開動畫 + 淡入）
        if (colorPickerBox) {
            // 步驟 1：設置 display: flex，初始狀態為 max-width: 0, padding: 0, opacity: 0
            colorPickerBox.style('display', 'flex');
            colorPickerBox.style('max-width', '0');
            colorPickerBox.style('padding', '0');
            colorPickerBox.style('opacity', '0');

            // 步驟 2：強制 reflow，然後設置 max-width、padding 和 opacity（觸發容器展開動畫 + 淡入）
            void colorPickerBox.elt.offsetHeight; // 強制瀏覽器重繪
            colorPickerBox.style('max-width', '500px'); // 設定足夠大的值
            colorPickerBox.style('padding', ''); // 恢復 CSS 中定義的 padding
            colorPickerBox.style('opacity', '1'); // 容器淡入（包括 border 和背景）

            // 步驟 3：等待容器完全展開（300ms），再立即創建 canvas 並顯示內容
            setTimeout(() => {
                // 立即創建 canvas（不等 draw() 執行）
                if (!colorPickerCanvas) {
                    // 根據設備選擇正確的 container
                    let containerId = isMobileMode ? 'mobile-colorpicker-container' : 'colorpicker-container';
                    let container = select('#' + containerId);
                    if (container) {
                        let containerWidth = container.elt.clientWidth;
                        let containerHeight = container.elt.clientHeight;

                        let canvasWidth, canvasHeight;

                        if (isMobileMode) {
                            // 手機版：使用實際容器尺寸（橫向長條）
                            canvasWidth = containerWidth;
                            canvasHeight = containerHeight;
                        } else {
                            // 桌面版：取較小值確保是正方形
                            let containerSize = Math.min(containerWidth, containerHeight);
                            canvasWidth = containerSize;
                            canvasHeight = containerSize;
                        }

                        if (canvasWidth > 0 && canvasHeight > 0) {
                            colorPickerCanvas = createGraphics(canvasWidth, canvasHeight);
                            colorPickerCanvas.parent(containerId);
                            colorPickerCanvas.elt.style.display = 'block';
                            colorPickerCanvas.elt.style.margin = 'auto';

                            colorPickerIndicatorX = 0.5;
                            colorPickerIndicatorY = 0.25;

                            // 綁定鼠標事件
                            colorPickerCanvas.elt.addEventListener('mousedown', handleColorPickerMouseDown);
                            colorPickerCanvas.elt.addEventListener('mousemove', handleColorPickerMouseMove);
                            colorPickerCanvas.elt.addEventListener('mouseup', handleColorPickerMouseUp);

                            // 添加 touch 事件支持（手機端）
                            colorPickerCanvas.elt.addEventListener('touchstart', handleColorPickerTouchStart);
                            colorPickerCanvas.elt.addEventListener('touchmove', handleColorPickerTouchMove);
                            colorPickerCanvas.elt.addEventListener('touchend', handleColorPickerMouseUp);
                            colorPickerCanvas.elt.addEventListener('touchcancel', handleColorPickerMouseUp);

                            // 全局事件，確保在 canvas 外也能繼續拖曳和停止
                            document.addEventListener('mousemove', handleColorPickerMouseMove);
                            document.addEventListener('mouseup', handleColorPickerMouseUp);
                            document.addEventListener('touchend', handleColorPickerMouseUp);

                            // 立即繪製色環
                            drawColorWheel();
                        }
                    }
                }

                // 允許創建 canvas 的標記（防止 draw() 重複創建）
                colorPickerReady = true;

                // 顯示內容（canvas 已經創建好了，可以立即顯示）
                if (colorPickerContainer) {
                    colorPickerContainer.style('opacity', '1');
                }
                if (colorWheelPlayButton) {
                    colorWheelPlayButton.style('opacity', '1');
                }
            }, 300); // 等待容器展開完成後立即顯示
        }
    } else {
        body.removeClass('wireframe-mode');
        if (isInverseTarget) {
            body.removeClass('standard-mode');
            body.addClass('inverse-mode');
            window.parent.postMessage({ genMode: 'Inverse', bg: '#000000', text: '#ffffff' }, '*');
        } else {
            body.removeClass('inverse-mode');
            body.addClass('standard-mode');
            window.parent.postMessage({ genMode: 'Standard', bg: '#ffffff', text: '#000000' }, '*');
        }
        // Standard/Inverse 模式下，清除 Wireframe 的 CSS 變數，讓背景色恢復為黑/白
        // 這樣可以確保從 Wireframe 切換回來時，背景顏色會正確重置
        body.elt.style.removeProperty('--wireframe-bg');
        body.elt.style.removeProperty('--wireframe-border');
        body.elt.style.removeProperty('--wireframe-icon-opacity');

        // 同時清除 canvas container 的 CSS 變數
        let canvasContainer = select('#canvas-container');
        let desktopCanvasContainer = select('#desktop-canvas-container');
        if (canvasContainer) {
            canvasContainer.elt.style.removeProperty('--wireframe-bg');
            canvasContainer.elt.style.removeProperty('--wireframe-border');
        }
        if (desktopCanvasContainer) {
            desktopCanvasContainer.elt.style.removeProperty('--wireframe-bg');
            desktopCanvasContainer.elt.style.removeProperty('--wireframe-border');
        }

        // 平滑收起 color picker box（收起動畫）
        if (colorPickerBox) {
            // 步驟 1：先淡出內容
            if (colorPickerContainer) {
                colorPickerContainer.style('opacity', '0');
            }
            if (colorWheelPlayButton) {
                colorWheelPlayButton.style('opacity', '0');
            }

            // 步驟 2：收起容器（縮小 max-width、padding、opacity）
            colorPickerBox.style('max-width', '0');
            colorPickerBox.style('padding', '0');
            colorPickerBox.style('opacity', '0');
            colorPickerBox.removeClass('show'); // 移除 show class

            // 步驟 3：等待動畫完成後再隱藏（200ms）
            setTimeout(() => {
                colorPickerBox.style('display', 'none');

                // 重置標記
                colorPickerReady = false;
            }, 200); // 與 CSS transition 時間一致
        }
    }

    // 更新所有圖標根據當前模式
    updateIconsForMode();

    // 更新輸入框顏色
    // Wireframe 模式下使用對比色，Standard/Inverse 模式使用固定顏色
    let textColor = activeColor;
    if (isWireframeMode && wireframeStrokeColor) {
        // 使用與 logo 邊框相同的對比色
        let r = red(wireframeStrokeColor);
        let g = green(wireframeStrokeColor);
        let b = blue(wireframeStrokeColor);
        textColor = `rgb(${r}, ${g}, ${b})`;
    }

    inputBox.style("color", textColor);
    if (inputBoxMobile) {
        inputBoxMobile.style("color", textColor);
    }

    if (isEasterEggActive) {
        // --- 彩蛋模式 UI ---
        // 隱藏整個 rotation-box
        select('#rotation-box').style('display', 'none');

        colormodeButton.style('display', 'flex');
        saveButton.style('display', 'flex');

        // Colormode 按鈕在彩蛋模式下仍然可用
        colormodeButton.style('cursor', 'pointer');

        // 修復：設定正確的圖片元素
        saveButton.style('cursor', 'pointer');
        saveButton.elt.disabled = false;

    } else {
        // --- 正常模式 UI ---
        // 桌面版：顯示整個 rotation-box
        let rotationBox = select('#rotation-box');
        if (rotationBox) {
            rotationBox.style('display', 'flex');

            // 更新 rotation-box 的 disabled 狀態
            if (hasText) {
                rotationBox.removeClass('disabled');
            } else {
                rotationBox.addClass('disabled');
            }
        }

        // 更新 save-box 的 disabled 狀態
        let saveBox = select('#save-box');
        if (saveBox) {
            if (hasText) {
                saveBox.removeClass('disabled');
            } else {
                saveBox.addClass('disabled');
            }
        }

        // 桌面版按鈕（添加存在性檢查）
        if (rotateButton) rotateButton.style('display', 'flex');
        if (customButton) customButton.style('display', 'flex');

        // 更新 Auto/Custom 按鈕（添加存在性檢查）
        if (rotateButton) {
            rotateButton.elt.disabled = !hasText;
            rotateButton.style("color", !hasText ? disabledColor : isAutoRotateMode ? activeColor : disabledColor);
            rotateButton.style("cursor", !hasText ? 'not-allowed' : "pointer");

            // 使用 class 控制 active 狀態
            if (hasText && isAutoRotateMode) {
                rotateButton.addClass('active');
            } else {
                rotateButton.removeClass('active');
            }
        }

        // 更新 Rotate 按鈕 icon（使用統一函數）
        updateRotateIcon();

        if (customButton) {
            customButton.elt.disabled = !hasText;
            customButton.style("color", !hasText ? disabledColor : !isAutoRotateMode ? activeColor : disabledColor);
            customButton.style("cursor", !hasText ? 'not-allowed' : "pointer");

            // 使用 class 控制 active 狀態
            if (hasText && !isAutoRotateMode) {
                customButton.addClass('active');
                // 為 custom-area-wrapper 添加 custom-mode class，顯示邊框和 padding
                let customAreaWrapper = select('#custom-area-wrapper');
                if (customAreaWrapper) customAreaWrapper.addClass('custom-mode');
            } else {
                customButton.removeClass('active');
                // 移除 custom-mode class
                let customAreaWrapper = select('#custom-area-wrapper');
                if (customAreaWrapper) customAreaWrapper.removeClass('custom-mode');
            }
        }

        // 更新 Colormode 按鈕（循環切換，總是可用）
        if (colormodeButton) {
            colormodeButton.style('display', 'flex');
            colormodeButton.style('cursor', 'pointer');
        }

        // 更新 Custom 控制面板
        const customControlsEnabled = hasText && !isAutoRotateMode;
        const customControlsContainer = select('#custom-angle-controls');

        if (customControlsContainer) {
            if (customControlsEnabled) {
                // Custom 展開時：顯示 slider 和 icon 按鈕（使用平滑動畫）
                if (customButton) customButton.style('display', 'flex');
                customControlsContainer.addClass('show'); // 添加 show class 觸發動畫
                if (randomButton) randomButton.style('display', 'flex');
                if (resetButton) resetButton.style('display', 'flex');
            } else {
                // Custom 未展開時：顯示按鈕但 disabled
                if (customButton) customButton.style('display', 'flex');
                customControlsContainer.removeClass('show'); // 移除 show class 觸發收起動畫
                if (randomButton) randomButton.style('display', 'flex');
                if (resetButton) resetButton.style('display', 'flex');
            }
        }

        // 更新 Random/Reset 圖示（添加存在性檢查）
        if (randomButton) {
            randomButton.elt.disabled = !customControlsEnabled;
            randomButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
        }
        if (resetButton) {
            resetButton.elt.disabled = !customControlsEnabled;
            resetButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
        }

        // 更新滑桿（根據字母數量決定可用的 slider）
        const letterCount = letters.length;

        sliders.forEach((slider, i) => {
            // 決定這個 slider 是否應該啟用
            // i=0 (R): 需要至少 1 個字母
            // i=1 (G): 需要至少 2 個字母
            // i=2 (B): 需要至少 3 個字母
            let sliderEnabled = customControlsEnabled && letterCount > i;

            slider.elt.disabled = !sliderEnabled;
            if (sliderEnabled) {
                slider.addClass('enabled');
                angleLabels[i].addClass('enabled');

                // 決定 slider 和 label 的顏色
                if (mode === "Wireframe") {
                    // Wireframe 模式：不需要手動設定顏色，CSS 會自動使用 --wireframe-border
                    // 移除 inline style，讓 CSS 規則生效
                    slider.elt.style.removeProperty("--track-color");
                    slider.elt.style.removeProperty("--thumb-color");
                    angleLabels[i].elt.style.removeProperty("color");
                } else {
                    // Standard/Inverse 模式：使用 RGB 三種顏色
                    let sliderColor = `rgb(${colors[i].join(',')})`;
                    slider.elt.style.setProperty("--track-color", sliderColor);
                    slider.elt.style.setProperty("--thumb-color", sliderColor);
                    angleLabels[i].style("color", sliderColor);
                }
            } else {
                slider.removeClass('enabled');
                angleLabels[i].removeClass('enabled');

                if (mode === "Wireframe") {
                    // Wireframe 模式：移除 inline style，讓 CSS 規則生效
                    slider.elt.style.removeProperty("--track-color");
                    slider.elt.style.removeProperty("--thumb-color");
                    angleLabels[i].elt.style.removeProperty("color");
                } else {
                    // 其他模式：設為預設 disabled 顏色
                    angleLabels[i].style("color", disabledColor);
                }
            }
        });

        // 更新滑桿數值標籤，並加上正號（使用陣列迴圈）
        // 如果正在 ease，顯示目標角度（正規化後的）；否則顯示當前角度
        const vals = [0, 1, 2].map(i =>
          Math.round(isEasingCustomRotation ? normalizeAngle(targetRotationOffsets[i]) : rotationOffsets[i])
        );

        // 只在角度 label 沒有焦點時才更新它的值（避免干擾用戶編輯）
        const activeElement = document.activeElement;
        angleLabels.forEach((label, i) => {
          if (label && activeElement !== label.elt) {
            label.value((vals[i] > 0 ? "+" : "") + vals[i]);
          }
        });

        // 更新手機版 Custom 調整區的 slider 和 label
        if (isMobileMode && mobileElements.customAngleControls) {
            mobileSliders.forEach((slider, i) => {
                if (slider && mobileAngleLabels[i]) {
                    let sliderEnabled = customControlsEnabled && letterCount > i;
                    slider.elt.disabled = !sliderEnabled;

                    if (sliderEnabled) {
                        slider.addClass('enabled');
                        mobileAngleLabels[i].addClass('enabled');

                        // 決定 slider 和 label 的顏色
                        if (mode === "Wireframe") {
                            slider.elt.style.removeProperty("--track-color");
                            slider.elt.style.removeProperty("--thumb-color");
                            mobileAngleLabels[i].elt.style.removeProperty("color");
                        } else {
                            let sliderColor = `rgb(${colors[i].join(',')})`;
                            slider.elt.style.setProperty("--track-color", sliderColor);
                            slider.elt.style.setProperty("--thumb-color", sliderColor);
                            mobileAngleLabels[i].style("color", sliderColor);
                        }
                    } else {
                        slider.removeClass('enabled');
                        mobileAngleLabels[i].removeClass('enabled');

                        if (mode === "Wireframe") {
                            slider.elt.style.removeProperty("--track-color");
                            slider.elt.style.removeProperty("--thumb-color");
                            mobileAngleLabels[i].elt.style.removeProperty("color");
                        } else {
                            mobileAngleLabels[i].style("color", disabledColor);
                        }
                    }
                }
            });

            // 更新手機版 label 數值（使用陣列迴圈）
            mobileAngleLabels.forEach((label, i) => {
                if (label && activeElement !== label.elt) {
                    label.value((vals[i] > 0 ? "+" : "") + vals[i]);
                }
            });
        }

        // 更新 Save 按鈕（添加存在性檢查）
        if (saveButton) {
            saveButton.style('display', 'flex');
            // 彩蛋模式下也要啟用下載按鈕
            const canSave = hasText || isEasterEggActive;
            saveButton.elt.disabled = !canSave;
            saveButton.style('cursor', canSave ? 'pointer' : 'not-allowed');
        }
    }

    // 更新手機版 Save 按鈕
    if (saveButtonMobile && saveImgMobile) {
        // 彩蛋模式下也要啟用下載按鈕
        const canSave = hasText || isEasterEggActive;
        saveButtonMobile.elt.disabled = !canSave;
        saveButtonMobile.style('cursor', canSave ? 'pointer' : 'not-allowed');
    }

    // 手機版：更新UI（使用全域變數，不需要重新 select）
    let mobileCustomAngleControls = select('.mobile-custom-angle-controls');

    // 更新手機版 control-box 的 disabled 狀態
    let mobileRotationBox = select('.mobile-rotation-box');
    let mobileSaveContainer = select('.mobile-save-container');
    if (mobileRotationBox && mobileSaveContainer) {
        if (hasText) {
            mobileRotationBox.removeClass('disabled');
            mobileSaveContainer.removeClass('disabled');
        } else {
            mobileRotationBox.addClass('disabled');
            mobileSaveContainer.addClass('disabled');
        }
    }

    if (mobileStandardButton && mobileInverseButton) {
        mobileStandardButton.elt.disabled = isStandardTarget;
        mobileStandardButton.style("color", isStandardTarget ? activeColor : disabledColor);
        mobileStandardButton.style("cursor", isStandardTarget ? "default" : "pointer");

        mobileInverseButton.elt.disabled = isInverseTarget;
        mobileInverseButton.style("color", isInverseTarget ? activeColor : disabledColor);
        mobileInverseButton.style("cursor", isInverseTarget ? "default" : "pointer");
    }

    if (mobileRotateButton && mobileCustomButton) {
        mobileRotateButton.elt.disabled = !hasText;
        mobileRotateButton.style("color", !hasText ? disabledColor : isAutoRotateMode ? activeColor : disabledColor);
        mobileRotateButton.style("cursor", !hasText ? 'not-allowed' : "pointer");

        // 更新手機版 Rotate 按鈕 icon（使用統一函數）
        updateRotateIcon();

        if (hasText && isAutoRotateMode) {
            mobileRotateButton.addClass('active');
        } else {
            mobileRotateButton.removeClass('active');
        }

        mobileCustomButton.elt.disabled = !hasText;
        mobileCustomButton.style("color", !hasText ? disabledColor : !isAutoRotateMode ? activeColor : disabledColor);
        mobileCustomButton.style("cursor", !hasText ? 'not-allowed' : "pointer");
        if (hasText && !isAutoRotateMode) {
            mobileCustomButton.addClass('active');
            // 為手機版 rotation-box 添加 custom-mode class，顯示整體邊框
            if (mobileRotationBox) mobileRotationBox.addClass('custom-mode');
        } else {
            mobileCustomButton.removeClass('active');
            // 移除 custom-mode class
            if (mobileRotationBox) mobileRotationBox.removeClass('custom-mode');
        }
    }

    // 更新手機版 Custom 控制面板
    const customControlsEnabled = hasText && !isAutoRotateMode;

    // 手機版：當 Custom 展開時，隱藏 Custom 按鈕
    if (mobileCustomButton) {
        if (customControlsEnabled) {
            mobileCustomButton.style('display', 'none');
        } else {
            mobileCustomButton.style('display', 'flex');
        }
    }

    // 移除自動顯示/隱藏邏輯，改為只通過按鈕控制
    // 但當切換到 Auto 模式或沒有文字時，仍需要隱藏調整區
    if (mobileCustomAngleControls && (isAutoRotateMode || !hasText)) {
        mobileCustomAngleControls.addClass('hidden');
    }

    if (mobileRandomButton && mobileResetButton && mobileRandomImg && mobileResetImg) {
        mobileRandomButton.elt.disabled = !customControlsEnabled;
        mobileResetButton.elt.disabled = !customControlsEnabled;
        mobileRandomButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
        mobileResetButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
    }

    // 更新手機版底部按鈕狀態
    if (isMobileMode && mobileElements.customBtn) {
        mobileElements.customBtn.elt.disabled = !hasText;
        if (hasText && !isAutoRotateMode) {
            mobileElements.customBtn.addClass('active');
        } else {
            mobileElements.customBtn.removeClass('active');
        }
    }

    if (isMobileMode && mobileElements.rotateBtn) {
        mobileElements.rotateBtn.elt.disabled = !hasText;
        if (hasText && isAutoRotateMode) {
            mobileElements.rotateBtn.addClass('active');
        } else {
            mobileElements.rotateBtn.removeClass('active');
        }
    }

    // 更新手機版 Custom 調整區的 Random/Reset 按鈕
    if (isMobileMode && mobileElements.mobileRandomBtn && mobileElements.mobileResetBtn) {
        mobileElements.mobileRandomBtn.elt.disabled = !customControlsEnabled;
        mobileElements.mobileResetBtn.elt.disabled = !customControlsEnabled;
    }

    // 更新手機版滑桿
    // 手機版滑桿和標籤（使用全域陣列）
    if (mobileSliders[0] && mobileSliders[1] && mobileSliders[2] && mobileAngleLabels[0] && mobileAngleLabels[1] && mobileAngleLabels[2]) {
        const letterCount = letters.length;

        mobileSliders.forEach((slider, i) => {
            // 決定這個 slider 是否應該啟用（與桌面版相同邏輯）
            // i=0 (R): 需要至少 1 個字母
            // i=1 (G): 需要至少 2 個字母
            // i=2 (B): 需要至少 3 個字母
            let sliderEnabled = customControlsEnabled && letterCount > i;

            slider.elt.disabled = !sliderEnabled;
            if (sliderEnabled) {
                slider.addClass('enabled');
                mobileAngleLabels[i].addClass('enabled');

                // 決定 slider 和 label 的顏色
                let sliderColor, labelColor;
                if (mode === "Wireframe") {
                    // Wireframe 模式：使用對比色（黑色或白色）
                    if (wireframeStrokeColor) {
                        let r = red(wireframeStrokeColor);
                        let g = green(wireframeStrokeColor);
                        let b = blue(wireframeStrokeColor);
                        sliderColor = `rgb(${r}, ${g}, ${b})`;
                        labelColor = sliderColor;
                    } else {
                        sliderColor = 'rgb(0, 0, 0)'; // 預設黑色
                        labelColor = sliderColor;
                    }
                } else {
                    // Standard/Inverse 模式：使用 RGB 三種顏色
                    sliderColor = `rgb(${colors[i].join(',')})`;
                    labelColor = sliderColor;
                }

                // 動態設定滑桿顏色
                slider.elt.style.setProperty("--track-color", sliderColor);
                slider.elt.style.setProperty("--thumb-color", sliderColor);
                mobileAngleLabels[i].style("color", labelColor);
            } else {
                slider.removeClass('enabled');
                mobileAngleLabels[i].removeClass('enabled');
                mobileAngleLabels[i].style("color", disabledColor);
            }
        });

        // 同步滑桿數值（使用陣列迴圈）
        // 如果正在 ease，顯示目標角度（正規化後的）；否則顯示當前角度
        const vals = [0, 1, 2].map(i =>
          Math.round(isEasingCustomRotation ? normalizeAngle(targetRotationOffsets[i]) : rotationOffsets[i])
        );

        // 只在角度 label 沒有焦點時才更新它的值（避免干擾用戶編輯）
        const activeElement = document.activeElement;
        mobileAngleLabels.forEach((label, i) => {
          if (label && activeElement !== label.elt) {
            label.value((vals[i] > 0 ? "+" : "") + vals[i]);
          }
        });
    }

    // 更新手機版 UI（使用 mobile.js）
    updateMobileUI();
}

function updateSliders() {
    // 當用戶手動拖動滑桿時，取消 ease 動畫並立即更新
    isEasingCustomRotation = false;
    isEasingSlider = false;

    // 使用陣列迴圈更新 R/G/B（簡化重複邏輯）
    for (let i = 0; i < 3; i++) {
      if (sliders[i]) {
        const sliderValue = sliders[i].value();
        rotationOffsets[i] = sliderValue;
        targetRotationOffsets[i] = sliderValue;
        currentSliderValues[i] = sliderValue;
        targetSliderValues[i] = sliderValue;
      }
    }
}

function getRotationFor(layer, index) {
    // 使用陣列直接取得對應 layer 的旋轉偏移（簡化條件判斷）
    return rotationOffsets[layer] || 0;
}
