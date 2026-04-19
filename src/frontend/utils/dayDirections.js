const GOOGLE_DIRECTIONS_BASE_URL = 'https://www.google.com/maps/dir/?api=1';

const isValidCoordinate = (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) return false;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
};

const normalizeItineraryDays = (finalItinerary) => {
    if (Array.isArray(finalItinerary)) {
        return { 1: finalItinerary };
    }
    return finalItinerary || {};
};

const normalizeDayMeta = (dayMeta) => {
    if (!dayMeta || typeof dayMeta !== 'object') {
        return {};
    }
    return dayMeta;
};

const getSpotCoordinates = (spot) => {
    if (isValidCoordinate(spot?.geometry?.coordinates)) {
        return [Number(spot.geometry.coordinates[0]), Number(spot.geometry.coordinates[1])];
    }
    if (isValidCoordinate(spot?.coordinates)) {
        return [Number(spot.coordinates[0]), Number(spot.coordinates[1])];
    }
    return null;
};

const toGoogleLatLng = (coords) => `${Number(coords[1])},${Number(coords[0])}`;

const resolveDayStartCoordinates = ({ dayMetaEntry, hubCoordinates }) => {
    if (isValidCoordinate(dayMetaEntry?.startCoordinates)) {
        return dayMetaEntry.startCoordinates;
    }
    if (isValidCoordinate(hubCoordinates)) {
        return hubCoordinates;
    }
    return null;
};

const buildDayDirectionsUrl = ({ startCoordinates, dayStopCoordinates, travelMode = 'driving' }) => {
    if (!isValidCoordinate(startCoordinates)) {
        return {
            hasRoute: false,
            reason: 'Start coordinates unavailable'
        };
    }

    if (!Array.isArray(dayStopCoordinates) || dayStopCoordinates.length === 0) {
        return {
            hasRoute: false,
            reason: 'No valid day stops'
        };
    }

    const destinationCoords = dayStopCoordinates[dayStopCoordinates.length - 1];
    if (!isValidCoordinate(destinationCoords)) {
        return {
            hasRoute: false,
            reason: 'Destination coordinates unavailable'
        };
    }

    const origin = toGoogleLatLng(startCoordinates);
    const destination = toGoogleLatLng(destinationCoords);
    const waypointsCoords = dayStopCoordinates.slice(0, -1).filter(isValidCoordinate);
    const waypoints = waypointsCoords.map(toGoogleLatLng).join('|');

    const searchParams = new URLSearchParams({
        origin,
        destination,
        travelmode: travelMode
    });

    if (waypoints) {
        searchParams.set('waypoints', waypoints);
    }

    return {
        hasRoute: true,
        url: `${GOOGLE_DIRECTIONS_BASE_URL}&${searchParams.toString()}`
    };
};

export const generateDayGoogleDirectionsLinks = ({
    activeHub,
    finalItinerary,
    dayMeta,
    travelMode = 'driving'
} = {}) => {
    const itineraryDays = normalizeItineraryDays(finalItinerary);
    const dayMetaByDay = normalizeDayMeta(dayMeta);
    const dayNumbers = Object.keys(itineraryDays).sort((a, b) => Number(a) - Number(b));
    if (dayNumbers.length === 0) return {};

    const hubCoordinates = isValidCoordinate(activeHub?.coordinates) ? activeHub.coordinates : null;
    const linksByDay = {};

    dayNumbers.forEach((dayNumber) => {
        const spotsForDay = Array.isArray(itineraryDays[dayNumber]) ? itineraryDays[dayNumber] : [];
        const dayStopCoordinates = spotsForDay
            .map(getSpotCoordinates)
            .filter(isValidCoordinate);

        const dayMetaEntry = dayMetaByDay?.[dayNumber] || dayMetaByDay?.[Number(dayNumber)] || null;
        const dayStartCoordinates = resolveDayStartCoordinates({
            dayMetaEntry,
            hubCoordinates
        });

        const dayRoute = buildDayDirectionsUrl({
            startCoordinates: dayStartCoordinates,
            dayStopCoordinates,
            travelMode
        });

        linksByDay[String(dayNumber)] = dayRoute;
    });

    return linksByDay;
};
