const fs = require('fs');
const path = require('path');

// ADJUST PATHS IF NEEDED
// The '../..' moves up two folders to the project root
const INPUT_FILE = path.join(__dirname, '../../src/backend/dataset/dataset.json');
const OUTPUT_FILE = path.join(__dirname, 'public/test_map2.geojson');

// This aligns your Chatbot topics to the Map's expected Types
const TOPIC_TO_TYPE = {
    'accommodation': 'HOTELS & RESORTS',
    'hotel': 'HOTELS & RESORTS',
    'resort': 'HOTELS & RESORTS',
    'dining': 'RESTAURANTS & CAFES',
    'food': 'RESTAURANTS & CAFES',
    'falls': 'FALLS',
    'sightseeing': 'VIEWPOINTS',
    'nature': 'VIEWPOINTS',
    'beaches': 'VIEWPOINTS',
    'culture': 'RELIGIOUS SITES',
    'religious': 'RELIGIOUS SITES'
};

console.log("1. Reading dataset...");

try {
    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    const items = JSON.parse(rawData);
    
    console.log(`   - Found ${items.length} total items.`);

    const features = [];
    let skippedCount = 0;

    items.forEach((item, index) => {
        if (
            item.coordinates && 
            typeof item.coordinates.lat === 'number' && 
            typeof item.coordinates.lng === 'number'
        ) {
            const rawTopic = (item.topic || 'general').toLowerCase().trim();
            const placeName = (item.place_name || item.title || '').toLowerCase();
            const activities = (item.activities || '').toLowerCase();
            
            let mappedType = null;

            // --- SMART MAPPING LOGIC ---
            
            // 1. Keyword Sniffing (Highest Priority)
            if (placeName.includes('resort') || placeName.includes('inn') || placeName.includes('hotel') || placeName.includes('lodge')) {
                mappedType = 'HOTELS & RESORTS';
            }
            else if (placeName.includes('restaurant') || placeName.includes('cafe') || placeName.includes('pizza') || placeName.includes('food')) {
                mappedType = 'RESTAURANTS & CAFES';
            }
            else if (placeName.includes('falls')) {
                mappedType = 'FALLS';
            }
            else if (placeName.includes('church') || placeName.includes('shrine') || placeName.includes('cathedral')) {
                mappedType = 'RELIGIOUS SITES';
            }
            // Specific fix for your Surfing/Beach issue
            else if (activities.includes('surfing') || placeName.includes('beach')) {
                // You can map beaches to VIEWPOINTS or HOTELS depending on preference
                // Based on your mapping: Swimming -> HOTELS & RESORTS
                mappedType = 'HOTELS & RESORTS'; 
            }

            // 2. Topic Fallback (If no keywords matched)
            if (!mappedType) {
                mappedType = TOPIC_TO_TYPE[rawTopic];
            }

            // 3. Last Resort
            if (!mappedType && rawTopic !== 'shopping') {
                 // Default to VIEWPOINTS if it's not shopping (since Shopping is empty in your map)
                 mappedType = 'VIEWPOINTS';
            }

            // If we still have no type (e.g. Shopping), skip it
            if (!mappedType) {
                skippedCount++;
                return;
            }

            features.push({
                type: "Feature",
                properties: {
                    name: item.place_name || item.title || "Unknown Location",
                    type: mappedType, // Now guaranteed to be a valid standard type
                    description: item.summary_offline || item.output,
                    municipality: (item.location || "CATANDUANES").toUpperCase(),
                    size: 0.15,
                    showAtZoom: 10,
                    id: index,
                    // Keeping original activities helps with debugging
                    original_activity: item.activities 
                },
                geometry: {
                    type: "Point",
                    coordinates: [item.coordinates.lng, item.coordinates.lat]
                }
            });
        } else {
            skippedCount++;
        }
    });

    const geoJsonData = {
        type: "FeatureCollection",
        features: features
    };

    // Ensure directory exists
    const publicDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(publicDir)){
        fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geoJsonData, null, 2));

    console.log("------------------------------------------------");
    console.log(`✅ SUCCESS! Generated 'public/test_map.geojson'`);
    console.log(`📍 Mapped Locations: ${features.length}`);
    console.log(`⏩ Skipped Items: ${skippedCount}`);
    console.log("------------------------------------------------");

} catch (error) {
    console.error("❌ ERROR:", error.message);
}