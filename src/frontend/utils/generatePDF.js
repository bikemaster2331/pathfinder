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
    addedSpots, // Can now be an Array (single day) OR Object {1: [], 2: []}
    totalDistance, // Total distance of whole trip
    driveData // Flat array of drive times (matches sequence of spots)
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

    // 1. NORMALIZE DATA (Handle Array vs Object)
    let itineraryDays = {};
    if (Array.isArray(addedSpots)) {
        itineraryDays = { 1: addedSpots }; // Treat flat array as Day 1
    } else {
        itineraryDays = addedSpots; // Use the multi-day object
    }

    let globalSpotIndex = 0; // To track position in the flat driveData array

    // ===============================
    // COVER PAGE
    // ===============================
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text("TRIP ITINERARY", pageWidth / 2, 25, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Hub: ${activeHubName || "Not Selected"}`, pageWidth / 2, 35, { align: 'center' });

    let currentY = 55;

    // ===============================
    // LOOP THROUGH DAYS
    // ===============================
    Object.keys(itineraryDays).forEach((dayNum) => {
        const spotsForDay = itineraryDays[dayNum];
        if (!spotsForDay || spotsForDay.length === 0) return;

        // --- A. DAY CALCULATION (Reverse Logic per Day) ---
        const COMFORT_START_TIME = new Date();
        COMFORT_START_TIME.setHours(8, 0, 0, 0); 
        const HARD_END_TIME = new Date();
        HARD_END_TIME.setHours(17, 0, 0, 0); 

        let dayTripMinutes = 0;
        
        // Calculate minutes for THIS day only
        spotsForDay.forEach((spot, localIndex) => {
            const actualDriveTime = driveData[globalSpotIndex + localIndex]?.driveTime || 0;
            dayTripMinutes += (spot.visit_time_minutes || 60);
            dayTripMinutes += actualDriveTime;
        });

        const requiredStartTime = addMinutes(HARD_END_TIME, -dayTripMinutes);
        let finalStartTime = COMFORT_START_TIME; 
        let scheduleNote = "Relaxed Pace (You can start by ~8:00 AM)";
        let noteColor = colors.accent; 

        const requiredHour = requiredStartTime.getHours() + (requiredStartTime.getMinutes() / 60);

        if (requiredHour >= 8) {
            finalStartTime = COMFORT_START_TIME; 
        } else if (requiredHour >= 6) {
            finalStartTime = requiredStartTime;
            scheduleNote = `Tight Schedule (Start exactly at ${formatTime(requiredStartTime)})`;
            noteColor = colors.warning;
        } else {
            finalStartTime = requiredStartTime;
            scheduleNote = `Early Start Required (${formatTime(requiredStartTime)})`;
            noteColor = colors.danger;
        }

        // --- B. CHECK PAGE SPACE (Add new page for new Day if needed) ---
        if (currentY + 60 > pageHeight) {
            doc.addPage();
            currentY = 20;
        }

        // --- C. RENDER DAY HEADER ---
        doc.setFillColor(...colors.light);
        doc.roundedRect(10, currentY, pageWidth - 20, 25, 3, 3, 'F');
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.dark);
        doc.text(`Day ${dayNum}`, 20, currentY + 10);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...noteColor);
        doc.text(scheduleNote, 20, currentY + 18);

        doc.setFontSize(10);
        doc.setTextColor(...colors.text);
        doc.setFont('helvetica', 'normal');
        doc.text(`${spotsForDay.length} Stops`, pageWidth - 40, currentY + 10);

        currentY += 35; // Move cursor below header

        // --- D. RENDER SPOTS FOR THIS DAY ---
        let runningTime = new Date(finalStartTime);
        const cardHeight = 35;

        spotsForDay.forEach((spot, i) => {
            // Check for page break inside the loop
            if (currentY + cardHeight > pageHeight - 15) {
                doc.addPage();
                currentY = 20;
            }

            // Get drive time using the Global Index
            const driveTime = driveData[globalSpotIndex]?.driveTime || 0;
            const visitTime = spot.visit_time_minutes || 60;
            
            const arrivalTime = addMinutes(runningTime, driveTime);
            const departureTime = addMinutes(arrivalTime, visitTime);

            // Card Styling
            const isEven = i % 2 === 0;
            if (isEven) {
                doc.setFillColor(255, 255, 255);
            } else {
                doc.setFillColor(250, 250, 250);
            }
            doc.setDrawColor(230, 230, 230);
            doc.roundedRect(15, currentY, pageWidth - 30, cardHeight, 2, 2, 'FD');

            // Time Badge
            doc.setFillColor(...colors.primary);
            doc.roundedRect(20, currentY + 8, 25, 12, 1, 1, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(formatTime(arrivalTime), 32.5, currentY + 15, { align: 'center' });

            // Spot Name
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colors.dark);
            const spotName = spot.name.length > 35 ? spot.name.substring(0, 32) + '...' : spot.name;
            doc.text(spotName, 50, currentY + 12);

            // Drive Info
            if (driveTime > 0) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text(`+${driveTime}m drive`, 50, currentY + 17);
            } else if (i === 0) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(150, 150, 150);
                doc.text(`Start from ${activeHubName}`, 50, currentY + 17);
            }

            // Duration
            doc.setTextColor(...colors.text);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Stay: ${visitTime} mins`, 50, currentY + 24);

            // Locked Indicator
            if (spot.locked) {
                doc.setTextColor(245, 158, 11);
                doc.text("🔒 Locked", 100, currentY + 24);
            }

            // Increment Time & Global Index
            runningTime = departureTime;
            globalSpotIndex++; 
            currentY += cardHeight + 5;
        });

        // Space between days
        currentY += 10;
    });

    // ===============================
    // FOOTER (Last Page)
    // ===============================
    const footerY = pageHeight - 10;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated on ${new Date().toLocaleDateString()} - Timing is estimated based on traffic/weather.`, pageWidth / 2, footerY, { align: 'center' });

    doc.save(`Itinerary_${activeHubName}_${Date.now()}.pdf`);
};