import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import roadData from '../data/catanduanes_optimized.json';
import { getVisualRoute } from '../utils/visualRoute.js';
import styles from '../styles/itinerary_page/map.module.css';


// --- CONFIGURATION ---
const INITIAL_VIEW = {
    center: [124.23, 13.71], 
    zoom: 10.4, 
    pitch: 60, 
    bearing: -15 
};

const MOBILE_INITIAL_VIEW = {
    center: INITIAL_VIEW.center,
    zoom: 9.2,
    pitch: 0,
    bearing: 0
};

const getInitialView = () => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
        return MOBILE_INITIAL_VIEW;
    }
    return INITIAL_VIEW;
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

const HUB_COLOR = '#048aa1';

const ACTIVITY_MAPPING = { 
    Swimming: ['FALLS', 'HOTELS & RESORTS'], 
    Hiking: ['VIEWPOINTS', 'FALLS'], 
    Dining: ['RESTAURANTS & CAFES'], 
    Sightseeing: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS'], 
    Photography: ['VIEWPOINTS', 'RELIGIOUS SITES', 'FALLS', 'HOTELS & RESORTS'], 
    Shopping: ['SHOPPING'], 
    Accommodation: ['HOTELS & RESORTS'] 
};

const ICONS = {
    'icon-hotel': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#333333" stroke="white" stroke-width="2"/><path d="M7 13v-3h10v3m-10 5v-8h10v8" stroke="white" stroke-width="1.5" fill="none"/></svg>`,
    'icon-food': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#333333" stroke="white" stroke-width="2"/><path d="M11 9H9V7c0-1.1.9-2 2-2v4zm4.41 6L15 9h-4l-.41 6H10v5h4v-5h-.59z" fill="white"/></svg>`,
    'icon-nature': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#333333" stroke="white" stroke-width="2"/><path d="M14 6l-3.5 5 2.5.5-3.5 5 2 .5L9 20h11v-2l-3-4 2.5-.5L14 6z" fill="white"/></svg>`,
    'icon-church': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#333333" stroke="white" stroke-width="2"/><path d="M12 5v14m-4-8h8" stroke="white" stroke-width="2" fill="none"/></svg>`,
    'icon-shop': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#333333" stroke="white" stroke-width="2"/><path d="M9 10V8a3 3 0 0 1 6 0v2h2v9H7v-9h2zm2 0h2V8a1 1 0 0 0-2 0v2z" fill="white"/></svg>`,
    'icon-camera': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#333333" stroke="white" stroke-width="2"/><circle cx="12" cy="13" r="3" stroke="white" stroke-width="1.5" fill="none"/><path d="M9 8h6l2 2h2v8H5v-8h2l2-2z" fill="none" stroke="white" stroke-width="1.5"/></svg>`,
    'icon-default': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="8" fill="#555555" stroke="white" stroke-width="2"/></svg>`,
    'icon-top10': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 4c-10.5 0-19 8.5-19 19 0 13.6 16.7 30.2 18.1 31.6.5.5 1.3.5 1.8 0C34.3 53.2 51 36.6 51 23 51 12.5 42.5 4 32 4z" fill="#111827" stroke="#facc15" stroke-width="2"/><circle cx="32" cy="23" r="11" fill="#1f2937"/><path d="M32 14l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L32 14z" fill="#facc15"/></svg>',
};

const readMapTheme = () => {
    if (typeof window === 'undefined') {
        return {
            mapBg: '#e8efe5',
            mapLand: '#1f4d3a',
            mapBorder: '#123625',
            mapLabel: '#f8fafc',
            mapLabelHalo: '#0b0b0b',
            mapPoint: '#0f172a',
            mapPointStroke: '#f8fafc',
            mapRoute: '#334155'
        };
    }
    const styles = getComputedStyle(document.documentElement);
    return {
        mapBg: styles.getPropertyValue('--map-style-bg').trim() || '#e8efe5',
        mapLand: styles.getPropertyValue('--map-style-land').trim() || '#1f4d3a',
        mapBorder: styles.getPropertyValue('--map-style-border').trim() || '#123625',
        mapLabel: styles.getPropertyValue('--map-style-label').trim() || '#f8fafc',
        mapLabelHalo: styles.getPropertyValue('--map-style-label-halo').trim() || '#0b0b0b',
        mapPoint: styles.getPropertyValue('--map-style-point').trim() || '#0f172a',
        mapPointStroke: styles.getPropertyValue('--map-style-point-stroke').trim() || '#f8fafc',
        mapRoute: styles.getPropertyValue('--map-style-route').trim() || '#334155'
    };
};

const Map = forwardRef((props, ref) => {
    const { selectedActivities, selectedLocation, onMarkerClick, mapData, selectedHub, addedSpots, budgetFilter } = props;
    
    const mapContainer = useRef(null);
    const map = useRef(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const lastHubRef = useRef(null);
    const glowingMarkersRef = useRef([]);
    const animationFrameRef = useRef(null);
    const resizeRafRef = useRef(null);
    const resizePendingRef = useRef(false);
    const resizeAfterIdleRef = useRef(false);

    useImperativeHandle(ref, () => ({
        handleChatbotLocations: (locations) => {
            if (!locations || locations.length === 0 || !map.current) return;

            console.log("📍 Map received locations:", locations);

            clearGlowingMarkers();

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

    const clearGlowingMarkers = () => {
        glowingMarkersRef.current.forEach(marker => marker.remove());
        glowingMarkersRef.current = [];
    };

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
        
        setTimeout(() => {
            marker.remove();
            glowingMarkersRef.current = glowingMarkersRef.current.filter(m => m !== marker);
        }, 10000); 
    };

    useEffect(() => {
        if (!isLoaded || !map.current) return;

        const activeActivities = Object.keys(selectedActivities).filter(key => selectedActivities[key]);
        const allowedTypes = [...new Set(activeActivities.flatMap(act => ACTIVITY_MAPPING[act]))];
        
        const commonCriteria = [];
        if (allowedTypes.length > 0) commonCriteria.push(['in', 'type', ...allowedTypes]);
        if (budgetFilter && budgetFilter.length > 0) commonCriteria.push(['in', 'min_budget', ...budgetFilter]);

        const standardFilter = ['all', ['==', '$type', 'Point'], ...commonCriteria, ['!=', ['get', 'is_top_10'], true]];
        const top10Filter = ['all', ['==', '$type', 'Point'], ...commonCriteria, ['==', ['get', 'is_top_10'], true]];

        try {
            if (map.current.getLayer('tourist-dots')) map.current.setFilter('tourist-dots', standardFilter);
            if (map.current.getLayer('tourist-points')) map.current.setFilter('tourist-points', standardFilter);
            if (map.current.getLayer('top-10-points')) map.current.setFilter('top-10-points', top10Filter);
        } catch (error) { 
            console.error("Filter error:", error); 
        }

    }, [selectedActivities, budgetFilter, isLoaded]);

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
    
    useEffect(() => {
        if (!isLoaded || !map.current) return;

        const sourceId = 'route-line';
        const layerId = 'route-layer';
        const previewSourceId = 'preview-route-line';
        const previewLayerId = 'preview-route-layer';

        const updateSolidRoute = () => {
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
                        'line-color': '#06b6d4', 
                        'line-width': 5,         
                        'line-opacity': 1,
                        'line-blur': 2
                    }
                }, 'tourist-points');
            }
        };

        const updatePreviewRoute = () => {
            const target = selectedLocation;
            const isAdded = target && addedSpots.some(s => s.name === target.name);
            let previewCoords = [];

            if (selectedHub?.coordinates && target?.geometry?.coordinates && !isAdded) {
                const segment = getVisualRoute(selectedHub.coordinates, target.geometry.coordinates);
                if (segment?.geometry?.coordinates) previewCoords = segment.geometry.coordinates;
            }

            const previewGeoJSON = {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: previewCoords
                }
            };

            if (map.current.getSource(previewSourceId)) {
                map.current.getSource(previewSourceId).setData(previewGeoJSON);
            } else {
                map.current.addSource(previewSourceId, { type: 'geojson', data: previewGeoJSON });
                map.current.addLayer({
                    id: previewLayerId, 
                    type: 'line', 
                    source: previewSourceId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 
                        'line-color': '#9CA3AF', // Gray color
                        'line-width': 3, 
                        'line-dasharray': [2, 2], // Dashed line
                        'line-opacity': 0.7 
                    }
                }, 'tourist-points'); 
            }
        };

        const timer = setTimeout(() => {
            updateSolidRoute();
            updatePreviewRoute();
        }, 10);
        
        return () => clearTimeout(timer);

    }, [selectedHub, addedSpots, isLoaded, selectedLocation]);

    useEffect(() => {
        if (map.current) return;

        const theme = readMapTheme();

        const initialView = getInitialView();

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                sources: {},
                layers: [{ 
                    id: 'background', 
                    type: 'background', 
                    paint: { 'background-color': theme.mapBg }
                }]
            },
            center: initialView.center,
            zoom: initialView.zoom,
            pitch: initialView.pitch,
            bearing: initialView.bearing,
            minZoom: 9, 
            maxZoom: 15,
            attributionControl: false,
            maxBounds: HARD_BOUNDS,
            dragPan: true,
            touchZoomRotate: true,
            touchPitch: true,
            clickTolerance: 12,
            cooperativeGestures: false
        });

        const scheduleResize = () => {
            if (!map.current) return;

            const isBusy = map.current.isMoving?.() || map.current.isZooming?.() || map.current.isRotating?.() || map.current.isEasing?.();
            if (isBusy) {
                if (!resizeAfterIdleRef.current) {
                    resizeAfterIdleRef.current = true;
                    map.current.once('idle', () => {
                        resizeAfterIdleRef.current = false;
                        if (map.current) map.current.resize();
                    });
                }
                return;
            }

            if (resizePendingRef.current) return;
            resizePendingRef.current = true;
            resizeRafRef.current = requestAnimationFrame(() => {
                resizePendingRef.current = false;
                if (map.current) map.current.resize();
            });
        };

        const resizeObserver = new ResizeObserver(() => {
            scheduleResize();
        });
        resizeObserver.observe(mapContainer.current);

        map.current.on('load', () => {
            setTimeout(() => {
                scheduleResize();
            }, 200);

            const loadIcon = (name, svgString) => {
                const img = new Image(24, 24);
                img.onload = () => {
                    if (map.current && !map.current.hasImage(name)) {
                        map.current.addImage(name, img);
                    }
                };
                img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
            };

            Object.keys(ICONS).forEach(key => loadIcon(key, ICONS[key]));

            const dataPromise = mapData 
                ? Promise.resolve(mapData) 
                : fetch('/catanduanes_datafile.geojson').then(res => res.json());

            dataPromise.then(allData => {
                if (!map.current) return;
                const activeTheme = readMapTheme();
                
                map.current.addSource('all-data', { type: 'geojson', data: allData });
                
                map.current.addLayer({ 
                    id: 'island-fill', 
                    type: 'fill', 
                    source: 'all-data', 
                    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], 
                    paint: { 
                        'fill-color': activeTheme.mapLand,
                        'fill-opacity': 1 
                    } 
                });
                
                map.current.addLayer({ 
                    id: 'municipality-borders', 
                    type: 'line', 
                    source: 'all-data', 
                    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], 
                    paint: { 
                        'line-color': activeTheme.mapBorder, 
                        'line-width': 1.5 
                    } 
                });
                
                map.current.addLayer({ 
                    id: 'municipality-labels', 
                    type: 'symbol', 
                    source: 'all-data', 
                    minzoom: 11,
                    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], 
                    layout: { 
                        'text-field': ['get', 'MUNICIPALI'], 
                        'text-font': ['Open Sans Bold'], 
                        'text-size': 12 
                    }, 
                    paint: { 
                        'text-color': activeTheme.mapLabel,
                        'text-halo-color': activeTheme.mapLabelHalo, 
                        'text-halo-width': 3,
                        'text-opacity': 0.9
                    } 
                });
                map.current.addLayer({
                    id: 'tourist-dots',
                    type: 'circle',
                    source: 'all-data',
                    maxzoom: 12,
                    filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['to-boolean', ['get', 'is_top_10']]]],
                    paint: {
                        'circle-radius': 3.5,
                        'circle-color': activeTheme.mapPoint,
                        'circle-stroke-width': 1,
                        'circle-stroke-color': activeTheme.mapPointStroke,
                        'circle-opacity': 0.8
                    }
                });

                map.current.addLayer({
                    id: 'tourist-points', 
                    type: 'symbol', 
                    source: 'all-data', 
                    minzoom: 12,
                    filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['to-boolean', ['get', 'is_top_10']]]],
                    layout: {
                        'icon-image': [
                            'match', 
                            ['get', 'type'], 
                            'HOTELS & RESORTS', 'icon-hotel', 
                            'FALLS', 'icon-nature', 
                            'VIEWPOINTS', 'icon-camera', 
                            'RESTAURANTS & CAFES', 'icon-food', 
                            'RELIGIOUS SITES', 'icon-church', 
                            'SHOPPING', 'icon-shop',
                            'icon-default'
                        ],
                        'icon-size': 1, 
                        'icon-allow-overlap': true,
                        'icon-anchor': 'center'
                    }
                });

                map.current.addLayer({
                    id: 'top-10-points',
                    type: 'symbol',
                    source: 'all-data',
                    filter: ['all', ['==', ['geometry-type'], 'Point'], ['to-boolean', ['get', 'is_top_10']]],
                    layout: {
                        'icon-image': 'icon-top10',
                        'icon-size': 1.25,
                        'icon-allow-overlap': true,
                        'icon-anchor': 'center',
                        'symbol-sort-key': 1
                    }
                });

                map.current.addLayer({
                    id: 'top-10-pulse',
                    type: 'circle',
                    source: 'all-data',
                    filter: ['all', ['==', ['geometry-type'], 'Point'], ['to-boolean', ['get', 'is_top_10']]],
                    paint: {
                        'circle-radius': 12,
                        'circle-color': '#facc15',
                        'circle-opacity': 0.25,
                        'circle-blur': 0.8
                    }
                }, 'top-10-points');

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
                        'line-color': activeTheme.mapRoute,
                        'line-width': 1,
                        'line-opacity': 0.3
                    }
                });

                setIsLoaded(true);

                const animatePulse = () => {
                    const time = Date.now() / 1000;
                    const pulse = 12 + Math.sin(time * 3) * 3;
                    const opacity = 0.15 + (Math.sin(time * 3) + 1) * 0.1;

                    if (map.current) {
                        if (map.current.getLayer('top-10-pulse')) {
                            map.current.setPaintProperty('top-10-pulse', 'circle-radius', pulse);
                            map.current.setPaintProperty('top-10-pulse', 'circle-opacity', opacity);
                        }
                    }
                    animationFrameRef.current = requestAnimationFrame(animatePulse);
                };
                animatePulse();

                map.current.on('dragend', () => {
                    if (!map.current) return;
                    
                    const currentZoom = map.current.getZoom();
                    if (currentZoom < 11) {
                        const initialView = getInitialView();
                        map.current.easeTo({
                            center: initialView.center,
                            zoom: initialView.zoom,
                            bearing: initialView.bearing, // 👈 RESET BEARING
                            pitch: initialView.pitch,     // 👈 RESET PITCH
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
                        const initialView = getInitialView();
                        map.current.easeTo({
                            center: initialView.center,
                            zoom: initialView.zoom,
                            bearing: initialView.bearing, // 👈 RESET BEARING
                            pitch: initialView.pitch,     // 👈 RESET PITCH
                            duration: 800, 
                            easing: (t) => t * (2 - t)
                        });
                    }
                });

                map.current.on('zoomend', () => {
                    if (!map.current) return;
                    if (map.current.getZoom() < 9.8) {
                        const initialView = getInitialView();
                        map.current.easeTo({
                            center: initialView.center,
                            zoom: initialView.zoom,
                            bearing: initialView.bearing, // 👈 RESET BEARING
                            pitch: initialView.pitch,     // 👈 RESET PITCH
                            duration: 600
                        });
                    }
                });

                map.current.on('click', 'island-fill', (e) => {
                    if (!map.current) return;

                    const features = map.current.queryRenderedFeatures(e.point, {
                        layers: ['tourist-points', 'top-10-points'] 
                    });

                    if (features.length > 0) return;

                    if (!e.features[0].properties.MUNICIPALI) return;
                    
                    const b = new maplibregl.LngLatBounds();
                    e.features[0].geometry.coordinates.flat(Infinity).forEach((c, i, arr) => { 
                        if (i % 2 === 0) b.extend([c, arr[i+1]]); 
                    });
                    map.current.fitBounds(b, { padding: 50, maxZoom: 12.5 });
                });

                const handlePointClick = (e) => {
                    if (!map.current) return;
                    const f = e.features[0];
                    const currentZoom = map.current.getZoom();
                    
                    if (currentZoom < 12) {
                        map.current.flyTo({
                            center: f.geometry.coordinates,
                            zoom: 14, 
                            speed: 1.5,
                            essential: true
                        });
                    } else {
                        map.current.easeTo({
                            center: f.geometry.coordinates,
                            duration: 300 
                        });
                    }

                    new maplibregl.Popup({ offset: 15 })
                        .setLngLat(f.geometry.coordinates)
                        .setHTML(`
                            <div style="text-align:center;">
                                <strong>${f.properties.name}</strong><br>
                                <span style="font-size:0.8em; color:#666;">${f.properties.type}</span>
                            </div>
                            `)
                        .addTo(map.current);

                    const spotData = { ...f.properties, geometry: f.geometry };
                    if (onMarkerClick) onMarkerClick(spotData);
                };

                map.current.on('click', 'tourist-points', handlePointClick);
                map.current.on('click', 'top-10-points', handlePointClick);
                    
                ['tourist-points', 'top-10-points'].forEach(l => {
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
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
            if (map.current) { 
                map.current.remove(); 
                map.current = null; 
            }
        };
    }, []);

    useEffect(() => {
        if (!map.current) return;

        const applyTheme = () => {
            if (!map.current) return;
            const theme = readMapTheme();
            if (map.current.getLayer('background')) {
                map.current.setPaintProperty('background', 'background-color', theme.mapBg);
            }
            if (map.current.getLayer('island-fill')) {
                map.current.setPaintProperty('island-fill', 'fill-color', theme.mapLand);
            }
            if (map.current.getLayer('municipality-borders')) {
                map.current.setPaintProperty('municipality-borders', 'line-color', theme.mapBorder);
            }
            if (map.current.getLayer('municipality-labels')) {
                map.current.setPaintProperty('municipality-labels', 'text-color', theme.mapLabel);
                map.current.setPaintProperty('municipality-labels', 'text-halo-color', theme.mapLabelHalo);
            }
            if (map.current.getLayer('tourist-dots')) {
                map.current.setPaintProperty('tourist-dots', 'circle-color', theme.mapPoint);
                map.current.setPaintProperty('tourist-dots', 'circle-stroke-color', theme.mapPointStroke);
            }
            if (map.current.getLayer('router-brain-layer')) {
                map.current.setPaintProperty('router-brain-layer', 'line-color', theme.mapRoute);
            }
        };

        applyTheme();
        window.addEventListener('themechange', applyTheme);
        return () => window.removeEventListener('themechange', applyTheme);
    }, [isLoaded]);

    return (
    <div 
        ref={mapContainer} 
        className={styles.mapContainer} 
        style={{ 
            touchAction: 'none',  // <--- MANDATORY for touch to work
            outline: 'none' 
        }} 
    />
    );
});

export default Map;
