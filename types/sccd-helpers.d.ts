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

  // Utilities
  debounce<T extends (...args: any[]) => any>(func: T, wait: number): T;
  throttle<T extends (...args: any[]) => any>(func: T, limit: number): T;

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
  _pressMarqueeInit?: () => void;
  _filesMarqueeInit?: () => void;
  _albumMarqueeInit?: () => void;
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
