import PathFinder from 'geojson-path-finder';
import * as turf from '@turf/turf';
import roadData from '../data/catanduanes_optimized.json';

let pathFinder = null;
let graphVertices = null; // Store valid nodes here

const initGraph = () => {
    if (pathFinder) return;
    
    // 1. Flatten Data
    const flattenedData = turf.flatten(roadData);
    const linesOnly = {
        type: "FeatureCollection",
        features: flattenedData.features.filter(f => f.geometry.type === 'LineString')
    };

    // 2. Build the Router
    console.time('GraphBuild');
    pathFinder = new PathFinder(linesOnly, {
        precision: 1e-3, // Keep the "Glue" precision
        weightFn: (a, b) => {
            const dx = a[0] - b[0];
            const dy = a[1] - b[1];
            return Math.sqrt(dx * dx + dy * dy);
        }
    });

    const nodes = [];
    linesOnly.features.forEach(f => {
        // Add the start and end of every segment
        const coords = f.geometry.coordinates;
        nodes.push(turf.point(coords[0])); 
        nodes.push(turf.point(coords[coords.length - 1]));
    });
    graphVertices = turf.featureCollection(nodes);
    
    console.timeEnd('GraphBuild');
};

export const getVisualRoute = (startCoords, endCoords) => {
    initGraph();

    const startPoint = turf.point(startCoords);
    const endPoint = turf.point(endCoords);

    // FIX: Snap to the NEAREST VERTEX (Node), not the nearest line.
    // This ensures the router actually recognizes the start point.
    const snappedStart = turf.nearestPoint(startPoint, graphVertices);
    const snappedEnd = turf.nearestPoint(endPoint, graphVertices);

    // Run Dijkstra
    const path = pathFinder.findPath(snappedStart, snappedEnd);

    // Fallback if still no path
    if (!path) {
        console.warn("No path found between", snappedStart, snappedEnd);
        return {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [startCoords, endCoords]
            }
        };
    }

    return {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: path.path
        }
    };
};