import { useNavigate } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';
import styles from '../styles/homepage/Home.module.css';
import chatStyles from '../styles/itinerary_page/ChatBot.module.css';
import { motion, wrap } from 'framer-motion';
import SharedNavbar from '../components/navbar';
import badges from '../assets/images/card/badges.png';
import mapScreenshot from '../assets/images/card/map.png';
import gsap from 'gsap';

const imageModules = import.meta.glob('../assets/images/homeshow/*.{png,jpg,jpeg,svg}', {
    eager: true,
    import: 'default',
});

import prism from '../assets/images/homeshow/prism/surf.png';

const imageEntries = Object.entries(imageModules).sort(([a], [b]) => a.localeCompare(b));
const IMAGES = imageEntries.map(([, src]) => src);
const IMAGE_NAMES = imageEntries.map(([path]) => {
    let name = path.split('/').pop().split('.')[0];
    return name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
});


const angledVariants = {
    animate: (offset) => {
        const isCenter = offset === 0;
        const isLeft = offset === -1;
        const isRight = offset === 1;
        const isFarLeft = offset < -1;
        const isFarRight = offset > 1;

        if (isCenter) {
            return { x: "0%", y: "0%", scale: 1.01, rotate: 0, filter: "brightness(1)", opacity: 1, zIndex: 10 };
        } else if (isLeft) {
            return { x: "-100%", y: "5%", scale: 0.88, rotate: -2, filter: "brightness(0.65)", opacity: 1, zIndex: 5 };
        } else if (isRight) {
            return { x: "100%", y: "5%", scale: 0.88, rotate: 2, filter: "brightness(0.65)", opacity: 1, zIndex: 5 };
        } else if (isFarLeft) {
            return { x: "-200%", y: "10%", scale: 0.75, rotate: -4, filter: "brightness(0.6)", opacity: 0, zIndex: 0 };
        } else if (isFarRight) {
            return { x: "200%", y: "10%", scale: 0.75, rotate: 4, filter: "brightness(0.6)", opacity: 0, zIndex: 0 };
        }
    }
};

const angledTransition = {
    duration: 1.2,
    ease: [0.34, 1.1, 0.64, 1]
};

const getOffset = (index, currentIndex, length) => {
    let offset = (index - currentIndex) % length;
    if (offset > Math.floor(length / 2)) offset -= length;
    if (offset < -Math.floor(length / 2)) offset += length;
    return offset;
};

const SWIPE_CONFIDENCE_THRESHOLD = 8000;
const getSwipePower = (offset, velocity) => Math.abs(offset) * velocity;

const ACTIVE_STICKY_OPACITY = 1.4;
const INACTIVE_STICKY_OPACITY = 0.1;
const ACTIVE_STICKY_SCALE = 1.5;
const INACTIVE_STICKY_SCALE = 0.6;


const FacebookIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
);
const InstagramIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
);
const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 .296C5.37.296 0 5.666 0 12.297c0 5.302 3.438 9.8 8.206 11.387.6.11.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.81 1.305 3.495.998.108-.775.42-1.305.763-1.605-2.665-.304-5.467-1.333-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.124-.304-.535-1.527.117-3.18 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.004-.404 11.5 11.5 0 0 1 3.004.404c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.876.118 3.18.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.623-5.48 5.92.43.372.814 1.102.814 2.222 0 1.604-.014 2.896-.014 3.29 0 .32.216.694.825.576C20.565 22.092 24 17.596 24 12.297 24 5.666 18.627.296 12 .296z" />
    </svg>
);
const YouTubeIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
);
const TwitterXIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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

const REPO_FEATURES = [
    { 
        label: 'RAG AI', 
        desc: 'Retrieval Augmented Generation', 
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M9 13a4.5 4.5 0 0 0 3-4"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M12 13h4"/><path d="M12 18h6a2 2 0 0 1 2 2v1"/><path d="M12 8h8"/><path d="M16 8V5a2 2 0 0 1 2-2"/><circle cx="16" cy="13" r=".5"/><circle cx="18" cy="3" r=".5"/><circle cx="20" cy="21" r=".5"/><circle cx="20" cy="8" r=".5"/></svg>
        )
    },
    { 
        label: 'Dynamic Maps', 
        desc: 'Interactive Leaflet visualization', 
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/></svg>
        )
    },
    { 
        label: 'Verified Data', 
        desc: 'Locally sourced tourism records', 
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="18" x="3" y="3" rx="1"/><path d="M7 3v18"/><path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"/></svg>
        )
    },
    { 
        label: 'Open Source', 
        desc: 'Transparency & Community driven', 
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/></svg>
        )
    },
];

const REPO_VERSION = 'v1.0.4';


