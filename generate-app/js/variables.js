// ====================================
// 全域變數管理模塊
// ====================================

// --- 文字與字體相關 ---
let letters = [];
let font;

// --- Canvas 相關 ---
let canvasContainer;

// --- 動畫與視覺效果變數 ---
let showCircle = false;
let circleAlpha = 0;
let circleShrinking = false;
let circleFillTimeout = null;

// --- 旋轉相關變數 ---
let autoRotate = false;
let rotationFactor = 0;
let rotationAngles = [];
let originalRotationAngles = [];
let shouldResetToZero = false;
let resetEaseSpeed = 0.035;
const baseSpeeds = [0.125, -0.125, 0.25]; // R, G, B 各自的基礎旋轉速度
const placeholderBaseSpeeds = [0.125, -0.125, 0.25]; // Placeholder SVG 的旋轉速度

// --- 旋轉相關常數 ---
const MIN_LETTERS_FOR_CHANNELS = [1, 2, 3]; // R, G, B 所需的最小字母數
const ROTATION_ANGLE_MIN = -180;
const ROTATION_ANGLE_MAX = 180;
const EASE_THRESHOLD = 0.1; // ease 動畫的閾值

// --- 字體大小設定 ---
const extraLargeFontSize = '180px';  // 1-3 字
const largeFontSize = '120px';       // 4-15 字
const mediumFontSize = '90px';       // 16-30 字
const smallFontSize = '68px';        // 31-40 字 (從 60px 改為 68px)

// --- 彩蛋相關 ---
const easterEggString = "SHIHCHIENCOMMUNICATIONSDESIGN";
let isEasterEggActive = false;
let sccdBlackImg, sccdWhiteImg; // 用於下載
let sccdBlackWireframeImg, sccdWhiteWireframeImg; // 用於下載
let sccdBlackImg_2, sccdWhiteImg_2; // 用於顯示
let sccdBlackWireframeImg_2, sccdWhiteWireframeImg_2; // 用於顯示

// --- 新彩蛋相關（COOLGUY, KAOCHIEHISHERE）---
// 新彩蛋圖片透過 HTML img.src 延遲載入，不需要預載入變數
let isSpecialEasterEggActive = false; // 是否正在播放新彩蛋動畫
let specialEasterEggType = null; // 'COOLGUY' 或 'KAOCHIEHISHERE'
let specialEasterEggAnimating = false; // 新彩蛋動畫是否正在播放中
let specialEasterEggStartTime = 0; // 動畫開始時間
let specialEasterEggAlpha = 0; // 彩蛋圖片的透明度
let specialEasterEggRotation = 0; // 彩蛋圖片的旋轉角度
let specialEasterEggScale = 0; // 彩蛋圖片的縮放比例（0-1）
let specialEasterEggTargetAngle = 0; // 彩蛋圖片最終停止的隨機角度（-60 到 60 度）

// --- 淡入淡出動畫 ---
let isFading = false;
let fadeStartTime = 0;
const fadeDuration = 400; // ms (彩蛋切換)
const modeTransitionDuration = 1000; // ms (模式切換時 logo 文字的 fade 時長)
let isModeTransition = false; // 是否為模式切換的淡入淡出
let logoAlpha = 255;
let easterEggAlpha = 0;

// --- UI 狀態與模式 ---
let mode = "Standard"; // "Standard", "Inverse", "Wireframe"
let targetMode = "Standard";
let previousMode = "Standard"; // 追蹤上一次的模式
let isAutoRotateMode = false;
let isCustomMode = false;

// --- 旋轉偏移（改用陣列：[R, G, B]）---
let rotationOffsets = [0, 0, 0];          // 當前旋轉偏移 [R, G, B]
let targetRotationOffsets = [0, 0, 0];    // 目標旋轉偏移 [R, G, B]
let isEasingCustomRotation = false;
let customEaseSpeed = 0.08;

// --- Slider 動畫（改用陣列：[R, G, B]）---
let currentSliderValues = [0, 0, 0];    // 當前 slider 值 [R, G, B]
let targetSliderValues = [0, 0, 0];     // 目標 slider 值 [R, G, B]
let isEasingSlider = false;

