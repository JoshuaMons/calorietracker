import gzip
import json


def main():
    path = r"C:\Users\Josh\Downloads\openfoodfacts-products.jsonl.gz"
    max_lines = 5000
    hits = set()
    lang_hits = set()

    with gzip.open(path, "rt", encoding="utf-8") as f:
        for i in range(max_lines):
            line = f.readline()
            if not line:
                break
            try:
                obj = json.loads(line)
            except Exception:
                continue

            cs = obj.get("countries_tags")
            if isinstance(cs, list):
                for c in cs:
                    s = str(c).lower()
                    if "nether" in s or "nederland" in s or s.endswith(":netherlands"):
                        hits.add(c)

            ls = obj.get("languages_codes")
            if isinstance(ls, dict):
                for k in ls.keys():
                    s = str(k).lower()
                    if s in ("nl", "nld", "nederlands", "dutch"):
                        lang_hits.add(k)
            elif isinstance(ls, list):
                for k in ls:
                    s = str(k).lower()
                    if s == "nl":
                        lang_hits.add("nl")

    print("netherlands-like country tags seen (sample):", sorted(hits)[:50])
    print("nl-like language codes seen (sample):", sorted(lang_hits)[:50])
    print("sample lines processed (max):", max_lines)


if __name__ == "__main__":
    main()

