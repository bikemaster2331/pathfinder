import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// --- CONFIGURATION ---
const INITIAL_VIEW = {
    center: [124.09, 13.81], 
    zoom: 9.8
};

// THE WALL: This stops the user from dragging too far.
// It effectively "kills" the throw because the map hits this invisible wall and stops.
const HARD_BOUNDS = [
    [123.45, 13.4], // Southwest Corner
    [124.8, 14.2]  // Northeast Corner
];

const ACTIVITY_MAPPING = { 
    Swimming: ['FALLS', 'HOTELS & RESORTS'], 
    Hiking: ['VIEWPOINTS', 'FALLS'], 
    Dining: ['RESTAURANTS & CAFES'], 
    Sightseeing: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS'], 
    Photography: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS', 'HOTELS & RESORTS'], 
    Shopping: [], 
    Accommodation: ['HOTELS & RESORTS'] 
};

export default function Map({ selectedActivities, onMarkerClick, mapData }) {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // --- FILTER LOGIC ---
    useEffect(() => {
        if (!isLoaded || !map.current?.getLayer('tourist-points')) return;
        const activeActivities = Object.keys(selectedActivities).filter(key => selectedActivities[key]);
        const allowedTypes = [...new Set(activeActivities.flatMap(act => ACTIVITY_MAPPING[act]))];
        try {
            if (allowedTypes.length === 0) {
                map.current.setFilter('tourist-points', ['==', '$type', 'Point']);
            } else {
                map.current.setFilter('tourist-points', ['all', ['==', '$type', 'Point'], ['in', 'type', ...allowedTypes]]);
            }
        } catch (error) { console.error("Filter error:", error); }
    }, [selectedActivities, isLoaded]);

    // --- MAP INITIALIZATION ---
    useEffect(() => {
        if (map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: {},
                layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#000000' } }]
            },
            center: INITIAL_VIEW.center,
            zoom: INITIAL_VIEW.zoom,
            minZoom: 9, 
            maxZoom: 12,
            attributionControl: false,
            
            // 1. THE WALL (Hard Bounds)
            // This physically stops the map from going too far.
            maxBounds: HARD_BOUNDS
        });

        const resizeObserver = new ResizeObserver(() => {
            map.current.resize();
        });
        resizeObserver.observe(mapContainer.current);

        map.current.on('load', () => {
            setTimeout(() => map.current.resize(), 200);

            const dataPromise = mapData 
                ? Promise.resolve(mapData) 
                : fetch('/catanduanes_full.geojson').then(res => res.json());

            dataPromise.then(allData => {
                // --- LAYER SETUP ---
                const worldBounds = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];
                const islandHoles = [];
                allData.features.forEach(feature => {
                    if (feature.geometry.type === 'Polygon') islandHoles.push(feature.geometry.coordinates[0]);
                    else if (feature.geometry.type === 'MultiPolygon') feature.geometry.coordinates.forEach(poly => islandHoles.push(poly[0]));
                });
                map.current.addSource('world-mask', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [worldBounds, ...islandHoles] } } });
                map.current.addLayer({ id: 'mask-layer', type: 'fill', source: 'world-mask', paint: { 'fill-color': '#000000', 'fill-opacity': 1 } });
                map.current.addSource('all-data', { type: 'geojson', data: allData });
                map.current.addLayer({ id: 'island-fill', type: 'fill', source: 'all-data', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], paint: { 'fill-color': '#ffffff', 'fill-opacity': 1 } });
                map.current.addLayer({ id: 'municipality-borders', type: 'line', source: 'all-data', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], paint: { 'line-color': '#cccccc', 'line-width': 1.5 } });
                map.current.addLayer({ id: 'municipality-labels', type: 'symbol', source: 'all-data', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], layout: { 'text-field': ['get', 'MUNICIPALI'], 'text-font': ['Open Sans Bold'], 'text-size': 12 }, paint: { 'text-color': '#333333', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
                map.current.addLayer({
                    id: 'tourist-points', type: 'circle', source: 'all-data', filter: ['==', ['geometry-type'], 'Point'],
                    paint: {
                        'circle-radius': 6,
                        'circle-color': ['match', ['get', 'type'], 'HOTELS & RESORTS', '#FF5733', 'FALLS', '#33C1FF', 'VIEWPOINTS', '#2ECC71', 'RESTAURANTS & CAFES', '#F1C40F', 'RELIGIOUS SITES', '#9B59B6', '#95A5A6'],
                        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
                    }
                });

                setIsLoaded(true);

                // --- 2. THE SNAP BACK (Aggressive) ---
                // We use 'dragend' (Mouse Up) instead of 'moveend'.
                // This triggers the MOMENT you let go, canceling any inertia/throw.
                map.current.on('dragend', () => {
                    map.current.easeTo({
                        center: INITIAL_VIEW.center,
                        zoom: INITIAL_VIEW.zoom, // Optional: Force zoom reset too
                        duration: 600, // Smooth 0.6s return
                        easing: (t) => t * (2 - t)
                    });
                });

                // Also reset if they zoom out too far
                map.current.on('zoomend', () => {
                    if (map.current.getZoom() < 9.5) {
                        map.current.easeTo({
                            center: INITIAL_VIEW.center,
                            zoom: INITIAL_VIEW.zoom,
                            duration: 600
                        });
                    }
                });

                // --- CLICKS ---
                map.current.on('click', 'island-fill', (e) => {
                    if (!e.features[0].properties.MUNICIPALI) return;
                    const b = new maplibregl.LngLatBounds();
                    e.features[0].geometry.coordinates.flat(Infinity).forEach((c, i, arr) => { if (i % 2 === 0) b.extend([c, arr[i+1]]); });
                    map.current.fitBounds(b, { padding: 50, maxZoom: 12.5 });
                });

                map.current.on('click', 'tourist-points', (e) => {
                    const f = e.features[0];
                    new maplibregl.Popup({ offset: 15 }).setLngLat(f.geometry.coordinates)
                        .setHTML(`<strong>${f.properties.name}</strong><br>${f.properties.type}`).addTo(map.current);
                    if (onMarkerClick) onMarkerClick(f.properties);
                });

                ['island-fill', 'tourist-points'].forEach(l => {
                    map.current.on('mouseenter', l, () => map.current.getCanvas().style.cursor = 'pointer');
                    map.current.on('mouseleave', l, () => map.current.getCanvas().style.cursor = '');
                });
            });
        });

        return () => {
            resizeObserver.disconnect();
            if (map.current) { map.current.remove(); map.current = null; }
        };
    }, []); 

    return (
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    );
}