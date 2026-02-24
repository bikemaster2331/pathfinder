import { useEffect, useState, useRef } from 'react';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import cardStyles from '../styles/itinerary_page/ItineraryCard.module.css';
import PreferenceCard from '../components/itineraryCard';
import MapWrapper from '../components/MapWrapper';
import ChatBot from '../components/ChatBot';
import { TRAVEL_HUBS } from '../constants/location';
import { optimizeRoute } from '../utils/optimize';
import defaultBg from '../assets/images/card/catanduanes.png';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIGURATION ---
const BUDGET_CONFIG = {
    1: { filterValues: ["low"] },
    2: { filterValues: ["low", "medium"] },
    3: { filterValues: ["low", "medium", "high"] }
};

// --- NEW: COLLAPSIBLE WIDGET COMPONENT ---
// This is pulled out so it can manage its own expanded/collapsed state natively in the chat flow.
const PreviewWidget = ({
    isLatest,
    spots,
    styles,
    cardStyles,
    handleOptimize,
    setSelectedLocation,
    handleMoveSpot,
    handleRemoveSpot
}) => {
    const [expanded, setExpanded] = useState(isLatest);

    // Auto-collapse older widgets when a new one is added to the chat
    useEffect(() => {
        setExpanded(isLatest);
    }, [isLatest]);

    return (
        <aside
            className={`${styles.mapExpandedPreviewBox} ${styles.desktopChatPreviewBox}`}
            style={!expanded ? { height: 'auto', minHeight: 'auto', paddingBottom: '0' } : {}}
        >
            <div
                className={styles.mapExpandedPreviewHeader}
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer', borderBottom: expanded ? '' : 'none' }}
            >
                <h3 className={styles.mapExpandedPreviewTitle}>Itinerary Preview</h3>
                <div className={styles.mapExpandedPreviewHeaderActions}>
                    <span className={styles.mapExpandedPreviewCount}>{spots.length} spot{spots.length === 1 ? '' : 's'}</span>

                    {/* Expand/Collapse Chevron */}
                    {expanded ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    )}

                    {expanded && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleOptimize(); }}
                            className={cardStyles.optimizeBtnSmall}
                            title="Fix my route order"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                                <path d="M230.86,109.25,169.18,86.82,146.75,25.14a19.95,19.95,0,0,0-37.5,0L86.82,86.82,25.14,109.25a19.95,19.95,0,0,0,0,37.5l61.68,22.43,22.43,61.68a19.95,19.95,0,0,0,37.5,0l22.43-61.68,61.68-22.43a19.95,19.95,0,0,0,0-37.5Zm-75.14,39.29a12,12,0,0,0-7.18,7.18L128,212.21l-20.54-56.49a12,12,0,0,0-7.18-7.18L43.79,128l56.49-20.54a12,12,0,0,0,7.18-7.18L128,43.79l20.54,56.49a12,12,0,0,0,7.18,7.18L212.21,128Z" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            {expanded && (
                <div className={`${styles.mapExpandedPreviewList} ${cardStyles.addedSpotsList}`}>
                    {spots.map((spot, index) => (
                        <div
                            key={`${spot.name}-${index}`}
                            className={`${cardStyles.miniSpotItem} ${spot.locked ? cardStyles.miniSpotItemLocked : ''}`}
                            onClick={() => setSelectedLocation(spot)}
                        >
                            <div className={cardStyles.spotRow}>
                                <div className={cardStyles.visitDurationBadge}>
                                    {spot.visit_time_minutes > 0 ? `${spot.visit_time_minutes}m` : '60m'}
                                </div>
                                <span className={cardStyles.spotName}>{spot.name}</span>
                            </div>
                            <div className={cardStyles.spotActions}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleMoveSpot(index, -1); }}
                                    className={cardStyles.spotActionBtn}
                                    disabled={index === 0}
                                    title="Move Up"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleMoveSpot(index, 1); }}
                                    className={cardStyles.spotActionBtn}
                                    disabled={index === spots.length - 1}
                                    title="Move Down"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>
                                <div className={cardStyles.actionDivider}></div>
                                <button
                                    className={`${cardStyles.removeBtn} ${cardStyles.removeSmallBtn}`}
                                    onClick={(e) => { e.stopPropagation(); handleRemoveSpot(spot.name); }}
                                    title="Remove"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                    {spots.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '0.85rem' }}>
                            Your itinerary is empty.
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
};


