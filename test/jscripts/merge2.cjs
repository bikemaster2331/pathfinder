const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const MAP_FILE = path.join(__dirname, 'public/catanduanes_full_backup.geojson');
const POINTS_FILE = path.join(__dirname, 'test/jscripts/public/test_map2.geojson');
const OUTPUT_FILE = path.join(__dirname, 'public/catanduanes_full.geojson');

console.log("🔄 Starting Merge Process...");

try {
    // Verify files exist
    if (!fs.existsSync(MAP_FILE)) {
        throw new Error(`Map file not found: ${MAP_FILE}`);
    }
    if (!fs.existsSync(POINTS_FILE)) {
        throw new Error(`Points file not found: ${POINTS_FILE}`);
    }

    // Read files
    const mapRaw = fs.readFileSync(MAP_FILE, 'utf8');
    const pointsRaw = fs.readFileSync(POINTS_FILE, 'utf8');
    
    const mapData = JSON.parse(mapRaw);
    const pointsData = JSON.parse(pointsRaw);

    // Extract island shapes (Polygon and MultiPolygon)
    const islandShapes = mapData.features.filter(f => 
        f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
    );
    
    console.log(`   - Kept ${islandShapes.length} Island Shapes (Polygons).`);

    // Extract new points
    const newPoints = pointsData.features.filter(f => f.geometry.type === 'Point');
    
    console.log(`   - Added ${newPoints.length} New Tourist Points.`);

    // Combine
    const combinedFeatures = [...islandShapes, ...newPoints];
    
    const finalGeoJSON = {
        type: "FeatureCollection",
        features: combinedFeatures
    };

    // Write output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalGeoJSON, null, 2));

    console.log("------------------------------------------------");
    console.log("✅ MERGE COMPLETE!");
    console.log(`📁 Updated: ${OUTPUT_FILE}`);
    console.log(`📊 Total Features: ${combinedFeatures.length}`);
    console.log(`   • Island Shapes: ${islandShapes.length}`);
    console.log(`   • Tourist Points: ${newPoints.length}`);
    console.log("------------------------------------------------");
    console.log("👉 Refresh your website to see changes.");

} catch (error) {
    console.error("❌ ERROR:", error.message);
    console.log("\nTroubleshooting:");
    console.log("1. Ensure public/catanduanes_full.geojson exists");
    console.log("2. Ensure public/test_map2.geojson exists");
    console.log("3. Check file permissions");
}