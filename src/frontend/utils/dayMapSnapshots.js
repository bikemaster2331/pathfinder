import maplibregl from 'maplibre-gl';
import { getVisualRoute } from './visualRoute';

const SNAPSHOT_WIDTH = 1180;
const SNAPSHOT_HEIGHT = 760;
const SNAPSHOT_QUALITY = 0.82;
const LOAD_TIMEOUT_MS = 12000;
const IDLE_TIMEOUT_MS = 12000;
const CONTEXT_DATA_URL = '/catanduanes_datafile.geojson';

const isValidCoordinate = (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) return false;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
};

const normalizeItineraryDays = (finalItinerary) => {
    if (Array.isArray(finalItinerary)) {
        return { 1: finalItinerary };
    }
    return finalItinerary || {};
};

const normalizeDayMeta = (dayMeta) => {
    if (!dayMeta || typeof dayMeta !== 'object') {
        return {};
    }
    return dayMeta;
};

const getSpotCoordinates = (spot) => {
    if (isValidCoordinate(spot?.geometry?.coordinates)) {
        return [Number(spot.geometry.coordinates[0]), Number(spot.geometry.coordinates[1])];
    }
    if (isValidCoordinate(spot?.coordinates)) {
        return [Number(spot.coordinates[0]), Number(spot.coordinates[1])];
    }
    return null;
};

const resolveDayStartCoordinates = ({ dayMetaEntry, hubCoordinates }) => {
    if (isValidCoordinate(dayMetaEntry?.startCoordinates)) {
        return dayMetaEntry.startCoordinates;
    }
    if (isValidCoordinate(hubCoordinates)) {
        return hubCoordinates;
    }
    return null;
};

const readMapTheme = () => {
    if (typeof window === 'undefined') {
        return {
            mapBg: '#e8efe5',
            mapLand: '#1f4d3a',
            mapBorder: '#123625',
            mapRoute: '#305dda'
        };
    }

    const rootStyles = getComputedStyle(document.documentElement);
    return {
        mapBg: rootStyles.getPropertyValue('--map-style-bg').trim() || '#e8efe5',
        mapLand: rootStyles.getPropertyValue('--map-style-land').trim() || '#1f4d3a',
        mapBorder: rootStyles.getPropertyValue('--map-style-border').trim() || '#123625',
        mapRoute: '#305dda'
    };
};

const waitForMapLoad = (map) => new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out while loading map style'));
    }, LOAD_TIMEOUT_MS);

    const handleLoad = () => {
        cleanup();
        resolve();
    };

    const handleError = (event) => {
        cleanup();
        reject(event?.error || new Error('Map style failed to load'));
    };

    const cleanup = () => {
        window.clearTimeout(timeoutId);
        map.off('load', handleLoad);
        map.off('error', handleError);
    };

    if (map.loaded()) {
        cleanup();
        resolve();
        return;
    }

    map.on('load', handleLoad);
    map.on('error', handleError);
});

const waitForMapIdle = (map) => new Promise((resolve) => {
    let completed = false;

    const finish = () => {
        if (completed) return;
        completed = true;
        window.clearTimeout(timeoutId);
        map.off('idle', handleIdle);
        resolve();
    };

    const handleIdle = () => {
        finish();
    };

    const timeoutId = window.setTimeout(() => {
        finish();
    }, IDLE_TIMEOUT_MS);

    map.on('idle', handleIdle);

    if (map.loaded() && !map.isMoving()) {
        requestAnimationFrame(() => finish());
    }
});

const buildDayRouteCoordinates = (startCoordinates, dayStopCoordinates) => {
    const routeCoordinates = [];
    const orderedPoints = [startCoordinates, ...dayStopCoordinates].filter(isValidCoordinate);

    if (orderedPoints.length < 2) {
        return routeCoordinates;
    }

    for (let index = 0; index < orderedPoints.length - 1; index += 1) {
        const start = orderedPoints[index];
        const end = orderedPoints[index + 1];
        let segmentCoordinates = null;

        try {
            const visualRoute = getVisualRoute(start, end);
            if (Array.isArray(visualRoute?.geometry?.coordinates) && visualRoute.geometry.coordinates.length > 1) {
                segmentCoordinates = visualRoute.geometry.coordinates.filter(isValidCoordinate);
            }
        } catch (error) {
            segmentCoordinates = null;
        }

        if (!segmentCoordinates || segmentCoordinates.length < 2) {
            segmentCoordinates = [start, end];
        }

        if (routeCoordinates.length === 0) {
            routeCoordinates.push(...segmentCoordinates);
        } else {
            routeCoordinates.push(...segmentCoordinates.slice(1));
        }
    }

    return routeCoordinates;
};

