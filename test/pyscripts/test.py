import json
from collections import Counter

GEOJSON_PATH = "public/catanduanes_datafile.geojson"

with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

features = data.get("features", [])
print(f"Total features: {len(features)}\n")

categories = [
    f["properties"].get("category", "NO_CATEGORY")
    for f in features
    if f.get("properties") is not None
]

counts = Counter(categories)

print("─── Categories (sorted by count) ───")
for cat, count in counts.most_common():
    print(f"  {count:>4}x  {cat}")

print(f"\nTotal unique categories: {len(counts)}")