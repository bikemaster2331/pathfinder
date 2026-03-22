import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import cardStyles from '../styles/itinerary_page/ItineraryCard.module.css';
import PreferenceCard from '../components/ItineraryCard';
import MapWrapper from '../components/MapWrapper';
import ThemeToggle from '../components/ThemeToggle';
import ChatBot from '../components/ChatBot';
import { TRAVEL_HUBS } from '../constants/location';
import { optimizeRoute } from '../utils/optimize';
import { calculateDriveTimes, calculateTimeUsage, calculateTotalRoute, calculateDistance } from '../utils/distance';
import { generateItineraryPDF } from '../utils/generatePDF';
import defaultBg from '../assets/images/card/catanduanes.png';
import { motion, AnimatePresence } from 'framer-motion';
import { House, Sun, CreditCard, Clock3, MapPin } from 'lucide-react';
import { generateItinerary } from '../utils/generateItinerary';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- CONFIGURATION ---
const BUDGET_CONFIG = {
    1: { filterValues: ["low"] },
    2: { filterValues: ["low", "medium"] },
    3: { filterValues: ["low", "medium", "high"] }
};

// --- DRAGGABLE SPOT ITEM ---
const SortableSpotItem = ({ spot, index, totalCount, cardStyles, setSelectedLocation, handleRemoveSpot }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: spot.name });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative',
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div
                className={`${cardStyles.miniSpotItem} ${spot.locked ? cardStyles.miniSpotItemLocked : ''}`}
                onClick={() => setSelectedLocation(spot)}
            >
                {/* Drag Handle */}
                <button
                    className={cardStyles.dragHandle}
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    title="Drag to reorder"
                    type="button"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="6" r="1" fill="currentColor"></circle>
                        <circle cx="15" cy="6" r="1" fill="currentColor"></circle>
                        <circle cx="9" cy="12" r="1" fill="currentColor"></circle>
                        <circle cx="15" cy="12" r="1" fill="currentColor"></circle>
                        <circle cx="9" cy="18" r="1" fill="currentColor"></circle>
                        <circle cx="15" cy="18" r="1" fill="currentColor"></circle>
                    </svg>
                </button>

                <div className={cardStyles.spotRow}>
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
    );
};

