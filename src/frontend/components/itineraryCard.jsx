import { useState } from 'react';
import styles from '../styles/itinerary_page/ItineraryCard.module.css';

const PreferenceCard = ({ selectedActivities, setSelectedActivities }) => {
    // Local state for dates and budget
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [budget, setBudget] = useState(50);

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

    const selectedCount = Object.values(selectedActivities).filter(Boolean).length;

    return (
        <div className={styles.PreferenceCard}>
            <div className={styles.secondCard}>
                
                <div className={styles.reviewBox}>
                    <h3 className={styles.boxTitle}>Reviews</h3>
                    <p className={styles.reviewText}>This area is famous for beaches</p>
                </div>

                <div className={styles.rightColumn}>
                    <div className={styles.journeyDatesBox}>
                        <h3 className={styles.boxTitle}>Journey Dates</h3>
                        <div className={styles.dateInputRow}>
                            <input
                                type='date'
                                name='start'
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className={styles.dateField}
                            />
                            <span className={styles.dateSeparator}>to</span>
                            <input
                                type="date" 
                                name="end" 
                                value={dateRange.end} 
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className={styles.dateField}
                            />
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

                <div className={styles.bottomLeftBox}>
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

                <div className={styles.bottomRightSection}>
                    <div className={styles.itineraryPreview}>
                        <h3 className={styles.boxTitle}>Itinerary Preview</h3>
                        <p className={styles.previewContent}>
                            {selectedCount > 0 
                                ? `You have selected ${selectedCount} activities. Your plan is being generated...`
                                : "Your personalized itinerary will appear here based on your preferences..."}
                        </p>
                    </div>
                    <button className={styles.saveButton}>
                        Save Itinerary
                    </button>
                </div>

            </div>
        </div>
    );
}

export default PreferenceCard;