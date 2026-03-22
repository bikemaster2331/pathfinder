import styles from '../styles/components/PrintView.module.css';

const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
};

const getBudgetSymbol = (b) => ({ low: '₱', medium: '₱₱', high: '₱₱₱' }[b] ?? '₱');

export const PrintView = ({ storedDays, activeHub, dateRange, driveData }) => {
    const days = Object.keys(storedDays).sort((a, b) => +a - +b);
    const allSpots = Object.values(storedDays).flat();

    return (
        <div className={styles.root}>

            {/* ── COVER ── */}
            <div className={styles.cover}>
                <div className={styles.coverTop}>
                    <span className={styles.coverLabel}>PATHFINDER  ·  AI TRAVEL GUIDE</span>
                    <span className={styles.coverLabel}>Catanduanes, Philippines</span>
                </div>

                <div className={styles.coverHero}>
                    <h1 className={styles.coverTitle}>Your<br /><em>Itinerary.</em></h1>
                    <p className={styles.coverSub}>
                        {dateRange?.start
                            ? new Date(dateRange.start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                            : 'Custom Trip'}
                        {dateRange?.end && ` – ${new Date(dateRange.end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                    </p>
                </div>

                <div className={styles.coverStats}>
                    <div className={styles.stat}>
                        <span className={styles.statNum}>{days.length}</span>
                        <span className={styles.statLbl}>{days.length === 1 ? 'Day' : 'Days'}</span>
                    </div>
                    <div className={styles.statDivider} />
                    <div className={styles.stat}>
                        <span className={styles.statNum}>{allSpots.length}</span>
                        <span className={styles.statLbl}>Stops</span>
                    </div>
                    <div className={styles.statDivider} />
                    <div className={styles.stat}>
                        <span className={styles.statNum}>{activeHub?.name || '–'}</span>
                        <span className={styles.statLbl}>Starting Hub</span>
                    </div>
                </div>
            </div>

            {/* ── DAYS ── */}
            {days.map((dayNum) => {
                const spots = storedDays[dayNum];
                if (!spots?.length) return null;

                let minutesCursor = 8 * 60; // 8:00 AM

                return (
                    <div key={dayNum} className={styles.dayPage}>

                        <div className={styles.dayHeader}>
                            <span className={styles.dayLabel}>DAY {dayNum}</span>
                            <span className={styles.dayCount}>{spots.length} stop{spots.length > 1 ? 's' : ''}</span>
                        </div>

                        <div className={styles.timeline}>
                            {spots.map((spot, i) => {
                                const drive = driveData?.[i]?.driveTime || 0;
                                minutesCursor += drive;
                                const arrivalLabel = formatTime(minutesCursor);
                                minutesCursor += (spot.visit_time_minutes || 60);

                                return (
                                    <div key={spot.name} className={styles.stop}>

                                        {/* Drive connector */}
                                        {i === 0 ? (
                                            <div className={styles.connector}>
                                                <div className={styles.connectorLine} />
                                                <span className={styles.connectorLabel}>From {activeHub?.name || 'hub'}</span>
                                            </div>
                                        ) : drive > 0 ? (
                                            <div className={styles.connector}>
                                                <div className={styles.connectorLine} />
                                                <span className={styles.connectorLabel}>{drive} min drive</span>
                                            </div>
                                        ) : null}

                                        {/* Stop card */}
                                        <div className={styles.stopCard}>
                                            <div className={styles.stopTime}>{arrivalLabel}</div>
                                            <div className={styles.stopBody}>
                                                <h3 className={styles.stopName}>{spot.name}</h3>
                                                {spot.municipality && (
                                                    <span className={styles.stopMuni}>{spot.municipality}</span>
                                                )}
                                                {spot.description && (
                                                    <p className={styles.stopDesc}>{spot.description}</p>
                                                )}
                                                <div className={styles.stopMeta}>
                                                    <span>{spot.visit_time_minutes || 60} min</span>
                                                    {spot.min_budget && <span>{getBudgetSymbol(spot.min_budget)}</span>}
                                                    {spot.opening_hours && <span>{spot.opening_hours}</span>}
                                                    {spot.best_time_of_day && spot.best_time_of_day !== 'any' && (
                                                        <span>Best: {spot.best_time_of_day}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.dayEnd}>
                            End of Day {dayNum}  ·  {formatTime(minutesCursor)} estimated
                        </div>
                    </div>
                );
            })}

            {/* ── REMINDERS ── */}
            <div className={styles.remindersPage}>
                <h2 className={styles.remindersTitle}>Before You Go</h2>
                {[
                    ['Bring cash', 'Most spots in Catanduanes are cash-only. ATMs are in Virac.'],
                    ['Download offline maps', 'Cell signal drops in coastal and mountain areas.'],
                    ['Sun protection', 'Tropical heat — sunscreen, hat, and 2L+ water daily.'],
                    ['Check weather', 'Typhoon season runs June through November.'],
                    ['Emergency', '911 (National)  ·  PNP Virac (052) 811-1102  ·  Tourism Office (052) 811-1231'],
                ].map(([title, body]) => (
                    <div key={title} className={styles.reminder}>
                        <strong>{title}</strong>
                        <span>{body}</span>
                    </div>
                ))}
                <p className={styles.printFooter}>
                    Generated by Pathfinder AI  ·  pathfinder.catanduanes.ph
                </p>
            </div>

        </div>
    );
};