import { useState, useEffect, useRef, forwardRef, useMemo } from 'react'; 
import MapBackground from './map';
import styles from '../styles/itinerary_page/MapWrapper.module.css';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";

// --- 1. NEW COMPONENT: Independent Typewriter Span ---
const TypewriterSpan = ({ text, delay = 25 }) => {
    const [displayedText, setDisplayedText] = useState(text);
    const [isTyping, setIsTyping] = useState(false);
    
    const currentTextRef = useRef(text); 
    const targetTextRef = useRef(text);

    targetTextRef.current = text;

    useEffect(() => {
        let isCancelled = false;

        const animate = async () => {
            // If the text hasn't changed, do nothing
            if (currentTextRef.current === targetTextRef.current) return;

            setIsTyping(true);

            // 1. SMART BACKSPACE LOOP
            // Only backspace until the current text matches the start of the new text
            // (e.g., "A and B" -> "A, " -> "A, B and C")
            while (
                !isCancelled && 
                currentTextRef.current.length > 0 && 
                !targetTextRef.current.startsWith(currentTextRef.current)
            ) {
                const newText = currentTextRef.current.slice(0, -1);
                currentTextRef.current = newText;
                setDisplayedText(newText);
                // Faster backspace speed for better UX
                await new Promise(r => setTimeout(r, 10)); 
            }

            // 2. TYPING LOOP
            while (
                !isCancelled && 
                currentTextRef.current.length < targetTextRef.current.length
            ) {
                const nextChar = targetTextRef.current[currentTextRef.current.length];
                const newText = currentTextRef.current + nextChar;
                currentTextRef.current = newText;
                setDisplayedText(newText);
                await new Promise(r => setTimeout(r, delay)); 
            }

            if (!isCancelled) setIsTyping(false);
        };

        animate();

        return () => { isCancelled = true; };
    }, [text, delay]);

    return (
        <span 
            className={isTyping ? `${styles.typingCursor} ${styles.typingActive}` : ''}
            style={{ display: 'inline' }} 
        >
            {displayedText}
        </span>
    );
};

