import { TRAVEL_HUBS } from '../constants/location';
import { calculateDistance } from './distance';

const AVG_SPEED_KPH = 40; 

const getDriveMinutes = (coord1, coord2) => {
    if (!coord1 || !coord2) return 0;
    const dist = calculateDistance(coord1, coord2);
    return Math.ceil((dist / AVG_SPEED_KPH) * 60);
};

// HELPER: Adds minutes to a date
const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);

/**
 * Calculates metrics for a specific set of spots relative to a Hub.
 * Returns: { minutesUsed, requiredStartTime, isOverloaded, returnDriveTime }
 */
export const calculateDayMetrics = (hubName, spotsForDay) => {
    const hub = TRAVEL_HUBS[hubName];
    if (!hub || !spotsForDay || spotsForDay.length === 0) {
        return { minutesUsed: 0, requiredStartTime: "08:00 AM", isOverloaded: false, returnDriveTime: 0 };
    }

    let currentLocation = hub.coordinates;
    let totalMinutes = 0;

    // 1. Calculate One-Way Trip (Hub -> Spot -> Spot...)
    spotsForDay.forEach(spot => {
        const drive = getDriveMinutes(currentLocation, spot.geometry.coordinates);
        const visit = spot.visit_time_minutes || 60;
        totalMinutes += (drive + visit);
        currentLocation = spot.geometry.coordinates;
    });

    // 2. Add Return Trip (Spot -> Hub)
    const returnDrive = getDriveMinutes(currentLocation, hub.coordinates);
    totalMinutes += returnDrive;

    // 3. Calculate "Required Start Time" to finish by 5:00 PM (17:00)
    const TARGET_END = new Date();
    TARGET_END.setHours(17, 0, 0, 0); 
    
    // Subtract duration from 5:00 PM
    const startObj = addMinutes(TARGET_END, -totalMinutes);
    const startHour = startObj.getHours() + (startObj.getMinutes() / 60);

    return {
        minutesUsed: totalMinutes,
        requiredStartTime: startObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        startHour: startHour, // Decimal hour (e.g., 5.5 for 5:30 AM)
        returnDriveTime: returnDrive
    };
};