const ReviewsBento = () => {
    const portraitImage = prism;


    const DESTS = [
        { name: 'Puraran Beach', tag: 'Surf' },
        { name: 'Binurong Point', tag: 'Trek' },
        { name: 'Twin Rock Beach', tag: 'Swim' },
        { name: 'Batalay Cove', tag: 'Dive' },
        { name: 'Maribina Falls', tag: 'Hike' },
        { name: 'Bato Church', tag: 'Tour' },
    ];
    const [destIdx, setDestIdx] = useState(0);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        const t = setInterval(() => {
            setFading(true);
            setTimeout(() => {
                setDestIdx(i => (i + 1) % DESTS.length);
                setFading(false);
            }, 340);
        }, 2600);
        return () => clearInterval(t);
    }, []);


    const [count, setCount] = useState(0);
    useEffect(() => {
        let raf;
        const t0 = performance.now();
        const dur = 1800;
        const tick = now => {
            const p = Math.min((now - t0) / dur, 1);
            setCount(Math.round((1 - Math.pow(1 - p, 3)) * 200));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);


    const [progress, setProgress] = useState(0);
    useEffect(() => {
        setProgress(0);
        const t = setTimeout(() => setProgress(100), 60);
        return () => clearTimeout(t);
    }, [destIdx]);

    return (
        <div className={styles.bentoGrid}>
            <div className={styles.prismLayout}>

                {/* ══════════════════════════════════════
                    COLUMN 1 — Brand identity + Stats
                ══════════════════════════════════════ */}
                <div className={styles.prismColumn}>

                    {/* Card A — Wordmark */}
                    <motion.div
                        className={`${styles.prismCard} ${styles.prismBrandCard}`}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.55 }}
                    >
                        <div className={styles.prismAuroraA} aria-hidden="true" />
                        <div className={styles.prismNoise} aria-hidden="true" />

                        <div className={styles.prismBrandTopRow}>
                            <span className={styles.prismEyebrow}>AI Travel</span>
                            <span className={styles.prismSpinStar} aria-hidden="true">✦</span>
                        </div>

                        <div className={styles.prismWordmark}>
                            <span>EXPLORE</span>
                        </div>

                        <div className={styles.prismBrandBottom}>
                            <span className={styles.prismLocLine}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <path d="M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                                </svg>
                                Catanduanes, PH
                            </span>
                        </div>
                    </motion.div>

                    {/* Card B — Destination stats */}
                    <motion.div
                        className={`${styles.prismCard} ${styles.prismStatsCard}`}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.55, delay: 0.08 }}
                    >
                        <div className={styles.prismNoise} aria-hidden="true" />

                        <div className={styles.prismStatRow}>
                            <span className={styles.prismStatNum}>{count}+</span>
                            <span className={styles.prismStatLabel}>Destinations</span>
                        </div>
                        <div className={styles.prismStatDivider} />
                        <div className={styles.prismStatRow}>
                            <span className={styles.prismStatNum}>12</span>
                            <span className={styles.prismStatLabel}>Municipalities</span>
                        </div>
                        <div className={styles.prismStatDivider} />
                        <div className={styles.prismStatRow}>
                            <span className={styles.prismStatNumAlt}>RAG</span>
                            <span className={styles.prismStatLabel}>AI Pipeline</span>
                        </div>
                    </motion.div>
                </div>

                {/* ══════════════════════════════════════
                    COLUMN 2 — Hero orb + Mini player
                ══════════════════════════════════════ */}
                <div className={styles.prismColumn}>

                    {/* Card C — Centerpiece */}
                    <motion.div
                        className={`${styles.prismCard} ${styles.prismHeroCard}`}
                        initial={{ opacity: 0, y: 28 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.15 }}
                        transition={{ duration: 0.65, delay: 0.05 }}
                    >


                        {/* Morphing orb */}
                        <div className={styles.prismOrbWrap} aria-hidden="true">
                            <div className={styles.prismOrbCore} />
                            <div className={styles.prismOrbRing1} />
                            <div className={styles.prismOrbRing2} />
                        </div>

                        {/* Footer — cycling destination */}
                        <div className={styles.prismHeroFooter}>
                            <div className={styles.prismHeroDestRow}>
                                <span
                                    className={styles.prismHeroDestName}
                                    style={{
                                        opacity: fading ? 0 : 1,
                                        transform: fading ? 'translateY(6px)' : 'translateY(0)',
                                        transition: 'opacity 0.32s ease, transform 0.32s ease',
                                    }}
                                >
                                    {DESTS[destIdx].name}
                                </span>
                                <span
                                    className={styles.prismHeroDestTag}
                                    style={{
                                        opacity: fading ? 0 : 1,
                                        transition: 'opacity 0.32s ease 0.06s',
                                    }}
                                >
                                    {DESTS[destIdx].tag}
                                </span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Card D — Mini player */}
                    <motion.div
                        className={`${styles.prismCard} ${styles.prismPlayerCard}`}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.5, delay: 0.14 }}
                    >
                        <div className={styles.prismNoise} aria-hidden="true" />
                    </motion.div>
                </div>

                {/* ══════════════════════════════════════
                    COLUMN 3 — Cinematic photo + CTA
                ══════════════════════════════════════ */}
                <div className={styles.prismColumn}>

                    {/* Card E — Full-bleed photo */}
                    <motion.div
                        className={`${styles.prismCard} ${styles.prismPhotoCard}`}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        <img src={portraitImage} alt="Catanduanes scenery" className={styles.prismPhotoImg} />
                        <div className={styles.prismPhotoVignette} aria-hidden="true" />
                    </motion.div>

                    {/* Card F — CTA */}
                    <motion.div
                        className={`${styles.prismCard} ${styles.prismCtaCard}`}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.5, delay: 0.18 }}
                    >
                        <div className={styles.prismAuroraC} aria-hidden="true" />
                        <div className={styles.prismNoise} aria-hidden="true" />

                        <span className={styles.prismCtaNum}>{count}+</span>
                        <span className={styles.prismCtaSub}>Destinations</span>
                        <p className={styles.prismCtaCopy}>
                            Explore the island with AI-powered itineraries.
                        </p>
                    </motion.div>
                </div>

            </div>
        </div>
    );
};


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
            <span style={{ visibility: 'hidden' }} aria-hidden="true">{renderParts(text)}</span>
            <span style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
                {renderParts(displayed)}
                {started && !done && <span className={styles.typewriterCursor}>|</span>}
            </span>
        </Tag>
    );
};


