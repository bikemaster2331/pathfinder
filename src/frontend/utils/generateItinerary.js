import { calculateDistance, calculateTimeUsage, estimateDriveMinutes } from './distance';
import { optimizeRoute } from './optimize';

// Itinerary generation logic for day-by-day trip planning.

const ALL_MUNICIPALITIES = [
    'Virac', 'San Andres', 'Bato',
    'Gigmoto', 'Caramoran',
    'Baras', 'San Miguel',
    'Bagamanoc', 'Panganiban', 'Viga', 'Pandan'
];

const ZONE_PLANS = {
    1: [ALL_MUNICIPALITIES],
    2: [
        ['Virac', 'San Andres', 'Bato', 'Baras', 'San Miguel'],
        ['Gigmoto', 'Caramoran', 'Bagamanoc', 'Panganiban', 'Viga', 'Pandan'],
    ],
    3: [
        ['Virac', 'San Andres'],
        ['Bato', 'Baras', 'San Miguel', 'Gigmoto', 'Caramoran'],
        ['Bagamanoc', 'Panganiban', 'Viga', 'Pandan'],
    ],
    4: [
        ['Virac', 'San Andres'],
        ['Bato', 'Baras', 'San Miguel'],
        ['Gigmoto', 'Caramoran'],
        ['Bagamanoc', 'Panganiban', 'Viga', 'Pandan'],
    ],
    5: [
        ['Virac'],
        ['San Andres', 'Bato'],
        ['Baras', 'San Miguel'],
        ['Gigmoto', 'Caramoran'],
        ['Bagamanoc', 'Panganiban', 'Viga', 'Pandan'],
    ],
    6: [
        ['Virac'],
        ['San Andres', 'Bato'],
        ['Baras', 'San Miguel'],
        ['Gigmoto', 'Caramoran'],
        ['Bagamanoc', 'Panganiban'],
        ['Viga', 'Pandan'],
    ],
    7: [
        ['Virac'],
        ['San Andres'],
        ['Bato', 'Baras'],
        ['San Miguel'],
        ['Gigmoto', 'Caramoran'],
        ['Bagamanoc', 'Panganiban'],
        ['Viga', 'Pandan'],
    ],
};

const getZonePlan = (dayCount) => {
    const clampedDays = Math.min(dayCount, 7);
    return ZONE_PLANS[clampedDays] || ZONE_PLANS[7];
};

// FILTER LABEL -> CATEGORY MAPPING
export const FILTER_LABELS = {
    Water: ['beach', 'swimming', 'falls', 'beach_resort'],
    Outdoor: ['hike', 'nature'],
    Views: ['viewpoint'],
    Heritage: ['religious', 'history', 'culture', 'indoor'],
    Dining: ['food'],
    Stay: ['accommodation', 'beach_resort'],
};

const VALID_CATEGORIES = new Set(Object.values(FILTER_LABELS).flat());

const isValidSpot = (spot) => {
    const cat = String(spot.category || '').toLowerCase().trim();
    return VALID_CATEGORIES.has(cat);
};

// CATEGORY PRIORITY SYSTEM
const CATEGORY_PRIORITY = {
    beach: 1,
    swimming: 1,
    falls: 1,
    hike: 1,
    nature: 1,

    viewpoint: 2,
    beach_resort: 2,
    religious: 2,
    history: 2,
    culture: 2,
    indoor: 2,

    food: 3,

    accommodation: 4,
};

// Caps applied per day when mixed trip mode is active (3+ filters).
const MIXED_TRIP_CAPS = {
    food: 2,
    accommodation: 1,
    beach_resort: 1,
};

const getCategoryPriority = (spot) => {
    const cat = String(spot.category || '').toLowerCase().trim();
    return CATEGORY_PRIORITY[cat] ?? 2;
};

const sortByPriority = (spots) => {
    return [...spots].sort((a, b) => getCategoryPriority(a) - getCategoryPriority(b));
};

