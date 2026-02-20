import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from '../styles/navbar/navbar.module.css';

export default function SharedNavbar() {
    const navigate = useNavigate();
    const location = useLocation();
    
    const isHomePage = location.pathname === '/';
    const getInitialTheme = () => {
        if (typeof window === 'undefined') return 'light';
        const stored = window.localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark') return stored;
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
    };

    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        window.localStorage.setItem('theme', theme);
        window.dispatchEvent(new Event('themechange'));
    }, [theme]);

    return (
        <>
            <nav 
                className={`${isHomePage ? styles.navBarHome : styles.navBarFixed} ${isHomePage ? styles.navHome : styles.navOther}`}
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
                            <button onClick={() => navigate('/Creators')} className={styles.navLink}>Creators</button>
                            <button onClick={() => navigate('/About')} className={styles.navLink}>What we do</button>
                            <button onClick={() => navigate('/Contact')} className={styles.navLink}>Contact</button>
                        </div>
                    </div>

                    {/* Right */}
                    <div className={styles.navRight}>
                        <button
                            type="button"
                            className={styles.themeIconButton}
                            onClick={() => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
                            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                        >
                            <svg 
                                className={styles.iconLight}
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                            >
                                <circle cx="12" cy="12" r="5" />
                                <line x1="12" y1="1" x2="12" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="23" />
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                <line x1="1" y1="12" x2="3" y2="12" />
                                <line x1="21" y1="12" x2="23" y2="12" />
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                            </svg>
                            <svg className={styles.iconDark} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                <path d="M19 4h.01" strokeWidth="3" />
                            </svg>
                        </button>
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
