// POI Service - Loads and filters POI data from GeoJSON files

const MUNICIPALITIES = [
  'BAGAMANOC',
  'BARAS',
  'BATO',
  'CARAMORAN',
  'CATANDUANES',
  'GIGMOTO',
  'PANDAN',
  'PANGANIBAN',
  'SAN_ANDRES',
  'SAN_MIGUEL',
  'VIGA',
  'VIRAC'
];

// Map GeoJSON type names to filter IDs
const typeMapping = {
  'HOTELS & RESORTS': 'hotels',
  'RESTAURANTS & CAFES': 'restaurants',
  'FALLS': 'falls',
  'VIEWPOINTS': 'viewpoints',
  'RELIGIOUS SITES': 'religious'
};

let cachedGeoJSON = {};

/**
 * Load GeoJSON data for a specific municipality
 */
export const loadMunicipalityData = async (municipality) => {
  // Convert spaces to underscores for file lookup (e.g., "SAN ANDRES" -> "SAN_ANDRES")
  const normalizedMunicipality = municipality.replace(/ /g, '_');
  
  if (cachedGeoJSON[normalizedMunicipality]) {
    return cachedGeoJSON[normalizedMunicipality];
  }

  try {
    const response = await fetch(`/data/${normalizedMunicipality}.geojson`);
    if (!response.ok) throw new Error(`Failed to load ${normalizedMunicipality} data`);
    const data = await response.json();
    cachedGeoJSON[normalizedMunicipality] = data;
    return data;
  } catch (error) {
    console.error(`Error loading municipality data for ${normalizedMunicipality}:`, error);
    return { type: 'FeatureCollection', features: [] };
  }
};

/**
 * Get all unique categories from a municipality's GeoJSON
 */
export const getCategoriesForMunicipality = (geojsonData) => {
  const categories = new Set();
  
  if (geojsonData.features) {
    geojsonData.features.forEach((feature) => {
      if (feature.properties && feature.properties.type) {
        const mappedType = typeMapping[feature.properties.type];
        if (mappedType) {
          categories.add(mappedType);
        }
      }
    });
  }
  
  return Array.from(categories);
};

/**
 * Get POIs from a municipality filtered by category
 */
export const getPOIsByCategory = (geojsonData, categoryId) => {
  if (!geojsonData.features) return [];

  // Find the GeoJSON type that maps to this category ID
  const geoJsonType = Object.keys(typeMapping).find(
    (key) => typeMapping[key] === categoryId
  );

  if (!geoJsonType) return [];

  return geojsonData.features.filter((feature) => {
    return feature.properties && feature.properties.type === geoJsonType;
  });
};

/**
 * Get all POIs from a municipality
 */
export const getAllPOIs = (geojsonData) => {
  return geojsonData.features || [];
};

/**
 * Convert POI feature to carousel card format
 */
export const featureToCarouselCard = (feature, index) => {
  const props = feature.properties || {};
  return {
    id: `poi-${index}`,
    name: props.name || 'Unknown',
    category: typeMapping[props.type] || 'other',
    image: props.image || `https://via.placeholder.com/300x200?text=${encodeURIComponent(props.name || 'POI')}`,
    description: props.description || '',
    coordinates: feature.geometry?.coordinates || [0, 0],
  };
};

/**
 * Fetch all POIs from all municipalities
 */
export const fetchAllPOIs = async () => {
  const allPois = [];

  for (const municipality of MUNICIPALITIES) {
    try {
      const geojsonData = await loadMunicipalityData(municipality);
      const pois = getAllPOIs(geojsonData);

      pois.forEach((feature, index) => {
        const poi = featureToCarouselCard(feature, index);
        poi.id = `${municipality}-${index}`;
        allPois.push(poi);
      });
    } catch (error) {
      console.error(`Error loading POIs for ${municipality}:`, error);
    }
  }

  return allPois;
};

export default {
  loadMunicipalityData,
  getCategoriesForMunicipality,
  getPOIsByCategory,
  getAllPOIs,
  featureToCarouselCard,
  fetchAllPOIs,
};
