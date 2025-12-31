import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Mapping user-friendly activity names to your GeoJSON "type" properties
const ACTIVITY_MAPPING = { 
    Swimming: ['FALLS', 'HOTELS & RESORTS'], 
    Hiking: ['VIEWPOINTS', 'FALLS'], 
    Dining: ['RESTAURANTS & CAFES'], 
    Sightseeing: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS'], 
    Photography: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS', 'HOTELS & RESORTS'], 
    Shopping: [], 
    Accommodation: ['HOTELS & RESORTS'] 
};

export default function Map({ selectedActivities }) {
    const mapContainer = useRef(null);
    const map = useRef(null);

    // --- 1. FILTER LOGIC (Run whenever checkboxes change) ---
    useEffect(() => {
        if (!map.current || !map.current.getLayer('tourist-points')) return;

        const activeActivities = Object.keys(selectedActivities).filter(key => selectedActivities[key]);
        
        const allowedTypes = [...new Set(activeActivities.flatMap(act => ACTIVITY_MAPPING[act]))];

        console.log("Active Activities:", activeActivities);
        console.log("Filtering Map for Types:", allowedTypes);

        // 3. Apply the filter
        try {
            if (allowedTypes.length === 0) {
                map.current.setFilter('tourist-points', ['==', '$type', 'Point']);
            } else {
                map.current.setFilter('tourist-points', [
                    'all',
                    ['==', '$type', 'Point'],
                    ['in', 'type', ...allowedTypes] 
                ]);
            }
        } catch (error) {
            console.error("Filter error:", error);
        }

    }, [selectedActivities]); // Re-run this effect when selectedActivities changes

    // --- 2. MAP INITIALIZATION (Run once) ---
    useEffect(() => {
        if (map.current) return;

        try {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: 'https://demotiles.maplibre.org/style.json',
                center: [124.25, 13.9],
                zoom: 10,
                attributionControl: false
            });

            map.current.on('load', () => {
                console.log("Map Loaded");

                // Source
                map.current.addSource('catanduanes-data', {
                    type: 'geojson',
                    data: '/catanduanes_full.geojson' 
                });

                // Layers
                map.current.addLayer({
                    id: 'municipality-fills',
                    type: 'fill',
                    source: 'catanduanes-data',
                    filter: ['==', '$type', 'Polygon'], 
                    paint: {
                        'fill-color': '#627BC1',
                        'fill-opacity': 0.3
                    }
                });

                map.current.addLayer({
                    id: 'municipality-borders',
                    type: 'line',
                    source: 'catanduanes-data',
                    filter: ['==', '$type', 'Polygon'],
                    paint: {
                        'line-color': '#ffffff',
                        'line-width': 2
                    }
                });

                map.current.addLayer({
                    id: 'municipality-labels',
                    type: 'symbol',
                    source: 'catanduanes-data',
                    filter: ['==', '$type', 'Polygon'],
                    layout: {
                        'text-field': ['get', 'MUNICIPALI'],
                        'text-font': ['Open Sans Bold'],
                        'text-size': 12,
                        'text-transform': 'uppercase'
                    },
                    paint: {
                        'text-color': '#000000',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 2
                    }
                });

                // Points Layer
                map.current.addLayer({
                    id: 'tourist-points',
                    type: 'circle',
                    source: 'catanduanes-data',
                    filter: ['==', '$type', 'Point'],
                    paint: {
                        'circle-radius': 8, // Made slightly bigger to see easily
                        'circle-color': [
                            'match',
                            ['get', 'type'],
                            'HOTELS & RESORTS', '#FF5733',
                            'FALLS', '#33C1FF',
                            'VIEWPOINTS', '#2ECC71',
                            'RESTAURANTS & CAFES', '#F1C40F',
                            'RELIGIOUS SITES', '#9B59B6',
                            '#95A5A6' // Default color
                        ],
                        'circle-stroke-width': 1,
                        'circle-stroke-color': '#fff'
                    }
                });

                // Interactions
                map.current.on('click', 'municipality-fills', (e) => {
                    const feature = e.features[0];
                    const bounds = new maplibregl.LngLatBounds();
                    const rawCoords = feature.geometry.coordinates.flat(Infinity);
                    for (let i = 0; i < rawCoords.length; i += 2) {
                        bounds.extend([rawCoords[i], rawCoords[i + 1]]);
                    }
                    map.current.fitBounds(bounds, { padding: 80, maxZoom: 14 });
                });

                map.current.on('click', 'tourist-points', (e) => {
                    e.preventDefault(); // Stop map zoom on double click if any
                    const feature = e.features[0];
                    const coordinates = feature.geometry.coordinates.slice();
                    
                    new maplibregl.Popup()
                        .setLngLat(coordinates)
                        .setHTML(`
                            <strong>${feature.properties.name}</strong><br>
                            <span style="font-size:11px; color:#666;">${feature.properties.type}</span>
                        `)
                        .addTo(map.current);
                });

                // Cursor pointer
                ['municipality-fills', 'tourist-points'].forEach(layer => {
                    map.current.on('mouseenter', layer, () => map.current.getCanvas().style.cursor = 'pointer');
                    map.current.on('mouseleave', layer, () => map.current.getCanvas().style.cursor = '');
                });
            }); 

        } catch (error) {
            console.error('Map init failed:', error);
        }
    }, []);

    return (
        <div 
            ref={mapContainer} 
            style={{ 
                position: 'fixed', 
                top: 0, 
                left: 0,
                width: '100vw', 
                height: '100vh', 
                zIndex: 0 
            }} 
        />
    );
}