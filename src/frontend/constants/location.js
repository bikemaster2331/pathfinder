export const TRAVEL_HUBS = {
    "NONE": {
        id: "NONE", // ID matches the dropdown value
        name: "Select Starting Point", 
        // Coordinates for the center of Catanduanes (matches your Initial View)
        coordinates: { lat: 13.81, lng: 124.09 }, 
        zoom: 9.8,
        description: "Choose your base location to start planning your route."
    },
    "Virac": {
        name: "Virac",
        // Catanduanes World War II Memorial Fountain
        coordinates: { lat: 13.583020295430252, lng: 124.23308476844431 },
        description: "The capital hub. Busy, accessible, and central."
    },
    "San Andres": {
        name: "San Andres",
        // San Andres Tourist Information & Assistance Center
        coordinates: { lat: 13.597830446586263, lng: 124.09696326202368 },
        description: "The gateway to the north. Scenic and coastal."
    }
};