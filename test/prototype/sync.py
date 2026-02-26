import json
from pathlib import Path

def sync_dataset_to_geojson():
    base_dir = Path(__file__).resolve().parent.parent
    geojson_path = base_dir / "public" / "catanduanes_datafile.geojson"
    dataset_path = base_dir / "src" / "backend" / "dataset" / "dataset.json"

    print("Loading data...")
    try:
        with open(geojson_path, 'r', encoding='utf-8') as f:
            geo_data = json.load(f)
    except FileNotFoundError:
        print(f"Fatal Error: Map file not found at {geojson_path}")
        return

    # 1. Build the absolute source of truth from GeoJSON
    valid_geo_names = set()
    for feature in geo_data.get('features', []):
        name = feature.get('properties', {}).get('name', '').strip().lower()
        if name:
            valid_geo_names.add(name)

    try:
        with open(dataset_path, 'r', encoding='utf-8') as f:
            dataset_data = json.load(f)
    except FileNotFoundError:
        print(f"Fatal Error: Dataset file not found at {dataset_path}")
        return

    # 2. Filter the dataset against the source of truth
    cleaned_dataset = []
    orphaned_entries = []

    for entry in dataset_data:
        raw_place_name = entry.get('place_name', '')
        place_name_lower = raw_place_name.strip().lower()
        
        if not place_name_lower:
            cleaned_dataset.append(entry)
        elif place_name_lower in valid_geo_names:
            cleaned_dataset.append(entry)
        else:
            orphaned_entries.append(raw_place_name)

    # 3. Report findings
    print("\n[ SYNCHRONIZATION REPORT ]")
    print(f"Valid map locations: {len(valid_geo_names)}")
    print(f"Dataset entries before sync: {len(dataset_data)}")
    print(f"Orphaned dataset entries found: {len(orphaned_entries)}")

    if not orphaned_entries:
        print("\nDatabase is perfectly synchronized. No action needed.")
        return

    print("\nThe following places have no matching map coordinates (Check for typos before deleting!):")
    for name in orphaned_entries:
        print(f" * {name}")

    # 4. Require explicit execution
    confirm = input("\nExecute deletion of these specific orphans? (yes/no): ").strip().lower()
    if confirm == 'yes':
        with open(dataset_path, 'w', encoding='utf-8') as f:
            json.dump(cleaned_dataset, f, indent=2, ensure_ascii=False)
        print(f"\nSUCCESS: Deleted {len(orphaned_entries)} orphaned entries. Dataset is synchronized.")
    else:
        print("\nSync cancelled. No files were modified.")

if __name__ == "__main__":
    sync_dataset_to_geojson()