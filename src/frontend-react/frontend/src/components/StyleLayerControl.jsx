import { addMaskAndOverlay } from './mapHelpers';

export default class StyleLayerControl {
  constructor() {
    this._expanded = false;
    this._currentStyle = 'default';
    this._defaultStyle = 'https://api.maptiler.com/maps/dataviz/style.json?key=wmOESkw5rZIYiq12dSvF';
    this._satelliteStyle = 'https://api.maptiler.com/maps/hybrid/style.json?key=wmOESkw5rZIYiq12dSvF';
    this._provinceLongitudePadding = 0.22;
    this._provinceLatitudePadding = 0.35;
    this._isTransitioning = false;
  }

  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this._container.style.position = 'relative';
    this._button = document.createElement('button');
    this._button.className = 'maplibregl-ctrl-icon';
    this._button.type = 'button';
    this._button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 7v5l4 2"></path>
      </svg>
    `;
    this._button.title = 'Select map style';
    this._button.style.cssText = 'width: 29px; height: 29px; display: flex; align-items: center; justify-content: center; cursor: pointer; background-color: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 0; margin-top: 8px; z-index: 10; position: relative;';
    this._button.onclick = () => {
      this._expanded = !this._expanded;
      this._updateMenu();
    };
    this._container.appendChild(this._button);

    // Create the expanding menu
    this._menu = document.createElement('div');
    this._menu.style.position = 'absolute';
    this._menu.style.top = '37px';
    this._menu.style.right = '0';
    this._menu.style.display = 'none';
    this._menu.style.flexDirection = 'column';
    this._menu.style.gap = '4px';
    this._menu.style.zIndex = '10';
    this._menu.style.backgroundColor = '#fff';
    this._menu.style.border = '1px solid #ccc';
    this._menu.style.borderRadius = '4px';
    this._menu.style.padding = '4px';
    this._menu.style.minWidth = '150px';

    // Tourism style option (formerly "Default")
    this._defaultBtn = document.createElement('button');
    this._defaultBtn.type = 'button';
    this._defaultBtn.innerHTML = '<span style="display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><path d="M12 3v6m0 6v6M3 12h6m6 0h6"></path></svg>Tourism</span>';
    this._defaultBtn.style.cssText = 'background: #fff; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-size: 14px; display: flex; align-items: center; text-align: left; color: #333; transition: background 0.2s;';
    this._defaultBtn.onmouseenter = () => this._defaultBtn.style.backgroundColor = '#f0f0f0';
    this._defaultBtn.onmouseleave = () => this._defaultBtn.style.backgroundColor = '#fff';
    this._defaultBtn.onclick = () => {
      if (this._currentStyle !== 'default' && !this._isTransitioning) {
        this._isTransitioning = true;
        this._fadeOutAndSwitchStyle(this._defaultStyle, 'default');
      }
      this._expanded = false;
      this._updateMenu();
    };

    // Satellite style option
    this._satelliteBtn = document.createElement('button');
    this._satelliteBtn.type = 'button';
    this._satelliteBtn.innerHTML = '<span style="display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>Satellite</span>';
    this._satelliteBtn.style.cssText = 'background: #fff; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-size: 14px; display: flex; align-items: center; text-align: left; color: #333; transition: background 0.2s;';
    this._satelliteBtn.onmouseenter = () => this._satelliteBtn.style.backgroundColor = '#f0f0f0';
    this._satelliteBtn.onmouseleave = () => this._satelliteBtn.style.backgroundColor = '#fff';
    this._satelliteBtn.onclick = () => {
      if (this._currentStyle !== 'satellite' && !this._isTransitioning) {
        this._isTransitioning = true;
        this._fadeOutAndSwitchStyle(this._satelliteStyle, 'satellite');
      }
      this._expanded = false;
      this._updateMenu();
    };

    this._menu.appendChild(this._defaultBtn);
    this._menu.appendChild(this._satelliteBtn);
    this._container.appendChild(this._menu);

    // Hide menu when clicking outside
    setTimeout(() => {
      window.addEventListener('click', this._handleWindowClick);
    }, 0);

    // Listen for style changes to re-add overlays
    this._map.on('styledata', () => {
      // Use current viewport from map
      const center = this._map.getCenter();
      const viewport = {
        longitude: center.lng,
        latitude: center.lat
      };
      addMaskAndOverlay(
        this._map,
        viewport,
        this._provinceLongitudePadding,
        this._provinceLatitudePadding,
        this._currentStyle // pass current style type
      );
    });

    return this._container;
  }

  _updateMenu() {
    this._menu.style.display = this._expanded ? 'flex' : 'none';
  }

  _fadeOutAndSwitchStyle(newStyle, styleName) {
    const mapContainer = this._map.getContainer();
    mapContainer.style.opacity = '1';
    mapContainer.style.transition = 'opacity 0.3s ease-out';
    
    // Fade out
    mapContainer.style.opacity = '0';
    
    setTimeout(() => {
      // Switch style while faded out
      this._map.setStyle(newStyle);
      this._currentStyle = styleName;
      
      // Fade in
      mapContainer.style.opacity = '1';
      mapContainer.style.transition = 'opacity 0.3s ease-in';
      
      setTimeout(() => {
        mapContainer.style.transition = '';
        this._isTransitioning = false;
      }, 300);
    }, 300);
  }

  _handleWindowClick = (e) => {
    if (!this._container.contains(e.target)) {
      this._expanded = false;
      this._updateMenu();
    }
  };

  onRemove() {
    window.removeEventListener('click', this._handleWindowClick);
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
}