const capByCategory = (spots) => {
    const counts = {};
    return spots.filter((spot) => {
        const cat = String(spot.category || '').toLowerCase().trim();
        const cap = MIXED_TRIP_CAPS[cat];

        if (cap === 0) return false;

        if (cap !== undefined) {
            counts[cat] = (counts[cat] || 0) + 1;
            return counts[cat] <= cap;
        }

        return true;
    });
};

// CAP DECISION
const TOTAL_FILTER_COUNT = Object.keys(FILTER_LABELS).length;
const SPECIFIC_SEARCH_MAX = 2;

const shouldApplyCap = (selectedActivities) => {
    const activeCount = Object.values(selectedActivities).filter(Boolean).length;
    if (activeCount === 0 || activeCount >= TOTAL_FILTER_COUNT) return true;
    return activeCount > SPECIFIC_SEARCH_MAX;
};

// ACTIVITY MATCHING
const matchesActivity = (spot, selectedActivities) => {
    const activeLabels = Object.entries(selectedActivities)
        .filter(([, enabled]) => enabled)
        .map(([label]) => label);

    if (activeLabels.length === 0 || activeLabels.length >= TOTAL_FILTER_COUNT) {
        return true;
    }

    const activeCats = new Set(activeLabels.flatMap((label) => FILTER_LABELS[label] ?? []));
    const cat = String(spot.category || '').toLowerCase().trim();
    return activeCats.has(cat);
};

// BUDGET MATCHING
const normalizeBudget = (raw) => {
    const s = String(raw || '').toLowerCase().trim();
    if (s.includes('high') || s === '\u20b1\u20b1\u20b1') return 'high';
    if (s.includes('medium') || s.includes('mid') || s === '\u20b1\u20b1') return 'medium';
    return 'low';
};

const matchesBudget = (spot, budgetFilter) => {
    const normalized = normalizeBudget(spot.min_budget);
    return budgetFilter.includes(normalized);
};

// PHASE 1: FILTER
const filterSpotPool = (allSpots, budgetFilter, selectedActivities) => {
    if (!allSpots?.features?.length) {
        console.warn('[generateItinerary] allSpots is empty or not a FeatureCollection');
        return [];
    }

    const filtered = allSpots.features
        .filter((feature) => {
            const props = feature?.properties;
            const geom = feature?.geometry;
            if (!props || !geom?.coordinates) return false;

            const coords = geom.coordinates;
            const validCoords = (
                Array.isArray(coords) &&
                coords.length >= 2 &&
                typeof coords[0] === 'number' &&
                typeof coords[1] === 'number' &&
                !isNaN(coords[0]) &&
                !isNaN(coords[1])
            );
            if (!validCoords) return false;

            if (!isValidSpot(props)) return false;

            return (
                matchesBudget(props, budgetFilter) &&
                matchesActivity(props, selectedActivities)
            );
        })
        .map((feature) => ({
            ...feature.properties,
            geometry: feature.geometry,
        }));

    console.log(`[generateItinerary] Phase 1 pool: ${filtered.length} / ${allSpots.features.length} spots passed filters`);
    return filtered;
};

// PHASE 2: ZONE CLUSTERING
const clusterByZone = (filteredSpots, zonePlan) => {
    const municipalityToZone = {};
    zonePlan.forEach((municipalities, zoneIdx) => {
        municipalities.forEach((m) => {
            municipalityToZone[m.toLowerCase()] = zoneIdx;
        });
    });

    const buckets = zonePlan.map(() => []);
    const overflow = [];

    filteredSpots.forEach((spot) => {
        const muni = String(spot.municipality || '').toLowerCase();
        const zoneIdx = municipalityToZone[muni];

        if (zoneIdx !== undefined) {
            buckets[zoneIdx].push(spot);
        } else {
            overflow.push(spot);
        }
    });

    if (overflow.length > 0) {
        buckets[buckets.length - 1].push(...overflow);
    }

    return buckets;
};

