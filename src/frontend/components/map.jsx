import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';

// --- CONFIGURATION ---
const INITIAL_VIEW = {
    center: [124.09, 13.81], 
    zoom: 9.8
};

const HARD_BOUNDS = [
    [123.45, 13.4], 
    [124.8, 14.2]  
];

// Extended bounds to allow dragging past the trigger point
const WIDE_BOUNDS = [
    [123.0, 13.0], 
    [125.5, 14.8]  
];

// Trigger zone for the elastic snap-back
const RESET_TRIGGER_BOUNDS = {
    minLng: 123.8,
    maxLng: 124.6,
    minLat: 13.4,
    maxLat: 14.3
};

const HUB_COLOR = '#2563EB';

const ACTIVITY_MAPPING = { 
    Swimming: ['FALLS', 'HOTELS & RESORTS'], 
    Hiking: ['VIEWPOINTS', 'FALLS'], 
    Dining: ['RESTAURANTS & CAFES'], 
    Sightseeing: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS'], 
    Photography: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS', 'HOTELS & RESORTS'], 
    Shopping: ['SHOPPING'], 
    Accommodation: ['HOTELS & RESORTS'] 
};

export default function Map({ selectedActivities, onMarkerClick, mapData, selectedHub, addedSpots }) {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // --- 1. FILTER LOGIC ---
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

    // --- 2. HUB HALO & CAMERA LOGIC ---
    useEffect(() => {
        if (!isLoaded || !map.current || !selectedHub) return;

        const sourceId = 'hub-data';
        
        // GeoJSON for the Halo
        const data = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: selectedHub.coordinates },
                properties: { name: selectedHub.name }
            }]
        };

        if (map.current.getSource(sourceId)) {
            map.current.getSource(sourceId).setData(data);
        } else {
            map.current.addSource(sourceId, { type: 'geojson', data });

            // Add Halo Layer
            map.current.addLayer({
                id: 'hub-halo', type: 'circle', source: sourceId,
                paint: {
                    'circle-radius': 20, 'circle-color': HUB_COLOR,
                    'circle-opacity': 0.4, 'circle-stroke-width': 1, 'circle-stroke-color': HUB_COLOR
                }
            });
            // Add Center Dot Layer
            map.current.addLayer({
                id: 'hub-center', type: 'circle', source: sourceId,
                paint: {
                    'circle-radius': 6, 'circle-color': '#ffffff',
                    'circle-stroke-width': 3, 'circle-stroke-color': HUB_COLOR
                }
            });
        }

        map.current.flyTo({
            center: selectedHub.coordinates,
            zoom: 11,
            speed: 1.2,
            curve: 1
        });
        
    }, [selectedHub, isLoaded]);
    
    // --- 3. ROUTE LINE LOGIC (Visual Connection) ---
    useEffect(() => {
        if (!isLoaded || !map.current) return;

        const sourceId = 'route-line';
        const layerId = 'route-layer';

        // 1. Build the path: Start at Hub -> Connect to each added spot
        let routeCoords = [];
        
        // Always start with the Hub
        if (selectedHub && selectedHub.coordinates) {
            routeCoords.push(selectedHub.coordinates);
        }

        // Add all selected spots in order
        if (addedSpots && addedSpots.length > 0) {
            addedSpots.forEach(spot => {
                // Safety check: ensure spot has geometry
                if (spot.geometry && spot.geometry.coordinates) {
                    routeCoords.push(spot.geometry.coordinates);
                }
            });
        }

        const geojson = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: routeCoords
            }
        };

        // 2. Render the Line
        if (map.current.getSource(sourceId)) {
            map.current.getSource(sourceId).setData(geojson);
        } else {
            map.current.addSource(sourceId, { type: 'geojson', data: geojson });

            map.current.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#2563EB', // Blue to match the Hub
                    'line-width': 4,
                    'line-opacity': 0.8,
                    'line-dasharray': [2, 1] // Dotted line style
                }
            });
        }
    }, [selectedHub, addedSpots, isLoaded]);

    // --- 3. MAP INITIALIZATION ---
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
            maxZoom: 15,
            attributionControl: false,
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
                // Layer Setup
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
                        'circle-color': ['match', ['get', 'type'], 'HOTELS & RESORTS', '#FF5733', 'FALLS', '#33C1FF', 'VIEWPOINTS', '#2ECC71', 'RESTAURANTS & CAFES', '#F1C40F', 'RELIGIOUS SITES', '#9B59B6', 'SHOPPING', '#EC4899','#95A5A6'],
                        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
                    }
                });

                setIsLoaded(true);

                // Bounds Management
                map.current.on('zoom', () => {
                    if (map.current.getZoom() >= 11) {
                        map.current.setMaxBounds(WIDE_BOUNDS);
                    } else {
                        map.current.setMaxBounds(HARD_BOUNDS);
                    }
                });

                // Elastic Snap-Back Logic
                map.current.on('dragend', () => {
                    const currentZoom = map.current.getZoom();

                    // Always snap back when zoomed out
                    if (currentZoom < 11) {
                        map.current.easeTo({
                            center: INITIAL_VIEW.center,
                            zoom: INITIAL_VIEW.zoom,
                            duration: 600,
                            easing: (t) => t * (2 - t)
                        });
                        return; 
                    }

                    // Snap back if outside safe zone when zoomed in
                    const center = map.current.getCenter();
                    const isOutsideSafeZone = 
                        center.lng < RESET_TRIGGER_BOUNDS.minLng || 
                        center.lng > RESET_TRIGGER_BOUNDS.maxLng ||
                        center.lat < RESET_TRIGGER_BOUNDS.minLat || 
                        center.lat > RESET_TRIGGER_BOUNDS.maxLat;

                    if (isOutsideSafeZone) {
                        map.current.easeTo({
                            center: INITIAL_VIEW.center,
                            zoom: INITIAL_VIEW.zoom,
                            duration: 800, 
                            easing: (t) => t * (2 - t)
                        });
                    }
                });

                // Safety Zoom Reset
                map.current.on('zoomend', () => {
                    if (map.current.getZoom() < 9.8) {
                        map.current.easeTo({
                            center: INITIAL_VIEW.center,
                            zoom: INITIAL_VIEW.zoom,
                            duration: 600
                        });
                    }
                });

                // Click Handling
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
                    const spotData = {
                        ...f.properties,
                        geometry: f.geometry
                    };
                    if (onMarkerClick) onMarkerClick(spotData);
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