const normalizeFeatureCollection = (mapFeatureData) => {
    if (mapFeatureData?.type === 'FeatureCollection' && Array.isArray(mapFeatureData.features)) {
        return mapFeatureData;
    }
    if (Array.isArray(mapFeatureData?.features)) {
        return {
            type: 'FeatureCollection',
            features: mapFeatureData.features
        };
    }
    return null;
};

const loadContextData = async (mapFeatureData) => {
    const normalized = normalizeFeatureCollection(mapFeatureData);
    if (normalized) {
        return normalized;
    }

    try {
        const response = await fetch(CONTEXT_DATA_URL);
        if (!response.ok) return null;
        const json = await response.json();
        return normalizeFeatureCollection(json);
    } catch (error) {
        return null;
    }
};

const createHiddenMapContainer = () => {
    const container = document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = `${SNAPSHOT_WIDTH}px`;
    container.style.height = `${SNAPSHOT_HEIGHT}px`;
    container.style.opacity = '1';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '-1';
    document.body.appendChild(container);
    return container;
};

const addMapContextLayers = (map, theme, contextData) => {
    if (!contextData?.features?.length) return;

    map.addSource('snapshot-context', {
        type: 'geojson',
        data: contextData
    });

    map.addLayer({
        id: 'snapshot-island-fill',
        type: 'fill',
        source: 'snapshot-context',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
            'fill-color': theme.mapLand,
            'fill-opacity': 1
        }
    });

    map.addLayer({
        id: 'snapshot-municipality-borders',
        type: 'line',
        source: 'snapshot-context',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
            'line-color': theme.mapBorder,
            'line-width': 1.1,
            'line-opacity': 0.8
        }
    });

    map.addLayer({
        id: 'snapshot-roads',
        type: 'line',
        source: 'snapshot-context',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
        paint: {
            'line-color': '#f8fafc',
            'line-width': 0.8,
            'line-opacity': 0.35
        }
    });
};

const addSnapshotDayLayers = ({ map, theme, startCoordinates, dayStopCoordinates, routeCoordinates }) => {
    if (routeCoordinates.length >= 2) {
        map.addSource('snapshot-day-route', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: routeCoordinates
                },
                properties: {}
            }
        });

        map.addLayer({
            id: 'snapshot-day-route-halo',
            type: 'line',
            source: 'snapshot-day-route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#ffffff',
                'line-width': 8,
                'line-opacity': 0.78
            }
        });

        map.addLayer({
            id: 'snapshot-day-route-line',
            type: 'line',
            source: 'snapshot-day-route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': theme.mapRoute,
                'line-width': 4,
                'line-opacity': 0.95
            }
        });
    }

    const dayPointsFeatures = [
        {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: startCoordinates
            },
            properties: {
                pointType: 'start'
            }
        },
        ...dayStopCoordinates.map((coordinates, index) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates
            },
            properties: {
                pointType: 'stop',
                order: index + 1
            }
        }))
    ];

    map.addSource('snapshot-day-points', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: dayPointsFeatures
        }
    });

    map.addLayer({
        id: 'snapshot-day-stops',
        type: 'circle',
        source: 'snapshot-day-points',
        filter: ['==', ['get', 'pointType'], 'stop'],
        paint: {
            'circle-radius': 5.5,
            'circle-color': '#2563eb',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 1
        }
    });

    map.addLayer({
        id: 'snapshot-day-hub-halo',
        type: 'circle',
        source: 'snapshot-day-points',
        filter: ['==', ['get', 'pointType'], 'start'],
        paint: {
            'circle-radius': 15,
            'circle-color': '#048aa1',
            'circle-opacity': 0.3
        }
    });

    map.addLayer({
        id: 'snapshot-day-hub',
        type: 'circle',
        source: 'snapshot-day-points',
        filter: ['==', ['get', 'pointType'], 'start'],
        paint: {
            'circle-radius': 7,
            'circle-color': '#ffffff',
            'circle-stroke-color': '#048aa1',
            'circle-stroke-width': 3
        }
    });
};

