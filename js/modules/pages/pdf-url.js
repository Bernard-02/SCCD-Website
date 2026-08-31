/**
 * PDF 開檔網址：單一真相源。
 *
 * ⚠️ 為什麼要集中：「viewer 開檔用的 pdfUrl」與「pdf-cross-ref-index 反查用的 key」必須**逐字元相同**才對得上
 *   （viewer 開檔後拿 pdfUrl 去 getPdfRefSources() → index.get(pdfUrl)）。凡是建構 library_documents 開檔網址的地方
 *   ——files 面板 / award ref / degree-show ref / activities ref / cross-ref key——一律走這個 helper，別各自組字串。
 *
 * 規則：貼的 pdfLink（CloudFront/S3 直連）優先；沒填才用上傳檔走 CloudFront（filename_disk）繞過弱機 /assets
 *   （弱機連 S3 常 5s 逾時回 403，見 memory reference_directus_s3_timeout_all_assets_down；
 *    CloudFront 直吃同顆 S3，range 206 支援，pdf.js viewer 分段載入 OK）。
 * pdfFile 需深取成 { filename_disk }（各 query 補 pdf.filename_disk）；不寫死副檔名 → 離線 webp/檔名變動自動跟上。
 */
import { CMS_CDN_BASE } from '../../config/api.js';

export function pdfOpenUrl(pdfLink, pdfFile) {
  if (pdfLink) return pdfLink;
  const fd = pdfFile && typeof pdfFile === 'object' ? pdfFile.filename_disk : null;
  return fd ? `${CMS_CDN_BASE}/${fd}` : '';
}
