import * as turf from '@turf/turf';

// 1. Basic Distance Calc (Used by everything else)
export const calculateDistance = (coord1, coord2) => {
    if (!coord1 || !coord2) return 0;
    const from = turf.point(coord1);
    const to = turf.point(coord2);
    return parseFloat(turf.distance(from, to).toFixed(1));
};

// 2. Total Trip Calc (Used for Summary Stats)
export const calculateTotalRoute = (hub, spots) => {
    if (!hub || !spots || spots.length === 0) return 0;
    
    let totalDist = 0;
    let currentCoords = hub.coordinates;

    spots.forEach(spot => {
        const dist = calculateDistance(currentCoords, spot.geometry.coordinates);
        totalDist += dist;
        currentCoords = spot.geometry.coordinates;
    });

    return totalDist.toFixed(1);
};

// 3. Feasibility Scoring Engine (The Green/Yellow/Red Logic)
export const evaluateTripFeasibility = (hub, spots, endHour = 17) => {
    // GUARD CLAUSE: Return safe default if data is missing
    if (!hub || !spots || spots.length === 0) {
        return { status: 'EMPTY', message: 'Add spots to see feasibility', color: '#6B7280' };
    }

    // A. Run the Reverse Math (Invisible Layer)
    let currentTime = new Date();
    currentTime.setHours(endHour, 0, 0, 0);

    // 1. Subtract Drive Home (Last Spot -> Hub)
    let lastSpot = spots[spots.length - 1];
    let distToHome = calculateDistance(lastSpot.geometry.coordinates, hub.coordinates);
    let driveHomeMins = Math.round((distToHome / 40) * 60); 
    currentTime.setMinutes(currentTime.getMinutes() - driveHomeMins);

    // 2. Loop Backwards to find Hub Departure Time
    for (let i = spots.length - 1; i >= 0; i--) {
        const spot = spots[i];
        
        // Subtract Visit (Default 60 mins)
        const visitDuration = spot.visit_time_minutes > 0 ? spot.visit_time_minutes : 60; 
        currentTime.setMinutes(currentTime.getMinutes() - visitDuration);

        // Subtract Drive from Previous
        let prevCoords = (i === 0) ? hub.coordinates : spots[i - 1].geometry.coordinates;
        const dist = calculateDistance(prevCoords, spot.geometry.coordinates);
        const driveMinutes = Math.round((dist / 40) * 60);

        currentTime.setMinutes(currentTime.getMinutes() - driveMinutes);
    }

    // B. The Result: When MUST you leave the Hub?
    const requiredDepartureHour = currentTime.getHours() + (currentTime.getMinutes() / 60);

    // C. The Verdict
    if (requiredDepartureHour >= 8) {
        return { 
            status: 'RELAXED', 
            message: 'Comfortable day. Fits well.', 
            color: '#10B981', // Green
        };
    } else if (requiredDepartureHour >= 6) {
        return { 
            status: 'TIGHT', 
            message: 'Doable, but requires an early start (6-8 AM).', 
            color: '#F59E0B', // Yellow
        };
    } else {
        return { 
            status: 'UNREALISTIC', 
            message: 'Too much! You would need to start before dawn.', 
            color: '#EF4444', // Red
        };
    }
};

export const calculateTimeUsage = (hub, spots) => {
    if (!hub || !spots || spots.length === 0) {
        return { totalUsed: 0, driveTime: 0, visitTime: 0 };
    }

    let totalDrive = 0;
    let totalVisit = 0;
    let currentCoords = hub.coordinates;

    spots.forEach(spot => {
        // 1. Visit Time
        const visit = spot.visit_time_minutes > 0 ? spot.visit_time_minutes : 60;
        totalVisit += visit;

        // 2. Drive from Previous
        const dist = calculateDistance(currentCoords, spot.geometry.coordinates);
        const driveMins = Math.round((dist / 40) * 60); // 40km/h
        totalDrive += driveMins;

        currentCoords = spot.geometry.coordinates;
    });

    // 3. Drive Home (Return to Hub) - The hidden cost
    const distHome = calculateDistance(currentCoords, hub.coordinates);
    const driveHome = Math.round((distHome / 40) * 60);
    totalDrive += driveHome;

    return {
        totalUsed: totalDrive + totalVisit,
        driveTime: totalDrive,
        visitTime: totalVisit
    };
};

// 4. Drive Time Helper (Used for the UI list)
export const calculateDriveTimes = (hub, spots) => {
    if (!hub || !spots || spots.length === 0) return [];
    
    let currentCoords = hub.coordinates;
    
    return spots.map(spot => {
        const dist = calculateDistance(currentCoords, spot.geometry.coordinates);
        const driveMinutes = Math.round((dist / 40) * 60);
        currentCoords = spot.geometry.coordinates;
        return { driveTime: driveMinutes };
    });
};