import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/navbar/navbar.module.css';

export default function SharedNavbar() {
    const navigate = useNavigate();
    const location = useLocation();
    
    // 1. Internal State
    const [isHidden, setIsHidden] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const lastScrollY = useRef(0);
    const burgerMenuRef = useRef(null);
    const burgerButtonRef = useRef(null);
    
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
        const getThresholds = () => {
            const isMobile = window.innerWidth <= 768;
            return {
                minScroll: isMobile ? 60 : 120,
                toggleDelta: isMobile ? 8 : 16
            };
        };

        const tick = () => {
            const currentY = getScrollY();
            const { minScroll, toggleDelta } = getThresholds();
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
        setIsMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!isMenuOpen) return undefined;

        const handleClickOutside = (event) => {
            const menuEl = burgerMenuRef.current;
            const buttonEl = burgerButtonRef.current;
            if (!menuEl || !buttonEl) return;
            if (menuEl.contains(event.target) || buttonEl.contains(event.target)) return;
            setIsMenuOpen(false);
        };

        document.addEventListener('pointerdown', handleClickOutside, true);
        return () => document.removeEventListener('pointerdown', handleClickOutside, true);
    }, [isMenuOpen]);

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
                    {/* Left */}
                    <div className={styles.navLeft}>
                        <div className={styles.brand}>
                        <button onClick={() => navigate('/')} className={styles.brandButton}>
                            {isHomePage ? (
                                <>
                                    <span className={styles.brandIcon}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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
                        {isHomePage && (
                            <div className={styles.ctaGroupNav}>
                                <button
                                    type="button"
                                    className={styles.themeIconButton}
                                    onClick={() => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
                                    aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                                >
                                    {theme === 'light' ? (
                                        <svg 
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
                                    ) : (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                            <path d="M19 4h.01" strokeWidth="3" />
                                        </svg>
                                    )}
                                </button>
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
                </motion.div>

                <div className={styles.collapsibleWrap}>
                    <button
                        type="button"
                        className={styles.themeIconButton}
                        onClick={() => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
                        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                    >
                        {theme === 'light' ? (
                            <svg 
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
                        ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                <path d="M19 4h.01" strokeWidth="3" />
                            </svg>
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.burgerButton}
                        aria-expanded={isMenuOpen}
                        aria-label="Toggle navigation"
                        ref={burgerButtonRef}
                        onClick={() => setIsMenuOpen(prev => !prev)}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <line x1="4" x2="20" y1="12" y2="12" />
                            <line x1="4" x2="20" y1="6" y2="6" />
                            <line x1="4" x2="20" y1="18" y2="18" />
                        </svg>
                    </button>

                    {isMenuOpen && (
                        <div className={styles.burgerMenu} ref={burgerMenuRef}>
                            <button onClick={() => navigate('/Creators')} className={styles.menuLink}>Creators</button>
                            <button onClick={() => navigate('/About')} className={styles.menuLink}>What we do</button>
                            <button onClick={() => navigate('/Contact')} className={styles.menuLink}>Contact</button>
                        </div>
                    )}
                </div>
            </motion.nav>
        </>
    );
}
