import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import cardStyles from '../styles/itinerary_page/ItineraryCard.module.css';
import PreferenceCard from '../components/itineraryCard';
import MapWrapper from '../components/MapWrapper';
import ChatBot from '../components/ChatBot';
import { TRAVEL_HUBS } from '../constants/location';
import { optimizeRoute } from '../utils/optimize';
import { calculateDriveTimes, calculateTimeUsage, calculateTotalRoute } from '../utils/distance';
import { generateItineraryPDF } from '../utils/generatePDF';
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
    activeHub,
    currentDay,
    dayCount,
    isLastDay,
    handleOptimize,
    setSelectedLocation,
    handleToggleLock,
    handleMoveSpot,
    handleRemoveSpot,
    handlePreviousDay,
    handleSliceAndNext,
    handleSaveItinerary
}) => {
    const [expanded, setExpanded] = useState(isLatest);
    const isNextAction = dayCount > 1 && !isLastDay;

    // Auto-collapse older widgets when a new one is added to the chat
    useEffect(() => {
        setExpanded(isLatest);
    }, [isLatest]);

    const driveData = useMemo(() => {
        if (!activeHub) return [];
        return calculateDriveTimes(activeHub, spots);
    }, [activeHub, spots]);

    const totalDistance = useMemo(() => {
        if (!activeHub || !spots || spots.length === 0) return 0;
        return calculateTotalRoute(activeHub, spots);
    }, [activeHub, spots]);
    const timeWallet = useMemo(() => {
        if (!activeHub) {
            return {
                totalUsed: 0,
                percent: 0,
                remaining: 540,
                color: 'rgb(255, 255, 255)',
                label: 'Schedule Empty',
                subtext: 'Select a starting point'
            };
        }

        const DAILY_CAPACITY = 540;
        const usage = calculateTimeUsage(activeHub, spots);
        const usedAmount = Number(usage?.totalUsed) || 0;
        const remaining = DAILY_CAPACITY - usedAmount;

        let percent = (usedAmount / DAILY_CAPACITY) * 100;
        if (percent > 100) percent = 100;

        let color = '#10B981';
        let label = 'Relaxed pace';
        let subtext = 'Plenty of buffer (Like 9 AM start)';

        if (remaining < 0) {
            color = '#EF4444';
            label = 'Day Overloaded';
            subtext = 'Exceeds standard 9-hour day';
        } else if (remaining < 60) {
            color = '#F59E0B';
            label = 'Very Full';
            subtext = 'Aim for 6:00 AM start';
        } else if (remaining < 120) {
            color = '#F59E0B';
            label = 'Busy Schedule';
            subtext = 'Aim for 7-8:00 AM start';
        }

        return { used: usedAmount, remaining, percent, color, label, subtext };
    }, [activeHub, spots]);

    return (
        <aside
            className={`${styles.mapExpandedPreviewBox} ${styles.desktopChatPreviewBox} ${expanded ? styles.mapExpandedPreviewExpanded : styles.mapExpandedPreviewCollapsed}`}
        >
            <div
                className={styles.mapExpandedPreviewHeader}
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer', borderBottom: expanded ? '' : 'none' }}
            >
                <h3 className={styles.mapExpandedPreviewTitle}>Itinerary Preview</h3>
                <div className={styles.mapExpandedPreviewHeaderActions}>
                    <span className={styles.mapExpandedPreviewCount}>{spots.length} spot{spots.length === 1 ? '' : 's'}</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleOptimize(); }}
                        className={cardStyles.optimizeBtnSmall}
                        title="Optimize Route"
                        style={{ padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sparkle-icon lucide-sparkle">
                            <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
                        </svg>
                    </button>
                    {expanded ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    )}
                </div>
            </div>
            {expanded && (
                <div className={styles.mapExpandedPreviewList}>
                    <div className={styles.mapExpandedTopRow}>
                        <div className={`${cardStyles.previewHeader} ${styles.mapExpandedTitleHeader}`}>
                            <div className={cardStyles.previewHeaderTitleGroup}>
                                <h3 className={`${cardStyles.boxTitle} ${cardStyles.previewHeaderTitle}`}>
                                    Day {currentDay} of {dayCount}
                                </h3>
                            </div>
                        </div>
                        <div className={`${cardStyles.walletContainer} ${styles.mapExpandedWalletCompact}`}>
                            <div className={`${cardStyles.walletHeader} ${styles.mapExpandedWalletHeader}`}>
                                <div className={cardStyles.walletStatusGroup}>
                                    <div className={cardStyles.walletLabel}>{timeWallet.label}</div>
                                </div>
                            </div>
                            <div className={cardStyles.walletBarTrack}>
                                <div
                                    className={cardStyles.walletBarFill}
                                    style={{
                                        width: `${timeWallet.percent}%`,
                                        backgroundColor: timeWallet.color,
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.mapExpandedSpotsScroll}>
                        {spots && spots.length > 0 ? (
                            spots.map((spot, index) => (
                                <div key={`${spot.name}-${index}`}>
                                    {driveData[index]?.driveTime > 0 && (
                                        <div
                                            className={cardStyles.driveTimeLabel}
                                            style={{ marginTop: index === 0 ? '0px' : '-4px' }}
                                        >
                                            <div className={cardStyles.driveTimeLine}></div>
                                            <svg className={cardStyles.driveTimeIcon} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
                                                <circle cx="7" cy="17" r="2"></circle>
                                                <circle cx="17" cy="17" r="2"></circle>
                                            </svg>
                                            {driveData[index].driveTime} min drive
                                        </div>
                                    )}

                                    <div
                                        className={`${cardStyles.miniSpotItem} ${spot.locked ? cardStyles.miniSpotItemLocked : ''}`}
                                        onClick={() => setSelectedLocation(spot)}
                                    >
                                        <div className={cardStyles.spotRow}>
                                            <div className={cardStyles.visitDurationBadge}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <polyline points="12 6 12 12 16 14"></polyline>
                                                </svg>
                                                {spot.visit_time_minutes > 0 ? spot.visit_time_minutes : 60}m
                                            </div>
                                            <span className={cardStyles.spotName}>
                                                {spot.locked && (
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                    </svg>
                                                )}
                                                {spot.name}
                                            </span>
                                        </div>

                                        <div className={cardStyles.spotActions}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleMoveSpot(index, -1); }}
                                                className={cardStyles.spotActionBtn}
                                                disabled={index === 0}
                                                title="Move Up"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="18 15 12 9 6 15"></polyline>
                                                </svg>
                                            </button>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleMoveSpot(index, 1); }}
                                                className={cardStyles.spotActionBtn}
                                                disabled={index === spots.length - 1}
                                                title="Move Down"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </button>

                                            <div className={cardStyles.actionDivider}></div>

                                            <button
                                                className={`${cardStyles.removeBtn} ${cardStyles.lockBtn} ${spot.locked ? cardStyles.lockBtnActive : cardStyles.lockBtnInactive}`}
                                                onClick={(e) => { e.stopPropagation(); handleToggleLock(spot.name); }}
                                                title={spot.locked ? "Unlock" : "Anchor"}
                                            >
                                                {spot.locked ? (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                    </svg>
                                                ) : (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="12" cy="5" r="3"></circle>
                                                        <line x1="12" y1="22" x2="12" y2="8"></line>
                                                        <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
                                                    </svg>
                                                )}
                                            </button>

                                            <button
                                                className={`${cardStyles.removeBtn} ${cardStyles.removeSmallBtn}`}
                                                onClick={(e) => { e.stopPropagation(); handleRemoveSpot(spot.name); }}
                                                title="Remove"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className={cardStyles.previewContent}>
                                Day {currentDay} wallet is empty. Select a pin to add.
                            </p>
                        )}
                    </div >

                    <div className={`${cardStyles.bottomButtonRow} ${styles.mapExpandedActionRow}`}>
                        {currentDay > 1 && (
                            <button
                                onClick={handlePreviousDay}
                                className={`${cardStyles.saveButton} ${cardStyles.backButton} ${styles.mapExpandedBackAction}`}
                                style={{ backgroundColor: '#4B5563' }}
                                title="Go back to previous day"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                            </button >
                        )}

                        <button
                            className={`${cardStyles.saveButton} ${cardStyles.previewPrimaryAction} ${styles.mapExpandedPrimaryAction}`}
                            onClick={isNextAction ? handleSliceAndNext : handleSaveItinerary}
                            style={{ backgroundColor: isNextAction ? undefined : '#2563EB' }}
                        >
                            {isNextAction ? 'Next' : 'Save'}
                        </button>
                    </div >
                </div >
            )}
        </aside >
    );
};


