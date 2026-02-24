import { useNavigate } from 'react-router-dom';
import { useRef, useState, useEffect, useCallback } from 'react';
import styles from '../styles/homepage/Home.module.css';
import chatStyles from '../styles/itinerary_page/ChatBot.module.css';
import { motion, AnimatePresence, wrap } from 'framer-motion';
import SharedNavbar from '../components/navbar';
import badges from '../assets/images/card/badges.png';
import mapScreenshot from '../assets/images/card/map.png';

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
    x: { type: "spring", stiffness: 400, damping: 40, mass: 0.5 },
    opacity: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
    scale: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] },
    filter: { duration: 0.5 }
};

const SWIPE_CONFIDENCE_THRESHOLD = 8000;
const getSwipePower = (offset, velocity) => Math.abs(offset) * velocity;

const ACTIVE_STICKY_OPACITY = 1.4;
const INACTIVE_STICKY_OPACITY = 0.1;
const ACTIVE_STICKY_SCALE = 1.5;
const INACTIVE_STICKY_SCALE = 0.6;

// Social Media Icons
const FacebookIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
);
const InstagramIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
);
const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 .296C5.37.296 0 5.666 0 12.297c0 5.302 3.438 9.8 8.206 11.387.6.11.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.81 1.305 3.495.998.108-.775.42-1.305.763-1.605-2.665-.304-5.467-1.333-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.124-.304-.535-1.527.117-3.18 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.004-.404 11.5 11.5 0 0 1 3.004.404c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.876.118 3.18.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.623-5.48 5.92.43.372.814 1.102.814 2.222 0 1.604-.014 2.896-.014 3.29 0 .32.216.694.825.576C20.565 22.092 24 17.596 24 12.297 24 5.666 18.627.296 12 .296z"/>
    </svg>
);
const YouTubeIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
);
const TwitterXIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
);

const TechReactIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="1.7" fill="currentColor" />
        <ellipse cx="12" cy="12" rx="9" ry="3.8" />
        <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" />
    </svg>
);

const TechPythonIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3c3 0 3 1.8 3 3v2.4H9.5A2.5 2.5 0 0 0 7 10.9v4.2A2.9 2.9 0 0 1 4 12.2v-2.4C4 6.3 7 3 12 3Z" fill="currentColor" opacity="0.9" />
        <circle cx="10.2" cy="5.8" r="0.9" fill="#0b0b0b" />
        <path d="M12 21c-3 0-3-1.8-3-3v-2.4h5.5a2.5 2.5 0 0 0 2.5-2.5V8.9A2.9 2.9 0 0 1 20 11.8v2.4C20 17.7 17 21 12 21Z" fill="currentColor" opacity="0.55" />
        <circle cx="13.8" cy="18.2" r="0.9" fill="#0b0b0b" />
    </svg>
);

const TechViteIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5.5 4.5 11.6 20a.6.6 0 0 0 1.1 0L18.5 4.5a.55.55 0 0 0-.72-.7L12 6 6.2 3.8a.55.55 0 0 0-.7.7Z" fill="url(#vite-grad-a)" />
        <path d="m12 6.8-3.5 1.3 2.3 6.2a.4.4 0 0 0 .75 0L14 8.1 12 6.8Z" fill="url(#vite-grad-b)" />
        <defs>
            <linearGradient id="vite-grad-a" x1="5" y1="4" x2="19" y2="20" gradientUnits="userSpaceOnUse">
                <stop stopColor="#41D1FF" />
                <stop offset="1" stopColor="#BD34FE" />
            </linearGradient>
            <linearGradient id="vite-grad-b" x1="8.5" y1="7" x2="14.5" y2="14.5" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFD760" />
                <stop offset="1" stopColor="#FFB100" />
            </linearGradient>
        </defs>
    </svg>
);

const TechLeafletIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13.8c0-4.8 3.9-8.7 8.7-8.7h5.3v5.3c0 4.8-3.9 8.7-8.7 8.7H5v-5.3Z" fill="currentColor" opacity="0.9" />
        <path d="M7.5 17.5c4-1.3 6.8-4.1 8.1-8.1" stroke="#0b0b0b" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const TechJavaScriptIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2.8" fill="currentColor" />
        <path d="M10.5 16.8c-.5.8-1.2 1.2-2.2 1.2-1 0-1.8-.4-2.4-1.1l1.2-1.1c.3.4.7.6 1.1.6.6 0 .9-.3.9-1V9.5h1.4v6c0 .5 0 .9-.2 1.3Zm2.2.4 1.2-1c.4.6 1 .9 1.7.9.8 0 1.2-.3 1.2-.8 0-.4-.3-.7-1.3-1.1l-.4-.2c-1.4-.6-2.2-1.2-2.2-2.7 0-1.3 1-2.3 2.6-2.3 1.1 0 1.9.4 2.5 1.3l-1.2.9c-.3-.5-.7-.7-1.3-.7-.6 0-1 .3-1 .7 0 .5.3.7 1.3 1.1l.4.2c1.6.7 2.3 1.4 2.3 2.8 0 1.6-1.2 2.5-2.9 2.5-1.6 0-2.7-.6-3.1-1.6Z" fill="#0b0b0b" />
    </svg>
);

const TECH_STACK = [
    { name: 'React', color: '#61DAFB', Icon: TechReactIcon },
    { name: 'Python', color: '#3776AB', Icon: TechPythonIcon },
    { name: 'Vite', color: '#646CFF', Icon: TechViteIcon },
    { name: 'Leaflet', color: '#199900', Icon: TechLeafletIcon },
    { name: 'JavaScript', color: '#F7DF1E', Icon: TechJavaScriptIcon },
];

const SOCIAL_LINKS = [
    {
        name: 'Facebook',
        handle: '@PathfinderCatanduanes',
        url: 'https://facebook.com',
        Icon: FacebookIcon,
        color: '#1877F2',
        bg: 'rgba(24,119,242,0.08)',
        border: 'rgba(24,119,242,0.2)',
    },
    {
        name: 'Instagram',
        handle: '@pathfinder.ph',
        url: 'https://instagram.com',
        Icon: InstagramIcon,
        color: '#E1306C',
        bg: 'rgba(225,48,108,0.08)',
        border: 'rgba(225,48,108,0.2)',
    },
    {
        name: 'GitHub',
        handle: '@pathfinder-ph',
        url: 'https://github.com',
        Icon: GitHubIcon,
        color: '#ffffff',
        bg: 'rgba(255,255,255,0.06)',
        border: 'rgba(255,255,255,0.14)',
    },
    {
        name: 'YouTube',
        handle: '@PathfinderCatanduanes',
        url: 'https://youtube.com',
        Icon: YouTubeIcon,
        color: '#FF0000',
        bg: 'rgba(255,0,0,0.08)',
        border: 'rgba(255,0,0,0.2)',
    },
    {
        name: 'X (Twitter)',
        handle: '@pathfinder_ph',
        url: 'https://x.com',
        Icon: TwitterXIcon,
        color: '#ffffff',
        bg: 'rgba(255,255,255,0.06)',
        border: 'rgba(255,255,255,0.14)',
    },
];

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
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02, x: 8, transition: { duration: 0.2 } }}
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

