import { useNavigate } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';
import styles from '../styles/homepage/Home.module.css';
import { motion, AnimatePresence, wrap } from 'framer-motion';
import SharedNavbar from '../components/navbar';
import badges from '../assets/images/card/badges.png';

const imageModules = import.meta.glob('../assets/images/homeshow/*.{png,jpg,jpeg,svg}', { 
    eager: true,
    import: 'default',
});

const IMAGES = Object.values(imageModules);

const slideVariants = {
    enter: (direction) => ({
        x: direction > 0 ? 1200 : -1200,
        opacity: 0,
        scale: 0.95,
        filter: "blur(10px)"
    }),
    center: {
        zIndex: 1,
        x: 0,
        opacity: 1,
        scale: 1,
        filter: "blur(0px)"
    },
    exit: (direction) => ({
        zIndex: 0,
        x: direction < 0 ? 1200 : -1200,
        opacity: 0,
        scale: 0.95,
        filter: "blur(10px)"
    })
};

// SPEED CONTROL: Adjust these values
const slideTransition = {
    x: { 
        type: "spring", 
        stiffness: 400,    // ← Increase for faster (try 600-800)
        damping: 40,       // ← Lower for snappier (try 30-35)
        mass: 0.5          // ← Lower for lighter feel
    },
    opacity: { 
        duration: 0.3,     // ← Decrease for instant fade
        ease: [0.25, 0.1, 0.25, 1]
    },
    scale: {
        duration: 0.3,
        ease: [0.34, 1.56, 0.64, 1]
    },
    filter: {
        duration: 0.25
    }
};

export default function Home() {
    const navigate = useNavigate();
    const imageRef = useRef(null);

    const [[page, direction], setPage] = useState([0, 0]);
    const imageIndex = wrap(0, IMAGES.length, page);

    const paginate = (newDirection) => {
        setPage([page + newDirection, newDirection]);
    };

    useEffect(() => {
        const timer = setInterval(() => {
            paginate(1);
        }, 4000);
        return () => clearInterval(timer);
    }, [page]); 

    const swipeConfidenceThreshold = 8000;
    const swipePower = (offset, velocity) => {
        return Math.abs(offset) * velocity;
    };

    const scrollToImage = () => {
        imageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const fadeInUp = {
        hidden: { opacity: 0, y: 40 },
        visible: (custom) => ({
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: custom || 0 }
        })
    };

    const scaleIn = {
        hidden: { opacity: 0, scale: 0.9 },
        visible: { opacity: 1, scale: 1, transition: { duration: 1, delay: 1, ease: [0.34, 1.56, 0.64, 1] } }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
    };

    return (
        <div className={styles.homeContainer}>
            <div className={styles.gradientBg} />
            <div className={styles.gridOverlay} />

            <main className={styles.heroSection}>
                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className={styles.contentWrapper}
                >
                    <motion.div variants={fadeInUp} className={styles.statusBadge}>
                        <span className={styles.statusDot} />
                        <span>Now Live in Beta</span>
                    </motion.div>

                    <motion.h1 variants={fadeInUp} className={styles.headline}>
                        Reimagine the world
                        <br />
                        <span className={styles.headlineAccent}>with every click.</span>
                    </motion.h1>

                    <motion.p variants={fadeInUp} className={styles.subheadline}>
                        The easternmost edge of Luzon. The{' '}
                        <span className={styles.highlight}>1st</span> to greet the Pacific.
                        <br />
                        Explore the island of <span className={styles.catnes}>Catanduanes</span> with us.
                    </motion.p>

                    <motion.div variants={fadeInUp} custom={1.5} className={styles.ctaGroup}>
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

                    <motion.div 
                        variants={fadeInUp} 
                        custom={1.5}
                        className={styles.badgesContainer}
                    >
                        <img 
                            src={badges}
                            alt="Badges"
                            className={styles.badgeImage}
                        />
                    </motion.div>
                    
                    <motion.div variants={fadeInUp} custom={2} className={styles.scrollDownWrapper}>
                        <button className={styles.Down} onClick={scrollToImage}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m7 6 5 5 5-5"/>
                                <path d="m7 13 5 5 5-5"/>
                            </svg>
                        </button>
                    </motion.div>
                </motion.div>

                <motion.div
                    ref={imageRef}
                    variants={scaleIn}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-200px" }}
                    className={styles.visualWrapper}
                >
                    <div className={styles.imageContainer}>
                        
                        <AnimatePresence initial={false} custom={direction} mode="popLayout">
                            <motion.img
                                key={page}
                                src={IMAGES[imageIndex]}
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={slideTransition}
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.2}
                                onDragEnd={(e, { offset, velocity }) => {
                                    const swipe = swipePower(offset.x, velocity.x);
                                    if (swipe < -swipeConfidenceThreshold) {
                                        paginate(1);
                                    } else if (swipe > swipeConfidenceThreshold) {
                                        paginate(-1);
                                    }
                                }}
                                alt="Catanduanes Slideshow"
                                className={styles.slideshowImage}
                            />
                        </AnimatePresence>

                        {/* Arrow Navigation */}
                        <button 
                            className={`${styles.navArrow} ${styles.navArrowLeft}`}
                            onClick={() => paginate(-1)}
                            aria-label="Previous image"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>

                        <button 
                            className={`${styles.navArrow} ${styles.navArrowRight}`}
                            onClick={() => paginate(1)}
                            aria-label="Next image"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>

                        {/* Slide Indicators - NOW AT TOP */}
                        <div className={styles.slideIndicators}>
                            {IMAGES.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setPage([idx, idx > imageIndex ? 1 : -1])}
                                    className={`${styles.indicatorDot} ${idx === imageIndex ? styles.indicatorDotActive : ''}`}
                                    aria-label={`Go to slide ${idx + 1}`}
                                />
                            ))}
                        </div>

                        {/* Location Card - Moved Higher */}
                        <motion.div 
                            className={styles.locationCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2, duration: 0.6 }}
                        >
                            <div className={styles.cardHeader}>
                                <span className={styles.cardLabel}>Current Location</span>
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

                <motion.section 
    className={styles.testimonialsSection}
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true }}
    transition={{ duration: 0.8 }}
