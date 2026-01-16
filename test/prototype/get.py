import json

# Load your dataset
try:
    with open('src/backend/dataset/dataset.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
except FileNotFoundError:
    # Try alternate path if running from root
    with open('dataset/dataset.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

print("places:")
seen = set()

for item in data:
    name = item.get('place_name')
    if name and name not in seen:
        # Get topic as type, default to 'general'
        place_type = item.get('topic', 'general').lower()
        
        # Mapping dataset topics to your config types
        if place_type == 'nature': place_type = 'sightseeing'
        if place_type == 'beach': place_type = 'swimming'
        
        print(f'  "{name}":')
        print(f'    lat: {item["coordinates"]["lat"]}')
        print(f'    lng: {item["coordinates"]["lng"]}')
        print(f'    type: {place_type}')
        seen.add(name)