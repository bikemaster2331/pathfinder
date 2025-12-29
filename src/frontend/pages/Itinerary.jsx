import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/itinerary_page/Itinerary.module.css';
import PreferenceCard from '../components/itineraryCard';


export default function ItineraryPage() {
    const navigate = useNavigate();
    
    return (
        <div className={styles.itineraryContainer}>
            <div className={styles.mapBackground}>
                {/*Dito yung map later*/}
            </div>
            <PreferenceCard />
        </div>
    );
}


// ETO YUNG BACKGROUND