// Reviews Bento Section
const ReviewsBento = () => {
    const [expandedStat, setExpandedStat] = useState(null);

    const STATS = [
        {
            value: '200+',
            label: 'Destinations',
            accent: '#22d3ee',
            detail: 'Sourced from the Catanduanes Provincial Tourism Office database — covering beaches, waterfalls, heritage sites, surf spots, and hidden gems across all 11 municipalities of the island.',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        },
        {
            value: '24/7',
            label: 'AI Planning',
            accent: '#a78bfa',
            detail: 'Our AI travel assistant is always available — build custom multi-day itineraries, get real-time recommendations, and plan your entire Catanduanes trip anytime, from anywhere.',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        },
        {
            value: '152k',
            label: 'Explorers',
            accent: '#34d399',
            detail: 'Total recorded tourist arrivals in Catanduanes — domestic and international travelers including backpackers, families, surfers, and adventurers exploring the island.',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        },
    ];

    const SPOTS = ['Puraran', 'Binurong Point', 'Twin Rock', 'Nahulugan Falls', 'Gigmoto', 'Bato Church', 'Virac', 'Batalay Cove', 'Igang Beach', 'Maribina Falls', 'Balacay Point', 'Panganiban'];


    return (
        <div className={styles.bentoGrid}>
            <AnimatePresence mode="wait">
                {expandedStat !== null ? (
                    <motion.div
                        key={`expanded-${expandedStat}`}
                        className={styles.bentoExpanded}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                        style={{ '--stat-accent': STATS[expandedStat].accent }}
                        onClick={() => setExpandedStat(null)}
                    >
                        <div className={styles.bentoExpandedHeader}>
                            <div className={styles.bentoExpandedIcon} style={{ color: STATS[expandedStat].accent }}>
                                {STATS[expandedStat].icon}
                            </div>
                            <div>
                                <span className={styles.bentoExpandedValue} style={{ color: STATS[expandedStat].accent }}>
                                    {STATS[expandedStat].value}
                                </span>
                                <span className={styles.bentoExpandedLabel}>{STATS[expandedStat].label}</span>
                            </div>
                            <span className={styles.bentoExpandedClose}>✕</span>
                        </div>
                        <p className={styles.bentoExpandedDetail}>
                            {STATS[expandedStat].detail}
                        </p>
                        <span className={styles.bentoExpandedHint}>Click anywhere to close</span>
                    </motion.div>
                ) : (
                    <motion.div
                        key="stats-row"
                        className={styles.bentoStatsRow}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        {STATS.map((stat, i) => (
                            <motion.div
                                key={stat.label}
                                className={styles.bentoStatCard}
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.3 }}
                                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                                style={{ '--stat-accent': stat.accent }}
                                onClick={() => setExpandedStat(i)}
                                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                            >
                                <div className={styles.bentoStatIcon} style={{ color: stat.accent }}>
                                    {stat.icon}
                                </div>
                                <span className={styles.bentoStatValue} style={{ color: stat.accent }}>{stat.value}</span>
                                <span className={styles.bentoStatLabel}>{stat.label}</span>
                                <span className={styles.bentoStatTap}>Tap to learn more</span>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Marquee strip */}
            <motion.div
                className={styles.bentoMarqueeCard}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, delay: 0.3 }}
            >
                <div className={styles.marqueeTrack}>
                    {[...SPOTS, ...SPOTS].map((spot, i) => (
                        <span key={i} className={styles.marqueeItem}>
                            {spot}
                            <span className={styles.marqueeDot} />
                        </span>
                    ))}
                </div>
            </motion.div>

            {/* Category Pills */}
            <motion.div
                className={styles.bentoCategoryRow}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: 0.4 }}
            >
                {[
                    { label: 'Beaches', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.553 4.18A2 2 0 0 1 20 6a2 2 0 0 1-2 2"/><path d="M2 21h20"/><path d="M6 12c1-.5 2-1 4-1s3 .5 4 1 2.5 1 4 1"/><path d="M3 18c1-.5 2-1 4-1s3 .5 4 1 2.5 1 4 1 3-.5 4-1"/></svg>, accent: '#22d3ee' },
                    { label: 'Waterfalls', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2v11l5 5 5-5V2"/><path d="M2 22h20"/></svg>, accent: '#34d399' },
                    { label: 'Heritage', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/></svg>, accent: '#facc15' },
                    { label: 'Surf Spots', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h2l3-3 3 3 3-3 3 3h6"/><circle cx="18" cy="5" r="3"/></svg>, accent: '#f472b6' },
                    { label: 'Food', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v7"/><path d="M12 3v7"/><path d="M10 3v18"/><path d="M17 3c0 4-1 7-3 7"/><path d="M17 3v18"/></svg>, accent: '#fb923c' },
                    { label: 'Hiking', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>, accent: '#a78bfa' },
                ].map((cat, i) => (
                    <motion.span
                        key={cat.label}
                        className={styles.bentoCategoryPill}
                        style={{ '--cat-accent': cat.accent }}
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: 0.45 + i * 0.05 }}
                        whileHover={{ scale: 1.06, transition: { duration: 0.15 } }}
                    >
                        <span className={styles.bentoCategoryIcon} style={{ color: cat.accent }}>{cat.icon}</span>
                        {cat.label}
                    </motion.span>
                ))}
            </motion.div>

        </div>
    );
};

