# 驗證：M2A「Add Existing」抽屜查詢（$FOLLOW join）是否從 500 變 200（collation 修好）。
# 對每個 junction × 各 allowed target 打一發。read-only、可刪。
import json, os, urllib.parse, urllib.request, urllib.error

BASE = "https://sccdtest.usc.edu.tw"
HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = open(os.path.join(HERE, ".directus-token")).read().strip()

# parent → allowed targets（含本次未碰但仍存在的 industry，一起驗）
MATRIX = {
    "activities_competitions":        ["library_documents", "library_press", "activities_exhibitions_special"],
    "activities_workshops":           ["library_documents", "library_press", "activities_lectures", "activities_exhibitions_special"],
    "activities_industry":            ["library_documents", "library_press", "library_awards", "library_album", "activities_competitions", "activities_workshops"],
    "library_awards":                 ["library_documents", "library_press"],
    "activities_exhibitions_special": ["library_documents", "library_press"],
    "admission_summer_camp":          ["library_documents", "library_press"],
    "activities_conferences":         ["library_documents", "library_press"],
    "activities_degree_show":         ["library_documents", "library_press", "activities_lectures", "activities_workshops", "activities_conferences"],
}

def drawer_status(junc, target):
    flt = {"_and": [{f"$FOLLOW({junc},item,collection)": {"_none": {"collection": {"_eq": target}}}}]}
    q = urllib.parse.urlencode({"filter": json.dumps(flt), "limit": "1"})
    r = urllib.request.Request(f"{BASE}/items/{target}?{q}", method="GET")
    r.add_header("Authorization", "Bearer " + TOKEN)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, ""
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:200]

bad = 0
for parent, targets in MATRIX.items():
    junc = f"{parent}_references"
    for t in targets:
        code, err = drawer_status(junc, t)
        ok = code == 200
        bad += 0 if ok else 1
        print(f"[{'OK ' if ok else 'BAD'}] ({code}) {junc}  ->  {t}" + (f"\n      {err}" if not ok else ""))

print(f"\n==== {'全部 200，collation 已修、抽屜可用' if bad == 0 else f'{bad} 條仍非 200'} ====")