const fitSnapshotBounds = (map, startCoordinates, dayStopCoordinates, routeCoordinates) => {
    const allCoordinates = [startCoordinates, ...dayStopCoordinates, ...routeCoordinates].filter(isValidCoordinate);
    if (allCoordinates.length === 0) return;

    if (allCoordinates.length === 1) {
        map.jumpTo({
            center: allCoordinates[0],
            zoom: 12.5
        });
        return;
    }

    const bounds = new maplibregl.LngLatBounds(allCoordinates[0], allCoordinates[0]);
    allCoordinates.slice(1).forEach((coords) => bounds.extend(coords));
    map.fitBounds(bounds, {
        padding: { top: 58, right: 58, bottom: 58, left: 58 },
        duration: 0,
        maxZoom: 13.2
    });
};

const captureDaySnapshot = async ({ dayStopCoordinates, startCoordinates, routeCoordinates, contextData }) => {
    const theme = readMapTheme();
    const mapContainer = createHiddenMapContainer();
    let map = null;

    try {
        map = new maplibregl.Map({
            container: mapContainer,
            style: {
                version: 8,
                sources: {},
                layers: [
                    {
                        id: 'snapshot-background',
                        type: 'background',
                        paint: {
                            'background-color': theme.mapBg
                        }
                    }
                ]
            },
            center: startCoordinates,
            zoom: 10,
            attributionControl: false,
            preserveDrawingBuffer: true,
            interactive: false
        });

        await waitForMapLoad(map);
        addMapContextLayers(map, theme, contextData);
        addSnapshotDayLayers({
            map,
            theme,
            startCoordinates,
            dayStopCoordinates,
            routeCoordinates
        });
        fitSnapshotBounds(map, startCoordinates, dayStopCoordinates, routeCoordinates);
        await waitForMapIdle(map);

        return map.getCanvas().toDataURL('image/jpeg', SNAPSHOT_QUALITY);
    } finally {
        if (map) {
            map.remove();
        }
        if (mapContainer.parentNode) {
            mapContainer.parentNode.removeChild(mapContainer);
        }
    }
};

export const generateDayMapSnapshots = async ({
    activeHub,
    finalItinerary,
    dayMeta,
    mapFeatureData
} = {}) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return {};
    }

    const hubCoordinates = isValidCoordinate(activeHub?.coordinates) ? activeHub.coordinates : null;
    if (!hubCoordinates) {
        return {};
    }

    const itineraryDays = normalizeItineraryDays(finalItinerary);
    const dayMetaByDay = normalizeDayMeta(dayMeta);
    const dayNumbers = Object.keys(itineraryDays).sort((a, b) => Number(a) - Number(b));
    if (dayNumbers.length === 0) {
        return {};
    }

    const contextData = await loadContextData(mapFeatureData);
    const dayMapSnapshots = {};

    for (const dayNumber of dayNumbers) {
        const daySpotsRaw = Array.isArray(itineraryDays[dayNumber]) ? itineraryDays[dayNumber] : [];
        if (daySpotsRaw.length === 0) continue;

        const dayStopCoordinates = daySpotsRaw
            .map(getSpotCoordinates)
            .filter(isValidCoordinate);

        if (dayStopCoordinates.length === 0) continue;

        const dayMetaEntry = dayMetaByDay?.[dayNumber] || dayMetaByDay?.[Number(dayNumber)] || null;
        const dayStartCoordinates = resolveDayStartCoordinates({
            dayMetaEntry,
            hubCoordinates
        });
        if (!isValidCoordinate(dayStartCoordinates)) continue;

        const routeCoordinates = buildDayRouteCoordinates(dayStartCoordinates, dayStopCoordinates);

        try {
            const snapshotDataUrl = await captureDaySnapshot({
                dayStopCoordinates,
                startCoordinates: dayStartCoordinates,
                routeCoordinates,
                contextData
            });
            if (snapshotDataUrl) {
                dayMapSnapshots[String(dayNumber)] = snapshotDataUrl;
            }
        } catch (error) {
            console.warn(`Day ${dayNumber} map snapshot failed:`, error);
        }
    }

    return dayMapSnapshots;
};
