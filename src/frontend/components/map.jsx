import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import roadData from '../data/catanduanes_optimized.json';
import { getVisualRoute } from '../utils/visualRoute.js';
import styles from '../styles/itinerary_page/map.module.css';

// --- CONFIGURATION ---
const INITIAL_VIEW = {
    center: [124.22, 13.75], 
    zoom: 10.4,
    pitch: 60,
    bearing: -15 // 👈 ADDED: The -15 degree rotation you wanted
};

const HARD_BOUNDS = [
    [123.65, 13.4], 
    [124.8, 14.2]  
];

const WIDE_BOUNDS = [
    [123.0, 13.0], 
    [125.5, 14.8]  
];

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

const Map = forwardRef((props, ref) => {
    const { selectedActivities, onMarkerClick, mapData, selectedHub, addedSpots, budgetFilter } = props;
    
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const lastHubRef = useRef(null);

    // Track glowing markers
    const glowingMarkersRef = useRef([]);

    // --- EXPOSE METHODS TO PARENT ---
    useImperativeHandle(ref, () => ({
        handleChatbotLocations: (locations) => {
            if (!locations || locations.length === 0 || !map.current) return;

            console.log("📍 Map received locations:", locations);

            clearGlowingMarkers();

            // Single Location -> Fly directly + Add Glow
            if (locations.length === 1) {
                const coords = locations[0].coordinates;
                
                map.current.flyTo({
                    center: coords,
                    zoom: 14,
                    speed: 1.5,
                    curve: 1,
                    essential: true
                });

                addGlowingMarker(locations[0]);
                
                new maplibregl.Popup({ 
                    offset: 25,
                    closeButton: true,
                    closeOnClick: false
                })
                    .setLngLat(coords)
                    .setHTML(`
                        <div style="padding: 4px;">
                            <strong style="color: #FFD700;">${locations[0].name}</strong><br>
                            <span style="font-size: 0.85em; color: #999;">${locations[0].type}</span>
                        </div>
                    `)
                    .addTo(map.current);
            } 
            // Multiple Locations -> Fit bounds + Add Glows
            else {
                const bounds = new maplibregl.LngLatBounds();
                
                locations.forEach(loc => {
                    bounds.extend(loc.coordinates);
                    addGlowingMarker(loc);
                });
                
                map.current.fitBounds(bounds, {
                    padding: { top: 80, bottom: 80, left: 80, right: 80 },
                    maxZoom: 13
                });
            }
        }
    }));

    // --- Clear All Glowing Markers ---
    const clearGlowingMarkers = () => {
        glowingMarkersRef.current.forEach(marker => marker.remove());
        glowingMarkersRef.current = [];
    };

    // --- Add Glowing Marker ---
    const addGlowingMarker = (location) => {
        if (!map.current) return;
        
        const container = document.createElement('div');
        container.className = styles.markerWrapper;

        const el = document.createElement('div');
        el.className = styles.chatbotGlowMarker;
        
        container.appendChild(el);
        
        const marker = new maplibregl.Marker({ element: container })
            .setLngLat(location.coordinates)
            .addTo(map.current);
        
        glowingMarkersRef.current.push(marker);
        
        container.addEventListener('click', () => {
            new maplibregl.Popup({ offset: 25 })
                .setLngLat(location.coordinates)
                .setHTML(`
                    <div style="padding: 4px;">
                        <strong style="color: #FFD700;">${location.name}</strong><br>
                        <span style="font-size: 0.85em; color: #999;">${location.type}</span><br>
                        <span style="font-size: 0.8em; color: #666;">${location.municipality}</span>
                    </div>
                `)
                .addTo(map.current);
        });
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            marker.remove();
            glowingMarkersRef.current = glowingMarkersRef.current.filter(m => m !== marker);
        }, 10000); 
    };

    // --- FILTER LOGIC ---
    useEffect(() => {
        if (!isLoaded || !map.current?.getLayer('tourist-points')) return;

        const activeActivities = Object.keys(selectedActivities).filter(key => selectedActivities[key]);
        const allowedTypes = [...new Set(activeActivities.flatMap(act => ACTIVITY_MAPPING[act]))];
        
        const combinedFilter = ['all', ['==', '$type', 'Point']];

        if (allowedTypes.length > 0) {
            combinedFilter.push(['in', 'type', ...allowedTypes]);
        }

        if (budgetFilter && budgetFilter.length > 0) {
            combinedFilter.push(['in', 'min_budget', ...budgetFilter]);
        }

        try {
            map.current.setFilter('tourist-points', combinedFilter);
        } catch (error) { 
            console.error("Filter error:", error); 
        }

    }, [selectedActivities, budgetFilter, isLoaded]);

    // --- HUB LOGIC ---
    useEffect(() => {
        if (!isLoaded || !map.current || !selectedHub) return;

        const sourceId = 'hub-data';
        
        const data = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: selectedHub.coordinates },
                properties: { name: selectedHub.name }
            }]
        };

        if (map.current.getSource(sourceId)) {
            const currentHubKey = `${selectedHub.name}_${selectedHub.coordinates[0]}_${selectedHub.coordinates[1]}`;
            if (lastHubRef.current === currentHubKey) return; 
            map.current.getSource(sourceId).setData(data);
            lastHubRef.current = currentHubKey;
        } else {
            map.current.addSource(sourceId, { type: 'geojson', data });

            map.current.addLayer({
                id: 'hub-halo', 
                type: 'circle', 
                source: sourceId,
                paint: {
                    'circle-radius': 20, 
                    'circle-color': HUB_COLOR,
                    'circle-opacity': 0.4, 
                    'circle-stroke-width': 1, 
                    'circle-stroke-color': HUB_COLOR
                }
            });
            
            map.current.addLayer({
                id: 'hub-center', 
                type: 'circle', 
                source: sourceId,
                paint: {
                    'circle-radius': 6, 
                    'circle-color': '#ffffff',
                    'circle-stroke-width': 3, 
                    'circle-stroke-color': HUB_COLOR
                }
            });

            lastHubRef.current = `${selectedHub.name}_${selectedHub.coordinates[0]}_${selectedHub.coordinates[1]}`;
        }

        map.current.flyTo({
            center: selectedHub.coordinates,
            zoom: 11,
            speed: 1.2,
            curve: 1
        });
        
    }, [selectedHub, isLoaded]);
    
    // --- ROUTE LOGIC ---
    useEffect(() => {
        if (!isLoaded || !map.current) return;

        const sourceId = 'route-line';
        const layerId = 'route-layer';

        const updateRoute = () => {
            const stops = [];
            
            if (selectedHub?.coordinates) {
                stops.push(selectedHub.coordinates);
            }

            if (addedSpots?.length > 0) {
                addedSpots.forEach(spot => {
                    if (spot.geometry?.coordinates) {
                        stops.push(spot.geometry.coordinates);
                    }
                });
            }

            const fullCoordinates = [];
            
            if (stops.length > 1) {
                for (let i = 0; i < stops.length - 1; i++) {
                    const segment = getVisualRoute(stops[i], stops[i + 1]);

                    if (segment?.geometry?.coordinates) {
                        fullCoordinates.push(...segment.geometry.coordinates);
                    }
                }
            }

            const geojson = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: fullCoordinates
                }
            };

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
                        'line-color': '#2563EB', 
                        'line-width': 4,
                        'line-opacity': 0.8
                    }
                }, 'tourist-points');
            }
        };

        const timer = setTimeout(updateRoute, 10);
        return () => clearTimeout(timer);

    }, [selectedHub, addedSpots, isLoaded]);

    // --- MAP INIT ---
    useEffect(() => {
        if (map.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: {},
                layers: [{ 
                    id: 'background', 
                    type: 'background', 
                    paint: { 'background-color': 'rgba(0,0,0,0)' }
                }]
            },
            center: INITIAL_VIEW.center,
            zoom: INITIAL_VIEW.zoom,
            pitch: 60,
            bearing: INITIAL_VIEW.bearing,
            minZoom: 9, 
            maxZoom: 15,
            attributionControl: false,
            maxBounds: HARD_BOUNDS
        });

        const resizeObserver = new ResizeObserver(() => {
            if (map.current) map.current.resize();
        });
        resizeObserver.observe(mapContainer.current);

        map.current.on('load', () => {
            setTimeout(() => {
                if (map.current) map.current.resize();
            }, 200);

            const dataPromise = mapData 
                ? Promise.resolve(mapData) 
                : fetch('/catanduanes_full.geojson').then(res => res.json());

            dataPromise.then(allData => {
                if (!map.current) return;
                
                map.current.addSource('all-data', { type: 'geojson', data: allData });
                
                map.current.addLayer({ 
                    id: 'island-fill', 
                    type: 'fill', 
                    source: 'all-data', 
                    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], 
                    paint: { 
                        'fill-color': '#ffffff', 
                        'fill-opacity': 1 
                    } 
                });
                
                map.current.addLayer({ 
                    id: 'municipality-borders', 
                    type: 'line', 
                    source: 'all-data', 
                    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], 
                    paint: { 
                        'line-color': '#cccccc', 
                        'line-width': 1.5 
                    } 
                });
                
                map.current.addLayer({ 
                    id: 'municipality-labels', 
                    type: 'symbol', 
                    source: 'all-data', 
                    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], 
                    layout: { 
                        'text-field': ['get', 'MUNICIPALI'], 
                        'text-font': ['Open Sans Bold'], 
                        'text-size': 12 
                    }, 
                    paint: { 
                        'text-color': '#333333', 
                        'text-halo-color': '#ffffff', 
                        'text-halo-width': 2 
                    } 
                });
                
                map.current.addLayer({
                    id: 'tourist-points', 
                    type: 'circle', 
                    source: 'all-data', 
                    filter: ['==', ['geometry-type'], 'Point'],
                    paint: {
                        'circle-radius': 6,
                        'circle-color': [
                            'match', 
                            ['get', 'type'], 
                            'HOTELS & RESORTS', '#FF5733', 
                            'FALLS', '#33C1FF', 
                            'VIEWPOINTS', '#2ECC71', 
                            'RESTAURANTS & CAFES', '#F1C40F', 
                            'RELIGIOUS SITES', '#9B59B6', 
                            'SHOPPING', '#EC4899',
                            '#95A5A6'
                        ],
                        'circle-stroke-width': 2, 
                        'circle-stroke-color': '#ffffff'
                    }
                });

                map.current.addSource('router-brain', {
                    type: 'geojson',
                    data: roadData
                });

                map.current.addLayer({
                    id: 'router-brain-layer',
                    minzoom: 12,
                    type: 'line',
                    source: 'router-brain',
                    paint: {
                        'line-color': '#e2e2e2ff',
                        'line-width': 2,
                        'line-opacity': 0.3
                    }
                });

                setIsLoaded(true);

                // --- RESET HANDLER 1: Bounds Check (Dragging) ---
                map.current.on('dragend', () => {
                    if (!map.current) return;
                    
                    const currentZoom = map.current.getZoom();
                    if (currentZoom < 11) {
                        map.current.easeTo({
                            center: INITIAL_VIEW.center,
                            zoom: INITIAL_VIEW.zoom,
                            bearing: INITIAL_VIEW.bearing, // 👈 RESET BEARING
                            pitch: INITIAL_VIEW.pitch,     // 👈 RESET PITCH
                            duration: 600,
                            easing: (t) => t * (2 - t)
                        });
                        return; 
                    }

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
                            bearing: INITIAL_VIEW.bearing, // 👈 RESET BEARING
                            pitch: INITIAL_VIEW.pitch,     // 👈 RESET PITCH
                            duration: 800, 
                            easing: (t) => t * (2 - t)
                        });
                    }
                });

                // --- RESET HANDLER 2: Zoom Check ---
                map.current.on('zoomend', () => {
                    if (!map.current) return;
                    if (map.current.getZoom() < 9.8) {
                        map.current.easeTo({
                            center: INITIAL_VIEW.center,
                            zoom: INITIAL_VIEW.zoom,
                            bearing: INITIAL_VIEW.bearing, // 👈 RESET BEARING
                            pitch: INITIAL_VIEW.pitch,     // 👈 RESET PITCH
                            duration: 600
                        });
                    }
                });

                map.current.on('click', 'island-fill', (e) => {
                    if (!map.current || !e.features[0].properties.MUNICIPALI) return;
                    const b = new maplibregl.LngLatBounds();
                    e.features[0].geometry.coordinates.flat(Infinity).forEach((c, i, arr) => { 
                        if (i % 2 === 0) b.extend([c, arr[i+1]]); 
                    });
                    map.current.fitBounds(b, { padding: 50, maxZoom: 12.5 });
                });

                map.current.on('click', 'tourist-points', (e) => {
                    if (!map.current) return;
                    const f = e.features[0];
                    new maplibregl.Popup({ offset: 15 })
                        .setLngLat(f.geometry.coordinates)
                        .setHTML(`<strong>${f.properties.name}</strong><br>${f.properties.type}`)
                        .addTo(map.current);
                    
                    const spotData = {
                        ...f.properties,
                        geometry: f.geometry
                    };
                    if (onMarkerClick) onMarkerClick(spotData);
                });

                ['island-fill', 'tourist-points'].forEach(l => {
                    map.current.on('mouseenter', l, () => {
                        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
                    });
                    map.current.on('mouseleave', l, () => {
                        if (map.current) map.current.getCanvas().style.cursor = '';
                    });
                });
            }).catch(err => {
                console.error('Failed to load map data:', err);
            });
        });

        return () => {
            resizeObserver.disconnect();
            if (map.current) { 
                map.current.remove(); 
                map.current = null; 
            }
        };
    }, []); 

    return (
        <div ref={mapContainer} className={styles.mapContainer} />
    );
});

export default Map;