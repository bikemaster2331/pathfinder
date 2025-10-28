// Helper functions for map overlays and masks
export function createMaskGeoJSON(viewport, provinceLongitudePadding, provinceLatitudePadding, showCutout = false) {
  const worldBounds = [
    [-180, -90],
    [180, -90],
    [180, 90],
    [-180, 90],
    [-180, -90]
  ];
  if (showCutout) {
    const provinceBounds = [
      [viewport.longitude - provinceLongitudePadding, viewport.latitude - provinceLatitudePadding],
      [viewport.longitude + provinceLongitudePadding, viewport.latitude - provinceLatitudePadding],
      [viewport.longitude + provinceLongitudePadding, viewport.latitude + provinceLatitudePadding],
      [viewport.longitude - provinceLongitudePadding, viewport.latitude + provinceLatitudePadding],
      [viewport.longitude - provinceLongitudePadding, viewport.latitude - provinceLatitudePadding]
    ];
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [worldBounds, provinceBounds]
      }
    };
  }
  // Default: filled mask (no cutout) so the overlay added on top remains visible
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [worldBounds]
    }
  };
}

export function addMaskAndOverlay(map, viewport, provinceLongitudePadding, provinceLatitudePadding, styleType = 'default') {
  return new Promise((resolve) => {
    // Only add mask if styleType is 'default', otherwise remove it
    if (styleType === 'default') {
      const maskGeoJSON = createMaskGeoJSON(viewport, provinceLongitudePadding, provinceLatitudePadding);
      if (!map.getSource('world-mask')) {
        map.addSource('world-mask', {
          type: 'geojson',
          data: maskGeoJSON
        });
        map.addLayer({
          id: 'world-mask-layer',
          type: 'fill',
          source: 'world-mask',
          paint: {
            'fill-color': '#000000',
            'fill-opacity': 1
          }
        });
      }
    } else {
      // Remove mask if present
      if (map.getLayer('world-mask-layer')) {
        map.removeLayer('world-mask-layer');
      }
      if (map.getSource('world-mask')) {
        map.removeSource('world-mask');
      }
    }

    // Only add thematic overlay if styleType is 'default'
    if (styleType === 'default') {
      if (!map.getSource('catanduanes')) {
        fetch('/data/CATANDUANES.geojson')
          .then((res) => res.json())
          .then((geojson) => {
            map.addSource('catanduanes', {
              type: 'geojson',
              data: geojson
            });
            const muniColors = [
              '#482edbff', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
            ];
            map.addLayer({
              id: 'catanduanes-fill',
              type: 'fill',
              source: 'catanduanes',
              paint: {
                'fill-color': [
                  'match',
                  ['get', 'MUNICIPALI'],
                  'SAN ANDRES', muniColors[0],
                  'VIRAC', muniColors[1],
                  'SAN MIGUEL', muniColors[2],
                  'BARAS', muniColors[3],
                  'BAGAMANOC', muniColors[4],
                  'BATO', muniColors[5],
                  'CARAMORAN', muniColors[6],
                  'GIGMOTO', muniColors[7],
                  'PANDAN', muniColors[8],
                  'PANGANIBAN', muniColors[9],
                  'VIGA', muniColors[10],
                  /* other */ '#cccccc'
                ],
                'fill-opacity': 0.6
              }
            });
            map.addLayer({
              id: 'catanduanes-outline',
              type: 'line',
              source: 'catanduanes',
              paint: {
                'line-color': '#ffffff',
                'line-width': 1.5
              }
            });
            resolve();
          })
          .catch(() => {
            // If fetch fails still resolve so map becomes visible
            resolve();
          });
      } else {
        resolve();
      }
    } else {
      resolve();
    }
  });
}
