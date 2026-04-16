# Compares two GeoJSON files to identify new, missing, or modified features.
import json
import sys
import os
from pathlib import Path

def load_geojson(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('features', [])
    except FileNotFoundError:
        print(f"Error: File '{filepath}' not found.")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: '{filepath}' is not a valid JSON file.")
        sys.exit(1)

def build_feature_dict(features, filename):
    feature_dict = {}
    duplicates = []
    
    for feature in features:
        props = feature.get('properties', {})
        name = props.get('name', '').strip()
        
        if not name:
            continue
            
        key = name.lower()
        if key in feature_dict:
            duplicates.append(name)
        else:
            feature_dict[key] = feature
            
    if duplicates:
        print(f"Warning: Found {len(duplicates)} duplicate names in {filename}. Only the last one was kept.")
        
    return feature_dict

def compare_geojsons(file1, file2):
    print(f"Loading files: {file1} and {file2}...\n")
    
    features1 = load_geojson(file1)
    features2 = load_geojson(file2)
    
    dict1 = build_feature_dict(features1, file1)
    dict2 = build_feature_dict(features2, file2)
    
    set1 = set(dict1.keys())
    set2 = set(dict2.keys())
    
    # 1. Find missing and added features
    only_in_1 = set1 - set2
    only_in_2 = set2 - set1
    common_keys = set1.intersection(set2)
    
    # 2. Find modified features
    modified = []
    for key in common_keys:
        f1 = dict1[key]
        f2 = dict2[key]
        
        # Check if properties or geometry changed
        if f1 != f2:
            modified.append(dict1[key].get('properties', {}).get('name', key))

    # 3. Print Results
    print("=" * 50)
    print("COMPARISON REPORT")
    print("=" * 50)
    
    print(f"\n1. Exclusively in '{file1}' ({len(only_in_1)} spots):")
    if only_in_1:
        for key in sorted(only_in_1):
            print(f"  * {dict1[key].get('properties', {}).get('name')}")
    else:
        print("  None.")

    print(f"\n2. Exclusively in '{file2}' ({len(only_in_2)} spots):")
    if only_in_2:
        for key in sorted(only_in_2):
            print(f"  * {dict2[key].get('properties', {}).get('name')}")
    else:
        print("  None.")

    print(f"\n3. Modified in both files ({len(modified)} spots):")
    if modified:
        print("  (These exist in both, but their coordinates or properties are different)")
        for name in sorted(modified):
            print(f"  * {name}")
    else:
        print("  None. All common spots are identical.")

if __name__ == "__main__":
    # Get the directory where the script is running
    base_dir = Path.cwd()
    
    # Point directly to the public folder
    file1 = base_dir / "public" / "catanduanes_datafile.geojson"
    file2 = base_dir / "public" / "catanduanes_full.geojson"
    
    # Verify files exist before running
    if not file1.exists():
        print(f"CRITICAL ERROR: Could not find {file1}")
        exit(1)
    if not file2.exists():
        print(f"CRITICAL ERROR: Could not find {file2}")
        exit(1)
        
    compare_geojsons(str(file1), str(file2))