const Constellation = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animId;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = canvas.parentElement?.offsetHeight || window.innerHeight * 3;
        };
        resize();
        window.addEventListener('resize', resize);

        const STARS = [
            { x: 0.08, y: 0.12 },
            { x: 0.22, y: 0.28 },
            { x: 0.41, y: 0.18 },
            { x: 0.55, y: 0.38 },
            { x: 0.68, y: 0.22 },
            { x: 0.78, y: 0.45 },
            { x: 0.88, y: 0.32 },
            { x: 0.62, y: 0.58 },
            { x: 0.35, y: 0.65 },
            { x: 0.15, y: 0.52 },
            { x: 0.25, y: 0.78 },
            { x: 0.50, y: 0.82 },
            { x: 0.75, y: 0.72 },
            { x: 0.90, y: 0.85 },
        ];

        const totalSegments = STARS.length - 1;
        const TIME_PER_SEGMENT = 900;   // ms per segment
        const GLOW_HOLD = 2200;         // ms to hold the full glow
        const FADE_OUT = 1000;          // ms to fade out before reset
        const LOOP_DURATION = (TIME_PER_SEGMENT * totalSegments) + GLOW_HOLD + FADE_OUT;

        const draw = (t) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const W = canvas.width;
            const H = canvas.height;
            const pts = STARS.map(s => ({ x: s.x * W, y: s.y * H }));

            const elapsed = t % LOOP_DURATION;
            const drawPhaseEnd = TIME_PER_SEGMENT * totalSegments;
            const glowPhaseEnd = drawPhaseEnd + GLOW_HOLD;

            // ── Phases ──
            const isDrawing   = elapsed < drawPhaseEnd;
            const isGlowing   = elapsed >= drawPhaseEnd && elapsed < glowPhaseEnd;
            const isFadingOut = elapsed >= glowPhaseEnd;

            // ── Smoother Transitions ──
            // 1. Glow Factor (0 to 1) for ramping up/down during GLOW_HOLD
            let glowFactor = 0;
            if (isGlowing) {
                const ramp = 600; // duration of ramp up/down
                if (elapsed < drawPhaseEnd + ramp) {
                    glowFactor = (elapsed - drawPhaseEnd) / ramp;
                } else if (elapsed > glowPhaseEnd - ramp) {
                    glowFactor = (glowPhaseEnd - elapsed) / ramp;
                } else {
                    glowFactor = 1;
                }
            }

            // 2. Smoother Global Alpha for FADE_OUT (using ease-in-out curve)
            let globalAlpha = 1;
            if (isFadingOut) {
                const fadeNorm = (elapsed - glowPhaseEnd) / FADE_OUT;
                // Cubic ease out: 1 - x^3
                globalAlpha = 1 - Math.pow(fadeNorm, 3);
            }
            ctx.globalAlpha = Math.max(0, globalAlpha);

            // ── Progress logic ──
            let drawn = totalSegments;
            let progress = 1;

            if (isDrawing) {
                const segIndex = Math.floor(elapsed / TIME_PER_SEGMENT);
                const segProgress = (elapsed % TIME_PER_SEGMENT) / TIME_PER_SEGMENT;
                drawn = segIndex;
                progress = segProgress;
            }

            // ── Draw stars ──
            pts.forEach((p, i) => {
                const pulse = 0.6 + Math.sin(t * 0.001 + i * 1.2) * 0.4;
                const glowBoost = 1 + (glowFactor * 1.5);
                const r = (i === 0 ? 3 : 2) * pulse;

                const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5 * glowBoost);
                grd.addColorStop(0, `rgba(255,255,255,${0.7 * pulse})`);
                grd.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.beginPath();
                ctx.arc(p.x, p.y, r * 5 * glowBoost, 0, Math.PI * 2);
                ctx.fillStyle = grd;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.9 * pulse})`;
                ctx.fill();
            });

            // ── Line style interpolation ──
            const lineOpacity  = 0.2 + (glowFactor * 0.5);
            const lineWidth    = 0.8 + (glowFactor * 0.7);
            const lineDash     = glowFactor > 0.4 ? [] : [4, 6];
            const lineColor    = `rgba(${255 - glowFactor * 75}, ${255 - glowFactor * 45}, 255, ${lineOpacity})`;

            ctx.setLineDash(lineDash);
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = lineWidth;

            for (let i = 0; i < drawn; i++) {
                ctx.beginPath();
                ctx.moveTo(pts[i].x, pts[i].y);
                ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
                ctx.stroke();
            }

            // ── Active growing segment ──
            if (isDrawing && drawn < totalSegments) {
                const from = pts[drawn];
                const to   = pts[drawn + 1];
                const cx   = from.x + (to.x - from.x) * progress;
                const cy   = from.y + (to.y - from.y) * progress;

                ctx.setLineDash([]);
                ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(cx, cy);
                ctx.stroke();

                // Travelling dot
                const dotGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 7);
                dotGrd.addColorStop(0, 'rgba(255,255,255,0.95)');
                dotGrd.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.beginPath();
                ctx.arc(cx, cy, 7, 0, Math.PI * 2);
                ctx.fillStyle = dotGrd;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(cx, cy, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();
            }

            ctx.globalAlpha = 1;
            animId = requestAnimationFrame(draw);
        };

        animId = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,          // behind everything
                pointerEvents: 'none',
                mixBlendMode: 'screen',
            }}
        />
    );
};


export default function Home() {
    const navigate = useNavigate();

    useEffect(() => {
        // No longer adding homepage-active as scrollbars are default now
    }, []);

    const guideRef = useRef(null);
    const reviewsRef = useRef(null);
    const collaborateRef = useRef(null);
    const sectionRatiosRef = useRef({ guide: 0, reviews: 0, collaborate: 0 });

    const [[page, direction], setPage] = useState([0, 0]);
    const imageIndex = wrap(0, IMAGES.length, page);
    const [expandedTestimonials, setExpandedTestimonials] = useState({});
    const [activeTestimonial, setActiveTestimonial] = useState(null);
    const suppressNextOpenRef = useRef(false);

    const [activeSection, setActiveSection] = useState('guide');
    const [activeCreator, setActiveCreator] = useState(null);
    const [activeFeatIndex, setActiveFeatIndex] = useState(0);



    useEffect(() => {
        const options = {
            root: null,
            rootMargin: "-45% 0px -45% 0px",
            threshold: [0, 0.25, 0.5, 0.75, 1],
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const id = entry.target.id;

                if (id in sectionRatiosRef.current) {
                    sectionRatiosRef.current[id] = entry.isIntersecting
                        ? entry.intersectionRatio
                        : 0;
                }
            });

            const nextActive = Object.entries(sectionRatiosRef.current)
                .sort((a, b) => b[1] - a[1])[0]?.[0];
            if (nextActive) setActiveSection(nextActive);
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


    const getStickyTitleAnimation = (sectionId) => {
        const isActive = activeSection === sectionId;
        return {
            color: isActive 
                ? 'rgba(var(--home-text-rgb), 1)' 
                : 'rgba(var(--home-text-rgb), 0.1)',
            scale: isActive ? ACTIVE_STICKY_SCALE : INACTIVE_STICKY_SCALE,
        };
    };



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
        const timer = setInterval(() => { paginate(1); }, 6000);
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

    const glowRefs = useRef([]);
    const headlineRef = useRef(null);

    useEffect(() => {
        const glows = glowRefs.current.filter(Boolean);
        const headline = headlineRef.current;
        if (!glows.length || !headline) return;
        
        // Initial setup - Force starting state
        gsap.set(glows, { opacity: 0, transform: 'rotate(-35deg) translateY(-60%)' });
        gsap.set(headline, { "--glow-opacity": 0, scale: 1 });
        
        const tl = gsap.timeline({ repeat: -1 });
        
        // 1. THE RAYS (Finishes at ~17.4s)
        glows.forEach((el, i) => {
            const start = i * 0.7;
            tl.to(el, {
                opacity: 1,
                transform: 'rotate(-35deg) translateY(0%)',
                duration: 3,
                ease: 'sine.inOut',
            }, start);
            tl.to(el, {
                opacity: 0,
                transform: 'rotate(-35deg) translateY(-60%)',
                duration: 3,
                ease: 'power2.in',
            }, start + 2.5);
        });
    
        // 2. THE BLOOM 
        const bloomStart = 15.4; 

        tl.to(headline, {
            "--glow-opacity": 1, 
            duration: 2,
            ease: "power2.out" // Gives it that slight "kick" to start the bloom
        }, bloomStart);

        // 3. FADE OUT
        tl.to(headline, {
            "--glow-opacity": 0,
            duration: 2,
            ease: "sine.inOut" // Smooth, natural retreat
        }, "+=1");
    
        tl.to({}, { duration: 0 }, 21);
    
        return () => tl.kill();
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveFeatIndex((current) => (current + 1) % REPO_FEATURES.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const fadeInUp = {
        hidden: { opacity: 0, y: 40 },
        visible: (custom) => ({
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: custom || 0 },
        }),
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
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

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className={styles.homeContainer}>
            {Array.from({ length: 18 }, (_, i) => (
                <div
                    key={i}
                    className={styles[`ambientGlow${i + 1}`]}
                    ref={el => { glowRefs.current[i] = el; }}
                />
            ))}

            <div className={styles.starfield} />


            {/* ══════════════════════════════════════════
                PAGE 1 — HERO SECTION
            ══════════════════════════════════════════ */}
            <main className={styles.heroSection}>
                <div className={styles.banigHeroWrapper}>
                    <div className={styles.topMetadata}>
                        <span>PATHFINDER // v1.0.21</span>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={styles.metadataIcon}
                        >
                            <path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999" />
                            <path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024" />
                            <path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069" />
                            <path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z" />
                        </svg>
                    </div>

                    <div className={styles.banigHeroBackground} />
                    <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        animate="visible"
                        className={styles.contentWrapper}
                    >
                        <motion.div variants={fadeInUp} custom={0} className={styles.headlineWrapper}>
                            <h1 ref={headlineRef} className={styles.headline}>
                                Explore with
                                <br />
                                <span className={styles.headlineAccent}> every click.</span>
                            </h1>

                        </motion.div>

                        <motion.p variants={fadeInUp} custom={0.12} className={styles.subheadline}>
                            Pathfinder is the AI travel guide for Catanduanes. <br />
                            Make personalized itineraries or find hidden spots. <br />
                            Plan your entire trip with real-time local data.
                        </motion.p>

                        <motion.div variants={fadeInUp} custom={0.45} className={styles.ctaGroup}>
                            <button className={styles.primaryCta} onClick={() => navigate('/itinerary')}>
                                <span>Start Exploring</span>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
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

                    {/* ── Carousel ── */}
                    <div className={styles.visualWrapper}>
                        <div className={styles.imageColumn}>
                            <div className={styles.imageContainer}>
                                {[-2, -1, 0, 1, 2].map((offset) => {
                                    const absoluteIndex = page + offset;
                                    const arrayIndex = wrap(0, IMAGES.length, absoluteIndex);
                                    const src = IMAGES[arrayIndex];
                                    const isActive = offset === 0;
                                    const isLeft = offset === -1;
                                    const isRight = offset === 1;
                                    return (
                                        <motion.div
                                            key={absoluteIndex}
                                            custom={offset}
                                            variants={angledVariants}
                                            initial={false}
                                            animate="animate"
                                            transition={angledTransition}
                                            drag={isActive ? "x" : false}
                                            dragConstraints={{ left: 0, right: 0 }}
                                            dragElastic={0}
                                            dragDirectionLock
                                            style={{ touchAction: "pan-y" }}
                                            onDragEnd={(e, { offset: dragOffset, velocity }) => {
                                                if (!isActive) return;
                                                const swipe = getSwipePower(dragOffset.x, velocity.x);
                                                if (swipe < -SWIPE_CONFIDENCE_THRESHOLD || dragOffset.x < -30) {
                                                    paginate(1);
                                                } else if (swipe > SWIPE_CONFIDENCE_THRESHOLD || dragOffset.x > 30) {
                                                    paginate(-1);
                                                }
                                            }}
                                            onClick={() => {
                                                if (isLeft) paginate(-1);
                                                if (isRight) paginate(1);
                                            }}
                                            className={`${styles.slideshowImage} ${isLeft ? styles.cursorPrev : ''} ${isRight ? styles.cursorNext : ''}`}
                                        >
                                            <img src={src} alt={`Slide ${arrayIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', pointerEvents: 'none' }} />
                                            <motion.div
                                                className={styles.locationCard}
                                                initial={false}
                                                animate={{ opacity: isActive ? 1 : 0 }}
                                                transition={{ duration: 0.4 }}
                                            >
                                                <div className={styles.cardLocation}>
                                                    <span>{IMAGE_NAMES[arrayIndex]}</span>
                                                </div>
                                            </motion.div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Testimonials ── */}
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
                                    { label: "First-time Visitor", quote: "Ang bilis lang magplano, will use again", icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></> },
                                    { label: "Weekend Explorer", quote: "Shoutout sa mga kapamilya at mga kaibigan ko at kay Patrick Guerrero, sikat na ako.", icon: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
                                    { label: "Weekend Explorer", quote: "Must try: Paraiso Ni Honesto", icon: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
                                    { label: "Group Trip Organizer", quote: "Multi-day planner kept our group of 8 perfectly coordinated across 3 days. Sa mga graduating d'yan ingat!", icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> },
                                    { label: "Backpacker", quote: "Offline access helped when signal dropped in remote spots.", icon: <><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></> },
                                    { label: "Food Trip Duo", quote: "Saved us time finding local food stops between attractions. I'm excited to spend my money on delicacies offered in the Island of Catanduanes", icon: <><path d="M8 3v7" /><path d="M12 3v7" /><path d="M10 3v18" /><path d="M17 3v18" /><path d="M17 8h3" /></> }
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

            <div className={styles.sectionBridge} />

            {/* ══════════════════════════════════════════
                STICKY SCROLL SECTIONS
            ══════════════════════════════════════════ */}

            <div className={styles.stickyContainer}>
                <div className={styles.starfieldPersistent} aria-hidden="true" />
                <Constellation />

                {/* ── LEFT PANEL — sticky titles ── */}
                <div className={styles.stickyPanel}>
                    <motion.div className={styles.stickyContent} layout>
                        <motion.div className={styles.stickyTitleGroup} layout transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}>
                            <motion.h2 className={`${styles.stickyTitle} ${activeSection !== 'guide' ? styles.inactiveShadowMask : ''}`} animate={getStickyTitleAnimation('guide')} transition={{ duration: 0.15 }}>
                                AI-Powered<br />Guide
                            </motion.h2>
                            <motion.div
                                className={styles.stickySubtextWrap}
                                initial={false}
                                animate={{ height: activeSection === 'guide' ? 'auto' : 0, opacity: activeSection === 'guide' ? 1 : 0 }}
                                transition={{ height: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }, opacity: { duration: 0.5 } }}
                            >
                                <div className={styles.stickySubtextInner}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stickyChevron}><path d="m9 18 6-6-6-6" /></svg>
                                    <p className={styles.stickySubtext}>
                                        Chat with our AI to build custom multi-day itineraries, pin destinations, and get real-time local recommendations.
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>

                        <motion.div className={styles.stickyTitleGroup} layout animate={{ marginTop: (activeSection === 'guide' || activeSection === 'reviews') ? 40 : 12 }} transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}>
                            <motion.h2 className={`${styles.stickyTitle} ${activeSection !== 'reviews' ? styles.inactiveShadowMask : ''}`} animate={getStickyTitleAnimation('reviews')} transition={{ duration: 0.15 }}>
                                What's<br />Beyond
                            </motion.h2>
                            <motion.div
                                className={styles.stickySubtextWrap}
                                initial={false}
                                animate={{ height: activeSection === 'reviews' ? 'auto' : 0, opacity: activeSection === 'reviews' ? 1 : 0 }}
                                transition={{ height: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }, opacity: { duration: 0.5 } }}
                            >
                                <div className={styles.stickySubtextInner}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stickyChevron}><path d="m9 18 6-6-6-6" /></svg>
                                    <p className={styles.stickySubtext}>
                                        Browse 200+ destinations, see live traveler stats, and discover top-rated spots across Catanduanes
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>

                        <motion.div className={styles.stickyTitleGroup} layout animate={{ marginTop: (activeSection === 'reviews' || activeSection === 'collaborate') ? 40 : 12 }} transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}>
                            <motion.h2 className={`${styles.stickyTitle} ${activeSection !== 'collaborate' ? styles.inactiveShadowMask : ''}`} animate={getStickyTitleAnimation('collaborate')} transition={{ duration: 0.15 }}>
                                Work<br />With Us
                            </motion.h2>
                            <motion.div
                                className={styles.stickySubtextWrap}
                                initial={false}
                                animate={{ height: activeSection === 'collaborate' ? 'auto' : 0, opacity: activeSection === 'collaborate' ? 1 : 0 }}
                                transition={{ height: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }, opacity: { duration: 0.5 } }}
                            >
                                <div className={styles.stickySubtextInner}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stickyChevron}><path d="m9 18 6-6-6-6" /></svg>
                                    <p className={styles.stickySubtext}>
                                        View the source, star the repo, or open a pull request — this project is fully open source.
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                    </motion.div>
                </div>

                {/* ── RIGHT PANEL — scrolling content ── */}
                <div className={styles.scrollPanel}>

                    {/* ══════════════════════════════════
                        SECTION 1: GUIDE
                    ══════════════════════════════════ */}
                    <div id="guide" ref={guideRef} className={styles.scrollSection} style={{ position: 'relative' }}>

                        <div className={styles.guideShowcase}>
                            <motion.div
                                className={styles.guideMapFrame}
                                initial={{ opacity: 0, y: 32, scale: 0.97 }}
                                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                viewport={{ once: true, amount: 0.2 }}
                                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <img src={mapScreenshot} alt="Pathfinder map view" className={styles.guideMapImage} />
                                <div className={styles.guideMapVignette} />
                                <div className={styles.guideMapScanlines} />

                                <motion.div className={`${styles.guidePin} ${styles.guidePinA}`} initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.75, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}>
                                    <span className={styles.guidePinDot} style={{ background: '#fb7185' }} />
                                    Puraran
                                </motion.div>
                                <motion.div className={`${styles.guidePin} ${styles.guidePinB}`} initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.9, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}>
                                    <span className={styles.guidePinDot} style={{ background: '#22d3ee' }} />
                                    Binurong Point
                                </motion.div>
                                <motion.div className={`${styles.guidePin} ${styles.guidePinC}`} initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.05, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}>
                                    <span className={styles.guidePinDot} style={{ background: '#facc15' }} />
                                    Twin Rock
                                </motion.div>

                                <motion.div
                                    className={styles.guideChatFloat}
                                    initial={{ opacity: 0, y: 28, scale: 0.96 }}
                                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                    viewport={{ once: true, amount: 0.2 }}
                                    transition={{ delay: 0.35, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <div className={styles.guideChatHeader}>
                                        <span className={styles.guideChatTitle}>Pathfinder AI</span>
                                        <span className={styles.guideChatOnline}>● Online</span>
                                    </div>
                                    <div className={styles.guideChatBody}>
                                        <motion.div className={styles.guideMsgUser} initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-80px' }} transition={{ duration: 0.45 }}>
                                            <TypewriterText as="span" className={styles.guideMsgTypewriter} text="Build me a 3-day itinerary for hidden beaches." speed={25} startDelay={600} />
                                        </motion.div>
                                        <motion.div className={styles.guideMsgAi} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-80px' }} transition={{ duration: 0.45, delay: 0.55 }}>
                                            <TypewriterText as="span" className={styles.guideMsgTypewriter} text="Found 4 hidden beaches — added to your map. Here's Day 1:" speed={20} startDelay={1800} />
                                        </motion.div>
                                        <motion.div className={styles.guideMsgCard} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-80px' }} transition={{ duration: 0.45, delay: 0.95 }}>
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
                                    <div className={styles.guideChatInput}>
                                        <span className={styles.guideChatInputPlaceholder}>Ask Pathfinder anything...</span>
                                        <button className={styles.guideChatSend} aria-label="Send" disabled tabIndex={-1}>
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                                                <path d="m21.854 2.147-10.94 10.939" />
                                            </svg>
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        </div>
                    </div>

                    {/* ══════════════════════════════════
                        SECTION 2: REVIEWS
                    ══════════════════════════════════ */}
                    <div id="reviews" ref={reviewsRef} className={styles.scrollSection} style={{ position: 'relative' }}>
                        <ReviewsBento />
                    </div>

                    {/* ══════════════════════════════════
                        SECTION 3: COLLABORATE
                    ══════════════════════════════════ */}
                    <div id="collaborate" ref={collaborateRef} className={styles.scrollSection} style={{ position: 'relative' }}>
                        <div className={styles.contributeShell}>
                            <div className={styles.contributeLayout}>
                                <motion.p
                                    className={styles.contributeNote}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.3 }}
                                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    Pathfinder operates in direct partnership with the {' '}
                                    <a href="https://www.facebook.com/catanduanestourismpromotion/" target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
                                        Catanduanes Tourism Promotion Office
                                    </a>
                                    , <br /> thoroughly relying on validated, updated, and locally sourced data to promote responsible and reliable
                                    <br /> tourism through a transparent open-source platform. Contributions, issues, and feature requests are welcome.
                                </motion.p>

                                <div className={styles.projectGrid}>
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
                                                    <path d="M12 .296C5.37.296 0 5.666 0 12.297c0 5.302 3.438 9.8 8.206 11.387.6.11.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.81 1.305 3.495.998.108-.775.42-1.305.763-1.605-2.665-.304-5.467-1.333-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.124-.304-.535-1.527.117-3.18 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.004-.404 11.5 11.5 0 0 1 3.004.404c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.876.118 3.18.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.623-5.48 5.92.43.372.814 1.102.814 2.222 0 1.604-.014 2.896-.014 3.29 0 .32.216.694.825.576C20.565 22.092 24 17.596 24 12.297 24 5.666 18.627.296 12 .296z" />
                                                </svg>
                                            </div>
                                            <div className={styles.repoMeta}>
                                                <span className={styles.repoName}>
                                                    bikemaster2331/pathfinder
                                                    <span className={styles.repoVersion}>{REPO_VERSION}</span>
                                                </span>
                                                <span className={styles.repoDesc}>AI-powered travel itinerary maker for Catanduanes</span>
                                            </div>
                                            <div className={styles.repoArrow}>↗</div>
                                        </div>

                                        <div className={styles.repoBody}>
                                            <div className={styles.repoFeaturesHeader}>
                                                <pre className={styles.asciiArt}>
                                                    {`      ___           ___           ___           ___           ___                       ___           ___           ___           ___     
     /\\  \\         /\\  \\         /\\  \\         /\\__\\         /\\  \\           ___       /\\__\\         /\\  \\         /\\  \\         /\\  \\    
    /::\\  \\       /::\\  \\        \\:\\  \\       /:/  /        /::\\  \\         /\\  \\     /::|  |       /::\\  \\       /::\\  \\       /::\\  \\   
   /:/\\:\\  \\     /:/\\:\\  \\        \\:\\  \\     /:/__/        /:/\\:\\  \\        \\:\\  \\   /:|:|  |      /:/\\:\\  \\     /:/\\:\\  \\     /:/\\:\\  \\  
  /::\\~\\:\\  \\   /::\\~\\:\\  \\       /::\\  \\   /::\\  \\ ___   /::\\~\\:\\  \\       /::\\__\\ /:/|:|  |__   /:/  \\:\\__\\   /::\\~\\:\\  \\   /::\\~\\:\\  \\ 
 /:/\\:\\ \\:\\__\\ /:/\\:\\ \\:\\__\\     /:/\\:\\__\\ /:/\\:\\  /\\__\\ /:/\\:\\ \\:\\__\\  __/:/\\/__/ /:/ |:| /\\__\\ /:/__/ \\:|__| /:/\\:\\ \\:\\__\\ /:/\\:\\ \\:\\__\\
 \\/__\\:\\/:/  / \\/__\\:\\/:/  /    /:/  \\/__/ \\/__\\:\\/:/  / \\/__\\:\\ \\/__/ /\\/:/  /    \\/__|:|/:/  / \\:\\  \\ /:/  / \\:\\~\\:\\ \\/__/ \\/_|::\\/:/  /
      \\::/  /        \\::/  /    /:/  /            \\::/  /        \\:\\__\\   \\::/__/          |:/:/  /   \\:\\  /:/  /   \\:\\ \\:\\__\\      |:|::/  / 
       \\/__/         /:/  /     \\/__/             /:/  /          \\/__/    \\:\\__\\          |::/  /     \\:\\/:/  /     \\:\\ \\/__/      |:|\\/__/  
                    /:/  /                       /:/  /                     \\/__/          /:/  /       \\::/__/       \\:\\__\\        |:|  |    
                    \\/__/                        \\/__/                                     \\/__/        ~~            \\/__/         \\|__|    `}
                                                </pre>
                                            </div>
                                            <div className={styles.repoFeaturesGrid}>
                                                {REPO_FEATURES.map((feat, index) => {
                                                    const isActive = activeFeatIndex === index;
                                                    return (
                                                        <div 
                                                            key={feat.label} 
                                                            className={styles.featItem}
                                                            onMouseEnter={() => setActiveFeatIndex(index)}
                                                        >
                                                            {isActive && (
                                                                <motion.div 
                                                                    layoutId="featHighlight"
                                                                    className={styles.featHighlight}
                                                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                                />
                                                            )}
                                                            <motion.div 
                                                                className={styles.featIcon} 
                                                                animate={{ 
                                                                    opacity: isActive ? 1 : 0.45,
                                                                    scale: isActive ? 1.1 : 1,
                                                                    color: isActive ? 'var(--home-text)' : 'var(--home-muted)'
                                                                }}
                                                                style={{ position: 'relative', zIndex: 1 }}
                                                            >
                                                                {feat.icon}
                                                            </motion.div>
                                                            <div className={styles.featMeta} style={{ position: 'relative', zIndex: 1 }}>
                                                                <motion.span 
                                                                    className={styles.featLabel}
                                                                    animate={{ 
                                                                        opacity: isActive ? 1 : 0.6,
                                                                        x: isActive ? 2 : 0,
                                                                        color: isActive ? 'var(--home-text)' : 'var(--home-muted)'
                                                                    }}
                                                                >
                                                                    {feat.label}
                                                                </motion.span>
                                                                <motion.span 
                                                                    className={styles.featDesc}
                                                                    animate={{ opacity: isActive ? 1 : 0.35 }}
                                                                >
                                                                    {feat.desc}
                                                                </motion.span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className={styles.repoFooterRow}>
                                            <div className={styles.repoStats}>
                                                <span className={styles.repoStat}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                                    Star
                                                </span>
                                                <span className={styles.repoStat}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" /><path d="M12 12v3" /></svg>
                                                    Fork
                                                </span>
                                            </div>
                                            <div className={styles.techIconPill}>
                                                {TECH_STACK.map((tech) => (
                                                    <span key={tech.name} className={styles.techIconBtn} style={{ '--tech-color': tech.color }} title={tech.name}>
                                                        <tech.Icon />
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.a>


                                </div>

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
                                            { name: 'Tan', role: 'Core Dev', accent: '#22d3ee', email: 'tanlanuzga@gmail.com', github: 'https://github.com/bikemaster2331', bio: 'Full-stack architect. Built the AI pipeline, RAG system, frontend, backend, map engine, and itinerary planner.' },
                                            { name: 'Roi', role: 'Hardware', accent: '#a78bfa', bio: 'Raspberry Pi deployment, hardware setup, and embedded systems integration.' },
                                            { name: 'Zed', role: 'Full Stack', accent: '#34d399', bio: 'Full-stack development and hardware integration. Bridged software with RPi infrastructure.' },
                                            { name: 'Pat', role: 'Hardware', accent: '#fb923c', bio: 'Raspberry Pi configuration, networking, and hardware infrastructure.' },
                                            { name: 'Lee', role: 'Researcher', accent: '#f472b6', bio: 'Destination data sourcing, tourism research, and documentation.' },
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
                                                    <div className={styles.creatorFront}>
                                                        <div className={styles.creatorAvatar}>
                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                                                <circle cx="12" cy="7" r="4" />
                                                            </svg>
                                                        </div>
                                                        <span className={styles.creatorName}>{creator.name}</span>
                                                        <span className={styles.creatorRole}>{creator.role}</span>
                                                    </div>
                                                    <div className={styles.creatorBack}>
                                                        <span className={styles.creatorBackName}>{creator.name}</span>
                                                        <p className={styles.creatorBio}>{creator.bio}</p>
                                                        <div className={styles.creatorActions}>
                                                            {creator.email && (
                                                                <a href={`mailto:${creator.email}`} className={styles.creatorLink} onClick={(e) => e.stopPropagation()} aria-label={`Email ${creator.name}`}>
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                                                                </a>
                                                            )}
                                                            {creator.github && (
                                                                <a href={creator.github} target="_blank" rel="noopener noreferrer" className={styles.creatorLink} onClick={(e) => e.stopPropagation()}>
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}