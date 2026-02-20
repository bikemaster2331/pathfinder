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

const imageEntries = Object.entries(imageModules).sort(([a], [b]) => a.localeCompare(b));
const IMAGES = imageEntries.map(([, src]) => src);

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

const slideTransition = {
    x: { 
        type: "spring", 
        stiffness: 400,
        damping: 40,
        mass: 0.5
    },
    opacity: { 
        duration: 0.3,
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

const SWIPE_CONFIDENCE_THRESHOLD = 8000;
const getSwipePower = (offset, velocity) => Math.abs(offset) * velocity;

const ACTIVE_STICKY_OPACITY = 1;
const INACTIVE_STICKY_OPACITY = 0.2;
const ACTIVE_STICKY_SCALE = 1;
const INACTIVE_STICKY_SCALE = 0.4;

// Roulette Card Component
const RouletteCard = ({ title, description, icon, index, withSlider = false }) => {
    const [[cardPage, cardDirection], setCardPage] = useState([0, 0]);
    const cardImageIndex = wrap(0, IMAGES.length, cardPage);

    useEffect(() => {
        if (!withSlider) return;
        const timer = setInterval(() => {
            setCardPage(([prev]) => [prev + 1, 1]);
        }, 3200);
        return () => clearInterval(timer);
    }, [withSlider]);

    return (
        <motion.div
            className={styles.rouletteCard}
            initial={{ 
                opacity: 0, 
                y: 24,
                scale: 0.98
            }}
            whileInView={{ 
                opacity: 1, 
                y: 0,
                scale: 1
            }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{
                duration: 0.8,
                delay: index * 0.1,
                ease: [0.16, 1, 0.3, 1]
            }}
            whileHover={{
                scale: 1.02,
                x: 8,
                transition: { duration: 0.2 }
            }}
        >
            {withSlider ? (
                <div className={styles.cardSlideWrap}>
                    <AnimatePresence initial={false} custom={cardDirection} mode="popLayout">
                        <motion.img
                            key={cardPage}
                            src={IMAGES[cardImageIndex]}
                            custom={cardDirection}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={slideTransition}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(e, { offset, velocity }) => {
                                const swipe = getSwipePower(offset.x, velocity.x);
                                if (swipe < -SWIPE_CONFIDENCE_THRESHOLD) {
                                    setCardPage(([prev]) => [prev + 1, 1]);
                                } else if (swipe > SWIPE_CONFIDENCE_THRESHOLD) {
                                    setCardPage(([prev]) => [prev - 1, -1]);
                                }
                            }}
                            alt={title}
                            className={styles.cardSlideImage}
                        />
                    </AnimatePresence>
                </div>
            ) : (
                <div className={styles.cardIcon}>{icon}</div>
            )}
            <h3 className={styles.cardTitle}>{title}</h3>
            <p className={styles.cardDescription}>{description}</p>
        </motion.div>
    );
};

export default function Home() {
    const navigate = useNavigate();
    const imageRef = useRef(null);
    
    // Refs for observing the sections
    const guideRef = useRef(null);
    const reviewsRef = useRef(null);
    const collaborateRef = useRef(null);

    const [[page, direction], setPage] = useState([0, 0]);
    const imageIndex = wrap(0, IMAGES.length, page);
    const [expandedTestimonials, setExpandedTestimonials] = useState({});
    const [activeTestimonial, setActiveTestimonial] = useState(null);
    const suppressNextOpenRef = useRef(false);
    
    // Track which section is active
    const [activeSection, setActiveSection] = useState('guide');

    const getStickyTitleAnimation = (sectionId) => {
        const isActive = activeSection === sectionId;
        return {
            opacity: isActive ? ACTIVE_STICKY_OPACITY : INACTIVE_STICKY_OPACITY,
            scale: isActive ? ACTIVE_STICKY_SCALE : INACTIVE_STICKY_SCALE
        };
    };

    // --- NEW: INTERSECTION OBSERVER LOGIC ---
    useEffect(() => {
        // Options: Trigger when the element crosses the middle of the viewport
        const options = {
            root: null,
            // Negative margins create a razor-thin line in the center of the viewport
            rootMargin: "-20% 0px -80% 0px",
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    // Update state to the ID of the section crossing the center line
                    setActiveSection(entry.target.id);
                }
            });
        }, options);

        // Observe elements
        if (guideRef.current) observer.observe(guideRef.current);
        if (reviewsRef.current) observer.observe(reviewsRef.current);
        if (collaborateRef.current) observer.observe(collaborateRef.current);

        return () => {
            if (guideRef.current) observer.unobserve(guideRef.current);
            if (reviewsRef.current) observer.unobserve(reviewsRef.current);
            if (collaborateRef.current) observer.unobserve(collaborateRef.current);
        };
    }, []);

    const paginate = (newDirection) => {
        setPage([page + newDirection, newDirection]);
    };

    const toggleTestimonial = (index) => {
        if (suppressNextOpenRef.current) {
            suppressNextOpenRef.current = false;
            return;
        }
        if (activeTestimonial !== null && activeTestimonial !== index) {
            suppressNextOpenRef.current = true;
            setExpandedTestimonials((prev) => ({
                ...prev,
                [activeTestimonial]: false
            }));
            setActiveTestimonial(null);
            return;
        }
        setExpandedTestimonials((prev) => ({
            ...prev,
            [index]: !prev[index]
        }));
        setActiveTestimonial((prev) => (prev === index ? null : index));
    };

    useEffect(() => {
        const timer = setInterval(() => {
            paginate(1);
        }, 4000);
        return () => clearInterval(timer);
    }, [page]); 

    useEffect(() => {
        if (activeTestimonial === null) return;

        const handleOutsideClick = (event) => {
            const card = event.target.closest('[data-testimonial-card]');
            if (card) {
                const index = Number(card.getAttribute('data-testimonial-card'));
                if (index === activeTestimonial) return;
            }
            suppressNextOpenRef.current = true;
            setActiveTestimonial(null);
            setExpandedTestimonials((prev) => ({
                ...prev,
                [activeTestimonial]: false
            }));
        };

        document.addEventListener('pointerdown', handleOutsideClick, true);
        return () => document.removeEventListener('pointerdown', handleOutsideClick, true);
    }, [activeTestimonial]);

    const fadeInUp = {
        hidden: { opacity: 0, y: 40 },
        visible: (custom) => ({
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: custom || 0 }
        })
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 }
    };

    const handleTestimonialsCapture = (event) => {
        if (activeTestimonial === null) return;
        const card = event.target.closest('[data-testimonial-card]');
        if (card) {
            const index = Number(card.getAttribute('data-testimonial-card'));
            if (index === activeTestimonial) return;
        }
        suppressNextOpenRef.current = true;
        setExpandedTestimonials((prev) => ({
            ...prev,
            [activeTestimonial]: false
        }));
        setActiveTestimonial(null);
        event.stopPropagation();
    };

    return (
        <div className={styles.homeContainer}>
            {/* PAGE 1 - HERO SECTION */}
            <main className={styles.heroSection}>
                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className={styles.contentWrapper}
                >
                    <motion.h1 variants={fadeInUp} custom={0} className={styles.headline}>
                        Explore with
                        <br />
                        <span className={styles.headlineAccent}> every click.</span>
                    </motion.h1>

                    <motion.p variants={fadeInUp} custom={0.12} className={styles.subheadline}>
                        Pathfinder is the AI travel guide for Catanduanes. <br />
                        Make personalized itineraries, find hidden spots. <br />
                        Plan your entire trip with real-time local data.
                    </motion.p>

                    <motion.div variants={fadeInUp} custom={0.45} className={styles.ctaGroup}>
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
                        custom={0.6}
                        className={styles.badgesContainer}
                    >
                        <img 
                            src={badges}
                            alt="Badges"
                            className={styles.badgeImage}
                        />
                    </motion.div>
                </motion.div>

                <div ref={imageRef} className={styles.visualWrapper}>
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
                                    const swipe = getSwipePower(offset.x, velocity.x);
                                    if (swipe < -SWIPE_CONFIDENCE_THRESHOLD) {
                                        paginate(1);
                                    } else if (swipe > SWIPE_CONFIDENCE_THRESHOLD) {
                                        paginate(-1);
                                    }
                                }}
                                alt="Catanduanes Slideshow"
                                className={styles.slideshowImage}
                            />
                        </AnimatePresence>

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

                        <motion.div 
                            className={styles.locationCard}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2, duration: 0.6 }}
                        >
                            <div className={styles.cardLocation}>
                                <span>Catanduanes, Philippines</span>
                            </div>
                        </motion.div>
                    </div>
                </div>

                <motion.section 
                    className={`${styles.testimonialsSection} ${activeTestimonial !== null ? styles.testimonialsActive : ''}`}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    onClickCapture={handleTestimonialsCapture}
                >
                    <div className={styles.testimonialsBlock}>
                        <h2 className={styles.testimonialsHeading}>Let's hear <br /> it for...</h2>
                        <div className={styles.testimonialsItems}>
                            {[0, 1, 2, 3, 4, 5].map((index) => {
                                const testimonialData = [
                                    { label: "First-time Visitor", quote: "Ang bilis lang magplano, will use again", icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
                                    { label: "Weekend Explorer", quote: "Shoutout sa mga kapamilya at mga kaibigan ko at kay Patrick Guerrero, sikat na ako.", icon: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></> },
                                    { label: "Weekend Explorer", quote: "Must try: Paraiso Ni Honesto", icon: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></> },
                                    { label: "Group Trip Organizer", quote: "Multi-day planner kept our group of 8 perfectly coordinated across 3 days. Sa mga graduating d'yan ingat!", icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></> },
                                    { label: "Backpacker", quote: "Offline access helped when signal dropped in remote spots.", icon: <><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></> },
                                    { label: "Food Trip Duo", quote: "Saved us time finding local food stops between attractions.", icon: <><path d="M8 3v7"/><path d="M12 3v7"/><path d="M10 3v18"/><path d="M17 3v18"/><path d="M17 8h3"/></> }
                                ];
                                const isLastCard = index === testimonialData.length - 1;

                                return (
                                    <div key={index} className={`${styles.testimonialItem} ${activeTestimonial === index ? styles.testimonialItemActive : ''}`}>
                                        <div
                                            className={`${styles.testimonialCard} ${isLastCard ? styles.testimonialCardLast : ''} ${expandedTestimonials[index] ? styles.testimonialCardExpanded : ''} ${activeTestimonial === index ? styles.testimonialCardActive : ''} ${activeTestimonial !== null && activeTestimonial !== index ? styles.testimonialCardDim : ''}`}
                                            data-testimonial-card={index}
                                            onClick={() => toggleTestimonial(index)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => e.key === 'Enter' && toggleTestimonial(index)}
                                        >
                                            <div className={styles.testimonialHeader}>
                                                <div className={styles.testimonialAvatar}>
                                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        {testimonialData[index].icon}
                                                    </svg>
                                                </div>
                                                <span className={styles.testimonialLabel}>{testimonialData[index].label}</span>
                                            </div>
                                            <p className={styles.testimonialQuote}>{testimonialData[index].quote}</p>
                                            <button className={styles.testimonialToggle} type="button" onClick={(e) => { e.stopPropagation(); toggleTestimonial(index); }}>
                                                {expandedTestimonials[index] ? 'Show less' : 'Read more'}
                                            </button>
                                            <div className={styles.testimonialMeta}>
                                                <span className={styles.metaDot}></span>
                                                <span>Verified Experience</span>
                                            </div>
                                            {isLastCard && <span className={styles.testimonialEllipsis} aria-hidden="true" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.section>
            </main>

            {/* STICKY SCROLL SECTIONS */}
            <div className={styles.stickyContainer}>
                {/* LEFT PANEL - STICKY TITLES */}
                <div className={styles.stickyPanel}>
                    <div className={styles.stickyContent}>
                        <motion.h2 
                            className={styles.stickyTitle}
                            animate={getStickyTitleAnimation('guide')}
                            transition={{ duration: 0.15 }}
                        >
                            AI-Powered<br />Guide
                        </motion.h2>
                        <motion.h2 
                            className={styles.stickyTitle}
                            animate={getStickyTitleAnimation('reviews')}
                            transition={{ duration: 0.15 }}
                        >
                            What's<br />Beyond
                        </motion.h2>
                        <motion.h2 
                            className={styles.stickyTitle}
                            animate={getStickyTitleAnimation('collaborate')}
                            transition={{ duration: 0.15 }}
                        >
                            Work<br />With Us
                        </motion.h2>
                    </div>
                </div>

                {/* RIGHT PANEL - SCROLLING CONTENT */}
                <div className={styles.scrollPanel}>
                    
                    {/* 1. GUIDE SECTION (Animated Chat Mockup) */}
                    <div id="guide" ref={guideRef} className={styles.scrollSection}>
                        <p className={styles.scrollSectionSubtitle}>Intelligent trip planning at your fingertips</p>
                        
                        <div className={styles.chatMockupWindow}>
                            <div className={styles.mockupHeader}>
                                <div className={styles.mockupAvatar}>
                                    {/* SVG Icon for AI */}
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                                </div>
                                <span className={styles.mockupTitle}>Pathfinder AI</span>
                                <div className={styles.mockupStatus}>Online</div>
                            </div>
                            
                            <div className={styles.mockupBody}>
                                {/* User Message - Slides in first */}
                                <motion.div 
                                    className={styles.mockupBubbleUser}
                                    initial={{ opacity: 0, x: 20, y: 10 }} 
                                    whileInView={{ opacity: 1, x: 0, y: 0 }} 
                                    viewport={{ once: false, margin: "-100px" }}
                                    transition={{ duration: 0.5 }}
                                >
                                    Build me a 3-day itinerary focusing on hidden beaches.
                                </motion.div>
                                
                                {/* AI Response - Slides in after a delay */}
                                <motion.div 
                                    className={styles.mockupBubbleAi}
                                    initial={{ opacity: 0, x: -20, y: 10 }} 
                                    whileInView={{ opacity: 1, x: 0, y: 0 }} 
                                    viewport={{ once: false, margin: "-100px" }}
                                    transition={{ duration: 0.5, delay: 0.6 }}
                                >
                                    I found 4 hidden beaches. I've added Puraran and Binurong Point to your map. Here is your route...
                                </motion.div>
                                
                                {/* AI Data Card - Slides up after AI text */}
                                <motion.div 
                                    className={styles.mockupRouteCard}
                                    initial={{ opacity: 0, y: 20 }} 
                                    whileInView={{ opacity: 1, y: 0 }} 
                                    viewport={{ once: false, margin: "-100px" }}
                                    transition={{ duration: 0.5, delay: 1.0 }}
                                >
                                    <div className={styles.routeDay}>Day 1: The Eastern Coast</div>
                                    <div className={styles.routeItem}>
                                        <span className={styles.routeTime}>9:00 AM</span>
                                        <span className={styles.routePlace}>Puraran Surf Camp</span>
                                    </div>
                                    <div className={styles.routeItem}>
                                        <span className={styles.routeTime}>1:00 PM</span>
                                        <span className={styles.routePlace}>Binurong Point Hike</span>
                                    </div>
                                </motion.div>
                            </div>
                            
                            {/* Fake Input Bar */}
                            <div className={styles.mockupInputBar}>
                                <div className={styles.mockupInputFake}>Ask Pathfinder...</div>
                                <div className={styles.mockupSendBtn}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* REVIEWS SECTION */}
                    {/* Added ID for IntersectionObserver */}
                    <div id="reviews" ref={reviewsRef} className={styles.scrollSection}>
                        <p className={styles.scrollSectionSubtitle}>Explore the island with each click</p>
                        <div className={styles.cardsGridReviews}>
                            <RouletteCard index={0} icon="VR" title="Verified Ratings" description="Authentic reviews from real visitors to Catanduanes" withSlider />
                        </div>
                    </div>

                    {/* COLLABORATE SECTION */}
                    {/* Added ID for IntersectionObserver */}
                    <div id="collaborate" ref={collaborateRef} className={styles.scrollSection}>
                        <p className={styles.scrollSectionSubtitle}>Contact us here</p>
                        <div className={styles.cardsGrid}>
                            <RouletteCard index={0} icon="GP" title="Group Planning" description="Share itineraries and vote on activities together" />
                            <RouletteCard index={1} icon="LC" title="Live Chat" description="Discuss plans and make decisions in real-time" />
                            <RouletteCard index={2} icon="SC" title="Shared Calendar" description="Everyone stays synced with the group schedule" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}