import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import styles from '../styles/homepage/Home.module.css';
import { motion } from 'framer-motion';
import myImage from '../assets/images/beach.png';

export default function Home() {
    const navigate = useNavigate();
    const imageRef = useRef(null); // 👈 ADD THIS - Reference to the image section

    // Smooth scroll function
    const scrollToImage = () => {
        imageRef.current?.scrollIntoView({ 
            behavior: 'smooth',
            block: 'center' // Centers the image in viewport
        });
    };

    // Refined animation variants - smoother, more professional
    const fadeInUp = {
        hidden: { opacity: 0, y: 40 },
        visible: (custom) => {
            const extraDelay = typeof custom === 'number' ? custom : 0;
            
            return {
                opacity: 1,
                y: 0,
                transition: {
                    duration: 0.8,
                    ease: [0.25, 0.1, 0.25, 1],
                    delay: extraDelay
                }
            };
        }
    };

    const scaleIn = {
        hidden: { opacity: 0, scale: 0.9 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: {
                duration: 1,
                delay: 1,
                ease: [0.34, 1.56, 0.64, 1]
            }
        }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    return (
        <div className={styles.homeContainer}>
            
            {/* Enhanced gradient background */}
            <div className={styles.gradientBg} />
            <div className={styles.gridOverlay} />

            {/* Navigation with glass morphism */}
            <motion.nav 
                className={styles.navBar}
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
            >
                <div className={styles.brand}>
                    <span className={styles.brandIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-squares-exclude-icon lucide-squares-exclude"><path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>
                        </svg>
                    </span>
                    Pathfinder
                </div>
                
                <div className={styles.navLinks}>
                    <button onClick={() => navigate('/Creators')} className={styles.navLink}>
                        Creators
                    </button>
                    <button onClick={() => navigate('/About')} className={styles.navLink}>
                        What we do
                    </button>
                    <button onClick={() => navigate('/Contact')} className={styles.navLink}>
                        Contact
                    </button>
                </div>
                
                <button className={styles.ctaNav} onClick={() => navigate('/itinerary')}>
                    Start Planning
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>
            </motion.nav>

            {/* Hero Section */}
            <main className={styles.heroSection}>
                
                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className={styles.contentWrapper}
                >
                    {/* Status Badge */}
                    <motion.div variants={fadeInUp} className={styles.statusBadge}>
                        <span className={styles.statusDot} />
                        <span>Now Live in Beta</span>
                    </motion.div>

                    {/* Main Headline */}
                    <motion.h1 variants={fadeInUp} className={styles.headline}>
                        Reimagine the world
                        <br />
                        <span className={styles.headlineAccent}>with every click.</span>
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.p variants={fadeInUp} className={styles.subheadline}>
                        The easternmost edge of Luzon. The{' '}
                        <span className={styles.highlight}>1st</span> to greet the Pacific.
                        <br />
                        Explore the island of <strong>Catanduanes</strong> with Pathfinder
                    </motion.p>

                    {/* CTA Buttons */}
                    <motion.div variants={fadeInUp} custom={2} className={styles.ctaGroup}>
                        <button className={styles.primaryCta} onClick={() => navigate('/itinerary')}>
                            <span>Start Exploring</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                            </svg>
                        </button>
                        
                        <button className={styles.secondaryCta} onClick={() => navigate('/Contact')}>
                            Work with us
                        </button>
                    </motion.div>
                    <motion.div variants={fadeInUp} custom={2.2} className={styles.scrollDownWrapper}>
                        <button className={styles.Down} onClick={scrollToImage}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m7 6 5 5 5-5"/>
                                <path d="m7 13 5 5 5-5"/>
                            </svg>
                        </button>
                    </motion.div>
                </motion.div>

                {/* Hero Visual */}
                <motion.div
                    ref={imageRef}
                    variants={scaleIn}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-200px" }}
                    className={styles.visualWrapper}
                >
                    <div className={styles.imageContainer}>
                        <img src={myImage} alt="Catanduanes Beach" className={styles.heroImage} />
                        
                        {/* Floating UI Card */}
                        <motion.div 
                            className={styles.locationCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2, duration: 0.6 }}
                        >
                            <div className={styles.cardHeader}>
                                <span className={styles.cardLabel}>Current Location</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                                </svg>
                            </div>
                            
                            <div className={styles.cardLocation}>
                                <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor">
                                    <path d="M160,140V72.85a4,4,0,0,1,7-2.69l55,60.46a8,8,0,0,1,.43,10.26,8.24,8.24,0,0,1-6.58,3.12H164A4,4,0,0,1,160,140Zm87.21,32.53A8,8,0,0,0,240,168H144V8a8,8,0,0,0-14.21-5l-104,128A8,8,0,0,0,32,144h96v24H16a8,8,0,0,0-6.25,13l29.6,37a15.93,15.93,0,0,0,12.49,6H204.16a15.93,15.93,0,0,0,12.49-6l29.6-37A8,8,0,0,0,247.21,172.53Z"/>
                                </svg>
                                <span>Catanduanes, Philippines</span>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}