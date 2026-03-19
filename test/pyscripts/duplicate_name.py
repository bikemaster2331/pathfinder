import json
import os

# used to check for duplicated names

def check_geojson_name_duplicates(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features = data.get('features', [])
    seen_names = {}  # Dictionary to store {name: [list of indices]}
    duplicates_found = False

    for index, feature in enumerate(features):
        # Extract the name from properties
        name = feature.get('properties', {}).get('name')
        
        if name:
            if name in seen_names:
                seen_names[name].append(index)
                duplicates_found = True
            else:
                seen_names[name] = [index]

    if duplicates_found:
        print("Duplicate names identified:")
        for name, indices in seen_names.items():
            if len(indices) > 1:
                print(f" - '{name}' found at indices: {indices}")
    else:
        print("No duplicate names found.")

# Path to your file
path = "/home/ubuubuntu/Documents/Marthan/pathfinder/public/catanduanes_datafile.geojson"
check_geojson_name_duplicates(path)