// PHASE 3: PROXIMITY SORT
const sortByProximity = (spots, startCoordinates) => {
    const isValidCoord = (c) => (
        Array.isArray(c) &&
        c.length >= 2 &&
        typeof c[0] === 'number' &&
        typeof c[1] === 'number' &&
        !isNaN(c[0]) &&
        !isNaN(c[1])
    );

    return [...spots]
        .filter((s) => isValidCoord(s?.geometry?.coordinates))
        .sort((a, b) => {
            const distA = calculateDistance(startCoordinates, a.geometry.coordinates);
            const distB = calculateDistance(startCoordinates, b.geometry.coordinates);
            return distA - distB;
        });
};

// PHASE 4: SLOT-AWARE DAY BUILDING
const DAILY_CAPACITY_MINUTES = 540;
const SLOT_PLAN = [
    { name: 'morning', minutes: 150 },
    { name: 'midday', minutes: 120 },
    { name: 'afternoon', minutes: 150 },
    { name: 'evening', minutes: 120 },
];
const STAY_CATEGORIES = new Set(['accommodation', 'beach_resort']);
const CATEGORY_VISIT_FALLBACK = {
    accommodation: 45,
    beach_resort: 60,
    food: 75,
    beach: 120,
    swimming: 90,
    hike: 110,
    falls: 95,
    nature: 90,
    viewpoint: 70,
    religious: 45,
    history: 55,
    culture: 60,
    indoor: 60,
    shopping: 50,
    transport: 20,
};

const getVisitMinutes = (spot) => {
    const raw = Number(spot?.visit_time_minutes);
    if (Number.isFinite(raw) && raw > 0) {
        return Math.max(15, Math.min(240, Math.round(raw)));
    }

    const category = String(spot?.category || '').toLowerCase().trim();
    const fallback = CATEGORY_VISIT_FALLBACK[category] ?? 60;
    return fallback;
};

const getDriveMinutesBetween = (fromCoordinates, toCoordinates) => {
    const km = calculateDistance(fromCoordinates, toCoordinates);
    return estimateDriveMinutes(km);
};

const estimateIncrementMinutes = (fromCoordinates, spot) => {
    return getDriveMinutesBetween(fromCoordinates, spot.geometry.coordinates) + getVisitMinutes(spot);
};

const normalizeDaypartTag = (bestTimeOfDay) => {
    const raw = String(bestTimeOfDay || '').toLowerCase().trim();

    if (!raw || raw === 'any') return 'any';

    if (raw.includes('night') || raw.includes('evening') || raw.includes('dinner') || raw.includes('sunset')) {
        return 'evening';
    }
    if (raw.includes('afternoon')) return 'afternoon';
    if (raw.includes('midday') || raw.includes('noon') || raw.includes('lunch')) return 'midday';
    if (raw.includes('morning') || raw.includes('sunrise') || raw.includes('breakfast')) return 'morning';

    return 'any';
};

const isSlotCompatible = (slotName, daypartTag) => {
    // Hard rule: evening tags must only appear in evening slot.
    if (daypartTag === 'evening') return slotName === 'evening';
    return true;
};

const slotPenalty = (slotName, daypartTag) => {
    if (daypartTag === 'any') {
        if (slotName === 'morning') return 8;
        if (slotName === 'evening') return 12;
        return 0;
    }

    const matrix = {
        morning: { morning: 0, midday: 14, afternoon: 28, evening: 65 },
        midday: { morning: 18, midday: 0, afternoon: 12, evening: 48 },
        afternoon: { morning: 30, midday: 10, afternoon: 0, evening: 26 },
        evening: { morning: 70, midday: 52, afternoon: 26, evening: 0 },
    };

    return matrix[daypartTag]?.[slotName] ?? 0;
};

const pickOvernightAnchor = (daySpots) => {
    if (!Array.isArray(daySpots) || daySpots.length === 0) return null;

    const fromEnd = [...daySpots].reverse();
    const staySpot = fromEnd.find((spot) => {
        const cat = String(spot?.category || '').toLowerCase().trim();
        return STAY_CATEGORIES.has(cat);
    });

    const anchor = staySpot || daySpots[daySpots.length - 1];
    return {
        coordinates: anchor.geometry.coordinates,
        label: anchor.name || 'Overnight stop',
    };
};

