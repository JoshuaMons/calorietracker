import argparse
import gzip
import json
import os
import re
from typing import Any


OPENFOODFACTS_PATH_DEFAULT = r"C:\Users\Josh\Downloads\openfoodfacts-products.jsonl.gz"


def guess_category(categories_tags: list[str]) -> str:
    t = " ".join(categories_tags).lower()
    is_drink = any(
        k in t
        for k in [
            "drinks",
            "beverages",
            "sodas",
            "soda",
            "water",
            "juice",
            "coffee",
            "tea",
            "soft-drinks",
        ]
    )
    if is_drink:
        return "Drink"

    is_meal = any(
        k in t
        for k in [
            "meals",
            "ready-meals",
            "main-dishes",
            "lunches",
            "dinners",
            "breakfasts",
        ]
    )
    if is_meal:
        return "Meal"

    return "Snack"


def split_ingredients(ingredients_text: str, max_items: int = 12) -> list[str]:
    if not ingredients_text:
        return []
    parts = re.split(r"[,;]", ingredients_text)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(p) > 60:
            p = p[:60].strip()
        out.append(p)
        if len(out) >= max_items:
            break
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=OPENFOODFACTS_PATH_DEFAULT)
    ap.add_argument("--out-dir", default=r"C:\Users\Josh\calorie-tracker\data")
    ap.add_argument("--target", type=int, default=30000)
    ap.add_argument("--max-lines", type=int, default=0, help="0 = no limit")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    out_json = os.path.join(args.out_dir, "nl-foods.json")
    out_gz = os.path.join(args.out_dir, "nl-foods.json.gz")

    # Filter conditions for “Dutch / Netherlands”
    NL_COUNTRY_TAG = "en:netherlands"
    NL_LANGUAGE = "nl"

    items: list[dict[str, Any]] = []
    seen_ids = set()

    processed = 0
    matched = 0
    accepted = 0
    missing_kcal = 0

    with gzip.open(args.input, "rt", encoding="utf-8", errors="replace") as f:
        while True:
            if args.max_lines and processed >= args.max_lines:
                break
            line = f.readline()
            if not line:
                break
            processed += 1

            try:
                obj = json.loads(line)
            except Exception:
                continue

            countries_tags = obj.get("countries_tags")
            languages_codes = obj.get("languages_codes")

            is_nl = False
            if isinstance(countries_tags, list):
                is_nl = any(str(x).lower() == NL_COUNTRY_TAG for x in countries_tags)
            if not is_nl and isinstance(languages_codes, dict):
                is_nl = NL_LANGUAGE in languages_codes
            if not is_nl and isinstance(languages_codes, list):
                is_nl = NL_LANGUAGE in [str(x).lower() for x in languages_codes]

            if not is_nl:
                continue
            matched += 1

            nutr = obj.get("nutriments")
            if not isinstance(nutr, dict):
                continue

            kcal = nutr.get("energy-kcal_100g")
            if kcal is None:
                missing_kcal += 1
                continue
            try:
                kcal_val = float(kcal)
            except Exception:
                missing_kcal += 1
                continue
            if kcal_val <= 0:
                missing_kcal += 1
                continue

            product_name = obj.get("product_name") or obj.get("name") or ""
            product_name = str(product_name).strip()
            if not product_name:
                continue

            _id = obj.get("_id") or obj.get("id") or product_name
            stable_id = f"nl:{_id}"
            if stable_id in seen_ids:
                continue
            seen_ids.add(stable_id)

            categories_tags = obj.get("categories_tags") or []
            if not isinstance(categories_tags, list):
                categories_tags = []
            # Keep tags compact for search
            tags = [str(t) for t in categories_tags[:12] if t is not None]

            category = guess_category(tags)

            image_query = f"{product_name} {obj.get('brands') or ''}".strip()

            ingredients_text = obj.get("ingredients_text") or ""
            ingredients = split_ingredients(str(ingredients_text), max_items=12)

            protein = nutr.get("proteins_100g")
            carbs = nutr.get("carbohydrates_100g")
            fat = nutr.get("fat_100g")

            record: dict[str, Any] = {
                "id": stable_id,
                "name": product_name,
                "category": category,
                "caloriesPerServing": kcal_val,
                "servingLabel": "100g",
                "imageQuery": image_query,
                "ingredients": ingredients,
                "tags": tags,
            }

            if protein is not None:
                try:
                    record["proteinPerBaseAmount"] = float(protein)
                except Exception:
                    pass
            if carbs is not None:
                try:
                    record["carbsPerBaseAmount"] = float(carbs)
                except Exception:
                    pass
            if fat is not None:
                try:
                    record["fatPerBaseAmount"] = float(fat)
                except Exception:
                    pass

            items.append(record)
            accepted += 1

            if accepted >= args.target:
                break

            if accepted % 5000 == 0 and accepted > 0:
                print(f"Accepted {accepted} / {args.target} (processed {processed}, matched {matched})")

    print("Done building dataset.")
    print(f"Processed: {processed}")
    print(f"Matched NL: {matched}")
    print(f"Accepted: {accepted}")
    print(f"Missing/invalid kcal: {missing_kcal}")

    # Write compact JSON (no indentation)
    with open(out_json, "w", encoding="utf-8") as out:
        json.dump(items, out, ensure_ascii=False, separators=(",", ":"))

    # Small “core” file for fast first paint (first N items)
    core_path = os.path.join(args.out_dir, "nl-foods-core.json")
    core_n = min(150, len(items))
    with open(core_path, "w", encoding="utf-8") as outc:
        json.dump(items[:core_n], outc, ensure_ascii=False, separators=(",", ":"))
    print("Wrote:", core_path, f"({core_n} items)")

    # Also write gzip version for backup.
    with gzip.open(out_gz, "wt", encoding="utf-8", compresslevel=9) as outgz:
        json.dump(items, outgz, ensure_ascii=False, separators=(",", ":"))

    print("Wrote:", out_json)
    print("Wrote:", out_gz)


if __name__ == "__main__":
    main()