export default function ItineraryPage() {
    const [allSpots, setAllSpots] = useState(null);
    const [addedSpots, setAddedSpots] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [activeHub, setActiveHub] = useState(() => {
        const saved = localStorage.getItem('itinerary_activeHub');
        return saved ? JSON.parse(saved) : null;
    });
    const [budgetFilter, setBudgetFilter] = useState(['low', 'medium', 'high']);
    const [selectedActivities, setSelectedActivities] = useState({
        Accommodation: false, Dining: false, Sightseeing: false,
        Shopping: false, Swimming: false, Hiking: false
    });

    const [budget, setBudget] = useState(50);
    const [destination, setDestination] = useState(() => {
        const saved = localStorage.getItem('itinerary_destination');
        return saved ? saved : '';
    });
    const [dateRange, setDateRange] = useState(() => {
        const saved = localStorage.getItem('itinerary_dateRange');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                start: parsed.start ? new Date(parsed.start) : '',
                end: parsed.end ? new Date(parsed.end) : ''
            };
        }
        return { start: '', end: '' };
    });

    useEffect(() => {
        if (activeHub) localStorage.setItem('itinerary_activeHub', JSON.stringify(activeHub));
        else localStorage.removeItem('itinerary_activeHub');
    }, [activeHub]);

    useEffect(() => {
        if (destination) localStorage.setItem('itinerary_destination', destination);
        else localStorage.removeItem('itinerary_destination');
    }, [destination]);

    useEffect(() => {
        localStorage.setItem('itinerary_dateRange', JSON.stringify(dateRange));
    }, [dateRange]);

    // Chat State Lifted to Parent
    const [chatMessages, setChatMessages] = useState([]);

    // SHEET STATE
    const [sheetState, setSheetState] = useState('collapsed');

    const [mobilePanel, setMobilePanel] = useState('review');
    const [isMobile, setIsMobile] = useState(false);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);
    const [isMapExpandedReviewOpen, setIsMapExpandedReviewOpen] = useState(false);
    const [isInitialTripboxCompleted, setIsInitialTripboxCompleted] = useState(false);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);

    const nextMobilePanel = mobilePanel === 'review' ? 'preview' : 'review';
    const mobilePanelToggleLabel = nextMobilePanel === 'preview' ? 'Show preview' : 'Show review';

    const mapRef = useRef(null);

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

    // --- NEW: INJECT WIDGET INTO CHAT STATE ---
    const pushItineraryWidgetToChat = () => {
        setChatMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            // If the last message is already an itinerary widget, don't spam a new one
            if (lastMsg && lastMsg.role === 'widget' && lastMsg.type === 'itinerary') {
                return prev;
            }
            return [...prev, { role: 'widget', type: 'itinerary', id: Date.now() }];
        });
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

    const handleOptimize = () => {
        if (!activeHub || !addedSpots || addedSpots.length < 2) return;
        const newOrder = optimizeRoute(activeHub, addedSpots);
        setAddedSpots(newOrder);
    };

    const handleAddSpot = (spot) => {
        setAddedSpots(prev => {
            if (!prev.find(s => s.name === spot.name)) {
                return [...prev, spot];
            }
            return prev;
        });
        pushItineraryWidgetToChat();
    };

    const handleRemoveSpot = (spotName) => {
        setAddedSpots(prev => prev.filter(s => s.name !== spotName));
    };

    const isSelectedAlreadyAdded = selectedLocation
        ? addedSpots.some((spot) => spot.name === selectedLocation.name)
        : false;

    const handleChatbotLocation = (locations) => {
        console.log('Chatbot returned locations:', locations);

        if (mapRef.current) {
            mapRef.current.handleChatbotLocations(locations);
        }

        if (!locations || locations.length !== 1) return;

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
            collapsed: Math.min(124, Math.max(60, vh * 0.12)),
            mid: vh * 0.53,
            open: vh * 0.92
        };
    };

    const handleSheetToggle = () => {
        setSheetState((prev) => {
            if (prev === 'collapsed') return 'mid';
            if (prev === 'mid') return 'open';
            return 'mid';
        });
    };

    const handleSheetTouchStart = (event) => {
        if (!sheetRef.current) return;

        sheetRef.current.classList.add(styles.isDragging);
        touchStartYRef.current = event.touches[0].clientY;
        touchStartHeightRef.current = sheetRef.current.offsetHeight;
    };

    const handleSheetTouchMove = (event) => {
        if (!isMobile || !sheetRef.current) return;

        if (event.cancelable) event.preventDefault();

        const currentY = event.touches[0].clientY;
        const delta = touchStartYRef.current - currentY;
        const newHeight = touchStartHeightRef.current + delta;

        const heights = getSheetHeights();
        const clampedHeight = Math.max(heights.collapsed - 20, Math.min(heights.open + 20, newHeight));

        sheetRef.current.style.height = `${clampedHeight}px`;
    };

    const handleSheetTouchEnd = (event) => {
        if (!sheetRef.current) return;

        sheetRef.current.classList.remove(styles.isDragging);
        const currentHeight = sheetRef.current.offsetHeight;
        sheetRef.current.style.height = '';

        const heights = getSheetHeights();
        const distCollapsed = Math.abs(currentHeight - heights.collapsed);
        const distMid = Math.abs(currentHeight - heights.mid);
        const distOpen = Math.abs(currentHeight - heights.open);

        const touchEndY = event.changedTouches[0].clientY;
        const totalDelta = touchStartYRef.current - touchEndY;

        let nextState = 'mid';

        if (totalDelta > 80 && sheetState === 'collapsed') nextState = 'mid';
        else if (totalDelta > 80 && sheetState === 'mid') nextState = 'open';
        else if (totalDelta < -80 && sheetState === 'open') nextState = 'mid';
        else if (totalDelta < -80 && sheetState === 'mid') nextState = 'collapsed';
        else {
            const min = Math.min(distCollapsed, distMid, distOpen);
            if (min === distCollapsed) nextState = 'collapsed';
            else if (min === distOpen) nextState = 'open';
            else nextState = 'mid';
        }

        setSheetState(nextState);
    };

    useEffect(() => {
        const step = getBudgetStep(budget);
        setBudgetFilter(BUDGET_CONFIG[step].filterValues);
    }, [budget]);

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

    useEffect(() => {
        if (selectedLocation) {
            setIsMapExpandedReviewOpen(true);
        }
    }, [selectedLocation]);

    // --- MAP CHAT MESSAGES TO REACT COMPONENTS ---
    // Finds the last widget so we can auto-expand only the newest one
    const latestWidgetIndex = chatMessages.map(m => m.type).lastIndexOf('itinerary');

    const desktopDisplayMessages = chatMessages.map((msg, index) => {
        if (msg.role === 'widget' && msg.type === 'itinerary') {
            return {
                ...msg,
                content: (
                    <PreviewWidget
                        isLatest={index === latestWidgetIndex}
                        spots={addedSpots}
                        styles={styles}
                        cardStyles={cardStyles}
                        handleOptimize={handleOptimize}
                        setSelectedLocation={setSelectedLocation}
                        handleMoveSpot={handleMoveSpot}
                        handleRemoveSpot={handleRemoveSpot}
                    />
                )
            };
        }
        return msg;
    });

    return (
        <div className={`${styles.itineraryContainer} ${isMapFullscreen ? styles.itineraryContainerFullscreen : ''} ${!isInitialTripboxCompleted ? styles.itineraryContainerBoot : ''}`}>
            <div className={styles.gradientBg} />
            {!isMobile && isInitialTripboxCompleted && (
                <aside className={styles.desktopChatContainer}>
                    <div className={styles.desktopChatHeader}>
                        <span className={styles.desktopChatTitle}>PATHFINDER</span>
                        <span className={styles.desktopChatStatus}>Connected</span>
                    </div>
                    <div className={styles.desktopChatBody}>
                        <ChatBot
                            variant="panel"
                            containerClassName={styles.desktopChatBot}
                            onLocationResponse={handleChatbotLocation}
                            messages={desktopDisplayMessages}
                            setMessages={setChatMessages}
                        />
                    </div>
                </aside>
            )}

            {/* Map Container with Controls */}
            <div className={`${styles.mapArea} ${isMapFullscreen ? styles.mapAreaFullscreen : ''} ${!isInitialTripboxCompleted ? styles.mapAreaBoot : ''}`}>
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
                    isMapFullscreen={isMapFullscreen}
                    onToggleMapFullscreen={() => setIsMapFullscreen((prev) => !prev)}
                    onInitialTripboxComplete={() => setIsInitialTripboxCompleted(true)}
                />
                <button
                    type="button"
                    className={styles.mapExpandedReviewToggle}
                    onClick={() => setIsMapExpandedReviewOpen((prev) => !prev)}
                >
                    {isMapExpandedReviewOpen ? 'Hide Info' : 'Show Info'}
                </button>
                {isMapExpandedReviewOpen && (
                    <>
                        <aside className={styles.mapExpandedReviewBox}>
                            <div className={styles.mapExpandedReviewImageWrap}>
                                <img
                                    src={selectedLocation?.image || defaultBg}
                                    alt={selectedLocation?.name || 'Catanduanes'}
                                    className={styles.mapExpandedReviewImage}
                                    style={{ cursor: 'zoom-in' }}
                                    onClick={() => setIsImageFullscreen(true)}
                                    onError={(e) => { e.currentTarget.src = defaultBg; }}
                                />
                            </div>
                            <div className={styles.mapExpandedReviewContent}>
                                <h3 className={styles.mapExpandedReviewTitle}>
                                    {selectedLocation?.name || 'Select a destination'}
                                </h3>
                                <p className={styles.mapExpandedReviewDesc}>
                                    {selectedLocation?.description || 'Select Add spot to include this destination in your itinerary.'}
                                </p>
                                <button
                                    type="button"
                                    className={styles.mapExpandedReviewBtn}
                                    disabled={!selectedLocation}
                                    onClick={() => (
                                        !selectedLocation
                                            ? null
                                            : isSelectedAlreadyAdded
                                                ? handleRemoveSpot(selectedLocation.name)
                                                : handleAddSpot(selectedLocation)
                                    )}
                                >
                                    {!selectedLocation ? 'Select a Spot' : isSelectedAlreadyAdded ? 'Remove Spot' : 'Add Spot'}
                                </button>
                            </div>
                        </aside>
                    </>
                )}
            </div>

            {/* Itinerary Card - Right Side */}
            {false && !isMapFullscreen && (
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
            )}

            {/* Mobile Bottom Sheet */}
            {isMobile && (
                <ChatBot
                    ref={sheetRef}
                    variant="sheet"
                    messages={chatMessages}
                    setMessages={setChatMessages}
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
                    onHandleTouchStart={handleSheetTouchStart}
                    onHandleTouchMove={handleSheetTouchMove}
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

            {/* FULLSCREEN IMAGE MODAL LAYER */}
            <AnimatePresence>
                {isImageFullscreen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsImageFullscreen(false)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.85)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            zIndex: 9999999, /* Above navbar and modals */
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '24px',
                            cursor: 'zoom-out'
                        }}
                    >
                        <motion.img
                            src={selectedLocation?.image || defaultBg}
                            alt="Fullscreen Destination"
                            initial={{ scale: 0.9, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 30 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '90vh',
                                objectFit: 'contain',
                                borderRadius: '16px',
                                boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.6)',
                                cursor: 'default'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button
                            onClick={() => setIsImageFullscreen(false)}
                            title="Close picture"
                            style={{
                                position: 'absolute',
                                top: '24px',
                                right: '24px',
                                background: 'rgba(255, 255, 255, 0.15)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                color: '#fff',
                                width: '44px',
                                height: '44px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                backdropFilter: 'blur(4px)',
                                transition: 'all 0.2s ease',
                                zIndex: 2
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}