import json
import math
from pathlib import Path

# ==========================================
# CONFIGURATION
# ==========================================
# Threshold: 0.0005 degrees is roughly ~55 meters
# This allows for tiny floating point differences
TOLERANCE = 0.0005 

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def check_alignment():
    # 1. SETUP PATHS
    base_dir = Path(__file__).parent
    # Adjust these if your folder structure is different
    json_path = base_dir / "dataset" / "dataset.json"
    geojson_path = base_dir.parent.parent / "public" / "catanduanes_full.geojson"

    print(f"Loading JSON: {json_path}")
    print(f"Loading GeoJSON: {geojson_path}")

    try:
        data_json = load_json(json_path)
        data_geojson = load_json(geojson_path)
    except FileNotFoundError as e:
        print(f"\n❌ ERROR: Could not find file. \n{e}")
        return

    # 2. PREPARE GEOJSON LOOKUP (The Map)
    map_points = []
    for feature in data_geojson.get('features', []):
        # Filter: Only Points
        if feature.get('geometry', {}).get('type') != 'Point':
            continue
        
        # GeoJSON is [lng, lat]
        coords = feature['geometry']['coordinates']
        lng, lat = coords[0], coords[1]
        
        map_points.append({
            "name": feature['properties'].get('name', 'Unknown'),
            "lat": lat,
            "lng": lng,
            "feature": feature
        })

    print(f"\nLoaded {len(map_points)} points from the Map (GeoJSON).")
    print(f"Scanning {len(data_json)} items from the Brain (JSON)...")
    print("-" * 50)

    # 3. RUN THE MATCHING (The Brain)
    matched_count = 0
    unmatched_coords_count = 0
    no_coords_count = 0
    
    unmatched_list = []

    for entry in data_json:
        # SKIP: Entries intended to be "General Knowledge" (null coordinates)
        if not entry.get('coordinates'):
            no_coords_count += 1
            continue

        # GET: Target coordinates
        target_lat = entry['coordinates'].get('lat')
        target_lng = entry['coordinates'].get('lng')
        
        if target_lat is None or target_lng is None:
            no_coords_count += 1
            continue

        # SEARCH: Look for a match in the Map
        match_found = False
        for point in map_points:
            # Simple distance check (diff in degrees)
            lat_diff = abs(point['lat'] - target_lat)
            lng_diff = abs(point['lng'] - target_lng)

            if lat_diff < TOLERANCE and lng_diff < TOLERANCE:
                match_found = True
                matched_count += 1
                break
        
        if not match_found:
            unmatched_coords_count += 1
            unmatched_list.append({
                "name": entry.get('place_name') or entry.get('title'),
                "lat": target_lat,
                "lng": target_lng
            })

    # 4. REPORT
    print(f"✅ MATCHED: {matched_count}")
    print(f"⚪ SKIPPED (General Info/No Coords): {no_coords_count}")
    print(f"❌ UNMATCHED (Has Coords but NOT on Map): {unmatched_coords_count}")
    
    if unmatched_list:
        print("\n⚠️  THE FOLLOWING PLACES ARE MISSING FROM YOUR MAP:")
        print(f"(We have their GPS in JSON, but no matching Pin in GeoJSON)")
        for item in unmatched_list:
            print(f" - {item['name']} ({item['lat']}, {item['lng']})")

if __name__ == "__main__":
    check_alignment()