export default function ItineraryPage() {
    const navigate = useNavigate();
    const [allSpots, setAllSpots] = useState(null);
    const [addedSpots, setAddedSpots] = useState([]);
    const [storedDays, setStoredDays] = useState({});
    const [currentDay, setCurrentDay] = useState(1);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [activeHub, setActiveHub] = useState(() => {
        const saved = sessionStorage.getItem('itinerary_activeHub');
        return saved ? JSON.parse(saved) : null;
    });
    const [budgetFilter, setBudgetFilter] = useState(['low', 'medium', 'high']);
    const [selectedActivities, setSelectedActivities] = useState({
        Accommodation: false, Dining: false, Sightseeing: false,
        Shopping: false, Swimming: false, Hiking: false
    });

    const [budget, setBudget] = useState(50);
    const [destination, setDestination] = useState(() => {
        const saved = sessionStorage.getItem('itinerary_destination');
        return saved ? saved : '';
    });
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const dayCount = useMemo(() => {
        if (!dateRange.start || !dateRange.end) return 1;
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diffTime = end - start;
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return days > 0 ? days : 1;
    }, [dateRange]);
    const isLastDay = currentDay >= dayCount;
    useEffect(() => {
        const saved = sessionStorage.getItem('itinerary_dateRange');
        if (saved) {
            const parsed = JSON.parse(saved);
            setDateRange({
                start: parsed.start ? new Date(parsed.start) : '',
                end: parsed.end ? new Date(parsed.end) : ''
            });
        }
    }, []);

    useEffect(() => {
        if (activeHub) sessionStorage.setItem('itinerary_activeHub', JSON.stringify(activeHub));
        else sessionStorage.removeItem('itinerary_activeHub');
    }, [activeHub]);

    useEffect(() => {
        if (destination) sessionStorage.setItem('itinerary_destination', destination);
        else sessionStorage.removeItem('itinerary_destination');
    }, [destination]);

    useEffect(() => {
        sessionStorage.setItem('itinerary_dateRange', JSON.stringify(dateRange));
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
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

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

    const handleSliceAndNext = () => {
        setStoredDays(prev => ({ ...prev, [currentDay]: [...addedSpots] }));
        const nextDay = currentDay + 1;
        setCurrentDay(nextDay);

        const nextDaySpots = storedDays[nextDay];
        if (nextDaySpots && nextDaySpots.length > 0) {
            setAddedSpots(nextDaySpots);
            setSelectedLocation(nextDaySpots[nextDaySpots.length - 1]);
        } else {
            setAddedSpots([]);
            setSelectedLocation(null);
        }
    };

    const handlePreviousDay = () => {
        if (currentDay <= 1) return;
        setStoredDays(prev => ({ ...prev, [currentDay]: [...addedSpots] }));

        const prevDay = currentDay - 1;
        setCurrentDay(prevDay);
        const prevDaySpots = storedDays[prevDay];

        if (prevDaySpots && prevDaySpots.length > 0) {
            setAddedSpots(prevDaySpots);
            setSelectedLocation(prevDaySpots[prevDaySpots.length - 1]);
        } else {
            setAddedSpots([]);
            setSelectedLocation(null);
        }
    };

    const handleSaveItinerary = () => {
        const finalItinerary = { ...storedDays, [currentDay]: addedSpots };

        const allSpotsFlat = [];
        Object.keys(finalItinerary)
            .sort((a, b) => Number(a) - Number(b))
            .forEach(day => {
                allSpotsFlat.push(...finalItinerary[day]);
            });

        if (!activeHub?.name || allSpotsFlat.length === 0) {
            alert("Please add at least one spot before saving.");
            return;
        }

        localStorage.setItem('finalItinerary', JSON.stringify(finalItinerary));
        localStorage.setItem('activeHubName', activeHub.name);

        const fullTripDistance = calculateTotalRoute(activeHub, allSpotsFlat);
        const fullTripDriveData = calculateDriveTimes(activeHub, allSpotsFlat);

        const pdfData = generateItineraryPDF({
            activeHubName: activeHub.name,
            dateRange,
            addedSpots: finalItinerary,
            totalDistance: fullTripDistance,
            driveData: fullTripDriveData
        });

        navigate('/last', { state: { pdfData } });
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
        if (dayCount < currentDay) {
            setCurrentDay(1);
            setStoredDays({});
            setAddedSpots([]);
        }
    }, [dayCount, currentDay]);

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
                        activeHub={activeHub}
                        currentDay={currentDay}
                        dayCount={dayCount}
                        isLastDay={isLastDay}
                        handleOptimize={handleOptimize}
                        setSelectedLocation={setSelectedLocation}
                        handleToggleLock={handleToggleLock}
                        handleMoveSpot={handleMoveSpot}
                        handleRemoveSpot={handleRemoveSpot}
                        handlePreviousDay={handlePreviousDay}
                        handleSliceAndNext={handleSliceAndNext}
                        handleSaveItinerary={handleSaveItinerary}
                    />
                )
            };
        }
        return msg;
    });

    return (
        <div className={`${styles.itineraryContainer} ${isMapFullscreen ? styles.itineraryContainerFullscreen : ''} ${(!activeHub || !dateRange.start || !dateRange.end) ? styles.itineraryNoSidebar : ''}`}>
            <div className={styles.gradientBg} />
            {!isMobile && activeHub && dateRange.start && dateRange.end && (
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
                            onKeyboardChange={setIsKeyboardOpen}
                        />
                    </div>
                </aside>
            )}

            {/* Map Container with Controls */}
            <div className={`${styles.mapArea} ${isMapFullscreen ? styles.mapAreaFullscreen : ''}`}>
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
                    className={`${styles.mapExpandedReviewToggle} ${isKeyboardOpen ? styles.mapExpandedReviewToggleBlurred : ''}`}
                    onClick={() => setIsMapExpandedReviewOpen((prev) => !prev)}
                >
                    {isMapExpandedReviewOpen ? 'Hide Info' : 'Show Info'}
                </button>
                {isMapExpandedReviewOpen && (
                    <>
                        <aside className={`${styles.mapExpandedReviewBox} ${isKeyboardOpen ? styles.mapExpandedReviewBoxBlurred : ''}`}>
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
                        currentDay={currentDay}
                        setCurrentDay={setCurrentDay}
                        storedDays={storedDays}
                        setStoredDays={setStoredDays}
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
                                currentDay={currentDay}
                                setCurrentDay={setCurrentDay}
                                storedDays={storedDays}
                                setStoredDays={setStoredDays}
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
