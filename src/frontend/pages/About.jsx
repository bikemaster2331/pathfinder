import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import styles from '../styles/pages/About.module.css';

const STATS = [
    { value: '200+', label: 'Verified destinations' },
    { value: '1 City', label: '12 Municipalities covered' },
    { value: 'RAG', label: 'AI pipeline' },
    { value: 'Open', label: 'Source & transparent' },
];

export default function About() {
    const navigate = useNavigate();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setReady(true), 60);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className={`${styles.container} ${ready ? styles.ready : ''}`}>

            <div className={styles.grain} aria-hidden="true" />


            <section className={styles.hero}>
                <span className={styles.eyebrow}>About Pathfinder</span>
                <h1 className={styles.headline}>
                    Every trip starts<br />
                    with a <em>question.</em>
                </h1>
                <p className={styles.lead}>
                    Planning a trip to Catanduanes was harder than it needed to be. No single source of truth. No intelligent routing. No local insight. A solution was needed —
                </p>
                <p className={styles.lead}>So we made<span className={styles.one}>one.</span></p>
            </section>

            <div className={styles.statsStrip}>
                {STATS.map((s, i) => (
                    <div key={s.label} className={styles.stat} style={{ '--i': i }}>
                        <span className={styles.statValue}>{s.value}</span>
                        <span className={styles.statLabel}>{s.label}</span>
                    </div>
                ))}
            </div>

            <article className={styles.body}>

                <div className={styles.section} style={{ '--i': 0 }}>
                    <span className={styles.sectionTag}>What it is</span>
                    <div className={styles.sectionContent}>
                        <p>Pathfinder is an AI-powered travel guide built specifically for Catanduanes — the island province at the eastern tip of the Bicol Peninsula. It combines a retrieval-augmented AI, an interactive map, and verified local data into a single, honest planning tool.</p>
                        <p>Ask it anything. It knows the beaches, the falls, the trails, the food, the roads, and some secrets...</p>
                    </div>
                </div>

                <div className={styles.section} style={{ '--i': 1 }}>
                    <span className={styles.sectionTag}>How it works</span>
                    <div className={styles.sectionContent}>
                        <p>The AI uses a RAG pipeline — meaning it reasons over a real, curated knowledge base of 200+ destinations rather than hallucinating from general training data. Every answer is grounded in locally sourced, validated information.</p>
                        <p>The itinerary planner builds day plans based on your budget, interests, and travel time — then optimizes the route so you actually see what you came for.</p>
                    </div>
                </div>

                <div className={styles.section} style={{ '--i': 2 }}>
                    <span className={styles.sectionTag}>Who's behind it</span>
                    <div className={styles.sectionContent}>
                        <p>Pathfinder was built by five students as a thesis project, with the help of Catanduanes Tourism Promotion Office. The data is locally validated. The code is open source.</p>
                        <p>We believe infrastructure for tourism should be transparent and community-driven — not locked behind five clueless students (jokes aside).</p>
                    </div>
                </div>

            </article>

            <div className={styles.cta}>
                <button className={styles.ctaPrimary} onClick={() => navigate('/itinerary')}>
                    Start exploring
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                </button>
                <button className={styles.ctaSecondary} onClick={() => navigate('/creators')}>
                    Meet the team
                </button>
            </div>

            <footer className={styles.foot}>
                <span>Catanduanes, PH</span>
                <span className={styles.footDot} />
                <span>v1.0.21</span>
                <span className={styles.footDot} />
                <a href="https://github.com/bikemaster2331/pathfinder" target="_blank" rel="noopener noreferrer" className={styles.footLink}>GitHub ↗</a>
            </footer>

        </div>
    );
}