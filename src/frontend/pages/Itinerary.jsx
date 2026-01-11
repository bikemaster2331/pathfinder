import { useEffect, useState } from 'react';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import PreferenceCard from '../components/itineraryCard';
import MapBackground from '../components/map';
import { TRAVEL_HUBS } from '../constants/location'; 

export default function ItineraryPage() {

    const [allSpots, setAllSpots] = useState(null);
    const [addedSpots, setAddedSpots] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [activeHub, setActiveHub] = useState(null);
    const [budgetFilter, setBudgetFilter] = useState(['low', 'medium', 'high']);
    const [selectedActivities, setSelectedActivities] = useState({
        Accommodation: false, Dining: false, Sightseeing: false,
        Shopping: false, Swimming: false, Hiking: false, Photography: false
    });

    // --- 2. NEW HANDLER: Switch the Hub ---
    const handleHubChange = (hubName) => {
        if (!hubName || hubName === "NONE") {
            setActiveHub(null);
            return;
        }
    
        const newHub = TRAVEL_HUBS[hubName];
        if (newHub) {
                setActiveHub(newHub);
        }
    };

    const handleToggleLock = (spotName) => {
        setAddedSpots(prevSpots => prevSpots.map(spot => {
            if (spot.name === spotName) {
                return { ...spot, locked: !spot.locked }; // Toggle lock
            }
            return spot;
        }));
    };

    const handleMoveSpot = (index, direction) => {
        setAddedSpots(prev => {
            const newSpots = [...prev];
            const targetIndex = index + direction;

            // Boundary Check: prevent moving past start or end
            if (targetIndex < 0 || targetIndex >= newSpots.length) return prev;

            // Swap Logic
            const temp = newSpots[index];
            newSpots[index] = newSpots[targetIndex];
            newSpots[targetIndex] = temp;

            return newSpots;
        });
    };

    const handleAddSpot = (spot) => {
        if (!addedSpots.find(s => s.name === spot.name)) {
            setAddedSpots([...addedSpots, spot]);
        }
    };

    const handleRemoveSpot = (spotName) => {
        setAddedSpots(addedSpots.filter(s => s.name !== spotName));
    };

    useEffect(() => {
        fetch('/catanduanes_full.geojson')
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
                    setAddedSpots={setAddedSpots}
                    onAddSpot={handleAddSpot}
                    onRemoveSpot={handleRemoveSpot}
                    activeHubName={activeHub ? activeHub.name : ""} 
                    onHubChange={handleHubChange} 
                    onToggleLock={handleToggleLock}
                    onMoveSpot={handleMoveSpot}
                    onBudgetChange={setBudgetFilter}
                />
            </div>

            {/* COLUMN 2: The Visualization / Map */}
            <div className={styles.mapContainer}>
                <MapBackground 
                    selectedActivities={selectedActivities} 
                    mapData={allSpots}
                    onMarkerClick={setSelectedLocation} 
                    selectedHub={activeHub}
                    addedSpots={addedSpots}
                    budgetFilter={budgetFilter}
                />
            </div>
        </div>
    );
}