const SortableSpotList = ({ spots, driveData, cardStyles, setSelectedLocation, handleRemoveSpot, handleMoveSpot, setAddedSpots }) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
    );

    const spotIds = useMemo(() => spots.map(s => s.name), [spots]);

    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = spots.findIndex(s => s.name === active.id);
        const newIndex = spots.findIndex(s => s.name === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        setAddedSpots(prev => arrayMove(prev, oldIndex, newIndex));
    }, [spots, setAddedSpots]);

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={spotIds} strategy={verticalListSortingStrategy}>
                {spots.map((spot, index) => (
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
                        <SortableSpotItem
                            spot={spot}
                            index={index}
                            totalCount={spots.length}
                            cardStyles={cardStyles}
                            setSelectedLocation={setSelectedLocation}
                            handleRemoveSpot={handleRemoveSpot}
                        />
                    </div>
                ))}
            </SortableContext>
        </DndContext>
    );
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
    handleGenerate,
    setSelectedLocation,
    handleToggleLock,
    handleMoveSpot,
    handleRemoveSpot,
    handlePreviousDay,
    handleSliceAndNext,
    handleSaveItinerary,
    setAddedSpots
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
                    {spots && spots.length > 0 && (
                        <span className={styles.mapExpandedPreviewCount}>{spots.length} spot{spots.length === 1 ? '' : 's'}</span>
                    )}
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
                        {spots && spots.length > 0 && (
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
                        )}
                    </div>

                    <div className={styles.mapExpandedSpotsScroll}>
                        {spots && spots.length > 0 ? (
                            <SortableSpotList
                                spots={spots}
                                driveData={driveData}
                                cardStyles={cardStyles}
                                setSelectedLocation={setSelectedLocation}
                                handleRemoveSpot={handleRemoveSpot}
                                handleMoveSpot={handleMoveSpot}
                                setAddedSpots={setAddedSpots}
                            />
                        ) : (
                            <p className={cardStyles.previewContent}>
                                Day {currentDay} is empty. Select a map pin or generate a plan to begin.
                            </p>
                        )}
                    </div>

                    <div className={`${cardStyles.bottomButtonRow} ${styles.mapExpandedActionRow}`}>
                        {currentDay > 1 ? (
                            <button
                                onClick={handlePreviousDay}
                                className={`${cardStyles.saveButton} ${cardStyles.backButton} ${styles.mapExpandedBackAction}`}
                                style={{ backgroundColor: '#4B5563', marginRight: 'auto' }}
                                title="Go back to previous day"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                            </button >
                        ) : (
                            <div style={{ marginRight: 'auto' }}></div>
                        )}

                        <button
                            className={`${cardStyles.saveButton} ${styles.mapExpandedPrimaryAction}`}
                            onClick={handleGenerate}
                            style={{ backgroundColor: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: 'auto' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pickaxe-icon lucide-pickaxe">
                                <path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"/>
                                <path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"/>
                                <path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"/>
                                <path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"/>
                            </svg>
                            Generate
                        </button>

                        <button
                            className={`${cardStyles.saveButton} ${styles.mapExpandedPrimaryAction}`}
                            onClick={isNextAction ? handleSliceAndNext : handleSaveItinerary}
                            style={{
                                backgroundColor: isNextAction ? 'transparent' : '#2563EB',
                                border: isNextAction ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
                                color: isNextAction ? 'rgba(255, 255, 255, 0.8)' : '#ffffff',
                                padding: '0 12px'
                            }}
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
    // --- enforces 1-hour INACTIVITY timeout per process ---
    // Runs once on page load to check if you've been inactive for over an hour.
    useMemo(() => {
        try {
            const ONE_HOUR_MS = 60 * 60 * 1000;
            const lastActivity = sessionStorage.getItem('itinerary_last_activity');
            const now = Date.now();
            
            if (lastActivity && (now - parseInt(lastActivity, 10) > ONE_HOUR_MS)) {
                // Expired! Clear all itinerary related keys in sessionStorage
                Object.keys(sessionStorage).forEach(key => {
                    if (key.startsWith('itinerary_')) {
                        sessionStorage.removeItem(key);
                    }
                });
                console.log("[SESSION] Cleared stale itinerary session (>1h inactive)");
            }
            
            // Update timestamp to now, keeping the session alive since you are actively loading
            sessionStorage.setItem('itinerary_last_activity', now.toString());
        } catch (e) {
            // safely ignore storage errors
        }
    }, []);

    const navigate = useNavigate();
    const [allSpots, setAllSpots] = useState(null);
    const [addedSpots, setAddedSpots] = useState(() => {
        try {
            const saved = sessionStorage.getItem('itinerary_addedSpots');
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            // Validate — must be an array of objects with a name property
            if (!Array.isArray(parsed) || (parsed.length > 0 && typeof parsed[0]?.name !== 'string')) {
                sessionStorage.removeItem('itinerary_addedSpots');
                return [];
            }
            return parsed;
        } catch {
            sessionStorage.removeItem('itinerary_addedSpots');
            return [];
        }
    });
    const [storedDays, setStoredDays] = useState(() => {
        try {
            const saved = sessionStorage.getItem('itinerary_storedDays');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    const [currentDay, setCurrentDay] = useState(() => {
        try {
            const saved = sessionStorage.getItem('itinerary_currentDay');
            return saved ? parseInt(saved, 10) : 1;
        } catch { return 1; }
    });
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [activeHub, setActiveHub] = useState(() => {
        const saved = sessionStorage.getItem('itinerary_activeHub');
        return saved ? JSON.parse(saved) : null;
    });
    const [budgetFilter, setBudgetFilter] = useState(['low', 'medium', 'high']);
    const [selectedActivities, setSelectedActivities] = useState(() => {
        const saved = sessionStorage.getItem('itinerary_selectedActivities');
        return saved ? JSON.parse(saved) : {
            Water: false, Outdoor: false, Views: false,
            Heritage: false, Dining: false, Stay: false
        };
    });

    const [budget, setBudget] = useState(50);
    const [destination, setDestination] = useState(() => {
        const saved = sessionStorage.getItem('itinerary_destination');
        return saved ? saved : '';
    });
    const [dateRange, setDateRange] = useState(() => {
        const saved = sessionStorage.getItem('itinerary_dateRange');
        if (!saved) return { start: '', end: '' };
        try {
            const parsed = JSON.parse(saved);
            return {
                start: parsed?.start || '',
                end: parsed?.end || ''
            };
        } catch {
            return { start: '', end: '' };
        }
    });

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
        if (activeHub) sessionStorage.setItem('itinerary_activeHub', JSON.stringify(activeHub));
        else sessionStorage.removeItem('itinerary_activeHub');
    }, [activeHub]);

    useEffect(() => {
        try {
            sessionStorage.setItem('itinerary_addedSpots', JSON.stringify(addedSpots));
        } catch { /* storage full */ }
    }, [addedSpots]);

    useEffect(() => {
        try {
            sessionStorage.setItem('itinerary_storedDays', JSON.stringify(storedDays));
        } catch { /* storage full */ }
    }, [storedDays]);

    useEffect(() => {
        sessionStorage.setItem('itinerary_currentDay', currentDay.toString());
    }, [currentDay]);

    useEffect(() => {
        if (destination) sessionStorage.setItem('itinerary_destination', destination);
        else sessionStorage.removeItem('itinerary_destination');
    }, [destination]);

    useEffect(() => {
        sessionStorage.setItem('itinerary_dateRange', JSON.stringify(dateRange));
    }, [dateRange]);

    useEffect(() => {
        sessionStorage.setItem('itinerary_selectedActivities', JSON.stringify(selectedActivities));
    }, [selectedActivities]);

    // Chat State Lifted to Parent
    const [chatMessages, setChatMessages] = useState(() => {
        const saved = sessionStorage.getItem('itinerary_chatMessages');
        return saved ? JSON.parse(saved) : [{ role: 'widget', type: 'itinerary', id: 'init-widget' }];
    });

    useEffect(() => {
        try {
            sessionStorage.setItem('itinerary_chatMessages', JSON.stringify(chatMessages));
        } catch { /* storage full */ }
    }, [chatMessages]);
    const [activePin, setActivePin] = useState(null);

    // SHEET STATE
    const [sheetState, setSheetState] = useState('collapsed');

    const [mobilePanel, setMobilePanel] = useState('review');
    const [isMobile, setIsMobile] = useState(false);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);
    const [isChatMinimized, setIsChatMinimized] = useState(false);
    const [isMapExpandedReviewOpen, setIsMapExpandedReviewOpen] = useState(false);
    const [isMapExpandedReviewExpanded, setIsMapExpandedReviewExpanded] = useState(false);
    const [isTripMenuOpen, setIsTripMenuOpen] = useState(true);
    const [isInitialTripboxCompleted, setIsInitialTripboxCompleted] = useState(() => {
        try { return sessionStorage.getItem('itinerary_tripboxDone') === 'true'; }
        catch { return false; }
    });
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);
    const [isChatVisible, setIsChatVisible] = useState(true);
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
            // Filter out ANY previous itinerary widget to ensure only one exists
            const filtered = prev.filter(m => !(m.role === 'widget' && m.type === 'itinerary'));
            return [...filtered, { role: 'widget', type: 'itinerary', id: Date.now() }];
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

    const handleGenerate = () => {
        const result = generateItinerary({
            hub: activeHub,
            dayCount,
            budgetFilter,
            selectedActivities,
            allSpots,
        });
        if (Object.keys(result).length === 0) {
            alert("No spots match your current filters. Try expanding your budget or activities.");
            return;
        }
        setStoredDays(result);
        setAddedSpots(result[1] || []);
        setCurrentDay(1);
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
        pushItineraryWidgetToChat();
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

    const mapExpandedMetaItems = useMemo(() => {
        if (!selectedLocation) return [];

        const exposureRaw = String(selectedLocation.outdoor_exposure || 'outdoor').toLowerCase();
        const budgetRaw = String(selectedLocation.min_budget || 'low').toLowerCase();
        const bestTimeRaw = String(selectedLocation.best_time_of_day || 'any').toLowerCase();
        const municipalityRaw = String(selectedLocation.municipality || 'Catanduanes');

        let budgetLabel = 'Low';
        if (budgetRaw.includes('high') || budgetRaw.includes('₱₱₱')) budgetLabel = 'High';
        else if (budgetRaw.includes('medium') || budgetRaw.includes('₱₱')) budgetLabel = 'Medium';

        let timeLabel = 'Anytime';
        if (bestTimeRaw === 'any') timeLabel = 'All Day';
        else if (bestTimeRaw.includes('morning')) timeLabel = 'Morning';
        else if (bestTimeRaw.includes('noon') || bestTimeRaw.includes('midday') || bestTimeRaw.includes('lunch')) timeLabel = 'Midday';
        else if (bestTimeRaw.includes('sunset')) timeLabel = 'Sunset';
        else if (bestTimeRaw.includes('night')) timeLabel = 'Night';
        else if (bestTimeRaw.includes('evening')) timeLabel = 'Evening';
        else if (bestTimeRaw.includes('dinner')) timeLabel = 'Dinner';
        else timeLabel = bestTimeRaw.charAt(0).toUpperCase() + bestTimeRaw.slice(1);

        const exposureLabel = exposureRaw.charAt(0).toUpperCase() + exposureRaw.slice(1);
        const locationLabel = municipalityRaw
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());
        const environmentValueClass = exposureRaw === 'indoor'
            ? styles.mapExpandedMetaValueEnvironmentIndoor
            : exposureRaw === 'shaded'
                ? styles.mapExpandedMetaValueEnvironmentShaded
                : styles.mapExpandedMetaValueEnvironmentOutdoor;
        const costValueClass = budgetLabel === 'High'
            ? styles.mapExpandedMetaValueCostHigh
            : budgetLabel === 'Medium'
                ? styles.mapExpandedMetaValueCostMedium
                : styles.mapExpandedMetaValueCostLow;
        const timeValueClass = timeLabel === 'Morning'
            ? styles.mapExpandedMetaValueTimeMorning
            : timeLabel === 'Midday'
                ? styles.mapExpandedMetaValueTimeMidday
                : timeLabel === 'Sunset'
                    ? styles.mapExpandedMetaValueTimeSunset
                    : timeLabel === 'Evening'
                        ? styles.mapExpandedMetaValueTimeEvening
                        : timeLabel === 'Dinner'
                            ? styles.mapExpandedMetaValueTimeDinner
                            : timeLabel === 'Night'
                                ? styles.mapExpandedMetaValueTimeNight
                                : styles.mapExpandedMetaValueTimeAllDay;
        const environmentIcon = exposureRaw === 'indoor'
            ? <House aria-hidden="true" />
            : <Sun aria-hidden="true" />;

        return [
            { key: 'location', label: 'Location', value: locationLabel, icon: <MapPin aria-hidden="true" />, valueClass: styles.mapExpandedMetaValueLocation },
            { key: 'cost', label: 'Cost Level', value: budgetLabel, icon: <CreditCard aria-hidden="true" />, valueClass: costValueClass },
            { key: 'time', label: 'Best Time', value: timeLabel, icon: <Clock3 aria-hidden="true" />, valueClass: timeValueClass },
            { key: 'environment', label: 'Environment', value: exposureLabel, icon: environmentIcon, valueClass: environmentValueClass }
        ];
    }, [selectedLocation, styles.mapExpandedMetaValueCostHigh, styles.mapExpandedMetaValueCostLow, styles.mapExpandedMetaValueCostMedium, styles.mapExpandedMetaValueEnvironmentIndoor, styles.mapExpandedMetaValueEnvironmentOutdoor, styles.mapExpandedMetaValueEnvironmentShaded, styles.mapExpandedMetaValueLocation, styles.mapExpandedMetaValueTimeAllDay, styles.mapExpandedMetaValueTimeDinner, styles.mapExpandedMetaValueTimeEvening, styles.mapExpandedMetaValueTimeMidday, styles.mapExpandedMetaValueTimeMorning, styles.mapExpandedMetaValueTimeNight, styles.mapExpandedMetaValueTimeSunset]);

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
        // Pre-load images
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
            setIsMapExpandedReviewExpanded(false);
        }
    }, [selectedLocation]);


    // --- MAP CHAT MESSAGES TO REACT COMPONENTS ---
    const displayMessages = useMemo(() => {
        return chatMessages.map((msg, index) => {
            if (msg.role === 'widget' && msg.type === 'itinerary') {
                // A widget is "latest" (expanded) ONLY if it is the very last message in the chat
                const isLatest = index === chatMessages.length - 1;
                return {
                    ...msg,
                    content: (
                        <PreviewWidget
                            isLatest={isLatest}
                            spots={addedSpots}
                            styles={styles}
                            cardStyles={cardStyles}
                            activeHub={activeHub}
                            currentDay={currentDay}
                            dayCount={dayCount}
                            isLastDay={isLastDay}
                            handleOptimize={handleOptimize}
                            handleGenerate={handleGenerate}
                            setSelectedLocation={setSelectedLocation}
                            handleToggleLock={handleToggleLock}
                            handleMoveSpot={handleMoveSpot}
                            handleRemoveSpot={handleRemoveSpot}
                            handlePreviousDay={handlePreviousDay}
                            handleSliceAndNext={handleSliceAndNext}
                            handleSaveItinerary={handleSaveItinerary}
                            setAddedSpots={setAddedSpots}
                        />
                    )
                };
            }
            return msg;
        });
    }, [chatMessages, addedSpots, activeHub, currentDay, dayCount, isLastDay, handleOptimize, handleGenerate, setSelectedLocation, handleToggleLock, handleMoveSpot, handleRemoveSpot, handlePreviousDay, handleSliceAndNext, handleSaveItinerary, setAddedSpots, styles, cardStyles]);

    return (
        <div className={`${styles.itineraryContainer} ${isMapFullscreen ? styles.itineraryContainerFullscreen : ''} ${(!activeHub || !dateRange.start || !dateRange.end || !isChatVisible) ? styles.itineraryNoSidebar : ''}`}>
            <div className={styles.gradientBg} />
            {!isMobile && activeHub && dateRange.start && dateRange.end && isChatVisible && (
                <aside 
                    className={styles.desktopChatContainer}
                >
                    <div className={styles.desktopChatHeader}>
                        <div className={styles.desktopChatTitleGroup}>
                            <button 
                                className={styles.homeRedirectBtn}
                                onClick={(e) => { e.stopPropagation(); navigate('/'); }}
                                title="Return Home"
                                aria-label="Return Home"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-squares-exclude">
                                    <path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0"/>
                                    <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>
                                </svg>
                                <span className={styles.desktopChatTitle}>PATHFINDER</span>
                            </button>                            
                        </div>
                        <button
                            className={styles.checkItineraryBtn}
                            onClick={pushItineraryWidgetToChat}
                            aria-label="Check Itinerary"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-icon lucide-map"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>
                            Check Itinerary
                        </button>
                    </div>
                    <div className={styles.desktopChatBody}>
                        <ChatBot
                            variant="panel"
                            containerClassName={styles.desktopChatBot}
                            onLocationResponse={handleChatbotLocation}
                            messages={displayMessages}
                            setMessages={setChatMessages}
                            onKeyboardChange={setIsKeyboardOpen}
                            activePin={activePin}
                            setActivePin={setActivePin}
                        />
                    </div>
                </aside>
            )}

            {/* Map Container with Controls */}
            <div className={`${styles.mapArea} ${isMapFullscreen ? styles.mapAreaFullscreen : ''}`}>
                <MapWrapper
                    ref={mapRef}
                    isTripForecastVisible={false}
                    isChatVisible={isChatVisible}
                    selectedActivities={selectedActivities}
                    setSelectedActivities={setSelectedActivities}
                    onMarkerClick={(spot) => {
                        setSelectedLocation(spot);
                        setActivePin(spot?.name || null);  // track which pin was clicked
                    }}
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
                    onMenuStateChange={setIsTripMenuOpen}
                />
                <div className={styles.mapTopControlsGroup}>
                    <button
                        type="button"
                        className={`${styles.chatToggle} ${!isChatVisible ? styles.chatToggleDisabled : ''}`}
                        onClick={() => setIsChatVisible((prev) => !prev)}
                        title={isChatVisible ? "Hide Chat & Forecast" : "Show Chat & Forecast"}
                        aria-label="Toggle Chat"
                    >
                        {isChatVisible ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bot-message-square-icon lucide-bot-message-square">
                                <path d="M12 6V2H8"/><path d="M15 11v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M9 11v2"/>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bot-off-icon lucide-bot-off">
                                <path d="M13.67 8H18a2 2 0 0 1 2 2v4.33"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M22 22 2 2"/><path d="M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586"/><path d="M9 13v2"/><path d="M9.67 4H12v2.33"/>
                            </svg>
                        )}
                    </button>
                    <ThemeToggle 
                        className={styles.mapThemeToggle} 
                        iconLightClass={styles.iconLight} 
                        iconDarkClass={styles.iconDark} 
                    />
                    <button
                        type="button"
                        className={`${styles.mapMenuToggle} ${isTripMenuOpen ? styles.mapControlLarge : styles.mapControlSmall}`}
                        onClick={() => mapRef.current?.toggleMenu()}
                        data-menu-toggle="true"
                        aria-label="Toggle trip configuration"
                    >
                        <div className={styles.buttonContentWrapper}>
                            <svg
                                className={`${styles.menuChevron} ${isTripMenuOpen ? styles.menuChevronOpen : ''}`}
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                            {isTripMenuOpen && <span className={styles.buttonLabel}>Setup</span>}
                        </div>
                    </button>
                    <button
                        type="button"
                        className={`${styles.mapExpandedReviewToggle} ${!isTripMenuOpen ? styles.mapControlLarge : styles.mapControlSmall} ${isKeyboardOpen ? styles.mapExpandedReviewToggleBlurred : ''}`}
                        onClick={() => {
                            setIsMapExpandedReviewOpen((prev) => {
                                const next = !prev;
                                if (!next) setIsMapExpandedReviewExpanded(false);
                                return next;
                            });
                        }}
                        title={!isTripMenuOpen ? (isMapExpandedReviewOpen ? 'Hide Info' : 'Show Info') : 'Location Details'}
                    >
                        <div className={styles.buttonContentWrapper}>
                            {isTripMenuOpen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-badge-info">
                                    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>
                                    <line x1="12" x2="12" y1="16" y2="12"/>
                                    <line x1="12" x2="12.01" y1="8" y2="8"/>
                                </svg>
                            ) : (
                                <span className={styles.buttonLabel}>
                                    {isMapExpandedReviewOpen ? 'Hide Info' : 'Show Info'}
                                </span>
                            )}
                        </div>
                    </button>
                </div>
                {isMapExpandedReviewOpen && (
                    <>
                        <aside className={`${styles.mapExpandedReviewBox} ${isMapExpandedReviewExpanded ? styles.mapExpandedReviewBoxExpanded : ''} ${isKeyboardOpen ? styles.mapExpandedReviewBoxBlurred : ''}`}>
                            <div className={styles.mapExpandedReviewImageWrap}>
                                {selectedLocation && activeHub && (
                                    <div className={styles.mapExpandedReviewDistanceBadge}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
                                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                                            <circle cx="12" cy="10" r="3"></circle>
                                        </svg>
                                        {Math.round(calculateDistance(activeHub.coordinates, selectedLocation.geometry.coordinates))} km from hub
                                    </div>
                                )}
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
                                <p
                                    className={styles.mapExpandedReviewDesc}
                                    onClick={() => setIsMapExpandedReviewExpanded((prev) => !prev)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            setIsMapExpandedReviewExpanded((prev) => !prev);
                                        }
                                    }}
                                >
                                    {selectedLocation?.description || 'Select a map pin to load destination details in this card. Use "Add Spot" to include it in your itinerary'}
                                </p>
                                {isMapExpandedReviewExpanded && mapExpandedMetaItems.length > 0 && (
                                    <div className={styles.mapExpandedMetaHandler}>
                                        {mapExpandedMetaItems.map((item) => (
                                            <div key={item.key} className={styles.mapExpandedMetaBox}>
                                                <span className={styles.mapExpandedMetaLabel}>{item.label}</span>
                                                <div className={styles.mapExpandedMetaRow}>
                                                    {item.icon}
                                                    <span className={`${styles.mapExpandedMetaValue} ${item.valueClass || ''}`}>{item.value}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    className={`${styles.mapExpandedReviewBtn} ${!selectedLocation
                                        ? styles.mapExpandedReviewBtnDisabled
                                        : isSelectedAlreadyAdded
                                            ? styles.mapExpandedReviewBtnRemove
                                            : styles.mapExpandedReviewBtnAdd
                                        }`}
                                    disabled={!selectedLocation}
                                    onClick={() => (
                                        !selectedLocation
                                            ? null
                                            : isSelectedAlreadyAdded
                                                ? handleRemoveSpot(selectedLocation.name)
                                                : handleAddSpot(selectedLocation)
                                    )}
                                >
                                    {!selectedLocation ? 'Add Spot' : isSelectedAlreadyAdded ? 'Remove Spot' : 'Add Spot'}
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
                    messages={displayMessages}
                    setMessages={setChatMessages}
                    activePin={activePin}
                    setActivePin={setActivePin}
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