>
    <div className={styles.testimonialCard}>
        <div className={styles.testimonialAvatar}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        </div>
        <span className={styles.testimonialLabel}>First-time Visitor</span>
        <p className={styles.testimonialQuote}>
            "Ang bilis lang magplano, will use again"
        </p>
        <div className={styles.testimonialMeta}>
            <span className={styles.metaDot}></span>
            <span>Verified Experience</span>
        </div>
    </div>

    <div className={styles.testimonialCard}>
        <div className={styles.testimonialAvatar}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
        </div>
        <span className={styles.testimonialLabel}>Weekend Explorer</span>
        <p className={styles.testimonialQuote}>
            "Shoutout sa mga kapamilya at mga kaibigan ko at kay Patrick Guerrero, sikat na ako."
        </p>
        <div className={styles.testimonialMeta}>
            <span className={styles.metaDot}></span>
            <span>Verified Experience</span>
        </div>
    </div>

    <div className={styles.testimonialCard}>
        <div className={styles.testimonialAvatar}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
        </div>
        <span className={styles.testimonialLabel}>Weekend Explorer</span>
        <p className={styles.testimonialQuote}>
            "Must try: Paraiso Ni Honesto"
        </p>
        <div className={styles.testimonialMeta}>
            <span className={styles.metaDot}></span>
            <span>Verified Experience</span>
        </div>
    </div>

    <div className={styles.testimonialCard}>
        <div className={styles.testimonialAvatar}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
        </div>
        <span className={styles.testimonialLabel}>Group Trip Organizer</span>
        <p className={styles.testimonialQuote}>
            "Multi-day planner kept our group of 8 perfectly coordinated across 3 days. Sa mga graduating d'yan ingat!"
        </p>
        <div className={styles.testimonialMeta}>
            <span className={styles.metaDot}></span>
            <span>Verified Experience</span>
        </div>
    </div>
</motion.section>

            </main>
        </div>
    );
}