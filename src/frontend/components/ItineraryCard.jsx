import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TRAVEL_HUBS } from '../constants/location';
import styles from '../styles/itinerary_page/ItineraryCard.module.css';
import { calculateDistance, calculateTotalRoute, calculateDriveTimes, calculateTimeUsage } from '../utils/distance';
import { optimizeRoute } from '../utils/optimize';
import { generateItineraryPDF } from '../utils/generatePDF';
import defaultBg from '../assets/images/card/catanduanes.png';
import { motion, AnimatePresence } from 'framer-motion';
import { House, Sun, CreditCard, Clock3, MapPin, Pickaxe, ChevronUp, ChevronDown, Trash2, MapPinPlus, Car, Clock } from 'lucide-react';

/**
 * Unified ItineraryCard Component
 * Variants: 
 * - 'full': Main sidebar/bottom sheet view with ReviewBox and ItineraryPreview.
 * - 'chat': Compact collapsible widget for chat messages.
 */
const ItineraryCard = ({
    variant = 'full', // 'full' or 'chat'
    selectedLocation,
    setSelectedLocation,
    addedSpots = [],
    setAddedSpots,
    onAddSpot,
    onRemoveSpot,
    activeHub,   // Object: { name, coordinates }
    onToggleLock,
    onMoveSpot,
    dateRange,
    currentDay = 1,
    dayCount = 1,
    storedDays = {},
    handlePreviousDay,
    handleSliceAndNext,
    handleSaveItinerary,
    handleGenerate,
    mobileMode = false,
    mobileSheetState = 'collapsed',
    onMobileSheetStateChange,
    activeMobilePanel = 'review',
    onMobilePanelChange,
    isLatest = true // for chat variant auto-expand
}) => {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(isLatest);
    const [isReviewExpanded, setIsReviewExpanded] = useState(false);
    const [localMobilePanel, setLocalMobilePanel] = useState('review');
    const [reviewImageSrc, setReviewImageSrc] = useState(defaultBg);
    const [isReviewImageLoading, setIsReviewImageLoading] = useState(false);
    const [warningDismissed, setWarningDismissed] = useState(false);
    const [showOverloadWarning, setShowOverloadWarning] = useState(false);

    const isAlreadyAdded = selectedLocation && addedSpots.some(spot => spot.name === selectedLocation.name);
    const isHubSelected = Boolean(activeHub?.name);
    const isLastDay = currentDay >= dayCount;
    const isNextAction = dayCount > 1 && !isLastDay;

    // --- CALCULATIONS ---
    const driveData = useMemo(() => {
        if (!activeHub) return [];
        return calculateDriveTimes(activeHub, addedSpots);
    }, [addedSpots, activeHub]);

    const timeWallet = useMemo(() => {
        if (!activeHub) return {
            totalUsed: 0, percent: 0, remaining: 540,
            color: 'rgb(255, 255, 255)', label: 'Schedule Empty',
            subtext: 'Select a starting point'
        };

        const DAILY_CAPACITY = 540;
        const usage = calculateTimeUsage(activeHub, addedSpots);
        const usedAmount = Number(usage?.totalUsed) || 0;
        const remaining = DAILY_CAPACITY - usedAmount;

        let percent = (usedAmount / DAILY_CAPACITY) * 100;
        if (percent > 100) percent = 100;

        let color = '#10B981';
        let label = 'Relaxed pace';
        let subtext = 'Plenty of buffer (Like 9 AM start)';

        if (remaining < 0) {
            color = '#EF4444';
            label = 'Day Overloaded';
            subtext = 'Exceeds standard 9-hour day';
        } else if (remaining < 60) {
            color = '#F59E0B';
            label = 'Very Full';
            subtext = 'Aim for 6:00 AM start';
        } else if (remaining < 120) {
            color = '#F59E0B';
            label = 'Busy Schedule';
            subtext = 'Aim for 7-8:00 AM start';
        }

        return { used: usedAmount, remaining, percent, color, label, subtext };
    }, [addedSpots, activeHub]);

    // --- EFFECTS ---
    useEffect(() => {
        setExpanded(isLatest);
    }, [isLatest]);

    useEffect(() => {
        if (timeWallet.remaining < 0 && !warningDismissed && !showOverloadWarning) {
            setShowOverloadWarning(true);
        }
        if (timeWallet.remaining >= 0) {
            setWarningDismissed(false);
            setShowOverloadWarning(false);
        }
    }, [timeWallet.remaining, warningDismissed, showOverloadWarning]);

    useEffect(() => {
        const nextSrc = selectedLocation?.image || defaultBg;
        if (reviewImageSrc === nextSrc) return;

        let cancelled = false;
        setIsReviewImageLoading(true);
        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            setReviewImageSrc(nextSrc);
            setIsReviewImageLoading(false);
        };
        img.onerror = () => {
            if (cancelled) return;
            setReviewImageSrc(defaultBg);
            setIsReviewImageLoading(false);
        };
        img.src = nextSrc;
        return () => { cancelled = true; };
    }, [selectedLocation, reviewImageSrc]);

    // --- HANDLERS ---
    const handleOptimize = (e) => {
        e?.stopPropagation();
        if (!activeHub || !addedSpots || addedSpots.length < 2) return;
        const newOrder = optimizeRoute(activeHub, addedSpots);
        if (setAddedSpots) setAddedSpots(newOrder);
    };

    const handleReviewExpandToggle = () => {
        const nextExpanded = !isReviewExpanded;
        setIsReviewExpanded(nextExpanded);
        if (mobileMode && onMobileSheetStateChange) {
            onMobileSheetStateChange(nextExpanded ? 'open' : 'mid');
        }
    };

    const switchToMobilePanel = (panel) => {
        if (!mobileMode) return;
        if (panel === (activeMobilePanel ?? localMobilePanel)) return;
        if (panel === 'preview') setIsReviewExpanded(false);
        setLocalMobilePanel(panel);
        if (onMobilePanelChange) onMobilePanelChange(panel);
    };

    // --- RENDER HELPERS ---
    const renderActionButton = () => {
        if (!selectedLocation) return null;
        if (isAlreadyAdded) {
            return (
                <button className={styles.removeSpotMain} onClick={() => onRemoveSpot(selectedLocation.name)} title="Remove">
                    <Trash2 size={20} />
                </button>
            );
        }
        return (
            <button
                className={isHubSelected ? styles.addSpot : styles.addSpotDisabled}
                onClick={() => isHubSelected && onAddSpot(selectedLocation)}
                disabled={!isHubSelected}
                title={isHubSelected ? "Add to itinerary" : "Select a starting point first"}
            >
                <MapPinPlus size={20} />
            </button>
        );
    };

    const metaItems = useMemo(() => {
        if (!selectedLocation) return [];
        const exposure = selectedLocation.outdoor_exposure || 'outdoor';
        const budgetRaw = String(selectedLocation.min_budget || 'low').toLowerCase();
        const bestTimeRaw = String(selectedLocation.best_time_of_day || 'any').toLowerCase();

        let budgetLevel = 'Low';
        if (budgetRaw.includes('high') || budgetRaw.includes('₱₱₱')) budgetLevel = 'High';
        else if (budgetRaw.includes('medium') || budgetRaw.includes('₱₱')) budgetLevel = 'Medium';

        const isNightTime = bestTimeRaw.includes('night') || bestTimeRaw.includes('evening') || bestTimeRaw.includes('dinner');

        return [
            { key: 'location', value: selectedLocation.municipality || 'Catanduanes', icon: <MapPin size={16} />, toneClass: styles.metaToneLocation },
            { key: 'cost', value: budgetLevel, icon: <CreditCard size={16} />, toneClass: styles.metaToneCost },
            { key: 'time', value: bestTimeRaw, icon: <Clock3 size={16} />, toneClass: isNightTime ? styles.metaToneTimeNight : styles.metaToneTime },
            { key: 'environment', value: exposure, icon: exposure === 'indoor' ? <House size={16} /> : <Sun size={16} />, toneClass: styles.metaToneEnvironment }
        ];
    }, [selectedLocation]);

    // --- MAIN RENDER ---
    if (variant === 'chat') {
        const isPreviewPanelVisible = expanded;
        return (
            <aside className={`${styles.chatWidget} ${expanded ? styles.chatWidgetExpanded : styles.chatWidgetCollapsed}`}>
                <div className={styles.chatWidgetHeader} onClick={() => setExpanded(!expanded)}>
                    <h3 className={styles.chatWidgetTitle}>Itinerary Preview</h3>
                    <div className={styles.chatWidgetHeaderActions}>
                        {addedSpots.length > 0 && <span className={styles.chatWidgetCount}>{addedSpots.length} spots</span>}
                        <button onClick={handleOptimize} className={styles.optimizeBtnSmall} title="Optimize Route">
                            <Pickaxe size={14} />
                        </button>
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>
                {expanded && (
                    <div className={styles.chatWidgetContent}>
                        <div className={styles.chatWidgetList}>
                            {addedSpots.map((spot, index) => (
                                <SpotItem
                                    key={`${spot.name}-${index}`}
                                    spot={spot}
                                    index={index}
                                    driveTime={driveData[index]?.driveTime}
                                    onMove={onMoveSpot}
                                    onRemove={onRemoveSpot}
                                    onSelect={setSelectedLocation}
                                    styles={styles}
                                />
                            ))}
                        </div>
                        <div className={styles.chatWidgetFooter}>
                            {currentDay > 1 && (
                                <button onClick={handlePreviousDay} className={styles.footerBtnBack}>Back</button>
                            )}
                            <button onClick={handleGenerate} className={styles.footerBtnGenerate}>Generate</button>
                            <button onClick={isNextAction ? handleSliceAndNext : handleSaveItinerary} className={styles.footerBtnPrimary}>
                                {isNextAction ? 'Next' : 'Save'}
                            </button>
                        </div>
                    </div>
                )}
            </aside>
        );
    }

    // Default 'full' variant (Sidebar / Bottom Sheet)
    const resolvedPanel = activeMobilePanel ?? localMobilePanel;
    const isReviewPanelVisible = !mobileMode || resolvedPanel === 'review';
    const isPreviewPanelVisible = !mobileMode || resolvedPanel === 'preview';

    return (
        <div className={`${styles.PreferenceCard} ${mobileMode && mobileSheetState === 'mid' ? styles.mobileMidSheet : ''} ${mobileMode && mobileSheetState === 'open' ? styles.mobileOpenSheet : ''}`}>
            {/* Overload Warning Modal moved to separate component or handled here */}
            {showOverloadWarning && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <Pickaxe className={styles.modalIcon} />
                        <h3 className={styles.modalTitle}>Day {currentDay} is Full</h3>
                        <p className={styles.modalText}>Exceeded time wallet. Slice this day and start Day {currentDay + 1}?</p>
                        <div className={styles.modalActions}>
                            <button onClick={() => { setShowOverloadWarning(false); setWarningDismissed(true); }} className={styles.modalBtnCancel}>Keep Adding</button>
                            {!isLastDay && <button onClick={handleSliceAndNext} className={styles.modalBtnConfirm}>Yes, Next Day</button>}
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.cardLayout}>
                {/* --- REVIEW PANEL --- */}
                <div className={`${styles.reviewPanel} ${isReviewExpanded ? styles.reviewPanelExpanded : ''} ${!isReviewPanelVisible ? styles.panelHidden : ''}`}>
                    <div className={styles.reviewImageFrame}>
                        <img src={reviewImageSrc} alt="Preview" className={styles.reviewImage} onError={(e) => { e.target.src = defaultBg; }} />
                        {isReviewImageLoading && <div className={styles.reviewLoadingPlaceholder} />}
                        <div className={styles.reviewImageOverlay} />
                        {mobileMode && <div className={styles.reviewMobileAction}>{renderActionButton()}</div>}
                    </div>

                    <div className={styles.reviewContent}>
                        <div className={styles.reviewHeader}>
                            <h3 className={styles.boxTitle}>{selectedLocation?.name || "Explore Catanduanes"}</h3>
                            {mobileMode && (
                                <button className={styles.viewToggleBtn} onClick={() => switchToMobilePanel('preview')}>
                                    <Car size={18} />
                                </button>
                            )}
                        </div>

                        {selectedLocation && (
                            <div className={styles.metaContainer}>
                                {metaItems.map(item => (
                                    <div key={item.key} className={`${styles.metaBox} ${item.toneClass}`}>
                                        {item.icon}
                                        <span>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!mobileMode && (
                            <div className={styles.reviewFooter}>
                                <p className={styles.reviewDesc}>{selectedLocation?.description || "Select a pin to see details."}</p>
                                <div className={styles.reviewActions}>
                                    {renderActionButton()}
                                    <button className={`${styles.expandBtn} ${isReviewExpanded ? styles.rotated : ''}`} onClick={handleReviewExpandToggle}>
                                        <ChevronDown size={24} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- PREVIEW PANEL --- */}
                <div className={`${styles.previewPanel} ${!mobileMode && isReviewExpanded ? styles.panelHidden : ''} ${!isPreviewPanelVisible ? styles.panelHidden : ''}`}>
                    <div className={styles.previewHeader}>
                        <h3 className={styles.boxTitle}>Day {currentDay} of {dayCount}</h3>
                        <div className={styles.previewHeaderActions}>
                            {mobileMode && (
                                <button className={styles.viewToggleBtn} onClick={() => switchToMobilePanel('review')}>
                                    <House size={18} />
                                </button>
                            )}
                            <button onClick={handleOptimize} className={styles.optimizeBtnSmall} title="Optimize"><Pickaxe size={16} /></button>
                        </div>
                    </div>

                    <div className={styles.walletContainer}>
                        <div className={styles.walletLabel}>{timeWallet.label}</div>
                        <div className={styles.walletTrack}>
                            <div className={styles.walletFill} style={{ width: `${timeWallet.percent}%`, backgroundColor: timeWallet.color }} />
                        </div>
                    </div>

                    <div className={styles.spotsList}>
                        {addedSpots.length > 0 ? (
                            addedSpots.map((spot, index) => (
                                <SpotItem
                                    key={`${spot.name}-${index}`}
                                    spot={spot}
                                    index={index}
                                    driveTime={driveData[index]?.driveTime}
                                    onMove={onMoveSpot}
                                    onRemove={onRemoveSpot}
                                    onSelect={setSelectedLocation}
                                    styles={styles}
                                />
                            ))
                        ) : (
                            <p className={styles.emptyText}>Day {currentDay} is empty. Add spots to begin.</p>
                        )}
                    </div>

                    <div className={styles.cardFooter}>
                        {currentDay > 1 && (
                            <button onClick={handlePreviousDay} className={styles.footerBtnBack}>Back</button>
                        )}
                        <button onClick={handleGenerate} className={styles.footerBtnGenerate}>Generate</button>
                        <button onClick={isNextAction ? handleSliceAndNext : handleSaveItinerary} className={styles.footerBtnPrimary}>
                            {isNextAction ? 'Next' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper Sub-component
const SpotItem = ({ spot, index, driveTime, onMove, onRemove, onSelect, styles }) => (
    <div key={index} className={styles.spotItemWrapper}>
        {driveTime > 0 && (
            <div className={styles.driveTimeLabel}>
                <Car size={12} />
                <span>{driveTime} min drive</span>
            </div>
        )}
        <div className={`${styles.miniSpotItem} ${spot.locked ? styles.miniSpotItemLocked : ''}`} onClick={() => onSelect(spot)}>
            <div className={styles.spotInfo}>
                <div className={styles.durationBadge}>
                    <Clock size={10} />
                    <span>{spot.visit_time_minutes || 60}m</span>
                </div>
                <span className={styles.spotName}>{spot.name}</span>
            </div>
            <div className={styles.spotActions}>
                <button onClick={(e) => { e.stopPropagation(); onMove(index, -1); }} disabled={index === 0}><ChevronUp size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); onMove(index, 1); }} disabled={false}><ChevronDown size={14} /></button>
                <div className={styles.divider} />
                <button onClick={(e) => { e.stopPropagation(); onRemove(spot.name); }} className={styles.removeBtn}><Trash2 size={16} /></button>
            </div>
        </div>
    </div>
);

export default ItineraryCard;
