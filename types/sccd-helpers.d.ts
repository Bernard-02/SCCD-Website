/**
 * SCCDHelpers 與全域 CDN script 的型別定義
 * 這是 ambient（全域）module，不能有 export/import
 */

// ===== SCCDHelpers API =====
interface SCCDHelpersAPI {
  // 響應式判斷
  isMobile(): boolean;
  isDesktop(): boolean;

  // DOM 操作
  scrollToElement(target: HTMLElement | string, offset?: number, behavior?: ScrollBehavior): void;
  setActive(activeElement: HTMLElement, siblings: NodeList | HTMLElement[], activeClass?: string): void;
  filterElements(
    elements: NodeList | HTMLElement[],
    filterValue: string,
    displayStyle?: string,
    dataAttribute?: string
  ): void;

  // 隨機樣式
  getRandomAccentColor(): string;
  getRandomRotation(): number;

  // 站台路徑
  siteBase: string;
  sitePath(path: string): string;
  refreshCursorVars(): void;
}

// ===== 全域變數 =====
declare var SCCDHelpers: SCCDHelpersAPI;

interface Window {
  SCCDHelpers: SCCDHelpersAPI;
  __sccdNavigateToItem?: (section: string, itemId: string) => void;
  __sccdResetFooterHide?: () => void;
  _pressMarqueeInit?: () => void;
  _filesMarqueeInit?: () => void;
  _albumMarqueeInit?: () => void;
  SCCD_classSlideshow?: any;
  // site-assets.js 填的後台 icon/cursor 覆蓋（localPath → CDN URL），sitePath 消費
  __SCCD_ASSET_OVERRIDES?: Record<string, string>;
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
declare var ScrollToPlugin: any;
declare var lottie: any;
declare var pdfjsLib: any;
declare var p5: any;