// --- 2. EXISTING HELPER COMPONENTS ---
const CustomDateInput = forwardRef(({ value, onClick, dateRange }, ref) => {
    const [start, end] = dateRange;
    
    let displayText = "Select trip dates";
    let hasValue = false;
    
    if (start && end) {
        displayText = `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
        hasValue = true;
    } else if (start) {
        displayText = `${format(start, "MMM d")} - ...`;
        hasValue = true;
    }

    return (
        <button
            className={`${styles.dateRangeTrigger} ${hasValue ? styles.fieldFilled : styles.fieldEmpty}`}
            onClick={onClick}
            ref={ref}
        >
            <span className={styles.dateText}>{displayText}</span>
            <span className={styles.calendarIcon}>
            <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
            >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
        </span>
        </button>
    );
});
CustomDateInput.displayName = "CustomDateInput";

const getActivityIcon = (activityName) => {
    const key = String(activityName || "").toLowerCase();

    if (key.includes("accommodation") || key.includes("accomodation")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 256 256" aria-hidden="true">
                <path fill="currentColor" d="M240,204H228V144a12,12,0,0,0,12.49-19.78L142.14,25.85a20,20,0,0,0-28.28,0L15.51,124.2A12,12,0,0,0,28,144v60H16a12,12,0,0,0,0,24H240a12,12,0,0,0,0-24ZM52,121.65l76-76,76,76V204H164V152a12,12,0,0,0-12-12H104a12,12,0,0,0-12,12v52H52ZM140,204H116V164h24Z" />
            </svg>
        );
    }
    if (key.includes("dining")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 256 256" aria-hidden="true">
                <path fill="currentColor" d="M68,88V40a12,12,0,0,1,24,0V88a12,12,0,0,1-24,0ZM220,40V224a12,12,0,0,1-24,0V180H152a12,12,0,0,1-12-12,273.23,273.23,0,0,1,7.33-57.82C157.42,68.42,176.76,40.33,203.27,29A12,12,0,0,1,220,40ZM196,62.92C182.6,77,175,98,170.77,115.38A254.41,254.41,0,0,0,164.55,156H196ZM128,39A12,12,0,0,0,104,41l4,47.46a28,28,0,0,1-56,0L56,41A12,12,0,1,0,32,39L28,87c0,.34,0,.67,0,1a52.1,52.1,0,0,0,40,50.59V224a12,12,0,0,0,24,0V138.59A52.1,52.1,0,0,0,132,88c0-.33,0-.66,0-1Z" />
            </svg>
        );
    }
    if (key.includes("sightseeing") || key.includes("photo") || key.includes("photography") || key.includes("camera")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 256 256" aria-hidden="true">
                <path fill="currentColor" d="M160,80a32,32,0,1,0-32-32A32,32,0,0,0,160,80Zm0-40a8,8,0,1,1-8,8A8,8,0,0,1,160,40Zm94.32,153.88L199.76,101.8A19.85,19.85,0,0,0,182.55,92h0a19.83,19.83,0,0,0-17.2,9.8l-18.7,31.55-37.42-63.5a20,20,0,0,0-34.46,0L1.66,193.91A12,12,0,0,0,12,212H244a12,12,0,0,0,10.32-18.12ZM92,87.87,108.57,116H75.43ZM33,188l28.28-48h61.44L151,188Zm145.86,0L160.56,157l22-37.1L222.94,188Z" />
            </svg>
        );
    }
    if (key.includes("shopping")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 256 256" aria-hidden="true">
                <path fill="currentColor" d="M216,36H40A20,20,0,0,0,20,56V200a20,20,0,0,0,20,20H216a20,20,0,0,0,20-20V56A20,20,0,0,0,216,36Zm-4,160H44V60H212ZM76,88a12,12,0,0,1,24,0,28,28,0,0,0,56,0,12,12,0,0,1,24,0A52,52,0,0,1,76,88Z" />
            </svg>
        );
    }
    if (key.includes("hiking")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 256 256" aria-hidden="true">
                <path fill="currentColor" d="M152,84a36,36,0,1,0-36-36A36,36,0,0,0,152,84Zm0-48a12,12,0,1,1-12,12A12,12,0,0,1,152,36Zm68,112a12,12,0,0,1-12,12c-37,0-55.27-18.47-70-33.3-1.71-1.72-3.36-3.4-5-5l-8.63,19.85L159,166.23a12,12,0,0,1,5,9.77v56a12,12,0,0,1-24,0V182.17l-25.37-18.12L83,236.78a12,12,0,1,1-22-9.57l50.06-115.13q-10.64.75-25,8.4a159.78,159.78,0,0,0-29.83,21.23,12,12,0,0,1-16.43-17.5c2.61-2.45,64.36-59.67,104.09-25.18,3.94,3.42,7.64,7.16,11.22,10.78C168.43,123.28,181,136,208,136A12,12,0,0,1,220,148Z" />
            </svg>
        );
    }
    if (key.includes("swimming")) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 256 256" aria-hidden="true">
                <path fill="currentColor" d="M241.37,231.5a12,12,0,0,1-16.87,1.87C224.16,233.1,186.64,204,128,204S31.83,233.1,31.46,233.39a12,12,0,0,1-15-18.76c1.62-1.3,37.57-29.53,95.85-34A123.26,123.26,0,0,1,110,146.06c1.67-20.79,9.88-47.91,37-69.78a52.75,52.75,0,0,0-6.68-.23c-17.2.56-27.61,10.37-32.74,30.88A12,12,0,0,1,96,116a11.79,11.79,0,0,1-2.92-.36,12,12,0,0,1-8.73-14.55c4.46-17.79,17.56-47.82,55.26-49a79.14,79.14,0,0,1,14.8,1c-3.47-4.89-7.81-9.21-13.08-11.39-8.28-3.43-18.73-1.33-31.06,6.23A12,12,0,1,1,97.72,27.43c19.3-11.84,37.11-14.5,52.93-7.89,10.46,4.37,19.63,12.92,26.75,24.88,5.86-7.19,12.72-12.18,20.2-14.61,16.42-5.35,31.7,2.47,41.63,10a12,12,0,1,1-14.47,19.14c-7.79-5.89-14.42-8-19.68-6.32-4.57,1.47-8.45,5.67-11.43,10.19A73.43,73.43,0,0,1,210,69.61C225.48,78.48,244,97.21,244,136a12,12,0,0,1-24,0c0-20-6.13-34.43-18.21-43.15a61.84,61.84,0,0,1-7.33,49,12,12,0,1,1-20.28-12.78,40.61,40.61,0,0,0,5.51-15.76c1.18-9.09-1.07-17.81-6.66-26-23.61,14.28-36.72,34.36-39,59.8a99.84,99.84,0,0,0,2.87,33.06c62.23,2.71,100.91,33.07,102.6,34.42A12,12,0,0,1,241.37,231.5ZM20,144a32,32,0,1,1,32,32A32,32,0,0,1,20,144Zm24,0a8,8,0,1,0,8-8A8,8,0,0,0,44,144Z" />
            </svg>
        );
    }

    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    );
};


// --- 3. MAIN COMPONENT ---
const MapWrapper = forwardRef((props, ref) => {
    const {
        selectedActivities,
        setSelectedActivities,
        onMarkerClick,
        selectedLocation, 
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
        onHubChange,
        isMapFullscreen,
        onToggleMapFullscreen,
        onInitialTripboxComplete
    } = props;

    const [sliderValue, setSliderValue] = useState(budget);
    useEffect(() => {
        setSliderValue(budget);
    }, [budget]);

    const [isMenuOpen, setIsMenuOpen] = useState(true);
    const [hasCompletedInitialTripbox, setHasCompletedInitialTripbox] = useState(false);
    const menuRef = useRef(null);
    const isTripBoxComplete = Boolean(destination && dateRange.start && dateRange.end);

    useEffect(() => {
        function handleClickOutside(event) {
            if (!hasCompletedInitialTripbox) return;
            const clickedToggle = event.target && event.target.closest && event.target.closest('[data-menu-toggle="true"]');
            if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target) && !clickedToggle) {
                setIsMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isMenuOpen, hasCompletedInitialTripbox]);

    const handleMenuToggle = () => {
        setIsMenuOpen((prev) => {
            // Always allow opening.
            if (!prev) return true;
            // Block closing during initial setup until TripBox is complete.
            if (!hasCompletedInitialTripbox) return true;
            return false;
        });
    };

    const handleOverlayClose = () => {
        if (!hasCompletedInitialTripbox) return;
        setIsMenuOpen(false);
    };

    const handleDoneClick = () => {
        if (!isTripBoxComplete) return;
        if (!hasCompletedInitialTripbox) {
            setHasCompletedInitialTripbox(true);
            if (onInitialTripboxComplete) {
                onInitialTripboxComplete();
            }
        }
        setIsMenuOpen(false);
    };

    const handleActivityChange = (activityName) => {
        setSelectedActivities(prev => ({
            ...prev,
            [activityName]: !prev[activityName]
        }));
    };

    // --- RESTRUCTURED TEXT LOGIC (3 Independent Parts) ---
    const introText = useMemo(() => {
        return destination ? `Starting your trip in ${destination}` : "Starting your trip";
    }, [destination]);

    const durationText = useMemo(() => {
        if (dateRange.start && dateRange.end) {
            const start = new Date(dateRange.start);
            const end = new Date(dateRange.end);
            const diffTime = Math.abs(end - start);
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            if (days <= 2) {
                return ` and staying for a ${days}-day sprint? Blink and you'll miss it. Better make every second count.`;
            } else if (days <= 5) {
                return ` and staying for ${days} days? A proper getaway. Enough time to unwind, but not enough to forget your passwords.`;
            } else {
                return ` and staying for ${days} days? Must be nice. Try not to forget what your real life looks like. I can join you if you want, i'm a good guide...`;
            }
        }
        return ".";
    }, [dateRange]);

    // Part 3: Activities (Fixed Logic)
    const activityText = useMemo(() => {
        // 1. Sort the keys to ensure stability when toggling items
        const activeKeys = Object.keys(selectedActivities)
            .filter(key => selectedActivities[key])
            .sort(); // <-- IMPORTANT: Sorts alphabetically so the start of sentence doesn't jump

        if (activeKeys.length > 0) {
            const flavors = {
                "Swimming": "chasing the dopamine of the sea",
                "Hiking": "punishing your calves for a nice view",
                "Shopping": "stimulating the local economy (and your closet)",
                "Dining": "treating your tastebuds like royalty",
                "Sightseeing": "filling your camera roll with evidence",
                "Photography": "hunting for the perfect golden hour shot",
                "Accommodation": "prioritizing a coma-level sleep"
            };

            const selectedFlavors = activeKeys.map(key => flavors[key] || "exploring");
            let text = " With those activities, looks like you're ";

            if (selectedFlavors.length === 1) {
                text += `${selectedFlavors[0]}.`;
            } else if (selectedFlavors.length === 2) {
                text += `${selectedFlavors[0]} and ${selectedFlavors[1]}.`;
            } else {
                // Because we sorted the keys, [0] and [1] remain the same unless you uncheck them.
                // This prevents the whole sentence from rewriting when you add a 3rd item.
                text += `${selectedFlavors[0]}, ${selectedFlavors[1]}, and doing plenty more. Ambitious plan.`;
            }
            return text;
        }
        return "";
    }, [selectedActivities]);

    return (
        <div className={styles.mapWrapper}>
            {/* --- MAP CONTAINER --- */}
            <div className={styles.mapSection}>
                <MapBackground 
                    ref={ref}
                    selectedActivities={selectedActivities} 
                    selectedLocation={selectedLocation}
                    mapData={mapData}
                    onMarkerClick={onMarkerClick} 
                    selectedHub={selectedHub}
                    addedSpots={addedSpots}
                    budgetFilter={budgetFilter}
                    isMapFullscreen={isMapFullscreen}
                    onToggleMapFullscreen={onToggleMapFullscreen}
                    isMenuOpen={isMenuOpen}
                    onToggleMenu={handleMenuToggle}
                />
            </div>
            <div 
                className={`${styles.blurOverlay} ${isMenuOpen ? styles.blurOverlayActive : ''}`}
                onClick={handleOverlayClose}
            />
            <div className={styles.leftRightControls} ref={menuRef}>
                    <div className={`${styles.collapsibleCard} ${isMenuOpen ? styles.cardOpen : ''}`}>
                        <div className={styles.collapsibleContent}>
                            
                            {/* --- COLUMN 1: LEFT CONTROLS (Trip Details & Budget) --- */}
                            <div className={styles.controlsColumnLeft}>
                                {/* 1. Trip Details Box */}
                                <div className={styles.TripBox}>
                                    <div className={styles.journeyMb}>
                                        <h2 className={styles.locHelperText}>
                                            START POINT AND TRIP DATE
                                        </h2>
                                        <div className={styles.locFieldWrap}>
                                            <span className={styles.locFieldIcon} aria-hidden="true">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">
                                                    <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                                    <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                                                </svg>
                                            </span>
                                            <select 
                                                className={`${styles.locField} ${destination ? styles.fieldFilled : styles.fieldEmpty}`}
                                                value={destination} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setDestination(val);
                                                    if (onHubChange) onHubChange(val);
                                                }}
                                            >
                                                <option value="" disabled hidden>Set start point here</option>
                                                <option className={styles.locFieldOption} value="Virac">
                                                    Virac
                                                </option>
                                                <option className={styles.locFieldOption} value="San Andres">
                                                    San Andres
                                                </option>
                                            </select>
                                        </div>
                                        <div className={styles.dateFieldWrap}>
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

                                {/* 2. Budget Box */}
                                <div className={styles.budgetBox}>
                                    <div className={styles.budgetMb}>
                                        <h2 className={styles.budgetHelperText}>
                                            BUDGET SLIDER
                                        </h2>
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

                            {/* --- COLUMN 2: RIGHT CONTROLS (Activities) --- */}
                            <div className={styles.controlsColumnRight}>
                                <div className={styles.activitiesBox}>
                                    <div className={styles.activitiesMb}>
                                        <h2 className={styles.boxHelperText}>CHOOSE ACTIVITIES</h2>
                                        <div className={styles.activitiesOption}>
                                            {Object.keys(selectedActivities).map((activity) => (
                                                <label
                                                    key={activity}
                                                    className={`${styles.activityTile} ${selectedActivities[activity] ? styles.activityTileActive : ''}`}
                                                >
                                                    <input 
                                                        type="checkbox" 
                                                        className={styles.hiddenCheckbox}
                                                        checked={selectedActivities[activity]}
                                                        onChange={() => handleActivityChange(activity)}
                                                    /> 
                                                    <span className={styles.activityTileIcon} aria-hidden="true">
                                                        {getActivityIcon(activity)}
                                                    </span>
                                                    <span className={styles.activityTileLabel}>{activity}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* --- ROW 2: TRIP SUMMARY (Spans Full Width) --- */}
                            <div className={styles.tripForecastRow}>
                                <h2 className={`${styles.boxHelperText} ${styles.tripForecastTitle}`}>TRIP FORECAST</h2>
                                <div className={styles.tripForecastTextBox}>
                                    <p className={styles.tripForecastText}>
                                        {/* --- 3 INDEPENDENT WRITERS --- */}
                                        <TypewriterSpan text={introText} />
                                        <TypewriterSpan text={durationText} />
                                        <TypewriterSpan text={activityText} />
                                    </p>
                                </div>
                            </div>

                        </div>
                        <div className={styles.tripForecastActions}>
                            <button
                                type="button"
                                className={styles.doneBtn}
                                onClick={handleDoneClick}
                                disabled={!isTripBoxComplete}
                            >
                                Done    
                            </button>
                        </div>
                    </div>
            </div>
        </div>
    );
});

export default MapWrapper;
