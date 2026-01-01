const fs = require('fs');
const path = require('path');

// CONFIGURATION
// Assuming 'downloaded-data' is inside the 'pathfinder' folder
const inputDir = './downloaded-data'; 
const outputFile = './catanduanes_full.geojson';

const masterGeoJSON = {
  type: "FeatureCollection",
  features: []
};

// 1. Read the directory
if (!fs.existsSync(inputDir)) {
    console.error(`ERROR: Could not find folder: ${inputDir}`);
    console.error("Make sure you are running this script from the 'pathfinder' folder!");
    process.exit(1);
}

const files = fs.readdirSync(inputDir);

files.forEach(file => {
  if (path.extname(file) === '.geojson' || path.extname(file) === '.json') {
    const filePath = path.join(inputDir, file);
    try {
      const rawContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(rawContent);

      if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        console.log(`Merging ${data.features.length} points from: ${file}`);
        masterGeoJSON.features.push(...data.features);
      }
    } catch (err) {
      console.error(`Skipping ${file}: Error parsing JSON.`);
    }
  }
});

// 2. Write the combined file 
fs.writeFileSync(outputFile, JSON.stringify(masterGeoJSON, null, 2));
console.log(`SUCCESS! Created ${outputFile} with ${masterGeoJSON.features.length} features.`);