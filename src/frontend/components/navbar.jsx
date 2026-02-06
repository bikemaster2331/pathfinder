import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/navbar/navbar.module.css';

export default function SharedNavbar() {
    const navigate = useNavigate();
    const location = useLocation();
    
    // 1. Internal State
    const [isHidden, setIsHidden] = useState(false);
    const lastScrollY = useRef(0);
    
    const isHomePage = location.pathname === '/';
    const getInitialTheme = () => {
        if (typeof window === 'undefined') return 'light';
        const stored = window.localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark') return stored;
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
    };

    const [theme, setTheme] = useState(getInitialTheme);

    // 2. Scroll Monitor: rAF loop for reliable hide/show on any scroll
    useEffect(() => {
        if (!isHomePage) {
            setIsHidden(false);
            return undefined;
        }

        const getScrollY = () =>
            window.scrollY ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0;

        let rafId = 0;
        const minScroll = 120;
        const toggleDelta = 16;

        const tick = () => {
            const currentY = getScrollY();
            const delta = currentY - lastScrollY.current;

            if (currentY <= 8) {
                setIsHidden(false);
            } else if (delta > toggleDelta && currentY > minScroll) {
                setIsHidden(true);
            } else if (delta < -toggleDelta) {
                setIsHidden(false);
            }

            lastScrollY.current = currentY;
            rafId = window.requestAnimationFrame(tick);
        };

        lastScrollY.current = getScrollY();
        rafId = window.requestAnimationFrame(tick);

        return () => {
            if (rafId) window.cancelAnimationFrame(rafId);
        };
    }, [isHomePage]);

    useEffect(() => {
        lastScrollY.current = 0;
        setIsHidden(false);
    }, [location.pathname]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        window.localStorage.setItem('theme', theme);
        window.dispatchEvent(new Event('themechange'));
    }, [theme]);

    // Smooth fade configuration
    const smoothTransition = {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1]
    };

    return (
        <>
            <motion.nav 
                // Choose the class based on state
                className={isHomePage ? styles.navBarHome : styles.navBarFixed}
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: isHidden ? -120 : 0, opacity: isHidden ? 0 : 1 }}
                transition={smoothTransition}
                style={{ pointerEvents: isHidden ? 'none' : 'auto' }}
            >
                <motion.div 
                    key="expanded"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}
                >
                    {/* Big Logo */}
                    <div className={styles.brand}>
                        <button onClick={() => navigate('/')} className={styles.brandButton}>
                            {isHomePage ? (
                                <>
                                    <span className={styles.brandIcon}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0"/>
                                            <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>
                                        </svg>
                                    </span>
                                    PATHFINDER
                                </>
                            ) : (
                                /* Small Logo for non-home pages */
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                                    <path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0-2-2h0"/>
                                    <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>
                                </svg>
                            )}
                        </button>
                    </div>
                    
                    {/* Navigation Links */}
                    <div className={styles.navLinks}>
                        <button onClick={() => navigate('/Creators')} className={styles.navLink}>Creators</button>
                        <button onClick={() => navigate('/About')} className={styles.navLink}>About</button>
                        <button onClick={() => navigate('/Contact')} className={styles.navLink}>Contact</button>
                    </div>

                    {/* Theme Toggle */}
                    <div> 
                        <button
                            type="button"
                            className={styles.themeToggle}
                            onClick={() => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
                            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                        >
                            <span className={styles.toggleLabel}>{theme === 'light' ? 'Light' : 'Dark'}</span>
                            <span className={styles.toggleTrack} data-theme={theme}>
                                <span className={styles.toggleThumb} />
                            </span>
                        </button>
                    </div>

                    {/* CTA (Home only) */}
                    {isHomePage && (
                        <div>
                            <button className={styles.ctaNav} onClick={() => navigate('/itinerary')}>
                                <span>Start</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 12h14" />
                                    <path d="m13 5 7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.nav>
        </>
    );
}