const pickBestCandidateForSlot = ({
    slotName,
    slotRemainingMinutes,
    dayRemainingMinutes,
    currentCoordinates,
    primaryPool,
    secondaryPool,
    selectedNames,
}) => {
    const rankForSlot = (spot, isPrimary) => {
        const daypartTag = normalizeDaypartTag(spot.best_time_of_day);
        const distanceWeight = calculateDistance(currentCoordinates, spot.geometry.coordinates);
        const priorityWeight = getCategoryPriority(spot) * 9;
        const daypartWeight = slotPenalty(slotName, daypartTag);
        const primaryBoost = isPrimary ? -4 : 0;
        return (distanceWeight * 3.5) + priorityWeight + daypartWeight + primaryBoost;
    };

    const classifyAndSort = (pool, isPrimary) => {
        return pool
            .filter((spot) => {
                if (!spot?.name || selectedNames.has(spot.name)) return false;
                const daypartTag = normalizeDaypartTag(spot.best_time_of_day);
                return isSlotCompatible(slotName, daypartTag);
            })
            .sort((a, b) => rankForSlot(a, isPrimary) - rankForSlot(b, isPrimary));
    };

    const ranked = [
        ...classifyAndSort(primaryPool, true),
        ...classifyAndSort(secondaryPool, false),
    ];

    for (const candidate of ranked) {
        const incrementMinutes = estimateIncrementMinutes(currentCoordinates, candidate);
        if (incrementMinutes <= slotRemainingMinutes && incrementMinutes <= dayRemainingMinutes) {
            return candidate;
        }
    }

    return null;
};

const buildDayFromSlotPlan = ({
    hub,
    dayStartCoordinates,
    primaryPool,
    secondaryPool,
    usedNames,
}) => {
    const selected = [];
    const selectedNames = new Set();
    let currentCoordinates = dayStartCoordinates;
    let totalUsedMinutes = 0;

    SLOT_PLAN.forEach((slot) => {
        let slotUsedMinutes = 0;
        let guard = 0;

        while (guard < 256) {
            guard += 1;
            const bestCandidate = pickBestCandidateForSlot({
                slotName: slot.name,
                slotRemainingMinutes: slot.minutes - slotUsedMinutes,
                dayRemainingMinutes: DAILY_CAPACITY_MINUTES - totalUsedMinutes,
                currentCoordinates,
                primaryPool,
                secondaryPool,
                selectedNames,
            });

            if (!bestCandidate) break;

            const incrementMinutes = estimateIncrementMinutes(currentCoordinates, bestCandidate);
            if (incrementMinutes <= 0) break;

            selected.push(bestCandidate);
            selectedNames.add(bestCandidate.name);
            usedNames.add(bestCandidate.name);

            currentCoordinates = bestCandidate.geometry.coordinates;
            slotUsedMinutes += incrementMinutes;
            totalUsedMinutes += incrementMinutes;

            if (totalUsedMinutes >= DAILY_CAPACITY_MINUTES) break;
        }
    });

    const optimised = selected.length > 0
        ? optimizeRoute(hub, selected, { startCoordinates: dayStartCoordinates })
        : [];

    // Defensive trim if route reordering exceeds capacity.
    while (optimised.length > 0) {
        const usage = calculateTimeUsage(hub, optimised, {
            startCoordinates: dayStartCoordinates,
            includeReturnLeg: false,
        });

        if (usage.totalUsed <= DAILY_CAPACITY_MINUTES) break;

        const removed = optimised.pop();
        if (removed?.name) usedNames.delete(removed.name);
    }

    return optimised;
};

