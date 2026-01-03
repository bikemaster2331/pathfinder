const fs = require('fs');
const path = require('path');

// PATHS
const GEOJSON_FILE = path.join(__dirname, 'public/catanduanes_full.geojson');
const OUTPUT_FILE = path.join(__dirname, 'new_entries.json');

// Helper to convert Map Types to Chatbot Topics
const TYPE_TO_TOPIC = {
    'HOTELS & RESORTS': 'Accommodation',
    'RESTAURANTS & CAFES': 'Food',
    'FALLS': 'Nature',
    'VIEWPOINTS': 'Sightseeing',
    'RELIGIOUS SITES': 'Culture',
    'BEACHES': 'Swimming'
};

// Helper to create safe, non-hallucinated descriptions
function generateSafeDescription(props) {
    const name = props.name;
    const type = (props.type || 'destination').toLowerCase().replace('&', 'and');
    const town = (props.municipality || 'Catanduanes').charAt(0).toUpperCase() + (props.municipality || '').slice(1).toLowerCase();

    // STRICT TEMPLATE: No guessing allowed.
    return `${name} is a ${type} located in ${town}.`;
}

console.log("🛠️  Starting deterministic migration...");

try {
    const rawData = fs.readFileSync(GEOJSON_FILE, 'utf8');
    const geojson = JSON.parse(rawData);
    
    const newEntries = [];

    geojson.features.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        // Skip if name is missing
        if (!props.name) return;

        // 1. Convert Coordinates (GeoJSON is [lng, lat], Dataset needs {lat, lng})
        const lat = coords[1];
        const lng = coords[0];

        // 2. Map the Topic
        const topic = TYPE_TO_TOPIC[props.type] || 'General';

        // 3. Create the Entry
        const entry = {
            input: `Where is ${props.name}?`,
            output: generateSafeDescription(props), // Uses strict template
            title: `${props.name} Location`,
            topic: topic,
            location: props.municipality || "Catanduanes",
            summary_offline: generateSafeDescription(props),
            place_name: props.name,
            coordinates: {
                lat: lat,
                lng: lng
            }
        };

        newEntries.push(entry);
    });

    // Save to a SEPARATE file so you can review it first
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(newEntries, null, 2));

    console.log("------------------------------------------------");
    console.log(`✅ GENERATED: 'new_entries.json'`);
    console.log(`   - Entries created: ${newEntries.length}`);
    console.log("------------------------------------------------");
    console.log("👉 ACTION: Open 'new_entries.json'. Check the data.");
    console.log("   If it looks good, copy the objects inside and paste them");
    console.log("   into the array in 'src/backend/dataset/dataset.json'.");

} catch (error) {
    console.error("❌ ERROR:", error.message);
}