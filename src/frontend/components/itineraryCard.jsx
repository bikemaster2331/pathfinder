import { useState, useMemo } from 'react';
import styles from '../styles/itinerary_page/ItineraryCard.module.css';

const PreferenceCard = ({ 
    selectedActivities, 
    setSelectedActivities, 
    selectedLocation,
    setSelectedLocation,
    addedSpots,   
    onAddSpot,
    onRemoveSpot 
}) => {
    // Local state for dates and budget
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [budget, setBudget] = useState(50);
    
    // Get today's date for validation
    const today = new Date().toISOString().split('T')[0];

    // Check if the currently selected location is already in the added list
    const isAlreadyAdded = selectedLocation && addedSpots.some(spot => spot.name === selectedLocation.name);

    // Updates the parent state (ItineraryPage) when checkboxes change
    const handleActivityChange = (activityName) => {
        setSelectedActivities(prev => ({
            ...prev,
            [activityName]: !prev[activityName]
        }));
    };

    const getBudgetLabel = (value) => {
        if (value < 33) return 'Low';
        if (value < 66) return 'Medium';
        return 'High';
    };

    // --- NEW LOGIC: Calculate raw Day Count for the quirky text ---
    const dayCount = useMemo(() => {
        if (!dateRange.start || !dateRange.end) return 0;
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const diffTime = end - start;
        // Calculate days including the start date
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return days > 0 ? days : 0;
    }, [dateRange]);

    // --- NEW LOGIC: Generate the comment based on days ---
    const getTripComment = (days) => {
        if (!days || days <= 0) return "Pick your dates to start the adventure.";
        if (days === 1) return "Speedrunning the island? Go fast go fast!";
        if (days <= 3) return "Short but sweet. A perfect weekend getaway.";
        if (days <= 7) return "The sweet spot! Enough time to see the gems.";
        if (days <= 14) return "Wow... i'm jealous, can i join your trip?";
        if (days > 14) return "Hah you might as well apply for residency now!";
        return "";
    };


    const durationString = dayCount > 0 ? `${dayCount} Days` : "0 Days";

    return (
        <div className={styles.PreferenceCard}>
            <div className={styles.secondCard}>
                
                {/* --- LEFT COLUMN --- */}
                <div className={styles.leftColumn}>
                    
                    {/* --- DYNAMIC REVIEW BOX --- */}
                    <div className={styles.reviewBox}>
                        <h3 className={styles.boxTitle}>
                            {selectedLocation ? selectedLocation.name : "Select a Location"}
                        </h3>
                        
                        <p className={styles.reviewText}>
                            {selectedLocation 
                                ? (selectedLocation.description || "Explore this destination and add it to your plan.") 
                                : "Click a pin on the map to see details here."}
                        </p>

                        {/* SMART BUTTON LOGIC */}
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
                                    className={styles.addSpot}
                                    onClick={() => onAddSpot(selectedLocation)}
                                    title="Add tourist spot"
                                >
                                    Add
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
                                <span>Low</span>
                                <span className={styles.currentBudget}>{getBudgetLabel(budget)}</span>
                                <span>High</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- RIGHT COLUMN --- */}
                <div className={styles.rightColumn}>
                    <div className={styles.journeyDatesBox}>
                        <h3 className={styles.boxTitle}>Journey Dates</h3>
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

                        {/* --- ADDED: THE QUIRKY COMMENT LINE --- */}
                        <p className={styles.durationComment}>
                            {dateRange.start && dateRange.end 
                                ? getTripComment(dayCount) 
                                : "Select dates to see your trip duration."}
                        </p>
                    </div>

                    <div className={styles.bottomRightSection}>
                        <div className={styles.itineraryPreview}>
                            <h3 className={styles.boxTitle}>Trip Summary</h3>
                            
                            {/* Stats Row */}
                            <div className={styles.statsRow}>
                                <span className={styles.statBadge}>{durationString}</span>
                                <span className={styles.statBadge}>{addedSpots?.length || 0} Stops</span>
                            </div>

                            {/* The List of Added Spots */}
                            <div className={styles.addedSpotsList}>
                                {addedSpots && addedSpots.length > 0 ? (
                                    addedSpots.map((spot, index) => (
                                        <div 
                                            key={index} 
                                            className={styles.miniSpotItem}
                                            onClick={() => setSelectedLocation(spot)} 
                                        >
                                            
                                            <span className={styles.spotName}>{spot.name}</span>
                                            
                                            <button 
                                                className={styles.removeBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveSpot(spot.name);
                                                }}
                                                title="Remove spot"
                                            >
                                                &times; 
                                            </button>

                                        </div>
                                    ))
                                ) : (
                                    <p className={styles.previewContent}>
                                        No spots added yet. Select a pin and click Add.
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        <button className={styles.saveButton}>
                            Save Itinerary
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default PreferenceCard;