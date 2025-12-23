import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const generateItineraryPDF = async (
  startDate,
  endDate,
  budgetRange,
  dayItineraries,
  calculateDays,
  getDayDate,
  adults = 2,
  children = 0,
  seniors = 0
) => {
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Configuration
    const PAGE_WIDTH = pdf.internal.pageSize.getWidth();
    const PAGE_HEIGHT = pdf.internal.pageSize.getHeight();
    const MARGIN = 12;
    const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

    let yPos = MARGIN;

    // Modern Color Palette
    const PRIMARY = [20, 20, 30];      // Deep navy
    const SECONDARY = [100, 150, 255]; // Vibrant blue
    const ACCENT = [255, 107, 107];    // Coral
    const TEXT = [45, 45, 50];         // Dark text
    const LIGHT_TEXT = [120, 120, 130];
    const BG_LIGHT = [248, 249, 252];  // Soft blue-white
    const BG_CARD = [255, 255, 255];   // Card white
    const BORDER = [220, 230, 245];    // Light blue border
    const WHITE = [255, 255, 255];

    // === UTILITY FUNCTIONS ===
    const addPageBreak = () => {
      pdf.addPage();
      yPos = MARGIN;
    };

    const checkPageBreak = (minHeight = 40) => {
      if (yPos + minHeight > PAGE_HEIGHT - MARGIN) {
        addPageBreak();
      }
    };

    const setFont = (size, bold = false, color = TEXT) => {
      pdf.setFontSize(size);
      pdf.setFont(undefined, bold ? 'bold' : 'normal');
      pdf.setTextColor(...color);
    };

    const addText = (text, x = MARGIN, fontSize = 10, bold = false, color = TEXT) => {
      setFont(fontSize, bold, color);
      pdf.text(text, x, yPos);
      yPos += fontSize * 0.55 + 2;
    };

    const addMultilineText = (text, x = MARGIN, maxWidth = CONTENT_WIDTH - 10, fontSize = 9, color = TEXT) => {
      setFont(fontSize, false, color);
      const lines = pdf.splitTextToSize(text, maxWidth);
      pdf.text(lines, x, yPos);
      yPos += lines.length * (fontSize * 0.45 + 1.5) + 2;
    };

    const addCard = (title, items) => {
      checkPageBreak(35);
      
      // Card border top accent
      pdf.setDrawColor(...SECONDARY);
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN, yPos, MARGIN + 20, yPos);
      yPos += 4;

      // Card title
      setFont(11, true, PRIMARY);
      pdf.text(title, MARGIN, yPos);
      yPos += 7;

      // Card background
      const itemHeight = items.length * 5.5 + 8;
      pdf.setFillColor(...BG_CARD);
      pdf.setDrawColor(...BORDER);
      pdf.setLineWidth(0.3);
      pdf.rect(MARGIN, yPos - 2, CONTENT_WIDTH, itemHeight, 'FD');

      // Card content
      setFont(9.5, false, TEXT);
      items.forEach((line) => {
        pdf.text(line, MARGIN + 4, yPos);
        yPos += 5.5;
      });

      yPos += 5;
    };

    const addGradientHeader = () => {
      // Background gradient effect (simulated with rectangles)
      pdf.setFillColor(...BG_LIGHT);
      pdf.rect(0, 0, PAGE_WIDTH, 50, 'F');

      // Accent line
      pdf.setDrawColor(...SECONDARY);
      pdf.setLineWidth(1);
      pdf.line(MARGIN, 48, PAGE_WIDTH - MARGIN, 48);
    };

    // === PAGE 1: MODERN HEADER ===
    addGradientHeader();

    yPos = 20;

    // Main title with modern styling
    setFont(28, true, PRIMARY);
    pdf.text('CATANDUANES', MARGIN, yPos);
    
    setFont(28, true, SECONDARY);
    pdf.text('ITINERARY', MARGIN, yPos + 9);
    
    yPos = 55;

    // Subtitle with dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const days = calculateDays();

    const formattedStart = startDateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    const formattedEnd = endDateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    setFont(10, false, LIGHT_TEXT);
    pdf.text(`${formattedStart} — ${formattedEnd} • ${days} Days`, MARGIN, yPos);
    yPos += 12;

    // === QUICK STATS ===
    checkPageBreak(40);

    // Stats in a modern grid (3 columns)
    const statBoxWidth = (CONTENT_WIDTH - 3) / 3;
    const statBoxHeight = 22;
    const statsY = yPos;

    // Stat 1: Duration
    pdf.setFillColor(...BG_LIGHT);
    pdf.rect(MARGIN, statsY, statBoxWidth, statBoxHeight, 'F');
    setFont(14, true, SECONDARY);
    pdf.text(days.toString(), MARGIN + statBoxWidth / 2, statsY + 8, { align: 'center' });
    setFont(8, false, LIGHT_TEXT);
    pdf.text('Days', MARGIN + statBoxWidth / 2, statsY + 15, { align: 'center' });

    // Stat 2: Travellers
    const totalTravellers = adults + children + seniors;
    pdf.setFillColor(...BG_LIGHT);
    pdf.rect(MARGIN + statBoxWidth + 1.5, statsY, statBoxWidth, statBoxHeight, 'F');
    setFont(14, true, SECONDARY);
    pdf.text(totalTravellers.toString(), MARGIN + statBoxWidth * 1.5 + 1.5, statsY + 8, { align: 'center' });
    setFont(8, false, LIGHT_TEXT);
    pdf.text('Travellers', MARGIN + statBoxWidth * 1.5 + 1.5, statsY + 15, { align: 'center' });

    // Stat 3: Budget
    const budgetText = String(budgetRange).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    pdf.setFillColor(...BG_LIGHT);
    pdf.rect(MARGIN + statBoxWidth * 2 + 3, statsY, statBoxWidth, statBoxHeight, 'F');
    setFont(12, true, SECONDARY);
    pdf.text('PHP', MARGIN + statBoxWidth * 2.5 + 3, statsY + 6, { align: 'center' });
    setFont(9, true, ACCENT);
    pdf.text(budgetText.substring(0, 8), MARGIN + statBoxWidth * 2.5 + 3, statsY + 13, { align: 'center' });

    yPos = statsY + statBoxHeight + 8;

    // === TRIP DETAILS ===
    addCard('Trip Overview', [
      `Start: ${formattedStart}`,
      `End: ${formattedEnd}`,
      `Destination: Catanduanes Islands`
    ]);

    // === TRAVELLER INFORMATION ===
    addCard('Traveller Details', [
      `Total: ${totalTravellers} people`,
      `Adults: ${adults} | Children: ${children} | Seniors: ${seniors}`
    ]);

    // === DAILY ITINERARY HEADER ===
    yPos += 2;
    setFont(14, true, PRIMARY);
    pdf.text('Daily Itinerary', MARGIN, yPos);
    
    pdf.setDrawColor(...SECONDARY);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN, yPos + 2, MARGIN + 35, yPos + 2);
    yPos += 8;

    // === PROCESS EACH DAY ===
    for (let dayIndex = 0; dayIndex < days; dayIndex++) {
      checkPageBreak(35);

      const dayKey = `day-${dayIndex}`;
      const dayItems = dayItineraries[dayKey] || [];
      const dayDate = getDayDate(dayIndex);

      // Modern day header with accent
      pdf.setFillColor(...PRIMARY);
      pdf.rect(MARGIN, yPos - 4, CONTENT_WIDTH, 11, 'F');

      setFont(11, true, WHITE);
      pdf.text(`Day ${dayIndex + 1}`, MARGIN + 4, yPos + 1);
      
      setFont(9, false, WHITE);
      pdf.text(dayDate, PAGE_WIDTH - MARGIN - 40, yPos + 1);

      yPos += 12;

      // Day activities
      if (dayItems.length === 0) {
        pdf.setFillColor(...BG_LIGHT);
        pdf.setDrawColor(...BORDER);
        pdf.setLineWidth(0.2);
        pdf.rect(MARGIN, yPos - 2, CONTENT_WIDTH, 10, 'FD');

        setFont(9, false, LIGHT_TEXT);
        pdf.text('No activities scheduled', MARGIN + 4, yPos + 3);
        yPos += 12;
      } else {
        dayItems.forEach((item, itemIndex) => {
          checkPageBreak(18);

          // Activity item with modern design
          pdf.setFillColor(...BG_LIGHT);
          pdf.setDrawColor(...BORDER);
          pdf.setLineWidth(0.2);
          pdf.rect(MARGIN, yPos - 2, CONTENT_WIDTH, 2, 'FD');

          // Activity number badge
          pdf.setFillColor(...SECONDARY);
          pdf.circle(MARGIN + 4, yPos + 3.5, 3, 'F');

          setFont(8, true, WHITE);
          pdf.text((itemIndex + 1).toString(), MARGIN + 4, yPos + 4.5, { align: 'center' });

          // Activity name
          setFont(10, true, PRIMARY);
          pdf.text(item.name, MARGIN + 12, yPos + 4.5);
          yPos += 8;

          // Activity description
          if (item.description) {
            addMultilineText(item.description, MARGIN + 12, CONTENT_WIDTH - 17, 8.5, LIGHT_TEXT);
          } else {
            yPos += 2;
          }

          yPos += 2;
        });
      }

      yPos += 6;
    }

    // === MODERN FOOTER ===
    checkPageBreak(12);
    const generatedDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    pdf.setDrawColor(...BORDER);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, yPos, PAGE_WIDTH - MARGIN, yPos);
    yPos += 4;

    setFont(8, false, LIGHT_TEXT);
    pdf.text(`Generated on ${generatedDate} • Catanduanes Travel Guide`, MARGIN, yPos);

    // Save PDF
    const fileName = `Itinerary_Catanduanes_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fileName);

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

export const exportItineraryAsImage = async (elementId) => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error('Element not found');
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false
    });

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `Itinerary_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return true;
  } catch (error) {
    console.error('Error exporting as image:', error);
    throw error;
  }
};