// Typewriter component — types text character-by-character when scrolled into view
const TypewriterText = ({ text, className, speed = 22, startDelay = 200, as: Tag = 'p', style }) => {
    const [displayed, setDisplayed] = useState('');
    const [started, setStarted] = useState(false);
    const [done, setDone] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setStarted(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.4 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!started) return;
        let i = 0;
        let intervalId;
        const timeout = setTimeout(() => {
            intervalId = setInterval(() => {
                i++;
                setDisplayed(text.slice(0, i));
                if (i >= text.length) {
                    clearInterval(intervalId);
                    setDone(true);
                }
            }, speed);
        }, startDelay);
        return () => {
            clearTimeout(timeout);
            if (intervalId) clearInterval(intervalId);
        };
    }, [started, text, speed, startDelay]);

    // Split on \n to render real <br /> elements
    const renderParts = (str) => {
        const parts = str.split('\n');
        return parts.map((part, i) => (
            <span key={i}>
                {i > 0 && <><br /><br /></>}
                {part}
            </span>
        ));
    };

    return (
        <Tag ref={ref} className={className} style={{ position: 'relative', ...style }}>
            {/* Invisible full text to reserve space */}
            <span style={{ visibility: 'hidden' }} aria-hidden="true">{renderParts(text)}</span>
            {/* Visible typed text overlaid on top */}
            <span style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
                {renderParts(displayed)}
                {started && !done && <span className={styles.typewriterCursor}>|</span>}
            </span>
        </Tag>
    );
};

