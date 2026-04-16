import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from '../styles/components/navbar.module.css';
import ThemeToggle from './ThemeToggle';

export default function SharedNavbar() {
    const navigate = useNavigate();
    const location = useLocation();
    
    const isHomePage = location.pathname === '/';
    const isItineraryPage = location.pathname === '/itinerary';
    
    if (isItineraryPage) {
        return null;
    }
    
    return (
        <>
            <nav 
                className={`${isHomePage ? styles.navBarHome : styles.navBarFixed} ${isHomePage ? styles.navHome : styles.navOther} ${isItineraryPage ? styles.navBarItinerary : ''}`}
            >
                <div className={styles.navInner}>
                    {/* Left */}
                    <div className={styles.navLeft}>
                        <div className={styles.brand}>
                        <button onClick={() => navigate('/')} className={styles.brandButton}>
                            <span className={styles.brandIcon}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0"/>
                                    <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>
                                </svg>
                            </span>
                        </button>
                    </div>
                    </div>

                    {/* Center */}
                    <div className={styles.navCenter}>
                        <div className={styles.navLinks}>
                            <button 
                                onClick={() => navigate('/Creators')} 
                                className={`${styles.navLink} ${location.pathname.toLowerCase() === '/creators' ? styles.activeNavLink : ''}`}
                            >
                                Creators
                            </button>
                            <button 
                                onClick={() => navigate('/About')} 
                                className={`${styles.navLink} ${location.pathname.toLowerCase() === '/about' ? styles.activeNavLink : ''}`}
                            >
                                What we do
                            </button>
                            <button 
                                onClick={() => navigate('/Contact')} 
                                className={`${styles.navLink} ${location.pathname.toLowerCase() === '/contact' ? styles.activeNavLink : ''}`}
                            >
                                Contact
                            </button>
                        </div>
                    </div>

                    {/* Right */}
                    <div className={styles.navRight}>
                        <ThemeToggle 
                            className={styles.themeIconButton} 
                            iconLightClass={styles.iconLight} 
                            iconDarkClass={styles.iconDark} 
                        />
                        {isHomePage && (
                            <div className={styles.ctaGroupNav}>
                                <button className={styles.ctaNav} onClick={() => navigate('/itinerary')}>
                                    <span>Start</span>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M5 12h14" />
                                        <path d="m13 5 7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </nav>
        </>
    );
}
