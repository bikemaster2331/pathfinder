import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TRAVEL_HUBS } from '../constants/location';
import styles from '../styles/itinerary_page/ItineraryCard.module.css';
import { calculateDistance, calculateTotalRoute, calculateDriveTimes, calculateTimeUsage } from '../utils/distance'; 
import { optimizeRoute } from '../utils/optimize';
import { generateItineraryPDF } from '../utils/generatePDF';
import defaultBg from '../assets/images/card/catanduanes.png';
import { motion, AnimatePresence } from 'framer-motion';

const PreferenceCard = ({ 
    selectedLocation,
    setSelectedLocation,
    addedSpots,   
    setAddedSpots,
    onAddSpot,
    onRemoveSpot,
    activeHubName,
    onToggleLock,
    onMoveSpot,
    dateRange
}) => {
    const navigate = useNavigate();

    // --- MULTI-DAY STATE ---
    const [currentDay, setCurrentDay] = useState(1);
    const [storedDays, setStoredDays] = useState({});
    
    // --- WARNING MODAL STATE ---
    const [showOverloadWarning, setShowOverloadWarning] = useState(false);
    const [warningDismissed, setWarningDismissed] = useState(false); 

    const isAlreadyAdded = selectedLocation && addedSpots.some(spot => spot.name === selectedLocation.name);
    const isHubSelected = Boolean(activeHubName && activeHubName !== "");

    // --- CALCULATIONS ---
    const dayCount = useMemo(() => {
        if (!dateRange.start || !dateRange.end) return 1;
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diffTime = end - start;
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return days > 0 ? days : 1;
    }, [dateRange]);

    useEffect(() => {
        if (dayCount < currentDay) {
            setCurrentDay(1);
            setStoredDays({});
            setAddedSpots([]);
        }
    }, [dayCount, setAddedSpots]);

    const distanceFromHub = useMemo(() => {
        if (!selectedLocation || !activeHubName) return null;
        const hub = TRAVEL_HUBS[activeHubName]; 
        if (!hub || !hub.coordinates || !selectedLocation.geometry || !selectedLocation.geometry.coordinates) return null;
        return calculateDistance(hub.coordinates, selectedLocation.geometry.coordinates);
    }, [selectedLocation, activeHubName]);

    const totalDistance = useMemo(() => {
        const hub = TRAVEL_HUBS[activeHubName];
        if (!hub || !addedSpots || addedSpots.length === 0) return 0;
        return calculateTotalRoute(hub, addedSpots);
    }, [addedSpots, activeHubName]);

    const driveData = useMemo(() => {
        const hub = TRAVEL_HUBS[activeHubName];
        if (!hub) return [];
        return calculateDriveTimes(hub, addedSpots);
    }, [addedSpots, activeHubName]);

    const [isReviewExpanded, setIsReviewExpanded] = useState(false);

    const timeWallet = useMemo(() => {
        const hub = TRAVEL_HUBS[activeHubName];
        
        if (!hub) return { 
            totalUsed: 0, 
            percent: 0, 
            remaining: 540, 
            color: 'rgb(255, 255, 255)', 
            label: 'Schedule Empty', 
            subtext: 'Select a starting point' 
        };

        const DAILY_CAPACITY = 540; 
        const usage = calculateTimeUsage(hub, addedSpots);
        const usedAmount = Number(usage?.totalUsed) || 0; 
        const remaining = DAILY_CAPACITY - usedAmount;
        
        let percent = (usedAmount / DAILY_CAPACITY) * 100;
        if (percent > 100) percent = 100; 

        // Dynamic Status Logic
        let color = '#10B981'; // Green
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

        return {
            used: usedAmount,
            remaining: remaining,
            percent: percent,
            color: color,
            label: label,
            subtext: subtext
        };
    }, [addedSpots, activeHubName]);

    // --- OVERLOAD WATCHER ---
    useEffect(() => {
        if (timeWallet.remaining < 0 && !warningDismissed && !showOverloadWarning) {
            setShowOverloadWarning(true);
        }
        if (timeWallet.remaining >= 0) {
            setWarningDismissed(false);
            setShowOverloadWarning(false);
        }
    }, [timeWallet.remaining, warningDismissed, showOverloadWarning]);

    // --- HANDLERS ---
    const handleOptimize = () => {
        if (!activeHubName || !addedSpots || addedSpots.length < 2) return;
        const hub = TRAVEL_HUBS[activeHubName];
        const newOrder = optimizeRoute(hub, addedSpots);
        if (setAddedSpots) setAddedSpots(newOrder);
    };

    // --- UPDATED HANDLER: Forward Logic (Next Day) ---
    const handleSliceAndNext = () => {
        // 1. Save current day's progress
        setStoredDays(prev => ({
            ...prev,
            [currentDay]: [...addedSpots]
        }));
        
        // 2. Calculate next day
        const nextDay = currentDay + 1;
        setCurrentDay(nextDay); 
        
        // 3. CHECK: Do we have data for this future day?
        const nextDaySpots = storedDays[nextDay];

        if (nextDaySpots && nextDaySpots.length > 0) {
            // YES -> Restore Memory
            setAddedSpots(nextDaySpots);
            
            // Restore the "Last Pic Location" (The last spot in the list)
            const lastSpot = nextDaySpots[nextDaySpots.length - 1];
            setSelectedLocation(lastSpot); 
            // Keep review box closed initially to be subtle, or open if you prefer
            setIsReviewExpanded(false); 

        } else {
            // NO -> Total Amnesia (Clean Slate)
            setAddedSpots([]); 
            setSelectedLocation(null); // Wipe the map pin
            setIsReviewExpanded(false); // Collapse box
        }
        
        // 4. Reset warnings
        setShowOverloadWarning(false);
        setWarningDismissed(false);
    };

    // --- NEW HANDLER: Backward Logic (Previous Day) ---
    const handlePreviousDay = () => {
        if (currentDay <= 1) return;

        // 1. Save current day's progress before leaving
        setStoredDays(prev => ({
            ...prev,
            [currentDay]: [...addedSpots]
        }));

        // 2. Go back one day
        const prevDay = currentDay - 1;
        setCurrentDay(prevDay);
        
        // 3. Restore Previous Data
        const prevDaySpots = storedDays[prevDay];

        if (prevDaySpots && prevDaySpots.length > 0) {
            setAddedSpots(prevDaySpots);
            
            // Restore "Last Pic Location" from that day
            const lastSpot = prevDaySpots[prevDaySpots.length - 1];
            setSelectedLocation(lastSpot);
            setIsReviewExpanded(false);
        } else {
            // Fallback (Shouldn't happen if you couldn't go back, but safe to have)
            setAddedSpots([]);
            setSelectedLocation(null);
        }

        // 4. Reset warnings
        setShowOverloadWarning(false);
        setWarningDismissed(false);
    };

    const handleKeepGoing = () => {
        setShowOverloadWarning(false);
        setWarningDismissed(true); 
    };

    const handleSaveItinerary = () => {
        const finalItinerary = {
            ...storedDays,
            [currentDay]: addedSpots
        };

        const allSpotsFlat = [];
        Object.keys(finalItinerary).sort().forEach(day => {
            allSpotsFlat.push(...finalItinerary[day]);
        });

        if (!activeHubName || allSpotsFlat.length === 0) {
            alert("Please add at least one spot before saving.");
            return;
        }

        console.log("Saving itinerary...", finalItinerary);

        localStorage.setItem('finalItinerary', JSON.stringify(finalItinerary));
        localStorage.setItem('activeHubName', activeHubName);

        const hub = TRAVEL_HUBS[activeHubName];
        const fullTripDistance = calculateTotalRoute(hub, allSpotsFlat);
        const fullTripDriveData = calculateDriveTimes(hub, allSpotsFlat);

        generateItineraryPDF({
            activeHubName,
            dateRange,
            addedSpots: finalItinerary, 
            totalDistance: fullTripDistance,
            driveData: fullTripDriveData
        });

        navigate('/last');
    };

    const isLastDay = currentDay >= dayCount;

    return (
        <div className={styles.PreferenceCard}>
            
            {/* --- OVERLOAD MODAL --- */}
            {showOverloadWarning && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalIcon}>✂️</div>
                        <h3 className={styles.modalTitle}>
                            Day {currentDay} is Full
                        </h3>
                        <p className={styles.modalText}>
                            You have exceeded the time wallet for Day {currentDay}.<br/>
                            Do you want to slice this day here and start planning <b>Day {currentDay + 1}</b>?
                        </p>
                        <div className={styles.modalActions}>
                            <button 
                                onClick={handleKeepGoing}
                                className={styles.modalBtnCancel}
                            >
                                No, Keep Packing Day {currentDay}
                            </button>
                            
                            {!isLastDay && (
                                <button 
                                    onClick={handleSliceAndNext}
                                    className={styles.modalBtnConfirm}
                                >
                                    Yes, Slice & Start Day {currentDay + 1}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.secondCard}>
                
                {/* --- REVIEW BOX (IMMERSIVE BACKGROUND) --- */}
                <div className={`${styles.reviewBox} ${isReviewExpanded ? styles.reviewBoxExpanded : ''}`}>
                    <img    
                        src={selectedLocation?.image || defaultBg} 
                        alt="Destination Preview" 
                        className={styles.reviewBoxBackground}
                        onError={(e) => { e.target.src = defaultBg; }} 
                    />
                    {/* 2. Gradient Overlay */}
                    <div className={styles.reviewBoxOverlay}></div>

                    {/* 3. Text Content */}
                    <div className={styles.reviewContent}>
                        <h3 className={styles.boxTitle}>
                            {selectedLocation ? selectedLocation.name : "Explore Catanduanes"}
                        </h3>
                        {selectedLocation && distanceFromHub !== null && (
                            <span className={styles.distanceBadge}>
                                {distanceFromHub} km from Hub 📍
                            </span>
                        )}
                        <div className={styles.reviewBottomRow}>
                            {/* Left: Description */}
                            <div className={styles.descriptionSection}>
                                <p className={styles.reviewText}>
                                    {selectedLocation 
                                        ? (selectedLocation.description || "Explore this destination and add it to your plan.") 
                                        : "Click a pin on the map to see details here."}
                                </p>
                                
                                {/* MOVED: ADD SPOT BUTTONS (Now next to text) */}
                                {selectedLocation && (
                                    isAlreadyAdded ? (
                                        <button 
                                            className={styles.removeSpotMain}
                                            onClick={() => onRemoveSpot(selectedLocation.name)}
                                            title="Remove from itinerary"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                            </svg>
                                        </button>
                                    ) : (
                                        <button 
                                            className={isHubSelected ? styles.addSpot : styles.addSpotDisabled}
                                            onClick={() => isHubSelected && onAddSpot(selectedLocation)}
                                            disabled={!isHubSelected}
                                            title={isHubSelected ? "Add tourist spot" : "Select a starting point first"}
                                        >
                                            {isHubSelected ? (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin-plus-icon lucide-map-pin-plus"><path d="M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738"/><circle cx="12" cy="10" r="3"/><path d="M16 18h6"/><path d="M19 15v6"/></svg>
                                                </>
                                            ) : (
                                                <>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                                        <circle cx="12" cy="10" r="3"></circle>
                                                    </svg>
                                                </>
                                            )}
                                        </button>
                                    )
                                )}
                            </div>
                            
                            {/* MOVED: EXPAND BUTTON (Now in the corner) */}
                            <div className={styles.actionButtonSection}>
                                <button className={`${styles.expandBtn} ${isReviewExpanded ? styles.btnRotatedVertical : ''}`}
                                    onClick={() => setIsReviewExpanded(!isReviewExpanded)}
                                    title={isReviewExpanded ? "Collapse" : "Expand Details"}
                                    >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* --- THE CLOSET METHOD: ANIMATED EXPANDED COMPONENTS (SMART TAGS) --- */}
                        <AnimatePresence>
                            {isReviewExpanded && (
                                <motion.div
                                    key="expanded-details"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    
                                    // FIX 1: Slowed down animation to 0.8s to allow UI to catch up
                                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} 
                                    className={styles.expandedContent}
                                >
                                    <div className={styles.expandedContentInner}>
                                        
                                        {/* THE "SMART TAGS" GRID */}
                                        <div className={styles.metaHandler}>

                                            {/* A. ENVIRONMENT */}
                                            <div className={styles.metaBox}>
                                                <span className={styles.metaLabel}>ENVIRONMENT</span>
                                                <div className={styles.metaRow}>
                                                    {selectedLocation?.outdoor_exposure === 'indoor' ? (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l8-4 8 4v14"/><path d="M10 9a3 3 0 0 1 3 3v9"/></svg>
                                                    ) : selectedLocation?.outdoor_exposure === 'shaded' ? (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><circle cx="12" cy="12" r="5"/></svg>
                                                    ) : (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCD34D" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>
                                                    )}
                                                    <span className={styles.metaValueCaps}>
                                                        {selectedLocation?.outdoor_exposure || 'Outdoor'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* B. COST LEVEL */}
                                            <div className={styles.metaBox}>
                                                <span className={styles.metaLabel}>COST LEVEL</span>
                                                <div className={styles.metaRow}>
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                                                    <span className={styles.metaValue}>
                                                        {selectedLocation?.min_budget === 'high' ? '₱₱₱' : 
                                                        selectedLocation?.min_budget === 'medium' ? '₱₱' : '₱'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* C. BEST TIME */}
                                            <div className={styles.metaBox}>
                                                <span className={styles.metaLabel}>BEST TIME</span>
                                                <div className={styles.metaRow}>
                                                    {(() => {
                                                        const time = selectedLocation?.best_time_of_day;
                                                        let icon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
                                                        let color = '#10B981';
                                                        
                                                        if (time === 'morning') {
                                                            color = '#FCD34D';
                                                            icon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><circle cx="12" cy="12" r="4"/></svg>;
                                                        } else if (['noon', 'midday', 'lunch'].includes(time)) {
                                                            color = '#F59E0B';
                                                            icon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/></svg>;
                                                        } else if (['sunset', 'evening'].includes(time)) {
                                                            color = '#F472B6';
                                                            icon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M12 2v8"/><path d="m2 18h2"/><path d="m20 18h2"/><path d="M22 22H2"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>;
                                                        }

                                                        return (
                                                            <>
                                                                {icon}
                                                                <span className={styles.metaValueCaps}>
                                                                    {time === 'any' ? 'All Day' : time || 'Anytime'}
                                                                </span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* D. LOCATION */}
                                            <div className={styles.metaBox}>
                                                <span className={styles.metaLabel}>LOCATION</span>
                                                <div className={styles.metaRow}>
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                                    <span className={styles.metaValueUpper}>
                                                        {selectedLocation?.municipality || 'Catanduanes'}
                                                    </span>
                                                </div>
                                            </div>

                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {/* --- END CLOSET --- */}

                    </div>
                </div>

                {/* --- ITINERARY PREVIEW (BLANKET METHOD) --- */}
                {/* FIX 2: Added inline transition to SYNC with the motion.div above */}
                <div 
                    className={`${styles.itineraryPreview} ${isReviewExpanded ? styles.previewHidden : ''} ${styles.itineraryPreviewTransition}`}
                >
                    
                    {/* Header Row */}
                    <div className={styles.previewHeader}>
                        <div className={styles.previewHeaderTitleGroup}>
                            <h3 className={`${styles.boxTitle} ${styles.previewHeaderTitle}`}>
                                Day {currentDay} of {dayCount}
                            </h3>
                        </div>

                        {/* Compact Optimize Button */}
                        <button 
                            onClick={handleOptimize}
                            className={styles.optimizeBtnSmall}
                            title="Fix my route order"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-waypoints-icon lucide-waypoints"><path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>
                            </svg>
                        </button>
                    </div>

                    <div className={styles.walletContainer}>
                        <div className={styles.walletHeader}>                            
                            <div className={styles.walletStatusGroup}>
                                <div className={styles.walletLabel}>
                                    {timeWallet.label}
                                </div>
                                <div className={styles.walletSubtext}>
                                    {timeWallet.subtext}
                                </div>
                            </div>
                        </div>
                        
                        <div className={styles.walletBarTrack}>
                            <div 
                                className={styles.walletBarFill} 
                                style={{
                                    width: `${timeWallet.percent}%`,
                                    backgroundColor: timeWallet.color,
                                }}
                            ></div>
                        </div>
                        <div className={styles.statsRow}>
                            <span className={styles.statBadge}>{addedSpots?.length || 0} Stops</span>
                            <span className={styles.statBadge}>{totalDistance} km</span>
                        </div>
                    </div>
                    
                    

                    <div className={styles.addedSpotsList}>
                        {addedSpots && addedSpots.length > 0 ? (
                            addedSpots.map((spot, index) => (
                                <div key={index}>
                                    
                                    {driveData[index]?.driveTime > 0 && (
                                        <div 
                                            className={styles.driveTimeLabel}
                                            style={{ marginTop: index === 0 ? '0px' : '-4px' }}
                                        >
                                            <div className={styles.driveTimeLine}></div>
                                            
                                            {/* New Car SVG */}
                                            <svg className={styles.driveTimeIcon} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
                                                <circle cx="7" cy="17" r="2"></circle>
                                                <circle cx="17" cy="17" r="2"></circle>
                                            </svg>
                                            
                                            {driveData[index].driveTime} min drive
                                        </div>
                                    )}

                                    <div 
                                        className={`${styles.miniSpotItem} ${spot.locked ? styles.miniSpotItemLocked : ''}`}
                                        onClick={() => setSelectedLocation(spot)}
                                    >
                                        <div className={styles.spotRow}>
                                            
                                            <div className={styles.visitDurationBadge}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <polyline points="12 6 12 12 16 14"></polyline>
                                                </svg>
                                                
                                                {spot.visit_time_minutes > 0 ? spot.visit_time_minutes : 60}m
                                            </div>

                                            {/* FIX: Prevent wide text expanding the card */}
                                            <span className={styles.spotName}>
                                                {spot.locked && (
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                    </svg>
                                                )} 
                                                {spot.name}
                                            </span>
                                        </div>
                                        
                                        <div className={styles.spotActions}>
                                            
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onMoveSpot(index, -1); }}
                                                className={styles.spotActionBtn}
                                                disabled={index === 0}
                                                title="Move Up"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="18 15 12 9 6 15"></polyline>
                                                </svg>
                                            </button>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); onMoveSpot(index, 1); }}
                                                className={styles.spotActionBtn}
                                                disabled={index === addedSpots.length - 1}
                                                title="Move Down"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </button>

                                            <div className={styles.actionDivider}></div>

                                            <button 
                                                className={`${styles.removeBtn} ${styles.lockBtn} ${spot.locked ? styles.lockBtnActive : styles.lockBtnInactive}`}
                                                onClick={(e) => { e.stopPropagation(); onToggleLock(spot.name); }}
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
                                                className={`${styles.removeBtn} ${styles.removeSmallBtn}`}
                                                onClick={(e) => { e.stopPropagation(); onRemoveSpot(spot.name); }}
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
                            <p className={styles.previewContent}>
                                Day {currentDay} wallet is empty. Select a pin to add.
                            </p>
                        )}
                    </div>

                    {/* --- BOTTOM BUTTON ROW (UPDATED) --- */}
                    <div className={styles.bottomButtonRow}>
                        
                        {/* BACK BUTTON (Visible Day 2+) */}
                        {currentDay > 1 && (
                            <button 
                                onClick={handlePreviousDay}
                                className={`${styles.saveButton} ${styles.backButton}`}
                                style={{ 
                                    backgroundColor: '#4B5563'
                                }}
                                title="Go back to previous day"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-icon lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                            </button>
                        )}

                        {/* NEXT / SAVE BUTTON */}
                        <button 
                            className={styles.saveButton} 
                            onClick={isLastDay ? handleSaveItinerary : handleSliceAndNext}
                            style={{
                                backgroundColor: isLastDay ? '#2563EB' : undefined,
                                flex: 1
                            }}
                        >
                            {isLastDay ? (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                        <polyline points="7 3 7 8 15 8"></polyline>
                                    </svg>
                                    Save
                                </>
                            ) : (
                                <>
                                    Complete Day {currentDay} & Next 
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-forward-icon lucide-forward"><path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                                </>
                            )}
                        </button>
                    </div>

                    {!isLastDay && (
                        <div 
                            onClick={handleSaveItinerary}
                            className={styles.finishLink}
                        >
                            (Or finish and save itinerary now)
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

export default PreferenceCard;
