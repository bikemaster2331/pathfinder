import { useEffect, useState, useRef } from 'react';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import PreferenceCard from '../components/itineraryCard';
import MapWrapper from '../components/MapWrapper';
import FloatingToolbar from '../components/toolbar';
import { TRAVEL_HUBS } from '../constants/location'; 

// --- CONFIGURATION ---
const BUDGET_CONFIG = {
    1: { filterValues: ["low"] },
    2: { filterValues: ["low", "medium"] },
    3: { filterValues: ["low", "medium", "high"] }
};

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
    
    // New states for MapWrapper
    const [budget, setBudget] = useState(50);
    const [destination, setDestination] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const mapRef = useRef(null);

    const handleHubChange = (hubName) => {
        if (!hubName || hubName === "NONE") {
            setActiveHub(null);
            setDestination('');
            return;
        }
        const newHub = TRAVEL_HUBS[hubName];
        if (newHub) {
            setActiveHub(newHub);
            setDestination(hubName);
        }
    };

    const handleToggleLock = (spotName) => {
        setAddedSpots(prevSpots => prevSpots.map(spot => {
            if (spot.name === spotName) {
                return { ...spot, locked: !spot.locked };
            }
            return spot;
        }));
    };

    const handleMoveSpot = (index, direction) => {
        setAddedSpots(prev => {
            const newSpots = [...prev];
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= newSpots.length) return prev;
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

    const handleChatbotLocation = (locations) => {
        console.log('Chatbot returned locations:', locations);
        
        if (mapRef.current) {
            mapRef.current.handleChatbotLocations(locations);
        }
    };

    const getBudgetStep = (value) => {
        if (value <= 33) return 1;
        if (value <= 66) return 2;
        return 3;
    };

    // Budget effect
    useEffect(() => {
        const step = getBudgetStep(budget);
        setBudgetFilter(BUDGET_CONFIG[step].filterValues);
    }, [budget]);

    // Sync destination with activeHub
    useEffect(() => {
        setDestination(activeHub ? activeHub.name : '');
    }, [activeHub]);

    useEffect(() => {
        fetch('/catanduanes_datafile.geojson')
            .then(res => res.json())
            .then(data => setAllSpots(data))
            .catch(err => console.error("Error loading data:", err));
    }, []);

    return (
        <div className={styles.itineraryContainer}>
            {/* <header className={styles.titleHeader}>
                <div className={styles.headerDot}></div>
                <h1>Tan-aw</h1>
            </header> */}
            <FloatingToolbar />
            {/* Map Container with Controls */}
            <div className={styles.mapArea}>
                <MapWrapper 
                    ref={mapRef}
                    selectedActivities={selectedActivities}
                    setSelectedActivities={setSelectedActivities}
                    onMarkerClick={setSelectedLocation}
                    selectedLocation={selectedLocation}
                    mapData={allSpots}
                    selectedHub={activeHub}
                    addedSpots={addedSpots}
                    budgetFilter={budgetFilter}
                    budget={budget} 
                    setBudget={setBudget}
                    destination={destination}
                    setDestination={setDestination}
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                    onHubChange={handleHubChange}
                    getBudgetStep={getBudgetStep}
                    onChatLocation={handleChatbotLocation} 
                />
            </div>

            {/* Itinerary Card - Right Side */}
            <div className={styles.preferenceCardContainer}>
                <PreferenceCard 
                    selectedLocation={selectedLocation}
                    setSelectedLocation={setSelectedLocation}
                    addedSpots={addedSpots}
                    setAddedSpots={setAddedSpots}
                    onAddSpot={handleAddSpot}
                    onRemoveSpot={handleRemoveSpot}
                    activeHubName={activeHub ? activeHub.name : ""} 
                    onToggleLock={handleToggleLock}
                    onMoveSpot={handleMoveSpot}
                    dateRange={dateRange}
                />
            </div>
            <div className={styles.footerCredit}>
                <p> 
                    Built by 
                    <a 
                        href="https://github.com/bikemaster2331" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.creatorLink}
                    >
                        M.L.
                    </a>
                    
                    <span className={styles.footerSeparator}>/</span> 
                    
                    {/* Colleagues Links */}
                    <a 
                        href="https://www.facebook.com/Roilan.Trasmano" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.colleagueLink}
                    >
                        R.B.
                    </a>
                    
                    <a 
                        href="https://www.facebook.com/Yffffdkkd" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.colleagueLink}
                    >
                        J.A.
                    </a>

                    <a 
                        href="https://www.facebook.com/patrickjohn.guerrero.1" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.colleagueLink}
                    >
                        P.G.
                    </a>

                    <a 
                        href="https://www.facebook.com/leetmns.10" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={styles.colleagueLink}
                    >
                        J.T.
                    </a>
                </p>
            </div>
        </div>
    );
}