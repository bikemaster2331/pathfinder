import jsPDF from 'jspdf';

// --- HELPER: Time Math ---
const addMinutes = (dateObj, minutes) => {
    return new Date(dateObj.getTime() + minutes * 60000);
};

const formatTime = (dateObj) => {
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

// --- MAIN GENERATOR ---
export const generateItineraryPDF = ({ 
    activeHubName, 
    dateRange, 
    addedSpots, 
    totalDistance,
    driveData
}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Color Palette
    const colors = {
        primary: [37, 99, 235],      // Blue
        accent: [34, 197, 94],       // Green
        warning: [234, 179, 8],      // Yellow/Orange
        danger: [220, 38, 38],       // Red
        dark: [31, 41, 55],          // Dark gray
        light: [243, 244, 246],      // Light gray
        text: [55, 65, 81]           // Text gray
    };

    // ==========================================
    // 1. THE MATHEMATICAL TRUTH (REVERSE LOGIC)
    // ==========================================
    
    const COMFORT_START_TIME = new Date();
    COMFORT_START_TIME.setHours(8, 0, 0, 0); // 8:00 AM Baseline

    const HARD_END_TIME = new Date();
    HARD_END_TIME.setHours(17, 0, 0, 0); // 5:00 PM Sunset/Target

    let totalTripMinutes = 0;
    addedSpots.forEach((spot, i) => {
        totalTripMinutes += (spot.visit_time_minutes || 60);
        totalTripMinutes += (driveData[i]?.driveTime || 0);
    });

    const requiredStartTime = addMinutes(HARD_END_TIME, -totalTripMinutes);
    
    let finalStartTime = COMFORT_START_TIME; 
    let scheduleNote = "Day Feasibility: Comfortable (Start ~8:00 AM)";
    let noteColor = colors.accent; 

    const requiredHour = requiredStartTime.getHours() + (requiredStartTime.getMinutes() / 60);

    if (requiredHour >= 8) {
        // GREEN
        finalStartTime = COMFORT_START_TIME; 
        scheduleNote = "Day Feasibility: Comfortable (Start ~8:00 AM)";
        noteColor = colors.accent;
    } 
    else if (requiredHour >= 6) {
        // YELLOW
        finalStartTime = requiredStartTime;
        scheduleNote = `Day Feasibility: Tight (Start exactly at ${formatTime(requiredStartTime)})`;
        noteColor = colors.warning;
    } 
    else {
        // RED
        finalStartTime = requiredStartTime;
        scheduleNote = `⚠️ UNREALISTIC: You must start at ${formatTime(requiredStartTime)} to finish.`;
        noteColor = colors.danger;
    }

    // ===============================
    // 2. HEADER & STYLING
    // ===============================
    
    doc.setFillColor(...colors.primary);
    doc.circle(pageWidth - 20, 15, 25, 'F');
    doc.setFillColor(...colors.accent);
    doc.circle(15, 20, 15, 'F');

    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.primary);
    doc.text("TRAVEL", pageWidth / 2, 25, { align: 'center' });
    
    doc.setFontSize(24);
    doc.setTextColor(...colors.accent);
    doc.text("Itinerary", pageWidth / 2, 35, { align: 'center' });

    doc.setDrawColor(...colors.primary);
    doc.setLineWidth(0.5);
    doc.line(60, 40, pageWidth - 60, 40);
    doc.setFontSize(16);
    doc.text("✈", pageWidth / 2 + 25, 27);

    // ===============================
    // 3. TRIP OVERVIEW BOX
    // ===============================
    const boxY = 50;
    
    doc.setFillColor(...colors.light);
    doc.roundedRect(15, boxY, pageWidth - 30, 40, 3, 3, 'F');
    
    doc.setFillColor(255, 255, 255);
    doc.circle(25, boxY + 10, 5, 'F');
    doc.setFontSize(10);
    doc.setTextColor(...colors.primary);
    doc.text("📍", 22, boxY + 12);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.dark);
    doc.text(`Starting Point: ${activeHubName || "Not Selected"}`, 35, boxY + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...colors.text);
    const dateStr = (dateRange.start && dateRange.end) ? `${dateRange.start} to ${dateRange.end}` : "Dates not set";
    const distanceStr = totalDistance ? `${totalDistance} km` : "0 km";
    doc.text(`📅 ${dateStr}`, 35, boxY + 18);
    doc.text(`🚗 Total Distance: ${distanceStr}`, 35, boxY + 25);
    doc.text(`📌 ${addedSpots.length} Stops Planned`, 35, boxY + 32);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...noteColor);
    doc.text(scheduleNote, 100, boxY + 20); 
    
    // ===============================
    // 4. GENERATE TIMELINE
    // ===============================
    
    let currentY = boxY + 50;
    const cardHeight = 35;
    const cardPadding = 5;
    let runningTime = new Date(finalStartTime);

    addedSpots.forEach((spot, index) => {
        if (currentY + cardHeight > pageHeight - 20) {
            doc.addPage();
            currentY = 20;
        }

        const driveTime = driveData[index]?.driveTime || 0;
        const visitTime = spot.visit_time_minutes || 60;
        const arrivalTime = addMinutes(runningTime, driveTime);
        const departureTime = addMinutes(arrivalTime, visitTime);

        // --- FIX: Logic corrected here ---
        const isEven = index % 2 === 0;
        
        if (isEven) {
            doc.setFillColor(255, 255, 255);
        } else {
            doc.setFillColor(...colors.light);
        }
        
        doc.roundedRect(15, currentY, pageWidth - 30, cardHeight, 2, 2, 'FD');
        
        if (!isEven) {
            doc.setDrawColor(...colors.primary);
            doc.setLineWidth(0.3);
        }

        // Time Badge
        doc.setFillColor(...colors.primary);
        doc.roundedRect(20, currentY + 8, 25, 12, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(formatTime(arrivalTime), 32.5, currentY + 15, { align: 'center' });
        doc.setFontSize(6);
        doc.text("ARRIVAL", 32.5, currentY + 19, { align: 'center' });

        // Spot Name
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.dark);
        const nameText = spot.name || "Unknown Spot";
        const spotName = nameText.length > 35 ? nameText.substring(0, 32) + '...' : nameText;
        doc.text(spotName, 50, currentY + 12);

        // Drive Info
        if (driveTime > 0) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            doc.text(`(+${driveTime}m drive from previous)`, 50, currentY + 17);
        }

        // Category Tag
        doc.setFillColor(...colors.accent);
        doc.roundedRect(50, currentY + 20, 30, 5, 1, 1, 'F');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        const category = spot.type || spot.category || "Spot";
        doc.text(category.toUpperCase(), 65, currentY + 23.5, { align: 'center' });

        // Duration & Lock Status
        doc.setTextColor(...colors.text);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Stay: ${visitTime} mins`, 85, currentY + 23.5);

        if (spot.locked) {
            doc.setTextColor(245, 158, 11); 
            doc.text(`🔒 Locked`, 115, currentY + 23.5);
        }

        // Image placeholder
        doc.setFillColor(220, 220, 220);
        doc.roundedRect(pageWidth - 55, currentY + 5, 35, 25, 2, 2, 'F');
        doc.setFontSize(16);
        doc.setTextColor(150, 150, 150);
        doc.text("IMG", pageWidth - 37.5, currentY + 18, { align: 'center' });

        runningTime = departureTime;
        currentY += cardHeight + cardPadding;
    });

    // ===============================
    // 5. FOOTER
    // ===============================
    const footerY = pageHeight - 15;
    doc.setDrawColor(...colors.light);
    doc.setLineWidth(0.5);
    doc.line(15, footerY - 5, pageWidth - 15, footerY - 5);
    
    doc.setFontSize(8);
    doc.setTextColor(...colors.text);
    doc.setFont('helvetica', 'italic');
    doc.text("Timing is estimated. Weather and traffic may affect travel.", pageWidth / 2, footerY, { align: 'center' });
    
    const filename = `Catanduanes_Itinerary_${Date.now()}.pdf`;
    doc.save(filename);
};