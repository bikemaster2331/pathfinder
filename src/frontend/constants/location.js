export const TRAVEL_HUBS = {
    "NONE": {
        id: "NONE",
        name: "Select Starting Point", 
        coordinates: null, // Null is safe. Objects are not.
        zoom: 9.8,
        description: "Choose your base location to start planning your route."
    },
    "Virac": {
        name: "Virac",
        // MUST BE AN ARRAY: [Longitude, Latitude]
        coordinates: [124.23308476844431, 13.583020295430252], 
        description: "The capital hub. Busy, accessible, and central."
    },
    "San Andres": {
        name: "San Andres",
        // MUST BE AN ARRAY: [Longitude, Latitude]
        coordinates: [124.09696326202368, 13.597830446586263],
        description: "The gateway to the north. Scenic and coastal."
    }
};