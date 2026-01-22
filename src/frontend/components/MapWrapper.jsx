import { useState, useEffect, forwardRef } from 'react'; // <--- consolidated here
import MapBackground from './map';
import styles from '../styles/itinerary_page/MapWrapper.module.css';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";

// --- 1. DEFINE HELPER COMPONENT OUTSIDE ---
const CustomDateInput = forwardRef(({ value, onClick, dateRange }, ref) => {
    const [start, end] = dateRange;
    
    let displayText = "Select trip dates";
    
    if (start && end) {
        displayText = `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
    } else if (start) {
        displayText = `${format(start, "MMM d")} - ...`;
    }

    return (
        <button className={styles.dateRangeTrigger} onClick={onClick} ref={ref}>
            <span className={styles.dateText}>{displayText}</span>
            <span className={styles.calendarIcon}>📅</span>
        </button>
    );
});
// (React requires display name for debugging when using forwardRef)
CustomDateInput.displayName = "CustomDateInput";


const MapWrapper = forwardRef((props, ref) => {
    const {
        selectedActivities,
        setSelectedActivities,
        onMarkerClick,
        mapData,
        selectedHub,
        addedSpots,
        budgetFilter,
        budget,
        setBudget,
        destination,
        setDestination,
        dateRange,
        setDateRange,
        onHubChange
    } = props;

    const [sliderValue, setSliderValue] = useState(budget);
    useEffect(() => {
        setSliderValue(budget);
    }, [budget]);

    const [isMenuOpen, setIsMenuOpen] = useState(true);

    const handleActivityChange = (activityName) => {
        setSelectedActivities(prev => ({
            ...prev,
            [activityName]: !prev[activityName]
        }));
    };

    return (
        <div className={styles.mapWrapper}>
            {/* --- LEFT SIDE CONTROLS --- */}
            <div className={styles.leftControls}>
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
            </div>

            {/* --- MAP CONTAINER --- */}
            <div className={styles.mapSection}>
                <MapBackground 
                    ref={ref}
                    selectedActivities={selectedActivities} 
                    mapData={mapData}
                    onMarkerClick={onMarkerClick} 
                    selectedHub={selectedHub}
                    addedSpots={addedSpots}
                    budgetFilter={budgetFilter}
                />
            </div>

            {/* --- TOP RIGHT CONTROLS --- */}
            <div className={styles.leftRightControls}>
                <div 
                    className={styles.collapsibleHeader} 
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    title="Trip Configuration"
                >
                    <svg 
                        width="24" 
                        height="24" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="white" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        style={{ 
                            transform: isMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
                            transition: 'transform 0.3s ease' 
                        }}
                    >
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
                
                {/* ✅ CORRECT: The condition wraps the ENTIRE card, not just the inside */}
                {isMenuOpen && (
                    <div className={styles.collapsibleCard}>
                        <div className={styles.collapsibleContent}>

                            {/* 1. Trip Details Box */}
                            <div className={styles.TripBox}>
                                <div className={styles.journeyMb}>
                                    <p className={styles.locHelperText}>
                                        Select start point and trip dates
                                    </p>
                                    <select 
                                        className={styles.locField} 
                                        value={destination} 
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setDestination(val);
                                            if (onHubChange) onHubChange(val);
                                        }}
                                    >
                                        <option value="" disabled hidden>Set start point here</option>
                                        <option value="Virac" style={{ color: "white", backgroundColor: "#333" }}>
                                            Virac
                                        </option>
                                        <option value="San Andres" style={{ color: "white", backgroundColor: "#333" }}>
                                            San Andres
                                        </option>
                                    </select>
                                    <div style={{ marginTop: '10px' }}>
                                        <DatePicker
                                            selectsRange={true}
                                            startDate={dateRange.start ? new Date(dateRange.start) : null}
                                            endDate={dateRange.end ? new Date(dateRange.end) : null}
                                            minDate={new Date()}
                                            onChange={(update) => {
                                                const [start, end] = update;
                                                setDateRange({ 
                                                    start: start ? format(start, 'yyyy-MM-dd') : '', 
                                                    end: end ? format(end, 'yyyy-MM-dd') : '' 
                                                });
                                            }}
                                            customInput={
                                                <CustomDateInput 
                                                    dateRange={[
                                                        dateRange.start ? new Date(dateRange.start) : null, 
                                                        dateRange.end ? new Date(dateRange.end) : null
                                                    ]} 
                                                />
                                            }
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Divider Line */}
                            <hr className={styles.divider} />

                            {/* 2. Budget Box */}
                            <div className={styles.budgetBox}>
                                <div className={styles.budgetMb}>
                                    <p className={styles.budgetHelperText}>
                                        Set your budget
                                    </p>
                                    <div className={styles.budgetContainer}>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={sliderValue}
                                            onChange={(e) => setBudget(Number(e.target.value))}
                                            onMouseUp={() => setBudget(sliderValue)} 
                                            onTouchEnd={() => setBudget(sliderValue)}
                                            className={styles.customRange}
                                        />

                                        <div className={styles.budgetLabelsRow}>
                                            <div className={`${styles.priceBox} ${budget <= 33 ? styles.activePriceBox : ''}`}>
                                                ≤ ₱200
                                            </div>

                                            <div className={`${styles.priceBox} ${budget > 33 && budget <= 66 ? styles.activePriceBox : ''}`}>
                                                ₱200 - ₱600
                                            </div>

                                            <div className={`${styles.priceBox} ${budget > 66 ? styles.activePriceBox : ''}`}>
                                                ₱600+
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

export default MapWrapper;