import styles from '../styles/itinerary_page/ActivityChips.module.css';

const ACTIVITIES = [
    {
        key: 'Swimming',
        label: 'Beaches',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" />
                <path d="M2 17c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0" />
                <circle cx="12" cy="6" r="2" />
            </svg>
        ),
        prompt: 'What are the best beaches and swimming spots in Catanduanes?'
    },
    {
        key: 'Hiking',
        label: 'Hiking',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
            </svg>
        ),
        prompt: 'What are the best hiking trails and mountains in Catanduanes?'
    },
    {
        key: 'Sightseeing',
        label: 'Sightseeing',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
            </svg>
        ),
        prompt: 'What are the must-see sightseeing spots and viewpoints in Catanduanes?'
    },
    {
        key: 'Dining',
        label: 'Dining',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                <path d="M7 2v20" />
                <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2h3Zm0 0v7" />
            </svg>
        ),
        prompt: 'Where are the best restaurants and food spots in Catanduanes?'
    },
    {
        key: 'Shopping',
        label: 'Shopping',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
        ),
        prompt: 'Where can I go shopping or buy souvenirs in Catanduanes?'
    },
    {
        key: 'Accommodation',
        label: 'Stay',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4v16" />
                <path d="M2 8h18a2 2 0 0 1 2 2v10" />
                <path d="M2 17h20" />
                <path d="M6 8v9" />
            </svg>
        ),
        prompt: 'What are the best hotels, resorts, and accommodations in Catanduanes?'
    }
];

export default function ActivityChips({ selectedActivities, onToggle, onPrompt }) {
    return (
        <div className={styles.chipScroll}>
            {ACTIVITIES.map(act => {
                const isActive = selectedActivities?.[act.key];
                return (
                    <button
                        key={act.key}
                        className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
                        onClick={() => {
                            if (onToggle) onToggle(act.key);
                            if (onPrompt && !isActive) onPrompt(act.prompt);
                        }}
                        title={act.label}
                    >
                        <span className={styles.chipIcon}>{act.icon}</span>
                        <span className={styles.chipLabel}>{act.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
