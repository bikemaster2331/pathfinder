import fs from 'fs';

const geojsonPath = 'public/catanduanes_datafile.geojson';
const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

const top10 = [
    "Binurong Point",
    "Puraran Beach",
    "Tuwad-Tuwadan Blue Lagoon",
    "Tuwad-Tuwadang Blue Lagoon",
    "St. John the Baptist  Church",
    "St. John the Baptist Church",
    "Nahulugan Falls",
    "Twin Rock Beach Resort",
    "Mamangal Beach",
    "Tampad Beach",
    "Ba-haw Falls",
    "Bahaw Falls",
    "Maribina Falls"
];

let modified = 0;
geojson.features.forEach(f => {
    if (f.properties && f.properties.name && top10.includes(f.properties.name)) {
        f.properties.is_top_10 = true;
        modified++;
    } else if (f.properties) {
        if (f.properties.is_top_10) delete f.properties.is_top_10;
    }
});

fs.writeFileSync(geojsonPath, JSON.stringify(geojson, null, 2));
console.log(`Modified ${modified} features`);
