/**
 * SCCDHelpers 與全域 CDN script 的型別定義
 * 這是 ambient（全域）module，不能有 export/import
 */

// ===== SCCDHelpers API =====
interface SCCDHelpersAPI {
  // 響應式判斷
  isMobile(): boolean;
  isDesktop(): boolean;
  isTablet(): boolean;

  // DOM 操作
  scrollToElement(target: HTMLElement | string, offset?: number, behavior?: ScrollBehavior): void;
  setActive(activeElement: HTMLElement, siblings: NodeList | HTMLElement[], activeClass?: string): void;
  toggleClass(element: HTMLElement, className: string): void;
  filterElements(
    elements: NodeList | HTMLElement[],
    filterValue: string,
    displayStyle?: string,
    dataAttribute?: string
  ): void;

  // HTTP
  fetchHTML(url: string): Promise<string>;
  loadHTMLInto(url: string, container: HTMLElement, callback?: () => void): Promise<void>;

  // Utilities — 實作回傳泛型 Function（不轉嫁原 signature），呼叫端不靠 generic 推導
  debounce(func: Function, wait?: number): Function;
  throttle(func: Function, limit?: number): Function;

  // 動畫
  animateHeight(
    element: HTMLElement,
    targetHeight: number | string,
    duration?: number,
    ease?: string,
    onComplete?: () => void
  ): void;
  animateRotation(element: HTMLElement, rotation: number, duration?: number, ease?: string): void;
  animateOpacity(element: HTMLElement, opacity: number, duration?: number, onComplete?: () => void): void;

  // 隨機樣式
  getRandomAccentColor(): string;
  getRandomRotation(): number;

  // URL
  getURLParam(param: string): string | null;
  setURLParam(param: string, value: string): void;

  // 驗證 / 視窗
  isValidEmail(email: string): boolean;
  isInViewport(element: HTMLElement): boolean;
}

// ===== 全域變數 =====
declare var SCCDHelpers: SCCDHelpersAPI;

interface Window {
  SCCDHelpers: SCCDHelpersAPI;
  __sccdNavigateToItem?: (section: string, itemId: string) => void;
  __sccdCurrentSectionColor?: string;
  __sccdResetFooterHide?: () => void;
  _pressMarqueeInit?: () => void;
  _filesMarqueeInit?: () => void;
  _albumMarqueeInit?: () => void;
  SCCD_classSlideshow?: any;
}

// ===== DOM 擴充（散在多處 element 上掛 callback / cached state）=====
interface HTMLElement {
  __closeSpotlight?: () => void;
  __pauseLayoutInterval?: () => void;
  __resumeLayoutInterval?: () => void;
  __fadeOutWatch?: (opts?: any) => void | Promise<void>;
  __fadeInWatch?: (opts?: any) => void | Promise<void>;
  __resetWatchAlpha?: () => void;
  _baseRot?: number;
}

// ===== CDN 全域 library（type: any 避免過度約束）=====
declare var gsap: any;
declare var ScrollTrigger: any;
declare var Draggable: any;
declare var InertiaPlugin: any;
declare var ScrollToPlugin: any;
declare var SplitText: any;
declare var lottie: any;
declare var pdfjsLib: any;
declare var p5: any;
