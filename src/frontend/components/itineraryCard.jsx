import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // <--- ADDED THIS
import { TRAVEL_HUBS } from '../constants/location';
import styles from '../styles/itinerary_page/ItineraryCard.module.css';
import { calculateDistance, calculateTotalRoute, calculateDriveTimes, calculateTimeUsage } from '../utils/distance'; 
import { optimizeRoute } from '../utils/optimize';
import { generateItineraryPDF } from '../utils/generatePDF';

// --- CONFIGURATION ---
const BUDGET_CONFIG = {
    1: { filterValues: ["low"] },
    2: { filterValues: ["low", "medium"] },
    3: { filterValues: ["low", "medium", "high"] }
};

const PreferenceCard = ({ 
    selectedActivities, 
    setSelectedActivities, 
    selectedLocation,
    setSelectedLocation,
    addedSpots,   
    setAddedSpots,
    onAddSpot,
    onRemoveSpot,
    onHubChange,
    activeHubName,
    onToggleLock,
    onMoveSpot,
    onBudgetChange 
}) => {
    // --- HOOKS ---
    const navigate = useNavigate(); // <--- INITIALIZED THIS

    // --- STATE ---
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [budget, setBudget] = useState(50); 
    const [destination, setDestination] = useState(activeHubName || ''); 

    // --- MULTI-DAY STATE ---
    const [currentDay, setCurrentDay] = useState(1);
    const [storedDays, setStoredDays] = useState({});
    
    // --- WARNING MODAL STATE ---
    const [showOverloadWarning, setShowOverloadWarning] = useState(false);
    const [warningDismissed, setWarningDismissed] = useState(false); 

    useEffect(() => {
        setDestination(activeHubName || '');
    }, [activeHubName]);

    // Budget Slider
    const getBudgetStep = (value) => {
        if (value <= 33) return 1;
        if (value <= 66) return 2;
        return 3;
    };

    useEffect(() => {
        if (onBudgetChange) {
            const step = getBudgetStep(budget);
            onBudgetChange(BUDGET_CONFIG[step].filterValues);
        }
    }, [budget, onBudgetChange]);

    const today = new Date().toISOString().split('T')[0];
    const isAlreadyAdded = selectedLocation && addedSpots.some(spot => spot.name === selectedLocation.name);
    const isHubSelected = Boolean(activeHubName && activeHubName !== "");

    const handleActivityChange = (activityName) => {
        setSelectedActivities(prev => ({
            ...prev,
            [activityName]: !prev[activityName]
        }));
    };

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

    const durationString = dayCount > 0 ? `${dayCount} Days` : "1 Day";

    const distanceFromHub = useMemo(() => {
        if (!selectedLocation || !activeHubName) return null;
        const hub = TRAVEL_HUBS[activeHubName]; 
        if (!hub || !hub.coordinates || !selectedLocation.geometry || !selectedLocation.geometry.coordinates) return null;
        return calculateDistance(hub.coordinates, selectedLocation.geometry.coordinates);
    }, [selectedLocation, activeHubName]);

    // Current Day Calculations
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

    const timeWallet = useMemo(() => {
        const hub = TRAVEL_HUBS[activeHubName];
        
        if (!hub) return { 
            totalUsed: 0, 
            percent: 0, 
            remaining: 540, 
            color: '#3ec3e4ff', 
            label: 'Schedule Empty', 
            subtext: 'Select a starting point' 
        };

        const DAILY_CAPACITY = 540; 
        const usage = calculateTimeUsage(hub, addedSpots);
        const usedAmount = Number(usage?.totalUsed) || 0; 
        const remaining = DAILY_CAPACITY - usedAmount;
        
        let percent = (usedAmount / DAILY_CAPACITY) * 100;
        if (percent > 100) percent = 100; 

        let color = '#10B981'; 
        let label = 'Relaxed pace';
        let subtext = 'Plenty of buffer (Start 8-9 AM)';
        
        if (remaining < 0) {
            color = '#EF4444'; 
            label = 'Day Overloaded';
            subtext = 'Not realistic in one day';
        } else if (remaining < 120) { 
            color = '#F59E0B'; 
            label = 'Tight but doable';
            subtext = 'Early start required';
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

    const handleSliceAndNext = () => {
        setStoredDays(prev => ({
            ...prev,
            [currentDay]: [...addedSpots]
        }));
        
        setAddedSpots([]); 
        setCurrentDay(prev => prev + 1); 
        
        setShowOverloadWarning(false);
        setWarningDismissed(false);
    };

    const handleKeepGoing = () => {
        setShowOverloadWarning(false);
        setWarningDismissed(true); 
    };

    // --- FIXED SAVE FUNCTION ---
    const handleSaveItinerary = () => {
        
        // 1. Construct the complete object
        const finalItinerary = {
            ...storedDays,
            [currentDay]: addedSpots
        };

        // 2. Validate - Check if empty
        const allSpotsFlat = [];
        Object.keys(finalItinerary).sort().forEach(day => {
            allSpotsFlat.push(...finalItinerary[day]);
        });

        if (!activeHubName || allSpotsFlat.length === 0) {
            alert("Please add at least one spot before saving.");
            return;
        }

        console.log("Saving itinerary...", finalItinerary);

        // 3. PERSIST DATA: Save to LocalStorage so 'Last.jsx' can read it
        localStorage.setItem('finalItinerary', JSON.stringify(finalItinerary));
        localStorage.setItem('activeHubName', activeHubName);

        // 4. Generate PDF (Optional: Keep this if you want the download to start immediately)
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

        // 5. Navigate to the Thank You Page (Last step!)
        navigate('/last');
    };

    const isLastDay = currentDay >= dayCount;

    return (
        <div className={styles.PreferenceCard}>
            
            {/* --- OVERLOAD MODAL --- */}
            {showOverloadWarning && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        backgroundColor: '#1F2937',
                        padding: '24px',
                        borderRadius: '12px',
                        border: '1px solid #EF4444',
                        maxWidth: '400px',
                        textAlign: 'center',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ fontSize: '40px', marginBottom: '16px' }}>✂️</div>
                        <h3 style={{ color: '#EF4444', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
                            Day {currentDay} is Full
                        </h3>
                        <p style={{ color: '#E5E7EB', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
                            You have exceeded the time wallet for Day {currentDay}.<br/>
                            Do you want to slice this day here and start planning <b>Day {currentDay + 1}</b>?
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button 
                                onClick={handleKeepGoing}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid #4B5563',
                                    background: 'transparent',
                                    color: '#E5E7EB',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                No, Keep Packing Day {currentDay}
                            </button>
                            
                            {!isLastDay && (
                                <button 
                                    onClick={handleSliceAndNext}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: '#EF4444',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '12px'
                                    }}
                                >
                                    Yes, Slice & Start Day {currentDay + 1}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.secondCard}>
                
                {/* --- LEFT COLUMN --- */}
                <div className={styles.leftColumn}>
                    
                    <div className={styles.reviewBox}>
                        <h3 className={styles.boxTitle}>
                            {selectedLocation ? selectedLocation.name : "Select a Location"}
                        </h3>
                        
                        {selectedLocation && distanceFromHub !== null && (
                            <span style={{ 
                                fontSize: '13px', 
                                fontWeight: '600', 
                                color: '#4ADE80', 
                                display: 'block', 
                                marginBottom: '8px' 
                            }}>
                                📍 {distanceFromHub} km from Hub
                            </span>
                        )}

                        <p className={styles.reviewText}>
                            {selectedLocation 
                                ? (selectedLocation.description || "Explore this destination and add it to your plan.") 
                                : "Click a pin on the map to see details here."}
                        </p>

                        {selectedLocation && (
                            isAlreadyAdded ? (
                                <button 
                                    className={styles.removeSpotMain}
                                    onClick={() => onRemoveSpot(selectedLocation.name)}
                                >
                                    Remove
                                </button>
                            ) : (
                                <button 
                                    className={isHubSelected ? styles.addSpot : styles.addSpotDisabled}
                                    onClick={() => isHubSelected && onAddSpot(selectedLocation)}
                                    disabled={!isHubSelected}
                                    title={isHubSelected ? "Add tourist spot" : "Select a starting point first"}
                                >
                                    {isHubSelected ? "Add" : "Set Start Point"}
                                </button>
                            )
                        )}
                    </div>

                    <div className={styles.activitiesBox}>
                        <h3 className={styles.boxTitle}>Choose your activities</h3>
                        <div className={styles.activitiesOption}>
                            {Object.keys(selectedActivities).map((activity) => (
                                <label key={activity} className={styles.activityLabel}>
                                    <input 
                                        type="checkbox" 
                                        className={styles.activityCheckbox}
                                        checked={selectedActivities[activity]}
                                        onChange={() => handleActivityChange(activity)}
                                    /> 
                                    <span>{activity}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles.budgetBox}>
                        <h3 className={styles.boxTitle}>Budget</h3>
                        <div className={styles.budgetSlider}>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={budget}
                                onChange={(e) => setBudget(Number(e.target.value))}
                                className={styles.slider}
                            />
                            <div className={styles.budgetLabels}>
                                <span>≤ ₱200</span>
                                <span className={styles.currentBudget}>₱200 - ₱600</span>
                                <span>₱600+</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- RIGHT COLUMN --- */}
                <div className={styles.rightColumn}>
                    <div className={styles.journeyDatesBox}>
                        <h3 className={styles.boxTitle}>Trip Details</h3>
                        
                        <select className={styles.locField} 
                            value={destination} 
                            onChange={(e) => {
                                const val = e.target.value;
                                setDestination(val);
                                if (onHubChange) onHubChange(val);
                            }}
                            style={{ width: '100%', marginBottom: '1rem', color: destination === "" ? "gray" : "white" }} 
                        >
                            <option value="" disabled hidden>Set start point here!</option>
                            <option value="Virac" style={{ color: "white", backgroundColor: "#333" }}>
                                Virac
                            </option>
                            <option value="San Andres" style={{ color: "white", backgroundColor: "#333" }}>
                                San Andres
                            </option>
                        </select>

                        <div className={styles.dateInputRow}>
                            <input
                                type='date'
                                name='start'
                                min={today} 
                                value={dateRange.start}
                                onChange={(e) => {
                                    const newStart = e.target.value;
                                    setDateRange(prev => ({ 
                                        ...prev, 
                                        start: newStart,
                                        end: prev.end && newStart > prev.end ? '' : prev.end 
                                    }));
                                }}
                                className={styles.dateField}
                            />
                            <span className={styles.dateSeparator}>to</span>
                            <input
                                type="date" 
                                name="end"
                                min={dateRange.start || today}
                                disabled={!dateRange.start}
                                value={dateRange.end} 
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className={styles.dateField}
                            />
                        </div>
                    </div>

                    <div className={styles.bottomRightSection}>
                        <div className={styles.itineraryPreview}>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 className={styles.boxTitle} style={{ margin: 0 }}>
                                    Day {currentDay} of {dayCount}
                                </h3>
                                
                                {currentDay > 1 && (
                                    <span style={{ fontSize: '10px', color: '#9CA3AF' }}>
                                        (Days 1-{currentDay-1} Saved)
                                    </span>
                                )}
                            </div>

                            <button 
                                onClick={handleOptimize}
                                style={{
                                    width: '100%',
                                    marginBottom: '12px',
                                    padding: '8px',
                                    background: 'linear-gradient(90deg, #2563EB 0%, #7C3AED 100%)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>✨</span> Optimize Day {currentDay}
                            </button>

                            <div style={{
                                marginTop: '8px', 
                                marginBottom: '16px', 
                                padding: '12px',
                                background: 'rgba(0,0,0,0.2)', 
                                borderRadius: '8px',
                                border: '1px solid #374151'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#E5E7EB', marginTop: '2px' }}>Day {currentDay} Wallet</span>
                                    
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '12px', color: timeWallet.color }}>
                                            {timeWallet.label}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '2px' }}>
                                            {timeWallet.subtext}
                                        </div>
                                    </div>
                                </div>
                                
                                <div style={{ width: '100%', height: '8px', background: '#374151', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${timeWallet.percent}%`,
                                        height: '100%',
                                        backgroundColor: timeWallet.color,
                                        transition: 'width 0.5s ease, background-color 0.5s ease'
                                    }}></div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#9CA3AF' }}>
                                    <span>Schedule Load</span>
                                    <span style={{ color: addedSpots.length > 0 ? timeWallet.color : '#6B7280', fontWeight: 'bold' }}>
                                        {(() => {
                                            if (addedSpots.length === 0) return "Ready";
                                            if (timeWallet.remaining < 0) return "Overloaded";
                                            if (timeWallet.remaining < 120) return "Packed";
                                            return "Relaxed";
                                        })()}
                                    </span>
                                </div>
                            </div>
                            
                            <div className={styles.statsRow}>
                                <span className={styles.statBadge}>{addedSpots?.length || 0} Stops</span>
                                <span className={styles.statBadge}>{totalDistance} km</span>
                            </div>

                            <div className={styles.addedSpotsList}>
                                {addedSpots && addedSpots.length > 0 ? (
                                    addedSpots.map((spot, index) => (
                                        <div key={index}>
                                            
                                            {driveData[index]?.driveTime > 0 && (
                                                <div style={{
                                                    fontSize: '9px',
                                                    color: '#9CA3AF',
                                                    marginLeft: '52px', 
                                                    marginBottom: '4px',
                                                    marginTop: index === 0 ? '0px' : '-4px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    overflowY: 'auto',
                                                }}>
                                                    <div style={{ width: '2px', height: '10px', background: '#4B5563', marginRight: '4px' }}></div>
                                                    🚗 {driveData[index].driveTime} min drive
                                                </div>
                                            )}

                                            <div 
                                                className={styles.miniSpotItem}
                                                onClick={() => setSelectedLocation(spot)} 
                                                style={{ 
                                                    borderLeft: spot.locked ? '3px solid #F59E0B' : '3px solid transparent',
                                                    backgroundColor: spot.locked ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: '8px',
                                                    padding: '8px 10px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                    
                                                    <div style={{ 
                                                        fontSize: '10px', 
                                                        fontWeight: 'bold',
                                                        background: '#374151', 
                                                        color: '#E5E7EB', 
                                                        padding: '2px 6px', 
                                                        borderRadius: '4px',
                                                        minWidth: '45px',
                                                        textAlign: 'center',
                                                        display: 'flex', 
                                                        gap: '4px',
                                                        justifyContent: 'center',
                                                        border: '1px solid #4B5563'
                                                    }}>
                                                        <span>⏳</span>
                                                        {spot.visit_time_minutes > 0 ? spot.visit_time_minutes : 60}m
                                                    </div>

                                                    <span className={styles.spotName} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {spot.locked && "🔒 "} 
                                                        {spot.name}
                                                    </span>
                                                </div>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onMoveSpot(index, -1); }}
                                                        style={{ 
                                                            background: 'none', border: 'none', cursor: 'pointer', 
                                                            color: index === 0 ? '#444' : '#E5E7EB',
                                                            fontSize: '10px', padding: '2px 4px'
                                                        }}
                                                        disabled={index === 0}
                                                        title="Move Up"
                                                    >
                                                        ▲
                                                    </button>

                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onMoveSpot(index, 1); }}
                                                        style={{ 
                                                            background: 'none', border: 'none', cursor: 'pointer', 
                                                            color: index === addedSpots.length - 1 ? '#444' : '#E5E7EB',
                                                            fontSize: '10px', padding: '2px 4px'
                                                        }}
                                                        disabled={index === addedSpots.length - 1}
                                                        title="Move Down"
                                                    >
                                                        ▼
                                                    </button>

                                                    <div style={{ width: '1px', height: '12px', background: '#4B5563', margin: '0 4px' }}></div>

                                                    <button 
                                                        className={styles.removeBtn}
                                                        onClick={(e) => { e.stopPropagation(); onToggleLock(spot.name); }}
                                                        title={spot.locked ? "Unlock" : "Anchor"}
                                                        style={{ 
                                                            color: spot.locked ? '#F59E0B' : '#6B7280', 
                                                            fontSize: '14px', margin: '0 2px'
                                                        }}
                                                    >
                                                        {spot.locked ? '🔓' : '⚓'} 
                                                    </button>

                                                    <button 
                                                        className={styles.removeBtn}
                                                        onClick={(e) => { e.stopPropagation(); onRemoveSpot(spot.name); }}
                                                        style={{ color: '#EF4444', fontSize: '16px', marginLeft: '4px' }}
                                                    >
                                                        &times; 
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className={styles.previewContent}>
                                        Day {currentDay} jar is empty. Select a pin to add.
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        <button 
                            className={styles.saveButton} 
                            onClick={isLastDay ? handleSaveItinerary : handleSliceAndNext}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                backgroundColor: isLastDay ? '#10B981' : undefined
                            }}
                        >
                            {isLastDay ? "💾 Save Full Itinerary" : `Complete Day ${currentDay} & Next ➜`}
                        </button>

                        {!isLastDay && (
                            <div 
                                onClick={handleSaveItinerary}
                                style={{
                                    marginTop: '8px',
                                    textAlign: 'center',
                                    fontSize: '11px',
                                    color: '#9CA3AF',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                (Or finish and save itinerary now)
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

export default PreferenceCard;