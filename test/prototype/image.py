import json
import re
import unicodedata

def to_snake_case(name):
    if not name: 
        return "unknown"
    
    # 1. Basic cleanup
    s = str(name).strip()
    
    # 2. Remove accents (é → e, ñ → n, etc.)
    s = unicodedata.normalize('NFKD', s)
    s = s.encode('ascii', 'ignore').decode('ascii')
    
    # 3. Remove possessive apostrophes
    s = s.replace("'s", "s").replace("'", "")
    
    # 4. Add underscore between lower->Upper
    s = re.sub('([a-z0-9])([A-Z])', r'\1_\2', s)
    
    # 5. Replace non-alphanumeric with underscores
    s = re.sub(r'[^a-zA-Z0-9]+', '_', s.lower())
    
    # 6. Clean up multiple/trailing underscores
    s = re.sub(r'_+', '_', s).strip('_')
    
    return s if s else "unknown"

def add_smart_image_property(input_file, output_file):
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        count = 0
        skipped = 0
        
        for feature in data['features']:
            props = feature['properties']
            
            # CHECK: Does this feature have a name?
            if 'name' not in props or not props['name']:
                print(f"⚠️  Skipping item (No Name): {props}")
                skipped += 1
                continue
            
            # Only generate if missing or empty
            if 'image' not in props or not props['image']:
                clean_name = to_snake_case(props['name'])
                props['image'] = f"/images/{clean_name}.jpg"
                count += 1
                print(f"✅ Generated: {props['name']} → {clean_name}.jpg")  # ← Added feedback
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print("-" * 50)
        print(f"✅ Success! Generated image paths for {count} locations.")
        print(f"⚠️  Skipped {skipped} locations (missing 'name').")
        print(f"📁 Saved to: {output_file}")
        
    except FileNotFoundError:
        print(f"❌ Error: Could not find '{input_file}'")
    except json.JSONDecodeError:
        print(f"❌ Error: '{input_file}' is not valid JSON")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

# --- RUN IT ---
if __name__ == "__main__":
    add_smart_image_property('public/catanduanes_full.geojson', 'catanduanes_datafile.json')
    print(to_snake_case("Bag-o Beach Resort"))
    print(to_snake_case("Twin Rock's Beach"))      # twin_rocks_beach
    print(to_snake_case("Mt. Cagraray"))           # mt_cagraray
    print(to_snake_case("St. John's Cathedral"))   # st_johns_cathedral
    print(to_snake_case("Puraran  Beach"))         # puraran_beach (double space)
