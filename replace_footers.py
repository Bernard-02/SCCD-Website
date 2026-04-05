import re
import os

base_dir = r"c:\Users\Bernard Liew\Documents\實踐大學\SCCD Website\pages"

files = [
    "general-activities.html",
    "bfa-courses.html",
    "mdes-courses.html",
    "faculty.html",
    "faculty-detail.html",
    "support.html",
    "admission.html",
    "admission-detail.html",
    "degree-show.html",
    "degree-show-detail.html",
]

replacement = "  <!-- Footer -->\n  <div id=\"site-footer\"></div>\n"

# Pattern: from "  <!-- Footer -->\n  <footer" all the way through "</footer>\n"
pattern = re.compile(r'  <!-- Footer -->\n  <footer.*?</footer>\n', re.DOTALL)

for fname in files:
    fpath = os.path.join(base_dir, fname)
    if not os.path.isfile(fpath):
        print(f"[WARN] File not found: {fpath}")
        continue

    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content, count = pattern.subn(replacement, content)

    if count == 0:
        print(f"[WARN] No footer match found in: {fname}")
    else:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"[OK]   Replaced footer in: {fname} ({count} replacement(s))")

# --- Verification: print last 10 lines before </body> or <script for each file ---
print("\n" + "=" * 70)
print("VERIFICATION — last 10 lines before <script or </body> in each file")
print("=" * 70)

for fname in files:
    fpath = os.path.join(base_dir, fname)
    if not os.path.isfile(fpath):
        continue
    with open(fpath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Find the index of the first <script line or </body> line
    anchor_idx = len(lines)  # fallback: end of file
    for i, line in enumerate(lines):
        stripped = line.strip().lower()
        if stripped.startswith('<script') or stripped.startswith('</body'):
            anchor_idx = i
            break

    start = max(0, anchor_idx - 10)
    snippet = lines[start:anchor_idx]

    print(f"\n--- {fname} (lines {start+1}–{anchor_idx}) ---")
    for line in snippet:
        print(line, end='')
    print()  # blank line after snippet

