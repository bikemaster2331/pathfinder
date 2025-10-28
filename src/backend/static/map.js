// Initialize the map
let map;
let markers = [];

function initMap() {
    // 1. Define the "Fence" (The corners of Catanduanes)
    var southWest = L.latLng(13.45, 124.0);
    var northEast = L.latLng(14.15, 124.5);
    var bounds = L.latLngBounds(southWest, northEast);

    // 2. Create the Map with Restrictions
    map = L.map('map', {
        center: [13.75, 124.22],
        zoom: 11,
        minZoom: 11,
        maxBounds: bounds,
        maxBoundsViscosity: 1
    });

    // 3. Add the Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    console.log("Map initialized and locked to Catanduanes!");
}

// Update map with places from chat response
function updateMapWithPlaces(places) {
    addMarkers(places);
}

// Add markers to the map
function addMarkers(places) {
    clearMarkers();
    
    places.forEach(place => {
        const marker = L.marker([place.lat, place.lng]).addTo(map);
        
        const safeName = place.name.replace(/'/g, "\\'");
        
        const PopContent = `
            <div style="font-family: Arial, sans-serif; text-align: center;">
                <h4 style="margin: 0; color: #2c5282;">${place.name}</h4>
                <p style="color: #666; font-size: 12px;">Type: ${place.type}</p>
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">
                <button 
                    style="background-color: #28a745; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;"
                    onclick="addToItineraryFromMap('${safeName}')"
                    onmouseover="this.style.backgroundColor='#218838'"
                    onmouseout="this.style.backgroundColor='#28a745'"
                >
                    📍 Add to Trip
                </button>
            </div>
        `;
        marker.bindPopup(PopContent);
        markers.push(marker);
    });
    
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

// Add to itinerary from map popup
async function addToItineraryFromMap(placeName) {
    try {
        const response = await fetch("http://127.0.0.1:8000/itinerary_add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ place_name: placeName })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[ITINERARY] Added ${placeName}. Total: ${data.total_items}`);
            
            // Refresh the itinerary list
            loadItinerary();
            
        } else {
            console.error("Server error:", response.status);
            alert("Failed to add to itinerary.");
        }

    } catch (error) {
        console.error("Connection failed:", error);
        alert("Could not connect to Pathfinder.");
    }
}

// Initialize map when page loads
initMap();