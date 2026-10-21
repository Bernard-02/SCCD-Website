#!/usr/bin/env python3
"""
library documents PDF 重存成 object-stream 版（開書慢的治本，2026-10-21）。

為什麼：ilovepdf／Ghostscript 壓出來的掃描本 Pages tree 是扁平的、每頁 page dict 緊貼該頁圖片散在整檔；
pdf.js getDocument 的 checkLastPage 會把最上層所有 Kids 平行抓一遍 → 160 頁＝160 個 16K Range 請求（2.9MB），
Chrome 又把同 URL 的 Range 逐個排隊（~45ms/段）→ 開書 5~20 秒。重存成 object streams 後 162 個 page dict 收進一個
ObjStm → 6 個請求、~300KB、本機 0.5s。⚠️ 不要加 linearize：qpdf linearize 會把 page dict 再攤回各頁（實測無效）。

用法（需 `pip install pikepdf`）：
  python scripts/optimize-pdfs-objstm.py <輸出資料夾> [--only 子字串] [--limit N]
  → 從 Directus library_documents 抓 pdfLink 清單，逐本下載→重存→寫到 <輸出資料夾>/<原檔名>（已是 ObjStm 版的跳過）。
之後：把輸出資料夾整包上傳回 S3 的「- documents/」覆蓋同名檔，再請 IT 做 CloudFront invalidation `/-%20documents/*`
（同 key 覆蓋不 invalidate 的話 edge 會一直吐舊檔）。前台不用改。
"""
import os, re, sys, urllib.parse, urllib.request, json, tempfile
import pikepdf

API = 'https://sccdtest.usc.edu.tw/items/library_documents?fields=pdfLink,titleEn,year&limit=-1&sort=-year,sort'
out_dir = sys.argv[1]; only = None; limit = 0
for i, a in enumerate(sys.argv):
    if a == '--only': only = sys.argv[i + 1]
    if a == '--limit': limit = int(sys.argv[i + 1])
os.makedirs(out_dir, exist_ok=True)

def page_dicts_outside_objstm(path):
    raw = open(path, 'rb').read()
    with pikepdf.open(path) as pdf:
        n = sum(1 for p in pdf.pages if re.search(rb'(?<![0-9])%d 0 obj' % p.obj.objgen[0], raw))
        return n, len(pdf.pages)

rows = json.load(urllib.request.urlopen(API))['data']
rows = [r for r in rows if r.get('pdfLink') and (not only or only in urllib.parse.unquote(r['pdfLink']))]
if limit: rows = rows[:limit]
print(f'{len(rows)} 本')
for r in rows:
    name = urllib.parse.unquote(r['pdfLink'].rsplit('/', 1)[-1])
    dst = os.path.join(out_dir, name)
    if os.path.exists(dst): print('skip(已存在)', name); continue
    tmp = os.path.join(tempfile.gettempdir(), 'sccd-pdf-src.pdf')
    urllib.request.urlretrieve(r['pdfLink'], tmp)
    outside, pages = page_dicts_outside_objstm(tmp)
    if outside == 0: print(f'ok(已是 ObjStm) {pages}p  {name}'); continue
    with pikepdf.open(tmp) as pdf:
        pdf.save(dst, object_stream_mode=pikepdf.ObjectStreamMode.generate)   # 不 linearize（見檔頭）
    after, _ = page_dicts_outside_objstm(dst)
    print(f'{"done" if after == 0 else "WARN 仍有散落 dict"} {pages}p  散落 {outside}→{after}  {os.path.getsize(tmp)>>20}MB→{os.path.getsize(dst)>>20}MB  {name}')