// --- Slider Hover 狀態 ---
// let hoveredSlider = null; // 'r', 'g', 'b', or null

// --- DOM 元素 ---
let inputBox, inputBoxMobile;
let mobileHiddenMeasurer; // 用於測量手機版輸入框文字高度
let rotateButton, customButton, colormodeButton, colormodeBox;
let randomButton, resetButton, saveButton, saveButtonMobile, saveBox;

// --- Slider 和 AngleLabel（改用陣列：[R, G, B]）---
let sliders = [null, null, null];         // 桌面版 sliders [R, G, B]
let angleLabels = [null, null, null];     // 桌面版 angle labels [R, G, B]
let mobileSliders = [null, null, null];   // 手機版 sliders [R, G, B]
let mobileAngleLabels = [null, null, null]; // 手機版 angle labels [R, G, B]

let randomImg, resetImg, saveImg, saveImgMobile, rotateIcon;
let customIcon, colormodeIcon;
let mobileRandomImg, mobileResetImg, mobileRotateIcon, mobileCustomIcon;
let mobileRotateButton, mobileCustomButton, mobileStandardButton, mobileInverseButton;
let mobileRandomButton, mobileResetButton;

// --- 色彩選擇器相關變數 ---
let colorPickerCanvas; // 主 canvas（桌面版色環 / 手機版 bar）
let colorPickerIndicatorCanvas; // 手機版 indicator 專用 canvas（在 bar 下方）
let colorPickerContainer;
let colorPickerBox; // Color picker 的外層容器（用於控制顯示/隱藏）
let colorPickerReady = false; // Color picker 容器是否已經展開完成，可以創建 canvas
let selectedHue = 0; // 選擇的色相（可以超出 0-360，Play 時用於循環動畫）
let wireframeColor; // Wireframe 模式下的填充顏色
let wireframeStrokeColor; // Wireframe 模式下的描邊顏色（當前顯示的顏色，會 lerp 到 targetStrokeColor）
let targetStrokeColor; // Wireframe 描邊顏色的目標值（黑色或白色）
let strokeColorLerpProgress = 1; // 顏色 lerp 的進度 (0-1)，1 表示已完成
let strokeColorLerpDuration = 300; // 顏色過渡時間（毫秒）
let strokeColorLerpStartTime = 0; // 開始 lerp 的時間
let currentStrokeColor; // 記錄當前的描邊顏色（lerp 的起點）
let colorPickerIndicatorX = 0; // 指示器 X 位置 (0-1)
let colorPickerIndicatorY = 0.5; // 指示器 Y 位置 (0-1)
let colorPickerDragging = false;

// --- Color Wheel 動畫相關 ---
let isColorWheelRotating = false; // Color wheel 是否正在旋轉
let colorWheelPlayButton; // Play/Pause 按鈕元素
let colorWheelPlayIcon; // Play/Pause icon 元素

// --- 禁用顏色 ---
let disabledColor = 'rgba(0, 0, 0, 0.25)'; // 黑色25%不透明度

// --- 響應式相關 ---
let isMobileMode = false;

// --- 下載相關 ---
let downloadNotification;
let isDownloading = false;

// --- 打字機動畫變數 ---
let typewriterActive = false;
let typewriterLines = [];
let typewriterCurrentLine = 0;
let typewriterCurrentChar = 0;
let typewriterStartTime = 0;
const typewriterDuration = 1200; // ms
let typewriterTotalChars = 0;

// --- Logo 繪製相關常數 ---
const colors = [ [255, 68, 138], [0, 255, 128], [38, 188, 255] ];

// --- Placeholder SVG 變數 ---
let placeholderR, placeholderG, placeholderB;
let placeholderR_white, placeholderG_white, placeholderB_white;
let placeholderRotations = [0, 0, 0];
let placeholderAlpha = 255;
let targetPlaceholderAlpha = 255;

// --- 頁面載入動畫變數 ---
let pageLoadStartTime = 0;
let inputBoxOpacity = 0;
let logoOpacity = 0;
let controlPanelOpacity = 0;
const fadeInDuration = 500; // ms
const fadeInDelay = 300; // ms