export default function Home() {
    const navigate = useNavigate();
    const imageRef = useRef(null);
    
    const guideRef = useRef(null);
    const reviewsRef = useRef(null);
    const collaborateRef = useRef(null);

    const [[page, direction], setPage] = useState([0, 0]);
    const imageIndex = wrap(0, IMAGES.length, page);
    const [expandedTestimonials, setExpandedTestimonials] = useState({});
    const [activeTestimonial, setActiveTestimonial] = useState(null);
    const suppressNextOpenRef = useRef(false);
    
    const [activeSection, setActiveSection] = useState('guide');
    const [activeCreator, setActiveCreator] = useState(null);

    const getStickyTitleAnimation = (sectionId) => {
        const isActive = activeSection === sectionId;
        return {
            opacity: isActive ? ACTIVE_STICKY_OPACITY : INACTIVE_STICKY_OPACITY,
            scale: isActive ? ACTIVE_STICKY_SCALE : INACTIVE_STICKY_SCALE
        };
    };

    useEffect(() => {
        const options = {
            root: null,
            rootMargin: "-20% 0px -80% 0px",
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    setActiveSection(entry.target.id);
                }
            });
        }, options);

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
            setExpandedTestimonials((prev) => ({ ...prev, [activeTestimonial]: false }));
            setActiveTestimonial(null);
            return;
        }
        setExpandedTestimonials((prev) => ({ ...prev, [index]: !prev[index] }));
        setActiveTestimonial((prev) => (prev === index ? null : index));
    };

    useEffect(() => {
        const timer = setInterval(() => { paginate(1); }, 4000);
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
            setExpandedTestimonials((prev) => ({ ...prev, [activeTestimonial]: false }));
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
        setExpandedTestimonials((prev) => ({ ...prev, [activeTestimonial]: false }));
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

                    <motion.div variants={fadeInUp} custom={0.6} className={styles.badgesContainer}>
                        <img src={badges} alt="Badges" className={styles.badgeImage} />
                    </motion.div>
                </motion.div>

                <motion.div
                    ref={imageRef}
                    className={styles.visualWrapper}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ amount: 0.5, once: true }}
                    transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
                >
                    <div className={styles.imageColumn}>
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
                                        if (swipe < -SWIPE_CONFIDENCE_THRESHOLD) { paginate(1); }
                                        else if (swipe > SWIPE_CONFIDENCE_THRESHOLD) { paginate(-1); }
                                    }}
                                    alt="Catanduanes Slideshow"
                                    className={styles.slideshowImage}
                                />
                            </AnimatePresence>

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
                        <div className={styles.outsideNavArrows}>
                            <button className={`${styles.navArrow} ${styles.navArrowLeft}`} onClick={() => paginate(-1)} aria-label="Previous image">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                            </button>
                            <button className={`${styles.navArrow} ${styles.navArrowRight}`} onClick={() => paginate(1)} aria-label="Next image">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </motion.div>

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
                                    { label: "Food Trip Duo", quote: "Saved us time finding local food stops between attractions. I'm excited to spend my money on delicacies offered in the Island of Catanduanes", icon: <><path d="M8 3v7"/><path d="M12 3v7"/><path d="M10 3v18"/><path d="M17 3v18"/><path d="M17 8h3"/></> }
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
                    <motion.div className={styles.stickyContent} layout>
                        <motion.div className={styles.stickyTitleGroup} layout transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}>
                            <motion.h2 className={styles.stickyTitle} animate={getStickyTitleAnimation('guide')} transition={{ duration: 0.15 }}>
                                AI-Powered<br />Guide
                            </motion.h2>
                            <motion.div
                                className={styles.stickySubtextWrap}
                                initial={false}
                                animate={{ height: activeSection === 'guide' ? 'auto' : 0, opacity: activeSection === 'guide' ? 1 : 0 }}
                                transition={{ height: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }, opacity: { duration: 0.5 } }}
                            >
                                <div className={styles.stickySubtextInner}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stickyChevron}><path d="m9 18 6-6-6-6"/></svg>
                                    <p className={styles.stickySubtext}>
                                        Chat with our AI to build custom multi-day itineraries, pin destinations, and get real-time local recommendations.
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                        <motion.div className={styles.stickyTitleGroup} layout animate={{ marginTop: (activeSection === 'guide' || activeSection === 'reviews') ? 40 : 12 }} transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}>
                            <motion.h2 className={styles.stickyTitle} animate={getStickyTitleAnimation('reviews')} transition={{ duration: 0.15 }}>
                                What's<br />Beyond
                            </motion.h2>
                            <motion.div
                                className={styles.stickySubtextWrap}
                                initial={false}
                                animate={{ height: activeSection === 'reviews' ? 'auto' : 0, opacity: activeSection === 'reviews' ? 1 : 0 }}
                                transition={{ height: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }, opacity: { duration: 0.5 } }}
                            >
                                <div className={styles.stickySubtextInner}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stickyChevron}><path d="m9 18 6-6-6-6"/></svg>
                                    <p className={styles.stickySubtext}>
                                        Browse 200+ destinations, see live traveler stats, and discover top-rated spots across Catanduanes
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                        <motion.div className={styles.stickyTitleGroup} layout animate={{ marginTop: (activeSection === 'reviews' || activeSection === 'collaborate') ? 40 : 12 }} transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}>
                            <motion.h2 className={styles.stickyTitle} animate={getStickyTitleAnimation('collaborate')} transition={{ duration: 0.15 }}>
                                Work<br />With Us
                            </motion.h2>
                            <motion.div
                                className={styles.stickySubtextWrap}
                                initial={false}
                                animate={{ height: activeSection === 'collaborate' ? 'auto' : 0, opacity: activeSection === 'collaborate' ? 1 : 0 }}
                                transition={{ height: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }, opacity: { duration: 0.5 } }}
                            >
                                <div className={styles.stickySubtextInner}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stickyChevron}><path d="m9 18 6-6-6-6"/></svg>
                                    <p className={styles.stickySubtext}>
                                        View the source, star the repo, or open a pull request — this project is fully open source.
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                    </motion.div>
                </div>

                {/* RIGHT PANEL - SCROLLING CONTENT */}
                <div className={styles.scrollPanel}>

                    {/* ========================================
                        SECTION 1: GUIDE — Chat mockup + features
                    ======================================== */}
                    <div id="guide" ref={guideRef} className={styles.scrollSection}>
    <p className={styles.scrollSectionSubtitle}>Intelligent trip planning at your fingertips</p>

    {/* ── NEW GUIDE SHOWCASE ── */}
    <div className={styles.guideShowcase}>

        {/* ── MAP PRODUCT SCREENSHOT ── */}
        <motion.div
            className={styles.guideMapFrame}
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
            {/* Actual map screenshot */}
            <img src={mapScreenshot} alt="Pathfinder map view" className={styles.guideMapImage} />

            {/* Atmospheric overlays */}
            <div className={styles.guideMapVignette} />
            <div className={styles.guideMapScanlines} />

            {/* Floating pin cards — scattered over map */}
            <motion.div
                className={`${styles.guidePin} ${styles.guidePinA}`}
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.75, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            >
                <span className={styles.guidePinDot} style={{ background: '#fb7185' }} />
                Puraran
            </motion.div>

            <motion.div
                className={`${styles.guidePin} ${styles.guidePinB}`}
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.9, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            >
                <span className={styles.guidePinDot} style={{ background: '#22d3ee' }} />
                Binurong Point
            </motion.div>

            <motion.div
                className={`${styles.guidePin} ${styles.guidePinC}`}
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 1.05, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            >
                <span className={styles.guidePinDot} style={{ background: '#facc15' }} />
                Twin Rock
            </motion.div>
            {/* ── CHAT WINDOW — overlay inside the map frame ── */}
            <motion.div
                className={styles.guideChatFloat}
                initial={{ opacity: 0, y: 28, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: 0.35, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            >
                {/* Chat header */}
                <div className={styles.guideChatHeader}>
                    <div className={styles.guideChatDots}>
                        <span /><span /><span />
                    </div>
                    <span className={styles.guideChatTitle}>Pathfinder AI</span>
                    <span className={styles.guideChatOnline}>● Online</span>
                </div>

                {/* Messages */}
                <div className={styles.guideChatBody}>
                    <motion.div
                        className={styles.guideMsgUser}
                        initial={{ opacity: 0, x: 16 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: false, margin: '-80px' }}
                        transition={{ duration: 0.45 }}
                    >
                        <TypewriterText
                            as="span"
                            className={styles.guideMsgTypewriter}
                            text="Build me a 3-day itinerary for hidden beaches."
                            speed={25}
                            startDelay={600}
                        />
                    </motion.div>

                    <motion.div
                        className={styles.guideMsgAi}
                        initial={{ opacity: 0, x: -16 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: false, margin: '-80px' }}
                        transition={{ duration: 0.45, delay: 0.55 }}
                    >
                        <TypewriterText
                            as="span"
                            className={styles.guideMsgTypewriter}
                            text="Found 4 hidden beaches — added to your map. Here's Day 1:"
                            speed={20}
                            startDelay={1800}
                        />
                    </motion.div>

                    <motion.div
                        className={styles.guideMsgCard}
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: false, margin: '-80px' }}
                        transition={{ duration: 0.45, delay: 0.95 }}
                    >
                        <div className={styles.guideMsgCardLabel}>Day 1 — Eastern Coast</div>
                        <div className={styles.guideMsgStop}>
                            <span className={styles.guideMsgTime}>9:00 AM</span>
                            <span className={styles.guideMsgStopDot} style={{ background: '#fb7185' }} />
                            <span className={styles.guideMsgPlace}>Puraran Surf Camp</span>
                        </div>
                        <div className={styles.guideMsgStop}>
                            <span className={styles.guideMsgTime}>1:00 PM</span>
                            <span className={styles.guideMsgStopDot} style={{ background: '#22d3ee' }} />
                            <span className={styles.guideMsgPlace}>Binurong Point Hike</span>
                        </div>
                        <div className={styles.guideMsgStop}>
                            <span className={styles.guideMsgTime}>5:00 PM</span>
                            <span className={styles.guideMsgStopDot} style={{ background: '#facc15' }} />
                            <span className={styles.guideMsgPlace}>Twin Rock Sunset</span>
                        </div>
                    </motion.div>
                </div>

                {/* Input bar */}
                <div className={styles.guideChatInput}>
                    <span className={styles.guideChatInputPlaceholder}>Ask Pathfinder anything...</span>
                    <button className={styles.guideChatSend} aria-label="Send" disabled tabIndex={-1}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>
                            <path d="m21.854 2.147-10.94 10.939"/>
                        </svg>
                    </button>
                </div>
            </motion.div>
        </motion.div>

    </div>
