import { useEffect, useState, useRef } from 'react';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import PreferenceCard from '../components/itineraryCard';
import MapWrapper from '../components/MapWrapper';
import SharedNavbar from '../components/navbar';
import ChatBot from '../components/ChatBot';
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
    const [sheetState, setSheetState] = useState('collapsed');
    const [isMobile, setIsMobile] = useState(false);

    const mapRef = useRef(null);
    const touchStartYRef = useRef(0);

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

        if (!locations || locations.length !== 1) return;

        // Sync review box only when exactly one location is returned
        const first = locations[0];
        let matched = null;

        if (allSpots?.features?.length) {
            matched = allSpots.features.find(f => {
                const name = f?.properties?.name || '';
                return name.toLowerCase() === String(first.name || '').toLowerCase();
            });
        }

        if (matched) {
            setSelectedLocation({ ...matched.properties, geometry: matched.geometry });
        } else {
            setSelectedLocation({
                name: first.name,
                type: first.type,
                municipality: first.municipality,
                geometry: { type: 'Point', coordinates: first.coordinates }
            });
        }
    };

    const getBudgetStep = (value) => {
        if (value <= 33) return 1;
        if (value <= 66) return 2;
        return 3;
    };

    const handleSheetToggle = () => {
        setSheetState((prev) => {
            if (prev === 'collapsed') return 'mid';
            if (prev === 'mid') return 'open';
            return 'collapsed';
        });
    };

    const handleSheetTouchStart = (event) => {
        touchStartYRef.current = event.touches[0].clientY;
    };

    const handleSheetTouchEnd = (event) => {
        const endY = event.changedTouches[0].clientY;
        const delta = touchStartYRef.current - endY;
        if (delta > 40) {
            setSheetState('open');
        } else if (delta < -40) {
            setSheetState('collapsed');
        }
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

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const media = window.matchMedia('(max-width: 768px)');
        const handleChange = () => setIsMobile(media.matches);
        handleChange();
        if (media.addEventListener) {
            media.addEventListener('change', handleChange);
        } else {
            media.addListener(handleChange);
        }
        return () => {
            if (media.removeEventListener) {
                media.removeEventListener('change', handleChange);
            } else {
                media.removeListener(handleChange);
            }
        };
    }, []);

    // Preload spot images for faster review box updates
    useEffect(() => {
        if (!allSpots?.features?.length) return;
        const uniqueImages = new Set();
        allSpots.features.forEach(feature => {
            const img = feature?.properties?.image;
            if (img) uniqueImages.add(img);
        });
        uniqueImages.forEach(src => {
            const img = new Image();
            img.src = src;
        });
    }, [allSpots]);

    return (
        <div className={styles.itineraryContainer}>
            <SharedNavbar />
            <div className={styles.gradientBg} />
            <div className={styles.gridOverlay} />  
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

            {/* Mobile Bottom Sheet */}
            {isMobile && (
                <ChatBot
                    variant="sheet"
                    containerClassName={`${styles.mobileSheet} ${styles[`mobileSheet${sheetState}`]}`}
                    onLocationResponse={handleChatbotLocation}
                    onExpand={() => {
                        if (sheetState === 'collapsed') setSheetState('mid');
                    }}
                    onHandleToggle={handleSheetToggle}
                    onHandleTouchStart={handleSheetTouchStart}
                    onHandleTouchEnd={handleSheetTouchEnd}
                    sheetState={sheetState}
                >
                    <div className={styles.mobileSheetCard}>
                        <div className={styles.mobileSheetContent}>
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
                                mobileMode
                            />
                            <div className={styles.footerCreditMobile}>
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
                    </div>
                </ChatBot>
            )}
        </div>
    );
}
