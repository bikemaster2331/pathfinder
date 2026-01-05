import { useEffect, useState } from 'react';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import PreferenceCard from '../components/itineraryCard';
import MapBackground from '../components/map';

export default function ItineraryPage() {

    const [allSpots, setAllSpots] = useState(null);
    const [addedSpots, setAddedSpots] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [selectedActivities, setSelectedActivities] = useState({
        Accommodation: false, Dining: false, Sightseeing: false,
        Shopping: false, Swimming: false, Hiking: false, Photography: false
    });
    const handleAddSpot = (spot) => {
        if (!addedSpots.find(s => s.name === spot.name)) {
            setAddedSpots([...addedSpots, spot]);
        }
    };
    const handleRemoveSpot = (spotName) => {
        setAddedSpots(addedSpots.filter(s => s.name !== spotName));
    };
    useEffect(() => {
        fetch('/test_map.geojson')
            .then(res => res.json())
            .then(data => setAllSpots(data))
            .catch(err => console.error("Error loading data:", err));
    }, []);
    return (
        <div className={styles.itineraryContainer}>
            {/* COLUMN 1: The Logic / Itinerary */}
            <div className={styles.preferenceCardContainer}>
                <PreferenceCard 
                    selectedActivities={selectedActivities}
                    setSelectedActivities={setSelectedActivities}
                    selectedLocation={selectedLocation}
                    setSelectedLocation={setSelectedLocation}
                    addedSpots={addedSpots}
                    onAddSpot={handleAddSpot}
                    onRemoveSpot={handleRemoveSpot}
                />
            </div>

            {/* COLUMN 2: The Visualization / Map */}
            <div className={styles.mapContainer}>
                <MapBackground 
                    selectedActivities={selectedActivities} 
                    mapData={allSpots}
                    onMarkerClick={setSelectedLocation} 
                />
            </div>
        </div>
    );
}