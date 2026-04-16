import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import styles from '../styles/pages/Contact.module.css';

const CHANNELS = [
    {
        label: 'Email',
        value: 'pathfinder.catanduanes@gmail.com',
        href: 'mailto:pathfinder.catanduanes@gmail.com',
        desc: 'General inquiries & partnerships',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
        ),
    },
    {
        label: 'GitHub',
        value: 'bikemaster2331/pathfinder',
        href: 'https://github.com/bikemaster2331/pathfinder',
        desc: 'Issues, contributions & source',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .296C5.37.296 0 5.666 0 12.297c0 5.302 3.438 9.8 8.206 11.387.6.11.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.386-1.332-1.755-1.332-1.755-1.09-.745.082-.73.082-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.81 1.305 3.495.998.108-.775.42-1.305.763-1.605-2.665-.304-5.467-1.333-5.467-5.93 0-1.31.467-2.38 1.235-3.22-.124-.304-.535-1.527.117-3.18 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.004-.404 11.5 11.5 0 0 1 3.004.404c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.876.118 3.18.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.623-5.48 5.92.43.372.814 1.102.814 2.222 0 1.604-.014 2.896-.014 3.29 0 .32.216.694.825.576C20.565 22.092 24 17.596 24 12.297 24 5.666 18.627.296 12 .296z" />
            </svg>
        ),
    },
    {
        label: 'Facebook',
        value: 'Catanduanes Tourism',
        href: 'https://www.facebook.com/catanduanestourismpromotion/',
        desc: 'Tourism office partner page',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
        ),
    },
];

export default function Contact() {
    const navigate = useNavigate();
    const [ready, setReady] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setReady(true), 60);
        return () => clearTimeout(t);
    }, []);

    const handleCopy = () => {
        navigator.clipboard.writeText('pathfinder.catanduanes@gmail.com');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`${styles.container} ${ready ? styles.ready : ''}`}>

            <div className={styles.grain} aria-hidden="true" />


            <section className={styles.hero}>
                <span className={styles.eyebrow}>Contact</span>
                <h1 className={styles.headline}>
                    Reach us<br />
                    about <em>Catanduanes.</em>
                </h1>
                <p className={styles.lead}>
                    Whether you want to contribute, report an issue, or just share a good beach tip, we're reachable.
                </p>
            </section>

            <ul className={styles.channels}>
                {CHANNELS.map((c, i) => (
                    <li key={c.label} className={styles.channel} style={{ '--i': i }}>
                        <div className={styles.channelIcon}>{c.icon}</div>
                        <div className={styles.channelBody}>
                            <span className={styles.channelLabel}>{c.label}</span>
                            <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={styles.channelValue}>
                                {c.value}
                            </a>
                            <span className={styles.channelDesc}>{c.desc}</span>
                        </div>
                        <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={styles.channelArrow} aria-label={`Open ${c.label}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M7 17L17 7M17 7H7M17 7v10" />
                            </svg>
                        </a>
                    </li>
                ))}
            </ul>

            {/* Quick copy email */}
            <div className={styles.copyBlock} style={{ '--i': 3 }}>
                <span className={styles.copyLabel}>Quick copy email</span>
                <button className={styles.copyBtn} onClick={handleCopy}>
                    {copied ? (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                            Copied
                        </>
                    ) : (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                            pathfinder.catanduanes@gmail.com
                        </>
                    )}
                </button>
            </div>

            <footer className={styles.foot}>
                <span>Pathfinder</span>
                <span className={styles.footDot} />
                <span>Catanduanes, PH</span>
                <span className={styles.footDot} />
                <span>v1.0.21</span>
                <span className={styles.footDot} />
                <span>2026</span>
            </footer>

        </div>
    );
}