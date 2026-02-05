import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import styles from '../styles/navbar/navbar.module.css';

export default function SharedNavbar() {
    const navigate = useNavigate();
    const location = useLocation();
    
    const isHomePage = location.pathname === '/';

    // 1. Define a "Luxury" smooth transition config
    // This bezier curve [0.22, 1, 0.36, 1] is like a high-end car suspension. 
    // It moves confidently but lands extremely softly.
    const smoothTransition = {
        layout: { 
            duration: 2, 
            ease: [0.22, 1, 0.36, 1] 
        },
        opacity: { 
            duration: 2, 
            ease: "easeInOut" 
        }
    };

    return (
        <motion.nav 
            className={isHomePage ? styles.navBarHome : styles.navBarFixed}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            
            // 2. Apply the smooth transition here
            transition={smoothTransition}
            
            // 3. Layout prop is crucial for the position change
            layout
        >
            {/* CHILD 1: Brand */}
            {/* We pass the same transition to children so they stay synced with the parent */}
            <motion.div layout transition={smoothTransition} className={styles.brand}>
                <button 
                    onClick={() => navigate('/')}
                    className={styles.brandButton}
                    aria-label="Go to Home"
                >
                    {isHomePage ? (
                        <>
                            <span className={styles.brandIcon}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-squares-exclude-icon lucide-squares-exclude"><path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>
                                </svg>
                            </span>
                            PATHFINDER
                        </>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                            <path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0"/>
                            <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>
                        </svg>
                    )}
                </button>
            </motion.div>
            
            {/* CHILD 2: Nav Links */}
            <motion.div layout transition={smoothTransition} className={styles.navLinks}>
                <button onClick={() => navigate('/Creators')} className={styles.navLink}>Creators</button>
                <button onClick={() => navigate('/About')} className={styles.navLink}>About</button>
                <button onClick={() => navigate('/Contact')} className={styles.navLink}>Contact</button>
            </motion.div>

            {/* CHILD 3: CTA Button */}
            <motion.div layout transition={smoothTransition}> 
                {isHomePage && (
                    <button className={styles.ctaNav} onClick={() => navigate('/itinerary')}>
                        Start Planning
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                )}
                {!isHomePage && <div style={{ width: 40 }}></div>} 
            </motion.div>

        </motion.nav>
    );
}