// Initialize the map
let map;
let markers = [];

function initMap() {
    // 1. Define the "Fence" (The corners of Catanduanes)
    // We define the Bottom-Left corner and the Top-Right corner
    var southWest = L.latLng(13.45, 124.0);
    var northEast = L.latLng(14.15, 124.5);
    var bounds = L.latLngBounds(southWest, northEast);

    // 2. Create the Map with Restrictions
    map = L.map('map', {
        center: [13.75, 124.22], // Center of Catanduanes
        zoom: 11,               // Starting zoom (closer in)
        minZoom: 11,            // Lock: Users cannot zoom out further than this
        maxBounds: bounds,      // Lock: Users cannot drag outside the fence
        maxBoundsViscosity: 1 // Makes the "fence" solid (no bouncing past it)
    });

    // 3. Add the Tiles (same as before)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    console.log("Map initialized and locked to Catanduanes!");
}

// Add markers to the map
function addMarkers(places) {
    clearMarkers();
    
    places.forEach(place => {
        const marker = L.marker([place.lat, place.lng]).addTo(map);
        
        // 🛡️ ESCAPE QUOTES: This fixes the bug with names like "Renel's"
        const safeName = place.name.replace(/'/g, "\\'"); 
        
        const PopContent = `
        <div style="font-family: Arial, sans-serif; text-align: center;">
                <h4 style="margin: 0; color: #2c5282;">${place.name}</h4>
                <p>Type: ${place.type}</p>
                <hr style="margin: 8px 0;">
                
                <button 
                    style="background-color: #033518ff; color: white; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer;"
                    onclick="addToItinerary('${safeName}')"
                >
                    Add to Trip
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

async function addToItinerary(placeName) {
    try {
        // 1. Send data to backend - FIXED ENDPOINT URL
        const response = await fetch("http://127.0.0.1:8000/itinerary_add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ place_name: placeName })
        });

        // 2. Handle success
        if (response.ok) {
            const data = await response.json();
            
            console.log(`[ITINERARY] Added ${placeName}. Total: ${data.total_items}`);

            // 🔥 Automatically refresh the list on the screen
            refreshItinerary();

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