// MAIN EXPORT
export const generateItinerary = ({
    hub,
    dayCount,
    budgetFilter,
    selectedActivities,
    allSpots,
}) => {
    console.log('[generateItinerary] Called with:', {
        hub: hub?.name,
        dayCount,
        budgetFilter,
        selectedActivities,
        totalFeatures: allSpots?.features?.length ?? 'NO DATA'
    });

    if (!hub?.coordinates) {
        console.error('[generateItinerary] No hub provided');
        return {};
    }
    if (!allSpots) {
        console.error('[generateItinerary] allSpots is null - GeoJSON not loaded yet');
        return {};
    }
    if (dayCount < 1) {
        console.error('[generateItinerary] dayCount < 1');
        return {};
    }

    const capActive = shouldApplyCap(selectedActivities);
    console.log(`[generateItinerary] Cap mode: ${capActive ? 'ON (mixed trip)' : 'OFF (specific search)'}`);

    const pool = filterSpotPool(allSpots, budgetFilter, selectedActivities);
    if (pool.length === 0) {
        console.warn('[generateItinerary] No spots match the current filters.');
        return {};
    }

    const generatePool = capActive
        ? pool.filter((spot) => {
            const cat = String(spot.category || '').toLowerCase().trim();
            return MIXED_TRIP_CAPS[cat] !== 0;
        })
        : pool;

    if (generatePool.length === 0) {
        console.warn('[generateItinerary] No generatable spots after applying cap mode.');
        return {};
    }

    // Keep zone logic, then build slot-aware days with rolling start context.
    const zonePlan = getZonePlan(dayCount);
    const zoneBuckets = clusterByZone(generatePool, zonePlan);
    const zoneCandidates = zoneBuckets.map((bucket) => {
        if (bucket.length === 0) return [];
        const proximitySorted = sortByProximity(bucket, hub.coordinates);
        const prioritized = sortByPriority(proximitySorted);
        return capActive ? capByCategory(prioritized) : prioritized;
    });

    const dayPreferredPools = {};
    for (let day = 1; day <= dayCount; day++) {
        dayPreferredPools[day] = [];
    }

    if (zoneCandidates.length <= dayCount) {
        zoneCandidates.forEach((spots, index) => {
            dayPreferredPools[index + 1] = spots;
        });
    } else {
        for (let day = 1; day < dayCount; day++) {
            dayPreferredPools[day] = zoneCandidates[day - 1] || [];
        }
        dayPreferredPools[dayCount] = zoneCandidates.slice(dayCount - 1).flat();
    }

    const allCandidates = sortByPriority(sortByProximity(generatePool, hub.coordinates));
    const usedNames = new Set();
    const days = {};
    const dayMeta = {};

    let previousOvernightCoordinates = hub.coordinates;
    let previousOvernightLabel = hub.name || 'Selected hub';

    for (let day = 1; day <= dayCount; day++) {
        const isDayOne = day === 1;
        const dayStartCoordinates = isDayOne
            ? hub.coordinates
            : (previousOvernightCoordinates || hub.coordinates);
        const dayStartLabel = isDayOne
            ? (hub.name || 'Selected hub')
            : (previousOvernightLabel || `End of Day ${day - 1}`);

        const primaryPool = sortByProximity(
            (dayPreferredPools[day] || []).filter((spot) => !usedNames.has(spot.name)),
            dayStartCoordinates
        );
        const primaryNames = new Set(primaryPool.map((spot) => spot.name));
        const secondaryPool = sortByProximity(
            allCandidates.filter((spot) => !usedNames.has(spot.name) && !primaryNames.has(spot.name)),
            dayStartCoordinates
        );

        const selectedSpots = buildDayFromSlotPlan({
            hub,
            dayStartCoordinates,
            primaryPool,
            secondaryPool,
            usedNames,
        });
        days[day] = selectedSpots;

        const overnight = pickOvernightAnchor(selectedSpots) || {
            coordinates: dayStartCoordinates,
            label: dayStartLabel,
        };
        const endCoordinates = selectedSpots.length > 0
            ? selectedSpots[selectedSpots.length - 1].geometry.coordinates
            : dayStartCoordinates;

        dayMeta[day] = {
            startCoordinates: dayStartCoordinates,
            startLabel: dayStartLabel,
            overnightCoordinates: overnight.coordinates,
            overnightLabel: overnight.label,
            endCoordinates,
        };

        previousOvernightCoordinates = overnight.coordinates;
        previousOvernightLabel = overnight.label;
    }

    console.log('[generateItinerary] Final result:', Object.keys(days).map((d) => `Day ${d}: ${days[d].length} spots`));

    return { days, dayMeta };
};
