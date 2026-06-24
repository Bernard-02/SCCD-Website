# 一次性：開 activities/library M2A ref slots（2026-06-24 定案矩陣）。idempotent、可重跑。
# 見 memory project_activities_ref_matrix_finalized + reference_directus_m2a_setup_recipe。
import json, os, urllib.request, urllib.error

BASE = "https://sccdtest.usc.edu.tw"
HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = open(os.path.join(HERE, ".directus-token")).read().strip()
PUBLIC_POLICY = "abf8a154-5b1c-4a46-ac9c-7300570f4f17"

def req(method, path, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None:
        r.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")

def exists(path):
    return req("GET", path)[0] == 200

def do(method, path, body=None, ok=(200, 204), note=""):
    code, text = req(method, path, body)
    tag = "OK  " if code in ok else f"FAIL"
    line = f"[{tag}] {method} {path} ({code}) {note}"
    if code not in ok:
        line += f"\n        -> {text[:400]}"
    print(line)
    return code, text

def fields_of(col):
    code, text = req("GET", f"/fields/{col}")
    return {f.get("field") for f in json.loads(text).get("data", [])} if code == 200 else set()

# ── A. 改既有 2 個母的允許清單 ──────────────────────────────
def set_allowed(parent, allowed):
    do("PATCH", f"/relations/{parent}_references/item",
       {"meta": {"one_allowed_collections": allowed}}, note="set allowed")

# ── B. 建新母的 references 欄（5 步 + Public Read）────────────
def build_references(parent, allowed):
    junc, fk = f"{parent}_references", f"{parent}_id"
    print(f"\n=== {parent} ===")
    # 1 junction collection
    if exists(f"/collections/{junc}"):
        print(f"[skip] junction {junc} 已存在")
    else:
        do("POST", "/collections", {
            "collection": junc,
            "fields": [{"field": "id", "type": "uuid",
                        "meta": {"hidden": True, "readonly": True, "special": ["uuid"]},
                        "schema": {"is_primary_key": True, "length": 36}}],
            "meta": {"hidden": True, "icon": "import_export"}, "schema": {}},
           note="create junction")
    # 2 junction 3 欄
    for f in (fk, "item", "collection"):
        if exists(f"/fields/{junc}/{f}"):
            print(f"[skip] field {junc}.{f} 已存在")
        else:
            do("POST", f"/fields/{junc}",
               {"field": f, "type": "string", "schema": {}, "meta": {"hidden": True}},
               note=f"field {f}")
    # 3 parent alias
    if exists(f"/fields/{parent}/references"):
        print(f"[skip] alias {parent}.references 已存在")
    else:
        do("POST", f"/fields/{parent}",
           {"field": "references", "type": "alias",
            "meta": {"interface": "list-m2a", "special": ["m2a"], "options": {}, "note": "跨頁關聯參考"},
            "schema": None}, note="alias references")
    # 4+5 relations
    code, text = req("GET", f"/relations/{junc}")
    have = {r.get("field") for r in json.loads(text).get("data", [])} if code == 200 else set()
    if fk in have:
        print(f"[skip] relation m2o {junc}.{fk} 已存在")
    else:
        do("POST", "/relations", {
            "collection": junc, "field": fk, "related_collection": parent,
            "meta": {"one_field": "references", "junction_field": "item",
                     "one_deselect_action": "delete", "sort_field": None},
            "schema": {"on_delete": "SET NULL"}}, note="relation m2o")
    if "item" in have:
        do("PATCH", f"/relations/{junc}/item",
           {"meta": {"one_allowed_collections": allowed}}, note="patch m2a allowed")
    else:
        do("POST", "/relations", {
            "collection": junc, "field": "item", "related_collection": None,
            "meta": {"one_collection_field": "collection",
                     "one_allowed_collections": allowed, "junction_field": fk, "sort_field": None},
            "schema": None}, note="relation m2a")
    # 6 Public Read on junction（已存在會 400，容忍）
    do("POST", "/permissions",
       {"policy": PUBLIC_POLICY, "collection": junc, "action": "read",
        "fields": ["*"], "permissions": {}, "validation": {}},
       ok=(200,), note="public read")

# ── C. target 補 refCode + display_template ─────────────────
def ensure_target(col):
    print(f"\n--- target {col} ---")
    fs = fields_of(col)
    if "refCode" in fs:
        print(f"[skip] {col}.refCode 已存在")
    else:
        do("POST", f"/fields/{col}", {
            "field": "refCode", "type": "string",
            "meta": {"interface": "input",
                     "translations": [{"language": "en-US", "translation": "Code"},
                                      {"language": "zh-TW", "translation": "代碼"}],
                     "note": "這筆資料的代碼，用於跨頁連結"},
            "schema": {}}, note="add refCode")
    tmpl = next((f"{{{{{c}}}}}" for c in ("titleZh", "competitionZh", "nameZh", "titleEn") if c in fs), None)
    if tmpl:
        do("PATCH", f"/collections/{col}", {"meta": {"display_template": tmpl}},
           note=f"display_template {tmpl}")
    else:
        print(f"[warn] {col} 找不到 titleZh/competitionZh/nameZh/titleEn → display_template 未設")

# ════════════════════════════════════════════════════════════
print("########## A. 改既有 ##########")
set_allowed("activities_competitions",
            ["library_documents", "library_press", "activities_exhibitions_special"])
set_allowed("activities_workshops",
            ["library_documents", "library_press", "activities_lectures", "activities_exhibitions_special"])

print("\n########## B. 建新母 references ##########")
MOTHERS = {
    "library_awards":                 ["library_documents", "library_press"],
    "activities_exhibitions_special": ["library_documents", "library_press"],
    "admission_summer_camp":          ["library_documents", "library_press"],
    "activities_conferences":         ["library_documents", "library_press"],
    "activities_degree_show":         ["library_documents", "library_press",
                                       "activities_lectures", "activities_workshops",
                                       "activities_conferences"],
}
for p, a in MOTHERS.items():
    build_references(p, a)

print("\n########## C. target refCode + display_template ##########")
for t in ("library_documents", "library_press", "activities_lectures",
          "activities_exhibitions_special", "activities_workshops", "activities_conferences"):
    ensure_target(t)

print("\n########## 完成 ##########")
