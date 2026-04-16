import { jsPDF } from 'jspdf';

// --- NEW HELPER: Scanned Line ---
const drawTechnicalLines = (doc, y, pageWidth) => {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    for (let i = 0; i < pageWidth; i += 4) {
        doc.line(i, y, i, y + 2); // Tiny vertical ticks
    }
};

// --- HELPER: Time Math ---
const addMinutes = (dateObj, minutes) => {
    return new Date(dateObj.getTime() + (minutes || 0) * 60000);
};

const formatTime = (dateObj) => {
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

// --- HELPER: Time Block Label ---
const getTimeBlock = (dateObj) => {
    const hour = dateObj.getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
};

// --- HELPER: Transport Mode Inference ---
const getTransportMode = (driveMinutes) => {
    if (driveMinutes <= 0) return null;
    if (driveMinutes <= 10) return 'Tricycle (~P30-50)';
    if (driveMinutes <= 30) return 'Van / Tricycle (~P50-150)';
    return 'Private Van Recommended (~P150-500)';
};

// --- HELPER: Budget Label ---
const getBudgetLabel = (minBudget) => {
    switch (minBudget) {
        case 'low': return 'P50-200 (Budget-Friendly)';
        case 'medium': return 'P200-500 (Moderate)';
        case 'high': return 'P500+ (Premium)';
        default: return 'Varies';
    }
};

// --- HELPER: Outdoor Exposure Tip ---
const getExposureTip = (exposure) => {
    switch (exposure) {
        case 'open': return 'Bring sun protection and water';
        case 'shaded': return 'Partially shaded - hat recommended';
        case 'indoor': return 'Indoor - comfortable in any weather';
        default: return '';
    }
};

// --- HELPER: Best Time Label ---
const getBestTimeLabel = (bestTime) => {
    switch (bestTime) {
        case 'morning': return 'Best visited in the morning';
        case 'afternoon': return 'Best visited in the afternoon';
        case 'evening': return 'Best visited in the evening';
        case 'any': return 'Good any time of day';
        default: return '';
    }
};

// --- HELPER: Safe page break check ---
const ensureSpace = (doc, currentY, needed, pageHeight) => {
    if (currentY + needed > pageHeight - 20) {
        doc.addPage();
        return 20;
    }
    return currentY;
};

// --- MAIN GENERATOR ---
export const generateItineraryPDF = ({
    activeHubName,
    dateRange,
    addedSpots, // Can now be an Array (single day) OR Object {1: [], 2: []}
    totalDistance, // Total distance of whole trip
    driveData, // Flat array of drive times (matches sequence of spots)
    saveFile = true
}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    // Color Palette
    const colors = {
        primary: [37, 99, 235],      // Blue
        accent: [34, 197, 94],       // Green
        warning: [234, 179, 8],      // Yellow/Orange
        danger: [220, 38, 38],       // Red
        dark: [31, 41, 55],          // Dark gray
        light: [243, 244, 246],      // Light gray
        text: [100, 100, 100],       // Text gray
        muted: [156, 163, 175],      // Muted gray
        purple: [139, 92, 246],      // Purple for agent insights
        amber: [245, 158, 11],       // Amber
        teal: [20, 184, 166],        // Teal
    };

    // 1. NORMALIZE DATA (Handle Array vs Object safely)
    let itineraryDays = {};
    if (Array.isArray(addedSpots)) {
        itineraryDays = { 1: addedSpots };
    } else {
        itineraryDays = addedSpots || {};
    }

    let globalSpotIndex = 0;

    // Collect all spots for summary sections later
    const allSpotsFlat = [];
    Object.keys(itineraryDays).sort((a, b) => Number(a) - Number(b)).forEach(dayNum => {
        const spots = itineraryDays[dayNum];
        if (spots) allSpotsFlat.push(...spots);
    });

    // ===============================
    // COVER PAGE (COMMAND CENTER HUD)
    // ===============================
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 60, 'F');

    doc.setFont('courier', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.text(`STATUS: Finalized`, margin, 15);
    doc.text(`PATHFINDER_v1.0.21`, margin, 20);
    doc.text(`ID: ${Math.random().toString(36).substring(2, 9).toUpperCase()}`, pageWidth - margin, 15, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(255, 255, 255);
    doc.text("EXPEDITION PLAN", pageWidth / 2, 40, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('courier', 'normal');
    doc.setTextColor(200, 220, 255);
    doc.text(`CATANDUANES, PH // HUB: ${activeHubName || "TBD"}`, pageWidth / 2, 50, { align: 'center' });

    let currentY = 75;

    if (dateRange?.start && dateRange?.end) {
        const startDate = new Date(dateRange.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const endDate = new Date(dateRange.end).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...colors.text);
        doc.text(`${startDate}  -  ${endDate}`, pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;
    }

    const totalDays = Object.keys(itineraryDays).length;
    const totalSpots = allSpotsFlat.length;
    const distanceLabel = (typeof totalDistance === 'number') ? totalDistance.toFixed(1) : totalDistance;
    const statsText = `${totalDays} Day${totalDays > 1 ? 's' : ''}  -  ${totalSpots} Stop${totalSpots > 1 ? 's' : ''}  -  ${distanceLabel ? distanceLabel + ' km total' : 'Distance TBD'}`;

    doc.setFontSize(9);
    doc.setFont('courier', 'bold');
    doc.setTextColor(...colors.muted);
    doc.text(statsText, pageWidth / 2, currentY, { align: 'center' });
    currentY += 6;

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 8;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.primary);
    doc.text('GENERATED BY PATHFINDER AI', pageWidth / 2, currentY, { align: 'center' });
    currentY += 15;

    // ===============================
    // DAILY CHRONOLOGY
    // ===============================
    Object.keys(itineraryDays)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((dayNum, dayIndex) => { // Added dayIndex here
            const spotsForDay = itineraryDays[dayNum];
            if (!spotsForDay || spotsForDay.length === 0) return;

            // ── Only start a new page if it is Day 2 or later ──
            if (dayIndex > 0) {
                doc.addPage();
                currentY = 20;
            }

            // --- A. DAY CALCULATION ---
            const COMFORT_START_TIME = new Date();
            COMFORT_START_TIME.setHours(8, 0, 0, 0);
            const HARD_END_TIME = new Date();
            HARD_END_TIME.setHours(17, 0, 0, 0);

            let dayTripMinutes = 0;
            spotsForDay.forEach((spot, localIndex) => {
                const actualDriveTime = driveData?.[globalSpotIndex + localIndex]?.driveTime || 0;
                dayTripMinutes += (spot.visit_time_minutes || 60);
                dayTripMinutes += actualDriveTime;
            });

            const requiredStartTime = addMinutes(HARD_END_TIME, -dayTripMinutes);
            let finalStartTime = COMFORT_START_TIME;
            let scheduleNote = "Relaxed Pace - User can start as early as 8:00 AM!";
            let noteColor = colors.accent;

            const requiredHour = requiredStartTime.getHours() + (requiredStartTime.getMinutes() / 60);

            if (requiredHour >= 8) {
                finalStartTime = COMFORT_START_TIME;
            } else if (requiredHour >= 6) {
                finalStartTime = requiredStartTime;
                scheduleNote = `Tight Schedule - Start at ${formatTime(requiredStartTime)}`;
                noteColor = colors.warning;
            } else {
                finalStartTime = requiredStartTime;
                scheduleNote = `Early Start Required - ${formatTime(requiredStartTime)}`;
                noteColor = colors.danger;
            }

            // --- B. DAY HEADER ---
            currentY = ensureSpace(doc, currentY, 45, pageHeight);
            doc.setFillColor(...colors.dark);
            doc.roundedRect(margin, currentY, contentWidth, 28, 3, 3, 'F');

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(`DAY ${dayNum}`, margin + 10, currentY + 12);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...noteColor);
            doc.text(scheduleNote, margin + 10, currentY + 22);

            doc.setFontSize(12);
            doc.setTextColor(200, 200, 200);
            doc.setFont('helvetica', 'normal');
            doc.text(`${spotsForDay.length} Stop${spotsForDay.length > 1 ? 's' : ''}`, pageWidth - margin - 10, currentY + 12, { align: 'right' });

            currentY += 36;

            // --- C. SPOT CARDS ---
            let runningTime = new Date(finalStartTime);
            let lastTimeBlock = '';

            spotsForDay.forEach((spot, i) => {
                const driveTime = driveData?.[globalSpotIndex]?.driveTime || 0;
                const visitTime = spot.visit_time_minutes || 60;
                const arrivalTime = addMinutes(runningTime, driveTime);
                const departureTime = addMinutes(arrivalTime, visitTime);
                const timeBlock = getTimeBlock(arrivalTime);

                // ── Time block separator ──
                if (timeBlock !== lastTimeBlock) {
                    currentY = ensureSpace(doc, currentY, 20, pageHeight);
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...colors.primary);
                    doc.text(timeBlock.toUpperCase(), margin + 5, currentY);
                    currentY += 8;
                    lastTimeBlock = timeBlock;
                }

                // ── Transit connector ──
                if (driveTime > 0) {
                    currentY = ensureSpace(doc, currentY, 14, pageHeight);
                    const transportMode = getTransportMode(driveTime);
                    doc.setFontSize(9);
                    doc.setFont('courier', 'bold');
                    doc.setTextColor(...colors.muted);
                    doc.text(
                        `-> ${driveTime} MIN DRIVE${transportMode ? ' // ' + transportMode.toUpperCase() : ''}`,
                        margin + 20, currentY
                    );
                    currentY += 8;
                } else if (i === 0) {
                    currentY = ensureSpace(doc, currentY, 14, pageHeight);
                    doc.setFontSize(9);
                    doc.setFont('courier', 'bold');
                    doc.setTextColor(...colors.muted);
                    doc.text(`-> START FROM ${activeHubName?.toUpperCase() || 'HUB'}`, margin + 20, currentY);
                    currentY += 8;
                }

                // ─────────────────────────────────────────────────
                // RIGID LAYOUT LOGIC (Matching image perfectly)
                // ─────────────────────────────────────────────────
                const PAD = 10;
                const BADGE_W = 28;
                const BADGE_H = 14;
                const GAP = 10;
                const TEXT_X = margin + PAD + BADGE_W + GAP;

                const hasDescription = !!(spot.description && spot.description.length > 0);
                const hasInsights = !!(spot.opening_hours || spot.best_time_of_day || spot.outdoor_exposure);

                // Calculate dynamic height based on text content
                let textBlockHeight = 8; // Just Name
                if (hasDescription) textBlockHeight += 10; // Add Desc
                if (hasInsights) textBlockHeight += 8; // Add Insights

                let cardHeight = PAD + Math.max(BADGE_H, textBlockHeight) + PAD;

                currentY = ensureSpace(doc, currentY, cardHeight + 6, pageHeight);

                // ── Card Background ──
                doc.setFillColor(255, 255, 255); // Solid white like image
                doc.setDrawColor(220, 220, 220); // Soft gray border
                doc.roundedRect(margin, currentY, contentWidth, cardHeight, 3, 3, 'FD');

                let innerY = currentY + PAD;

                // ── 1. Time Badge (Left) ──
                doc.setFillColor(...colors.primary);
                doc.roundedRect(margin + PAD, innerY, BADGE_W, BADGE_H, 1, 1, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(7.5);
                doc.setFont('courier', 'bold');
                doc.text(
                    formatTime(arrivalTime),
                    margin + PAD + (BADGE_W / 2),
                    innerY + (BADGE_H / 2) + 2.5,
                    { align: 'center' }
                );

                // ── 2. Identity Row (Name & Municipality) ──
                let currentTextY = innerY + 8; // Baseline for the first row of text

                // Municipality (Far Right)
                let muniWidth = 0;
                if (spot.municipality) {
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(170, 170, 170);
                    const muniText = spot.municipality.toUpperCase();
                    muniWidth = doc.getTextWidth(muniText);
                    doc.text(muniText, pageWidth - margin - PAD, currentTextY, { align: 'right' });
                }

                // Spot Name
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...colors.dark);
                const spotNameStr = spot.name || 'Unknown Location';
                let spotName = spotNameStr;
                const maxNameWidth = contentWidth - PAD - BADGE_W - GAP - PAD - muniWidth - 10;

                if (doc.getTextWidth(spotName) > maxNameWidth) {
                    while (doc.getTextWidth(spotName + '...') > maxNameWidth && spotName.length > 0) {
                        spotName = spotName.slice(0, -1);
                    }
                    spotName += '...';
                }
                doc.text(spotName, TEXT_X, currentTextY);

                // TOP 10 Tag
                if (spot.is_top_10) {
                    const nameWidth = doc.getTextWidth(spotName);
                    doc.setFontSize(6);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...colors.amber);
                    doc.text('* TOP 10', TEXT_X + nameWidth + 4, currentTextY - 1);
                }

                // ── 3. Description Row ──
                if (hasDescription) {
                    currentTextY += 10;
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...colors.text);
                    const desc = spot.description.length > 95 ? spot.description.substring(0, 92) + '...' : spot.description;
                    doc.text(desc, TEXT_X, currentTextY);
                }

                // ── 4. Insights Row ──
                if (hasInsights) {
                    currentTextY += 8;
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...colors.purple);

                    const insightParts = [];
                    if (spot.opening_hours) insightParts.push(`Open: ${spot.opening_hours}`);
                    if (spot.visit_time_minutes) insightParts.push(`Stay: ${spot.visit_time_minutes}m`);
                    if (spot.best_time_of_day && spot.best_time_of_day !== 'any') {
                        insightParts.push(`Best: ${spot.best_time_of_day}`);
                    }
                    if (spot.outdoor_exposure) {
                        const tip = getExposureTip(spot.outdoor_exposure);
                        if (tip) insightParts.push(tip);
                    }

                    let insightLine = insightParts.join('  ·  ');
                    if (insightLine.length > 105) {
                        insightLine = insightLine.substring(0, 102) + '...';
                    }
                    doc.text(insightLine, TEXT_X, currentTextY);
                }

                // Locked indicator
                if (spot.locked) {
                    doc.setTextColor(...colors.amber);
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'bold');
                    doc.text("LOCKED", pageWidth - margin - PAD, currentY + cardHeight - PAD, { align: 'right' });
                }

                // Increment
                runningTime = departureTime;
                globalSpotIndex++;
                currentY += cardHeight + 4;
            });

            // Day end marker
            currentY = ensureSpace(doc, currentY, 14, pageHeight);
            doc.setFontSize(7);
            doc.setFont('courier', 'bold');
            doc.setTextColor(...colors.muted);
            doc.text(
                `- END DAY ${dayNum} // EST FINISH: ${formatTime(runningTime)} -`,
                pageWidth / 2, currentY, { align: 'center' }
            );
            currentY += 16;
        });

    // ===============================
    // SECTION 3: FINANCIAL BLUEPRINT
    // ===============================
    currentY += 10;
    currentY = ensureSpace(doc, currentY, 100, pageHeight);

    doc.setFillColor(...colors.teal);
    doc.roundedRect(margin, currentY, contentWidth, 20, 3, 3, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('FINANCIAL BLUEPRINT', margin + 10, currentY + 14);
    currentY += 30;

    const budgetCounts = { low: 0, medium: 0, high: 0, unknown: 0 };
    allSpotsFlat.forEach(spot => {
        const b = spot.min_budget || 'unknown';
        if (budgetCounts[b] !== undefined) budgetCounts[b]++;
        else budgetCounts.unknown++;
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.dark);
    doc.text('Budget Distribution', margin, currentY);
    currentY += 6;

    let barX = margin;
    const barWidth = contentWidth;
    const barHeight = 8;
    const totalValidSpots = allSpotsFlat.length || 1;

    const lowWidth = (budgetCounts.low / totalValidSpots) * barWidth;
    const medWidth = (budgetCounts.medium / totalValidSpots) * barWidth;
    const highWidth = (budgetCounts.high / totalValidSpots) * barWidth;
    const unkWidth = (budgetCounts.unknown / totalValidSpots) * barWidth;

    if (lowWidth > 0) { doc.setFillColor(...colors.accent); doc.rect(barX, currentY, lowWidth, barHeight, 'F'); barX += lowWidth; }
    if (medWidth > 0) { doc.setFillColor(...colors.warning); doc.rect(barX, currentY, medWidth, barHeight, 'F'); barX += medWidth; }
    if (highWidth > 0) { doc.setFillColor(...colors.danger); doc.rect(barX, currentY, highWidth, barHeight, 'F'); barX += highWidth; }
    if (unkWidth > 0) { doc.setFillColor(...colors.muted); doc.rect(barX, currentY, unkWidth, barHeight, 'F'); }
    currentY += 16;

    doc.setFillColor(...colors.light);
    doc.roundedRect(margin, currentY, contentWidth, 12, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.dark);
    doc.text('- BUDGET TIER', margin + 8, currentY + 8);
    doc.text('- EST. COST RANGE', margin + 70, currentY + 8);
    doc.text('# SPOTS', pageWidth - margin - 8, currentY + 8, { align: 'right' });
    currentY += 16;

    const budgetRows = [
        { key: 'low', label: 'Budget-Friendly', range: 'P50 - P200 per person', color: colors.accent },
        { key: 'medium', label: 'Moderate', range: 'P200 - P500 per person', color: colors.warning },
        { key: 'high', label: 'Premium', range: 'P500+ per person', color: colors.danger },
    ];

    budgetRows.forEach((row) => {
        const count = budgetCounts[row.key];
        if (count === 0) return;

        doc.setDrawColor(240, 240, 240);
        doc.line(margin, currentY + 10, pageWidth - margin, currentY + 10);

        doc.setFillColor(...row.color);
        doc.circle(margin + 5, currentY + 6, 2, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.dark);
        doc.text(row.label, margin + 12, currentY + 8);

        doc.setTextColor(...colors.text);
        doc.text(row.range, margin + 70, currentY + 8);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.dark);
        doc.text(`${count}`, pageWidth - margin - 8, currentY + 8, { align: 'right' });

        currentY += 14;
    });

    currentY += 6;
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'F');
    doc.setDrawColor(...colors.warning);
    doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'S');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.warning);
    doc.text('! LOGISTICS & PAYMENT TIP', margin + 8, currentY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.text);
    doc.text('Most locations in Catanduanes are cash-only. ATMs are available in Virac town center.', margin + 8, currentY + 14);
    doc.text('FUEL TAX: Catanduanes terrain involves mountain passes. Budget extra for tricycle/van fuel.', margin + 8, currentY + 20);
    currentY += 34;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.dark);
    doc.text('Cost Breakdown Per Stop', margin, currentY);
    currentY += 8;

    allSpotsFlat.forEach((spot, idx) => {
        currentY = ensureSpace(doc, currentY, 12, pageHeight);
        doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255);
        doc.roundedRect(margin, currentY, contentWidth, 10, 1, 1, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.dark);
        const spotNameStr = spot.name || 'Unknown Location';
        const name = spotNameStr.length > 28 ? spotNameStr.substring(0, 25) + '...' : spotNameStr;
        doc.text(name, margin + 5, currentY + 7);

        doc.setTextColor(...colors.text);
        doc.text(getBudgetLabel(spot.min_budget), pageWidth - margin - 5, currentY + 7, { align: 'right' });

        currentY += 12;
    });

    // ===============================
    // SECTION 5: EMERGENCY & REFERENCE INFO
    // ===============================
    currentY += 10;
    currentY = ensureSpace(doc, currentY, 100, pageHeight);

    doc.setFillColor(...colors.danger);
    doc.roundedRect(margin, currentY, contentWidth, 20, 3, 3, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('EMERGENCY & REFERENCE', margin + 10, currentY + 14);
    currentY += 28;

    const emergencyItems = [
        { label: 'Provincial Tourism Office', value: 'Capitol Complex, Virac - (052) 811-1231', icon: '[Location]' },
        { label: 'Catanduanes Provincial Hospital', value: 'Virac, Catanduanes - (052) 811-1163', icon: '[Medical]' },
        { label: 'Philippine National Police - Virac', value: 'Virac Station - (052) 811-1102', icon: '[Police]' },
        { label: 'Philippine Coast Guard', value: 'Port of Virac - (052) 811-1250', icon: '[Port]' },
        { label: 'Emergency Hotline', value: '911 (National) / 117 (PNP)', icon: '[Phone]' },
    ];

    emergencyItems.forEach((item) => {
        currentY = ensureSpace(doc, currentY, 16, pageHeight);

        doc.setFillColor(254, 242, 242);
        doc.roundedRect(margin, currentY, contentWidth, 14, 2, 2, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.dark);
        doc.text(`${item.icon}  ${item.label}`, margin + 5, currentY + 9);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.text);
        doc.text(item.value, pageWidth - margin - 5, currentY + 9, { align: 'right' });

        currentY += 17;
    });

    currentY += 5;
    currentY = ensureSpace(doc, currentY, 45, pageHeight);

    doc.setFillColor(239, 246, 255);
    doc.roundedRect(margin, currentY, contentWidth, 40, 3, 3, 'F');
    doc.setDrawColor(...colors.primary);
    doc.roundedRect(margin, currentY, contentWidth, 40, 3, 3, 'S');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.primary);
    doc.text('TRAVEL REMINDERS', margin + 8, currentY + 9);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.text);
    const tips = [
        '* Download offline maps - cell signal is weak in coastal and mountainous areas.',
        '* Bring cash - most rural spots do not accept digital payments.',
        '* Check weather forecasts - typhoon season is June to November.',
        '* Respect local customs - always ask before photographing locals or sacred sites.',
    ];
    tips.forEach((tip, idx) => {
        doc.text(tip, margin + 8, currentY + 17 + (idx * 6));
    });

    // ===============================
    // FOOTER + AI DISCLAIMER (every page)
    // ===============================
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - 8;

        if (i === totalPages) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(180, 180, 180);
            doc.text(
                'AI-generated content: Itinerary details — including times, costs, and availability — are estimates produced by an AI model and may be inaccurate or outdated. Always verify with local operators before travelling. Pathfinder AI is not liable for any discrepancies.',
                pageWidth / 2,
                footerY - 20,
                { align: 'center', maxWidth: contentWidth }
            );
        }


        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

        doc.setFontSize(6.5);
        doc.setTextColor(180, 180, 180);
        doc.setFont('helvetica', 'normal');
        doc.text(`Pathfinder AI  -  Generated ${new Date().toLocaleDateString()}  -  Timing estimates may vary`, margin, footerY);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
    }

    // Save a file immediately when requested, then return a Blob URL for in-app preview.
    // Blob URLs are more reliable than large data URIs on constrained browsers/devices.
    if (saveFile) {
        doc.save(`Itinerary_${activeHubName || 'Trip'}_${Date.now()}.pdf`);
    }
    const pdfBlob = doc.output('blob');
    return URL.createObjectURL(pdfBlob);
};
