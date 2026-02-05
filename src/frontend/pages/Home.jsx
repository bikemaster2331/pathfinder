import { useNavigate } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react'; // Added useEffect
import styles from '../styles/homepage/Home.module.css';
import { motion, AnimatePresence, wrap } from 'framer-motion';
import SharedNavbar from '../components/navbar';

const imageModules = import.meta.glob('../assets/images/homeshow/*.{png,jpg,jpeg,svg}', { 
    eager: true, 
    import: 'default' 
});

const IMAGES = Object.values(imageModules);

const slideVariants = {
    enter: (direction) => ({
        x: direction > 0 ? 0 : -1000,
        opacity: 0,
        scale: 1.1 
    }),
    center: {
        zIndex: 1,
        x: 0,
        opacity: 1,
        scale: 1
    },
    exit: (direction) => ({
        zIndex: 0,
        x: direction < 0 ? 0 : -1000,
        opacity: 0
    })
};

export default function Home() {
    const navigate = useNavigate();
    const imageRef = useRef(null);

    const [[page, direction], setPage] = useState([0, 0]);
    const imageIndex = wrap(0, IMAGES.length, page);

    const paginate = (newDirection) => {
        setPage([page + newDirection, newDirection]);
    };

    // --- AUTO-PLAY ENGINE ---
    useEffect(() => {
        const timer = setInterval(() => {
            paginate(1);
        }, 5000); // Change 5000 to whatever speed you want (ms)
        return () => clearInterval(timer);
    }, [page]); 
    // ------------------------

    const swipeConfidenceThreshold = 10000;
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
                    <div className={styles.imageContainer} style={{ position: 'relative', overflow: 'hidden' }}>
                        
                        <AnimatePresence initial={false} custom={direction}>
                            <motion.img
                                key={page}
                                src={IMAGES[imageIndex]}
                                custom={direction}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{
                                    x: { type: "spring", stiffness: 300, damping: 30 },
                                    opacity: { duration: 0.2 }
                                }}
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={1}
                                onDragEnd={(e, { offset, velocity }) => {
                                    const swipe = swipePower(offset.x, velocity.x);
                                    if (swipe < -swipeConfidenceThreshold) {
                                        paginate(1);
                                    } else if (swipe > swipeConfidenceThreshold) {
                                        paginate(-1);
                                    }
                                }}
                                alt="Catanduanes Slideshow"
                                className={styles.heroImage}
                                style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} 
                            />
                        </AnimatePresence>

                        {/* Controls */}
                        <div 
                            style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', zIndex: 10, cursor: 'w-resize' }} 
                            onClick={() => paginate(-1)} 
                            title="Previous Photo"
                        />
                        <div 
                            style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '100%', zIndex: 10, cursor: 'e-resize' }} 
                            onClick={() => paginate(1)} 
                            title="Next Photo"
                        />

                        {/* Location Card */}
                        <motion.div 
                            className={styles.locationCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2, duration: 0.6 }}
                            style={{ zIndex: 20, pointerEvents: 'none' }}
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