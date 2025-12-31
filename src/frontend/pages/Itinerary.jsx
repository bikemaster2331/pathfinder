import { useEffect, useState } from 'react';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import PreferenceCard from '../components/itineraryCard';
import MapBackground from '../components/map';

export default function ItineraryPage() {
    const [selectedActivities, setSelectedActivities] = useState({
        Swimming: false,
        Hiking: false,
        Dining: false,
        Sightseeing: false,
        Photography: false,
        Shopping: false,
        Accommodation: false
    });

    useEffect(() => {
        fetch('/catanduanes_full.geojson')
            .then(res => res.json())
            .then(data => {
                setAllSpots(data);
            })
            .catch(err => console.error("Error loading data:", err));
    }, []);
    
    return (
        <div className={styles.itineraryContainer}>
            <MapBackground selectedActivities={selectedActivities}
            allSpots={allSpots} />
            <PreferenceCard 
                selectedActivities={selectedActivities}
                setSelectedActivities={setSelectedActivities}
                allSpots={allSpots}
            />
        </div>
    );
}