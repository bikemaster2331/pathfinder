import { useState, useMemo, useEffect } from 'react';
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
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    
    // Slider state 0-100 for smooth dragging
    const [budget, setBudget] = useState(50); 
    
    const [destination, setDestination] = useState(activeHubName || ''); 

    useEffect(() => {
        setDestination(activeHubName || '');
    }, [activeHubName]);

    // Helper to map 0-100 slider to 1-3 step for the MAP FILTER only
    const getBudgetStep = (value) => {
        if (value <= 33) return 1;
        if (value <= 66) return 2;
        return 3;
    };

    // Effect: Updates the map filter when slider stops, but doesn't touch UI text
    useEffect(() => {
        if (onBudgetChange) {
            const step = getBudgetStep(budget);
            onBudgetChange(BUDGET_CONFIG[step].filterValues);
        }
    }, [budget, onBudgetChange]);

    const today = new Date().toISOString().split('T')[0];
    const isAlreadyAdded = selectedLocation && addedSpots.some(spot => spot.name === selectedLocation.name);
    
    // [PRO FIX] Check if a Hub is selected
    const isHubSelected = Boolean(activeHubName && activeHubName !== "");

    const handleActivityChange = (activityName) => {
        setSelectedActivities(prev => ({
            ...prev,
            [activityName]: !prev[activityName]
        }));
    };

    const dayCount = useMemo(() => {
        if (!dateRange.start || !dateRange.end) return 0;
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diffTime = end - start;
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return days > 0 ? days : 0;
    }, [dateRange]);

    const durationString = dayCount > 0 ? `${dayCount} Days` : "0 Days";

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
            label = 'Not realistic in one day';
            subtext = 'Remove a stop or split into another day (Start 6-7 AM)';
        } else if (remaining < 120) { 
            color = '#F59E0B'; 
            label = 'Tight but doable';
            subtext = 'Early start or minimal delays required (Start 3-5 AM)';
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

    const formatMins = (mins) => {
        const safeMins = Number(mins);
        if (isNaN(safeMins)) return "0h 0m";

        const m = Math.abs(safeMins);
        const h = Math.floor(m / 60);
        const min = Math.round(m % 60);
        return `${h}h ${min}m`;
    };

    const handleOptimize = () => {
        if (!activeHubName || !addedSpots || addedSpots.length < 2) return;
        
        const hub = TRAVEL_HUBS[activeHubName];
        const newOrder = optimizeRoute(hub, addedSpots);
        
        if (setAddedSpots) {
            setAddedSpots(newOrder);
        }
    };

    const handleSaveItinerary = () => {
        if (!activeHubName || addedSpots.length === 0) {
            alert("Please select a Base Location and add at least one spot.");
            return;
        }

        generateItineraryPDF({
            activeHubName,
            dateRange,
            addedSpots,
            totalDistance,
            driveData
        });
    };

    return (
        <div className={styles.PreferenceCard}>
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

                        {/* [PRO FIX START]: Updated Add Button Logic */}
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
                                    // Switches class if hub is missing
                                    className={isHubSelected ? styles.addSpot : styles.addSpotDisabled}
                                    
                                    // Only allow add if hub is selected
                                    onClick={() => isHubSelected && onAddSpot(selectedLocation)}
                                    
                                    // Disable the button to block interaction
                                    disabled={!isHubSelected}
                                    
                                    // Helpful tooltip
                                    title={isHubSelected ? "Add tourist spot" : "Select a starting point first"}
                                >
                                    {/* Change text to guide user */}
                                    {isHubSelected ? "Add" : "Set Start Point"}
                                </button>
                            )
                        )}
                        {/* [PRO FIX END] */}
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
                            {/* Smooth Slider 0-100 */}
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={budget}
                                onChange={(e) => setBudget(Number(e.target.value))}
                                className={styles.slider}
                            />
                            {/* STATIC LABELS - No logic here */}
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
                            <h3 className={styles.boxTitle}>Trip Summary</h3>

                            {/* Optimization Button */}
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
                                <span>✨</span> Optimize Route
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
                                    <span style={{ fontSize: '12px', color: '#E5E7EB', marginTop: '2px' }}>Time Wallet</span>
                                    
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
                                    <span>Your Day Meter</span>
                                    <span style={{ color: addedSpots.length > 0 ? timeWallet.color : '#6B7280', fontWeight: 'bold' }}>
                                        {(() => {
                                            if (addedSpots.length === 0) return "Ready to start";
                                            if (timeWallet.remaining < 0) return "Overloaded";
                                            if (timeWallet.remaining < 120) return "Packed";
                                            return "Relaxed";
                                        })()}
                                    </span>
                                </div>
                            </div>
                            
                            <div className={styles.statsRow}>
                                <span className={styles.statBadge}>{durationString}</span>
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
                                        No spots added yet. Select a pin and click Add.
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        <button className={styles.saveButton}
                        onClick={handleSaveItinerary}>
                            Save Itinerary
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default PreferenceCard;