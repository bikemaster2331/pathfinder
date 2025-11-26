// Initialize the map
let map;
let markers = [];

function initMap() {
    // Create map centered on Catanduanes
    map = L.map('map').setView([13.7, 124.2], 10);
    
    // Add tile layer (the actual map images)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    console.log("Map initialized!");
}

// Add markers to the map
function addMarkers(places) {
    // Clear old markers first
    clearMarkers();
    
    // Add new markers
    places.forEach(place => {
        const marker = L.marker([place.lat, place.lng]).addTo(map);
        
        // Add popup with place info
        marker.bindPopup(`
            <b>${place.name}</b><br>
            Type: ${place.type}
        `);
        
        markers.push(marker);
    });
    
    // Zoom to fit all markers
    if (places.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Clear all markers
function clearMarkers() {
    markers.forEach(marker => marker.remove());
    markers = [];
}

// Initialize map when page loads
initMap();