</div>


                    {/* ========================================
                        SECTION 2: REVIEWS — Framer-style bento
                    ======================================== */}
                    <div id="reviews" ref={reviewsRef} className={styles.scrollSection}>
                        <p className={styles.scrollSectionSubtitle}>Explore the island with every click</p>
                        <ReviewsBento />
                    </div>

                    {/* ========================================
                        SECTION 3: COLLABORATE — Social links
                    ======================================== */}
                    <div id="collaborate" ref={collaborateRef} className={styles.scrollSection}>
                        <div className={styles.contributeLayout}>
                            <p className={styles.scrollSectionSubtitle}>Open source</p>
                            <p className={styles.contributeNote}>
                                Pathfinder operates in direct partnership with the <a href="https://www.facebook.com/catanduanestourismpromotion/" target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>Catanduanes Provincial Tourism Office</a>, relying on validated, updated, and locally sourced data to promote responsible tourism through a transparent open-source platform. Contributions, issues, and feature requests are welcome.
                            </p> 

                            <div className={styles.projectGrid}>
                                {/* ── 1. Project: GitHub Repo Card ── */}
                                <motion.a
                                    href="https://github.com/bikemaster2331/pathfinder"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.repoCard}
                                    initial={{ opacity: 0, y: 24 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.2 }}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                                >
                                    <div className={styles.repoCardHeader}>
                                        <div className={styles.repoIconWrap}>
                                            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                                                <path d="M12 .296C5.37.296 0 5.666 0 12.297c0 5.302 3.438 9.8 8.206 11.387.6.11.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.81 1.305 3.495.998.108-.775.42-1.305.763-1.605-2.665-.304-5.467-1.333-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.124-.304-.535-1.527.117-3.18 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.004-.404 11.5 11.5 0 0 1 3.004.404c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.876.118 3.18.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.623-5.48 5.92.43.372.814 1.102.814 2.222 0 1.604-.014 2.896-.014 3.29 0 .32.216.694.825.576C20.565 22.092 24 17.596 24 12.297 24 5.666 18.627.296 12 .296z"/>
                                            </svg>
                                        </div>
                                        <div className={styles.repoMeta}>
                                            <span className={styles.repoName}>bikemaster2331/pathfinder</span>
                                            <span className={styles.repoDesc}>AI-powered travel itinerary maker for Catanduanes</span>
                                        </div>
                                        <div className={styles.repoArrow}>↗</div>
                                    </div>

                                    <div className={styles.repoStats}>
                                        <span className={styles.repoStat}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                            Star
                                        </span>
                                        <span className={styles.repoStat}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/></svg>
                                            Fork
                                        </span>
                                    </div>
                                </motion.a>

                                {/* ── 2. Tech Stack Card ── */}
                                <motion.div
                                    className={`${styles.techStack} ${styles.techCard}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.2 }}
                                    transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <span className={styles.techLabel}>Built with</span>
                                    <div className={`${styles.techBadges} ${styles.techBadgesCentered}`}>
                                        {TECH_STACK.map((tech) => (
                                            <span key={tech.name} className={styles.techBadge} style={{ '--tech-color': tech.color }}>
                                                <span className={styles.techBadgeIcon}>
                                                    <tech.Icon />
                                                </span>
                                                {tech.name}
                                            </span>
                                        ))}
                                    </div>
                                </motion.div>
                            </div>

                            {/* ── Meet the Creators ── */}
                            <motion.div
                                className={styles.creatorsSection}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <span className={styles.techLabel}>Creators</span>
                                <div className={styles.creatorsGrid}>
                                    {[
                                        {
                                            name: 'Tan', role: 'Core Dev', accent: '#22d3ee',
                                            email: 'tanlanuzga@gmail.com',
                                            github: 'https://github.com/bikemaster2331',
                                            stats: { commits: '240+', prs: '38', lines: '12k+' },
                                            bio: 'Full-stack architect. Built the AI pipeline, RAG system, frontend, backend, map engine, and itinerary planner.'
                                        },
                                        {
                                            name: 'Roi', role: 'Hardware', accent: '#a78bfa',
                                            stats: { commits: '85', prs: '14', lines: '4k+' },
                                            bio: 'Raspberry Pi deployment, hardware setup, and embedded systems integration.'
                                        },
                                        {
                                            name: 'Zed', role: 'Full Stack', accent: '#34d399',
                                            stats: { commits: '120', prs: '22', lines: '7k+' },
                                            bio: 'Full-stack development and hardware integration. Bridged software with RPi infrastructure.'
                                        },
                                        {
                                            name: 'Pat', role: 'Hardware', accent: '#fb923c',
                                            stats: { commits: '45', prs: '8', lines: '2k+' },
                                            bio: 'Raspberry Pi configuration, networking, and hardware infrastructure.'
                                        },
                                        {
                                            name: 'Lee', role: 'Researcher', accent: '#f472b6',
                                            stats: { commits: '30', prs: '6', lines: '1k+' },
                                            bio: 'Destination data sourcing, tourism research, and documentation.'
                                        },
                                    ].map((creator, i) => (
                                        <motion.div
                                            key={creator.name}
                                            className={styles.creatorCardWrap}
                                            initial={{ opacity: 0, y: 16 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 0.45, delay: 0.2 + i * 0.08 }}
                                            style={{ '--creator-accent': creator.accent }}
                                            onClick={() => setActiveCreator(activeCreator === i ? null : i)}
                                        >
                                            <div className={`${styles.creatorFlipper} ${activeCreator === i ? styles.creatorFlipped : ''}`}>
                                                {/* Front face */}
                                                <div className={styles.creatorFront}>
                                                    <div className={styles.creatorAvatar}>
                                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                                            <circle cx="12" cy="7" r="4"/>
                                                        </svg>
                                                    </div>
                                                    <span className={styles.creatorName}>{creator.name}</span>
                                                    <span className={styles.creatorRole}>{creator.role}</span>
                                                </div>

                                                {/* Back face */}
                                                <div className={styles.creatorBack}>
                                                    <span className={styles.creatorBackName}>{creator.name}</span>
                                                    <p className={styles.creatorBio}>{creator.bio}</p>
                                                    <div className={styles.creatorActions}>
                                                        {creator.email && (
                                                            <a href={`mailto:${creator.email}`} className={styles.creatorLink} onClick={(e) => e.stopPropagation()} aria-label={`Email ${creator.name}`}>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                                            </a>
                                                        )}
                                                        {creator.github && (
                                                            <a href={creator.github} target="_blank" rel="noopener noreferrer" className={styles.creatorLink} onClick={(e) => e.stopPropagation()}>
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* ── Footer Exit: Connect Links ── */}
                            <motion.div
                                className={`${styles.techStack} ${styles.connectFooter}`}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <span className={styles.techLabel}>Connect</span>
                                <div className={styles.techBadges}>
                                    <a href="https://www.facebook.com/catanduanestourismpromotion/" target="_blank" rel="noopener noreferrer" className={styles.techBadgeLink}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                        Catanduanes Tourism
                                    </a>
                                    <a href="https://www.itsmorefuninthephilippines.com/" target="_blank" rel="noopener noreferrer" className={styles.techBadgeLink}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                        It's More Fun in the Philippines
                                    </a>
                                    <a href="https://tourism.gov.ph/" target="_blank" rel="noopener noreferrer" className={styles.techBadgeLink}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7l10 5 10-5"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                                        Department of Tourism
                                    </a>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
