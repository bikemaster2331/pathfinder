import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '../store/mapStore';
import { addMaskAndOverlay } from './mapHelpers';
import StyleLayerControl from './StyleLayerControl';
import * as poiService from '../services/poiService';
import styles from '../styles/MapBoard.module.css';

export default function MapBoard() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const initialPosition = useRef(null);
  const currentMunicipalityData = useRef(null);
  const { viewport, setViewport } = useMapStore();
  const overlayReady = useRef(false);
  const currentStyle = useRef('default');
  const ignoreMunicipalityClick = useRef(false);
  // eslint-disable-next-line no-unused-vars
  const [selectedMunicipality, setSelectedMunicipality] = useState(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const longitudePadding = 2.0;
    const latitudePadding = 1.0;
    const provinceLongitudePadding = 0.22;
    const provinceLatitudePadding = 0.35;
    const maxBounds = [
      [viewport.longitude - longitudePadding, viewport.latitude - latitudePadding],
      [viewport.longitude + longitudePadding, viewport.latitude + latitudePadding],
    ];

    // Adjust zoom for mobile devices - zoom out more on mobile
    const isMobile = window.innerWidth <= 768;
    const zoomLevel = isMobile ? 7.5 : 9;

    initialPosition.current = {
      center: [viewport.longitude, viewport.latitude],
      zoom: zoomLevel,
      bearing: 0,
      pitch: 0
    };

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://api.maptiler.com/maps/dataviz/style.json?key=wmOESkw5rZIYiq12dSvF',
      center: [viewport.longitude, viewport.latitude],
      zoom: zoomLevel,
      maxBounds: maxBounds,
      maxZoom: 18,
      minZoom: 7,
      attributionControl: false,
      preserveDrawingBuffer: false,
      refreshExpiredTiles: false,
    });

    // Update map padding - no sidebar, so center the map
    const updateMapPadding = () => {
      if (!map.current || !mapContainer.current) return;
      try {
        map.current.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        map.current.resize();
      } catch (err) {
        console.warn('Failed to update map padding', err);
      }
    };

    map.current.on('load', updateMapPadding);
    window.addEventListener('resize', updateMapPadding);

    // Hide the map container until overlay is ready
    if (mapContainer.current) {
      mapContainer.current.style.visibility = 'visible';
    }

    // Use styledata event to ensure mask and overlay are added before map is shown
    map.current.on('styledata', () => {
      if (overlayReady.current) return;
      // Reuse the addMaskAndOverlay helper and wait for it to finish
      addMaskAndOverlay(
        map.current,
        viewport,
        provinceLongitudePadding,
        provinceLatitudePadding,
        'default'
      ).then(() => {
        overlayReady.current = true;
        if (mapContainer.current) {
          // After overlay is visible, ensure padding accounts for the sidebar
          updateMapPadding();
        }
      })
      .catch((err) => {
        console.warn('addMaskAndOverlay error:', err);
        overlayReady.current = true;
      });
    });

    map.current.on('error', (e) => {
      console.error('Map error:', e);
    });

    // Listen for style changes to update current style
    map.current.on('styledata', () => {
      const style = map.current.getStyle();
      if (style.name && style.name.includes('Hybrid')) {
        currentStyle.current = 'satellite';
      } else {
        currentStyle.current = 'default';
      }
      
      // Load and add custom POI icon and sources
      const loadCustomPOI = () => {
        // Load icon first
        if (!map.current.hasImage('custom-poi-icon')) {
          const img = new Image();
          img.onload = () => {
            if (map.current && !map.current.hasImage('custom-poi-icon')) {
              map.current.addImage('custom-poi-icon', img);
            }
            // Add source and layers after icon is loaded
            addCustomPOILayers();
          };
          img.src = '/assets/beach_poi.svg';
        } else {
          addCustomPOILayers();
        }
      };

      const addCustomPOILayers = () => {
        // Add custom POI source with empty data initially
        if (!map.current.getSource('custom-poi')) {
          map.current.addSource('custom-poi', {
            type: 'geojson',
            data: { "type": "FeatureCollection", "features": [] }
          });

          // Add individual POI marker layer
          map.current.addLayer({
            id: 'custom-poi-markers',
            type: 'symbol',
            source: 'custom-poi',
            layout: {
              'icon-image': 'custom-poi-icon',
              'icon-size': 0.1,
              'icon-anchor': 'bottom',
              'icon-allow-overlap': true,
              'text-field': ['get', 'name'],
              'text-size': 12,
              'text-offset': [1.5, -1.5],
              'text-anchor': 'left',
              'text-max-width': 15,
              'text-allow-overlap': false,
              'visibility': 'none'
            },
            paint: {
              'icon-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 1],
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 1],
              'text-color': '#fff',
              'text-halo-color': '#000',
              'text-halo-width': 1.5
            }
          });
          
          // Show popup on click for individual markers
          map.current.on('click', 'custom-poi-markers', (e) => {
            e.originalEvent.stopPropagation();
            ignoreMunicipalityClick.current = true;
            setTimeout(() => { ignoreMunicipalityClick.current = false; }, 500);
            const coordinates = e.features[0].geometry.coordinates.slice();
            const properties = e.features[0].properties;
            
            new maplibregl.Popup()
              .setLngLat(coordinates)
              .setHTML(`
                <div style="font-weight: bold; margin-bottom: 4px;">${properties.name}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${properties.type}</div>
                <div style="font-size: 12px;">${properties.description}</div>
              `)
              .addTo(map.current);
          });
          
          // Change cursor on hover for markers
          map.current.on('mouseenter', 'custom-poi-markers', () => {
            map.current.getCanvas().style.cursor = 'pointer';
          });
          
          map.current.on('mouseleave', 'custom-poi-markers', () => {
            map.current.getCanvas().style.cursor = '';
          });
        }
      };

      // Load custom POI
      loadCustomPOI();
    });

    // Handle municipality click for highlighting (only on default layer)
    map.current.on('click', 'catanduanes-fill', (e) => {
      if (currentStyle.current !== 'default') return;
      
      if (e.features.length > 0) {
        const municipalityName = e.features[0].properties.MUNICIPALI;
        setSelectedMunicipality(municipalityName);

        // Emit event for RightSidebar
        window.dispatchEvent(
          new CustomEvent('municipalitySelected', { detail: municipalityName })
        );
        
        // Update the outline layer: only selected municipality borders turn white
        map.current.setPaintProperty(
          'catanduanes-outline',
          'line-color',
          [
            'case',
            ['==', ['get', 'MUNICIPALI'], municipalityName],
            '#ffffff',
            '#333'
          ]
        );
        
        // Increase line width for selected municipality only
        map.current.setPaintProperty(
          'catanduanes-outline',
          'line-width',
          [
            'case',
            ['==', ['get', 'MUNICIPALI'], municipalityName],
            3,
            1.5
          ]
        );
        
        // Increase fill opacity for the selected municipality
        map.current.setPaintProperty(
          'catanduanes-fill',
          'fill-opacity',
          [
            'case',
            ['==', ['get', 'MUNICIPALI'], municipalityName],
            1,
            0.6
          ]
        );
        
        // Create a temporary layer above the current outline to ensure selected municipality borders render on top
        if (map.current.getLayer('catanduanes-outline-selected')) {
          map.current.removeLayer('catanduanes-outline-selected');
        }
        
        map.current.addLayer({
          id: 'catanduanes-outline-selected',
          type: 'line',
          source: 'catanduanes',
          filter: ['==', ['get', 'MUNICIPALI'], municipalityName],
          paint: {
            'line-color': '#ffffff',
            'line-width': 3
          }
        });
        
        // Load municipality-specific POI data
        const municipalitiesWithPOI = ['BARAS', 'BAGAMANOC', 'BATO', 'CARAMORAN', 'GIGMOTO', 'PANDAN', 'SAN ANDRES', 'SAN MIGUEL', 'VIGA', 'VIRAC', 'PANGANIBAN'];
        
        if (municipalitiesWithPOI.includes(municipalityName)) {
          const poiFileName = municipalityName.replace(' ', '_');
          fetch(`/data/${poiFileName}.geojson`)
            .then(response => response.json())
            .then(data => {
              // Store municipality data for category filtering
              currentMunicipalityData.current = data;
              
              if (map.current && map.current.getSource('custom-poi')) {
                // Update source with new municipality data
                map.current.getSource('custom-poi').setData(data);
                
                // Show POIs with popup animation
                if (map.current.getLayer('custom-poi-markers')) {
                  // Start with zero opacity
                  map.current.setPaintProperty('custom-poi-markers', 'icon-opacity', 0);
                  map.current.setPaintProperty('custom-poi-markers', 'text-opacity', 0);
                  map.current.setLayoutProperty('custom-poi-markers', 'visibility', 'visible');
                  map.current.moveLayer('custom-poi-markers');
                  
                  // Animate popup: scale and fade in over 600ms
                  let progress = 0;
                  const animationDuration = 600;
                  const startTime = Date.now();
                  
                  const animate = () => {
                    const elapsed = Date.now() - startTime;
                    progress = Math.min(elapsed / animationDuration, 1);

                    // Simplified easing for better performance
                    const easeOut = progress;

                    // Update opacity
                    map.current.setPaintProperty('custom-poi-markers', 'icon-opacity', easeOut);
                    map.current.setPaintProperty('custom-poi-markers', 'text-opacity', easeOut);

                    if (progress < 1) {
                      requestAnimationFrame(animate);
                    }
                  };
                  
                  animate();
                }
              }
            })
            .catch(err => console.error(`Failed to load POI data for ${municipalityName}:`, err));
        } else {
          // Hide POI for municipalities without POI data
          if (map.current.getLayer('custom-poi-markers')) {
            map.current.setLayoutProperty('custom-poi-markers', 'visibility', 'none');
          }
        }
        
        // Get all features of the clicked municipality to calculate proper bounds
        const allMunicipalityFeatures = map.current.querySourceFeatures('catanduanes', {
          filter: ['==', ['get', 'MUNICIPALI'], municipalityName]
        });
        
        // Calculate bounding box that includes ALL parts of the municipality
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        
        allMunicipalityFeatures.forEach(feature => {
          const geometry = feature.geometry;
          let allCoords = [];
          
          if (geometry.type === 'Polygon') {
            allCoords = geometry.coordinates[0];
          } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(polygon => {
              allCoords = allCoords.concat(polygon[0]);
            });
          }
          
          allCoords.forEach(coord => {
            minLng = Math.min(minLng, coord[0]);
            maxLng = Math.max(maxLng, coord[0]);
            minLat = Math.min(minLat, coord[1]);
            maxLat = Math.max(maxLat, coord[1]);
          });
        });
        
        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;
        
        // Adjust zoom level based on municipality
        // Caramoran has islets so it needs lower zoom to show the entire municipality as a whole
        let zoomLevel = 10.5;
        if (municipalityName === 'CARAMORAN') {
          zoomLevel = 10;
        }
        
        // Animate camera: zoom in and tilt 45 degrees
        map.current.flyTo({
          center: [centerLng, centerLat],
          zoom: zoomLevel,
          pitch: 60,
          bearing: 0,
          duration: 1500
        });
      }
    });

    // Change cursor to pointer when hovering over municipalities (only on default layer)
    map.current.on('mouseenter', 'catanduanes-fill', () => {
      if (currentStyle.current === 'default') {
        map.current.getCanvas().style.cursor = 'pointer';
      }
    });

    map.current.on('mouseleave', 'catanduanes-fill', () => {
      map.current.getCanvas().style.cursor = '';
    });

    // Reset highlighting when clicking on map canvas (not on a municipality)
    map.current.on('click', () => {
      const features = map.current.queryRenderedFeatures({ layers: ['catanduanes-fill'] });
      if (features.length === 0 && currentStyle.current === 'default') {
        // Reset all styling to default
        map.current.setPaintProperty(
          'catanduanes-outline',
          'line-color',
          '#333'
        );
        map.current.setPaintProperty(
          'catanduanes-outline',
          'line-width',
          1.5
        );
        map.current.setPaintProperty(
          'catanduanes-fill',
          'fill-opacity',
          0.6
        );
        // Remove the temporary selected outline layer
        if (map.current.getLayer('catanduanes-outline-selected')) {
          map.current.removeLayer('catanduanes-outline-selected');
        }
        // Reset camera to initial position
        if (initialPosition.current) {
          map.current.flyTo({
            center: initialPosition.current.center,
            zoom: initialPosition.current.zoom,
            pitch: initialPosition.current.pitch,
            bearing: initialPosition.current.bearing,
            duration: 1500
          });
        }
        setSelectedMunicipality(null);
      }
    });

    const navigationControl = new maplibregl.NavigationControl({
      showCompass: false,
      showZoom: true
    });
    map.current.addControl(navigationControl, 'top-right');

    // Custom Reset Camera Button
    class ResetPositionControl {
      onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this._button = document.createElement('button');
        this._button.className = 'maplibregl-ctrl-icon';
        this._button.type = 'button';
        this._button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: auto;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
        this._button.title = 'Back to starting position';
        this._button.style.cssText = 'width: 29px; height: 29px; display: flex; align-items: center; justify-content: center; cursor: pointer; background-color: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 0; z-index: 10; position: relative;';
        this._button.onclick = () => {
          if (initialPosition.current) {
            // Reset municipality styling
            if (this._map.getLayer('catanduanes-outline')) {
              this._map.setPaintProperty('catanduanes-outline', 'line-color', '#333');
              this._map.setPaintProperty('catanduanes-outline', 'line-width', 1.5);
            }
            if (this._map.getLayer('catanduanes-fill')) {
              this._map.setPaintProperty('catanduanes-fill', 'fill-opacity', 0.6);
            }
            if (this._map.getLayer('catanduanes-outline-selected')) {
              this._map.removeLayer('catanduanes-outline-selected');
            }
            
            // Hide POI markers with fade-out
            if (this._map.getLayer('custom-poi-markers')) {
              let opacity = 1;
              const fadeOutInterval = setInterval(() => {
                opacity -= 0.1;
                if (opacity <= 0) {
                  opacity = 0;
                  clearInterval(fadeOutInterval);
                  this._map.setLayoutProperty('custom-poi-markers', 'visibility', 'none');
                }
                this._map.setPaintProperty('custom-poi-markers', 'icon-opacity', opacity);
                this._map.setPaintProperty('custom-poi-markers', 'text-opacity', opacity);
              }, 30);
            }
            
            // Reset selected municipality state
            setSelectedMunicipality(null);
            
            // Fly to initial position
            this._map.flyTo({
              center: initialPosition.current.center,
              zoom: initialPosition.current.zoom,
              bearing: initialPosition.current.bearing,
              pitch: initialPosition.current.pitch,
              duration: 1000
            });
          }
        };
        this._container.appendChild(this._button);
        return this._container;
      }

      onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }

    // Custom Style Layer Button (below reset camera)

    

    // Add both controls to the top-right, style layer below reset
    map.current.addControl(new ResetPositionControl(), 'top-right');
    map.current.addControl(new StyleLayerControl(), 'top-right');

    map.current.on('move', () => {
      const center = map.current.getCenter();
      const zoom = map.current.getZoom();
      setViewport({
        latitude: center.lat,
        longitude: center.lng,
        zoom: zoom,
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      // cleanup resize listener
      window.removeEventListener('resize', updateMapPadding);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle category selection from sidebar
  useEffect(() => {
    const handleCategorySelected = (event) => {
      const categoryId = event.detail;
      
      // Only filter if we have municipality data
      if (!currentMunicipalityData.current || !map.current) {
        return;
      }
      
      // Filter POIs by selected category
      const filteredPOIs = poiService.getPOIsByCategory(currentMunicipalityData.current, categoryId);
      
      // Create filtered GeoJSON feature collection
      const filteredGeoJSON = {
        type: 'FeatureCollection',
        features: filteredPOIs
      };
      
      // Update map source with filtered POIs
      if (map.current.getSource('custom-poi')) {
        map.current.getSource('custom-poi').setData(filteredGeoJSON);
      }
    };
    
    window.addEventListener('categorySelected', handleCategorySelected);
    
    return () => {
      window.removeEventListener('categorySelected', handleCategorySelected);
    };
  }, []);

  return (
    <div className={styles.mapBoard}>
      <div ref={mapContainer} className={styles.mapContainer} />
      <div className={styles.overlayRectangle} />
    </div>
  );
}