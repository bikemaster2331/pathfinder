import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import styles from '../styles/footer/Creators.module.css';

const CREATORS = [
    {
        name: 'Tan',
        role: 'Core Developer',
        accent: '#22d3ee',
        email: 'tanlanuzga@gmail.com',
        github: 'https://github.com/bikemaster2331',
        bio: 'Built the AI pipeline, RAG system, frontend, backend, map engine, and itinerary planner.',
        tag: 'Architect',
    },
    {
        name: 'Roi',
        role: 'Hardware Engineer',
        accent: '#a78bfa',
        bio: 'Raspberry Pi deployment, hardware setup, and embedded systems integration.',
        tag: 'Infrastructure',
    },
    {
        name: 'Zed',
        role: 'Full Stack',
        accent: '#34d399',
        bio: 'Full-stack development and hardware integration. Bridged the software world with physical RPi infrastructure.',
        tag: 'Bridge',
    },
    {
        name: 'Pat',
        role: 'Hardware Engineer',
        accent: '#fb923c',
        bio: 'Raspberry Pi configuration, networking, and hardware infrastructure that keeps the system running.',
        tag: 'Infrastructure',
    },
    {
        name: 'Lee',
        role: 'Researcher',
        accent: '#f472b6',
        bio: 'Destination data sourcing, tourism research, and documentation.',
        tag: 'Truth',
    },
];

export default function About() {
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 60);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className={`${styles.container} ${visible ? styles.ready : ''}`}>

            <div className={styles.grain} aria-hidden="true" />

            <button className={styles.back} onClick={() => navigate('/')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
            </button>

            <section className={styles.opening}>
                <p className={styles.openingLabel}>Pathfinder · Catanduanes, PH</p>
                <h1 className={styles.openingTitle}>
                    Built by five. <br />
                    <em>for everyone.</em>
                </h1>
                <p className={styles.openingBody}>
                    An AI travel guide with a live map, a RAG pipeline, and 200+ verified destinations sourced from the ground up.
                </p>
            </section>

            <div className={styles.divider} aria-hidden="true">
                <span className={styles.dividerText}>Meet the team</span>
            </div>

            <ul className={styles.list}>
                {CREATORS.map((c, i) => (
                    <li
                        key={c.name}
                        className={styles.row}
                        style={{ '--accent': c.accent, '--i': i }}
                    >
                        <div className={styles.rowLeft}>
                            <span className={styles.rowIndex}>0{i + 1}</span>
                            <span className={styles.rowInitial}>{c.name[0]}</span>
                        </div>

                        <div className={styles.rowCenter}>
                            <div className={styles.rowNameLine}>
                                <strong className={styles.rowName}>{c.name}</strong>
                                <span className={styles.rowTag}>{c.tag}</span>
                            </div>
                            <span className={styles.rowRole}>{c.role}</span>
                            <p className={styles.rowBio}>{c.bio}</p>
                        </div>

                        <div className={styles.rowRight}>
                            {c.github && (
                                <a href={c.github} target="_blank" rel="noopener noreferrer" className={styles.rowLink} aria-label="GitHub">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .296C5.37.296 0 5.666 0 12.297c0 5.302 3.438 9.8 8.206 11.387.6.11.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.81 1.305 3.495.998.108-.775.42-1.305.763-1.605-2.665-.304-5.467-1.333-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.124-.304-.535-1.527.117-3.18 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.004-.404 11.5 11.5 0 0 1 3.004.404c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.876.118 3.18.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.623-5.48 5.92.43.372.814 1.102.814 2.222 0 1.604-.014 2.896-.014 3.29 0 .32.216.694.825.576C20.565 22.092 24 17.596 24 12.297 24 5.666 18.627.296 12 .296z" /></svg>
                                </a>
                            )}
                            {c.email && (
                                <a href={`mailto:${c.email}`} className={styles.rowLink} aria-label="Email">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                                </a>
                            )}
                        </div>
                    </li>
                ))}
            </ul>

            <footer className={styles.closing}>
                <p className={styles.closingText}>
                    Designed and developed in partnership with the{' '}
                    <a href="https://www.facebook.com/catanduanestourismpromotion/" target="_blank" rel="noopener noreferrer" className={styles.closingLink}>
                        Catanduanes Tourism Promotion Office
                    </a>.
                </p>
                <span className={styles.closingVersion}>v1.0.21</span>
            </footer>

        </div>
    );
}