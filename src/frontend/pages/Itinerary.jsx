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
    
    // SHEET STATE
    const [sheetState, setSheetState] = useState('collapsed');
    
    const [mobilePanel, setMobilePanel] = useState('review');
    const [isMobile, setIsMobile] = useState(false);
    
    // REMOVED: const [sheetDragHeight, setSheetDragHeight] = useState(null);
    // REMOVED: const [isSheetDragging, setIsSheetDragging] = useState(false);
    
    const nextMobilePanel = mobilePanel === 'review' ? 'preview' : 'review';
    const mobilePanelToggleLabel = nextMobilePanel === 'preview' ? 'Show preview' : 'Show review';

    const mapRef = useRef(null);
    
    // --- NEW: SHEET REFS FOR DIRECT MANIPULATION ---
    const sheetRef = useRef(null);
    const touchStartYRef = useRef(0);
    const touchStartHeightRef = useRef(0);

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

    // --- SHEET LOGIC ---

    const getSheetHeights = () => {
        if (typeof window === 'undefined') {
            return { collapsed: 60, mid: 480, open: 720 };
        }
        const vh = window.innerHeight;
        return {
            collapsed: Math.min(124, Math.max(60, vh * 0.12)), // Slight bump to 12%
            mid: vh * 0.53,
            open: vh * 0.92 // Apple Maps style almost full screen
        };
    };

    const handleSheetToggle = () => {
        // Toggle Logic: Cycle through states
        setSheetState((prev) => {
            if (prev === 'collapsed') return 'mid';
            if (prev === 'mid') return 'open';
            return 'mid';
        });
    };

    // --- DIRECT DOM MANIPULATION HANDLERS ---
    
    const handleSheetTouchStart = (event) => {
        if (!sheetRef.current) return;
        
        // 1. FREEZE TRANSITION: Add class that sets transition: none
        // NOTE: Ensure .isDragging { transition: none !important; } exists in your CSS
        sheetRef.current.classList.add(styles.isDragging);
        
        // 2. RECORD START POINTS
        touchStartYRef.current = event.touches[0].clientY;
        touchStartHeightRef.current = sheetRef.current.offsetHeight;
    };

    const handleSheetTouchMove = (event) => {
        if (!isMobile || !sheetRef.current) return;
        
        // Prevent Pull-to-refresh / bouncing
        if (event.cancelable) event.preventDefault();

        const currentY = event.touches[0].clientY;
        const delta = touchStartYRef.current - currentY; // Dragging UP is positive delta
        const newHeight = touchStartHeightRef.current + delta;

        // 3. APPLY HEIGHT DIRECTLY (0ms Latency)
        const heights = getSheetHeights();
        // Allow slight rubber-banding (+/- 20px) but mostly clamp
        const clampedHeight = Math.max(heights.collapsed - 20, Math.min(heights.open + 20, newHeight));
        
        sheetRef.current.style.height = `${clampedHeight}px`;
    };

    const handleSheetTouchEnd = (event) => {
        if (!sheetRef.current) return;

        // 4. RESTORE TRANSITION (Smooth snap)
        sheetRef.current.classList.remove(styles.isDragging);
        
        // Read final height from DOM
        const currentHeight = sheetRef.current.offsetHeight;
        
        // Clear manual inline style so CSS classes can take over
        sheetRef.current.style.height = ''; 

        // 5. SNAP LOGIC
        const heights = getSheetHeights();
        const distCollapsed = Math.abs(currentHeight - heights.collapsed);
        const distMid = Math.abs(currentHeight - heights.mid);
        const distOpen = Math.abs(currentHeight - heights.open);

        // Velocity Check (Did user flick?)
        const touchEndY = event.changedTouches[0].clientY;
        const totalDelta = touchStartYRef.current - touchEndY;
        
        let nextState = 'mid';

        // Flick Up Logic
        if (totalDelta > 80 && sheetState === 'collapsed') nextState = 'mid';
        else if (totalDelta > 80 && sheetState === 'mid') nextState = 'open';
        // Flick Down Logic
        else if (totalDelta < -80 && sheetState === 'open') nextState = 'mid';
        else if (totalDelta < -80 && sheetState === 'mid') nextState = 'collapsed';
        // Proximity Logic (If no flick)
        else {
            const min = Math.min(distCollapsed, distMid, distOpen);
            if (min === distCollapsed) nextState = 'collapsed';
            else if (min === distOpen) nextState = 'open';
            else nextState = 'mid';
        }

        setSheetState(nextState);
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
                    ref={sheetRef} // <--- 6. PASS THE REF HERE
                    variant="sheet"
                    containerClassName={`${styles.mobileSheet} ${styles[`mobileSheet${sheetState}`]}`}
                    formAccessory={
                        sheetState !== 'collapsed' ? (
                            <div className={styles.mobileInputToggle} aria-label="Switch itinerary panel">
                                <button
                                    type="button"
                                    className={`${styles.mobileInputToggleBtn} ${styles.mobileInputToggleBtnActive}`}
                                    onClick={() => {
                                        setMobilePanel(nextMobilePanel);
                                        if (nextMobilePanel === 'preview') {
                                            setSheetState('open');
                                        }
                                    }}
                                    aria-label={mobilePanelToggleLabel}
                                    title={mobilePanelToggleLabel}
                                >
                                    {nextMobilePanel === 'preview' ? (
                                        <svg className={styles.mobileInputToggleIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
                                            <rect x="13" y="3" width="8" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                                            <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
                                            <rect x="13" y="17" width="8" height="4" rx="2" stroke="currentColor" strokeWidth="2" />
                                        </svg>
                                    ) : (
                                        <svg className={styles.mobileInputToggleIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M3 5h18M3 12h12M3 19h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            <path d="M19 12l2 2-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        ) : null
                    }
                    onLocationResponse={handleChatbotLocation}
                    onExpand={() => {
                        if (sheetState === 'collapsed') setSheetState('mid');
                    }}
                    onHandleToggle={handleSheetToggle}
                    
                    // Pass the Direct DOM handlers
                    onHandleTouchStart={handleSheetTouchStart}
                    onHandleTouchMove={handleSheetTouchMove}
                    onHandleTouchEnd={handleSheetTouchEnd}
                    
                    sheetState={sheetState}
                    // Removed containerStyle prop as we now use direct class manipulation for dragging
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
                                activeMobilePanel={mobilePanel}
                                showPanelToggleInCard={false}
                                mobileSheetState={sheetState}
                                onMobileSheetStateChange={setSheetState}
                                onMobilePanelChange={(panel) => {
                                    setMobilePanel(panel);
                                    if (panel === 'preview') {
                                        setSheetState('open');
                                    }
                                }}
                            />
                        </div>
                    </div>
                </ChatBot>
            )}
        </div>
    );
}