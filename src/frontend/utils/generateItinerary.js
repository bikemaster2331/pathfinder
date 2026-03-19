import { TRAVEL_HUBS } from '../constants/location';
import { calculateDistance, calculateTimeUsage } from './distance';
import { optimizeRoute } from './optimize';

// HELLO GUYS, this contains the logic for itinerary generation

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

// ─────────────────────────────────────────────────────────────────────────────
// FILTER LABEL → CATEGORY MAPPING
//
//   Water     → beach, swimming, falls
//   Outdoor   → hike, nature
//   Views     → viewpoint
//   Heritage  → religious, history, culture, indoor
//   Dining    → food
//   Stay      → accommodation
//
// This is the single source of truth. UI labels must match these keys.
// ─────────────────────────────────────────────────────────────────────────────

export const FILTER_LABELS = {
    Water: ['beach', 'swimming', 'falls'],
    Outdoor: ['hike', 'nature'],
    Views: ['viewpoint'],
    Heritage: ['religious', 'history', 'culture', 'indoor'],
    Dining: ['food'],
    Stay: ['accommodation'],
};

const VALID_CATEGORIES = new Set(Object.values(FILTER_LABELS).flat());

const isValidSpot = (spot) => {
    const cat = String(spot.category || '').toLowerCase().trim();
    return VALID_CATEGORIES.has(cat);
};

const CATEGORY_TO_FILTER = {};
Object.entries(FILTER_LABELS).forEach(([label, cats]) => {
    cats.forEach(cat => { CATEGORY_TO_FILTER[cat] = label; });
});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY PRIORITY SYSTEM
//
// Tier 1 (1) — Core attractions: fill the day with these first
// Tier 2 (2) — Cultural filler: good to include, not the main draw
// Tier 3 (3) — Support spots: capped per day when mixed trip
// Tier 4 (4) — Low priority: capped aggressively when mixed trip
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_PRIORITY = {
    // Tier 1 — Water + Outdoor
    beach: 1,
    swimming: 1,
    falls: 1,
    hike: 1,
    nature: 1,

    // Tier 2 — Views + Heritage
    viewpoint: 2,
    religious: 2,
    history: 2,
    culture: 2,
    indoor: 2,

    // Tier 3 — Dining
    food: 3,

    // Tier 4 — Stay
    accommodation: 4,
};

// Caps applied PER DAY when mixed trip mode is active (3+ filters).
// These are ignored entirely when specific search mode is active (1–2 filters).
const MIXED_TRIP_CAPS = {
    food: 2,   // max 2 food stops per day
    accommodation: 1,   // excluded from mixed itineraries entirely
};

const getCategoryPriority = (spot) => {
    const cat = String(spot.category || '').toLowerCase().trim();
    return CATEGORY_PRIORITY[cat] ?? 2;
};

const sortByPriority = (spots) => {
    return [...spots].sort((a, b) => getCategoryPriority(a) - getCategoryPriority(b));
};

// Only called during mixed trips (3+ filters active)
const capByCategory = (spots) => {
    const counts = {};
    return spots.filter(spot => {
        const cat = String(spot.category || '').toLowerCase().trim();
        const cap = MIXED_TRIP_CAPS[cat];

        // Hard exclude for mixed trips (accommodation = 0)
        if (cap === 0) return false;

        // Soft cap (food ≤ 2/day)
        if (cap !== undefined) {
            counts[cat] = (counts[cat] || 0) + 1;
            return counts[cat] <= cap;
        }

        return true;
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// CAP DECISION
//
// 1–2 filters active → specific intent
//   e.g. Stay only    → hotel trip   → all accommodation flows through
//   e.g. Dining only  → food trip    → all food flows through
//   → NO cap applied
//
// 0 or 3–6 filters   → mixed / general trip
//   → cap applied → attractions dominate, food ≤ 2/day, accommodation excluded
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_FILTER_COUNT = Object.keys(FILTER_LABELS).length;
const SPECIFIC_SEARCH_MAX = 2;

const shouldApplyCap = (selectedActivities) => {
    const activeCount = Object.values(selectedActivities).filter(Boolean).length;
    // Nothing or everything selected = general trip = cap on
    if (activeCount === 0 || activeCount >= TOTAL_FILTER_COUNT) return true;
    // 1 or 2 filters = specific intent = no cap
    return activeCount > SPECIFIC_SEARCH_MAX;
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY MATCHING
//
// Expands filter labels into raw category sets before matching.
// Nothing selected OR all selected → pass all valid spots.
// ─────────────────────────────────────────────────────────────────────────────

const matchesActivity = (spot, selectedActivities) => {
    const activeLabels = Object.entries(selectedActivities)
        .filter(([, v]) => v)
        .map(([k]) => k);

    // Nothing selected OR everything selected → no preference → pass all
    if (activeLabels.length === 0 || activeLabels.length >= TOTAL_FILTER_COUNT) {
        return true;
    }

    // Expand labels → raw category set
    const activeCats = new Set(
        activeLabels.flatMap(label => FILTER_LABELS[label] ?? [])
    );

    const cat = String(spot.category || '').toLowerCase().trim();
    return activeCats.has(cat);
};

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET MATCHING
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: FILTER
// ─────────────────────────────────────────────────────────────────────────────

const filterSpotPool = (allSpots, budgetFilter, selectedActivities) => {
    if (!allSpots?.features?.length) {
        console.warn('[generateItinerary] allSpots is empty or not a FeatureCollection');
        return [];
    }

    const filtered = allSpots.features
        .filter(feature => {
            const props = feature?.properties;
            const geom = feature?.geometry;
            if (!props || !geom?.coordinates) return false;

            const coords = geom.coordinates;
            if (
                !Array.isArray(coords) || coords.length < 2 ||
                typeof coords[0] !== 'number' || typeof coords[1] !== 'number' ||
                isNaN(coords[0]) || isNaN(coords[1])
            ) return false;

            // Hard exclude boundary polygons and uncategorized admin data
            if (!isValidSpot(props)) return false;

            return (
                matchesBudget(props, budgetFilter) &&
                matchesActivity(props, selectedActivities)
            );
        })
        .map(feature => ({
            ...feature.properties,
            geometry: feature.geometry,
        }));

    console.log(`[generateItinerary] Phase 1 pool: ${filtered.length} / ${allSpots.features.length} spots passed filters`);
    return filtered;
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: ZONE CLUSTERING
// ─────────────────────────────────────────────────────────────────────────────

const clusterByZone = (filteredSpots, zonePlan) => {
    const municipalityToZone = {};
    zonePlan.forEach((municipalities, zoneIdx) => {
        municipalities.forEach(m => {
            municipalityToZone[m.toLowerCase()] = zoneIdx;
        });
    });

    const buckets = zonePlan.map(() => []);
    const overflow = [];

    filteredSpots.forEach(spot => {
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

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: PROXIMITY SORT
// ─────────────────────────────────────────────────────────────────────────────

const sortByProximity = (spots, hubCoordinates) => {
    const isValidCoord = (c) =>
        Array.isArray(c) && c.length >= 2 &&
        typeof c[0] === 'number' && typeof c[1] === 'number' &&
        !isNaN(c[0]) && !isNaN(c[1]);

    return [...spots]
        .filter(s => isValidCoord(s?.geometry?.coordinates))
        .sort((a, b) => {
            const distA = calculateDistance(hubCoordinates, a.geometry.coordinates);
            const distB = calculateDistance(hubCoordinates, b.geometry.coordinates);
            return distA - distB;
        });
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: CAPACITY FILL
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_CAPACITY_MINUTES = 540;

const fillDayToCapacity = (sortedSpots, hub) => {
    const accepted = [];

    for (const spot of sortedSpots) {
        const candidate = [...accepted, spot];
        const { totalUsed } = calculateTimeUsage(hub, candidate);

        if (totalUsed <= DAILY_CAPACITY_MINUTES) {
            accepted.push(spot);
        }
    }

    return accepted;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

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

    if (!hub) { console.error('[generateItinerary] No hub provided'); return {}; }
    if (!allSpots) { console.error('[generateItinerary] allSpots is null — GeoJSON not loaded yet'); return {}; }
    if (dayCount < 1) { console.error('[generateItinerary] dayCount < 1'); return {}; }

    // ── Decide cap mode ────────────────────────────────────────────────────
    // 1–2 filters = specific search = no cap (hotel trip, food trip, etc.)
    // 0 or 3–6   = mixed/general   = cap on (attractions dominate)
    const capActive = shouldApplyCap(selectedActivities);
    console.log(`[generateItinerary] Cap mode: ${capActive ? 'ON (mixed trip)' : 'OFF (specific search)'}`);

    // ── Phase 1: Filter ────────────────────────────────────────────────────
    const pool = filterSpotPool(allSpots, budgetFilter, selectedActivities);

    if (pool.length === 0) {
        console.warn('[generateItinerary] No spots match the current filters.');
        return {};
    }

    // ── Build generate pool ────────────────────────────────────────────────
    // Specific search (cap OFF) → everything passes including accommodation
    // Mixed trip    (cap ON)  → strip accommodation before routing
    const generatePool = capActive
        ? pool.filter(spot => {
            const cat = String(spot.category || '').toLowerCase().trim();
            return MIXED_TRIP_CAPS[cat] !== 0;
        })
        : pool;

    if (generatePool.length === 0) {
        console.warn('[generateItinerary] No generatable spots after applying cap mode.');
        return {};
    }

    // ── Phase 2: Zone clustering ───────────────────────────────────────────
    const zonePlan = getZonePlan(dayCount);
    const zoneBuckets = clusterByZone(generatePool, zonePlan);

    // ── Phases 3–5: Per-zone processing ────────────────────────────────────
    const filledZones = [];

    zoneBuckets.forEach((bucket) => {
        if (bucket.length === 0) return;

        // Phase 3a: Proximity sort
        const proximitySorted = sortByProximity(bucket, hub.coordinates);

        // Phase 3b: Priority sort — Tier 1 first, Stay last
        const prioritized = sortByPriority(proximitySorted);

        // Phase 3c: Cap only on mixed trips
        const capped = capActive ? capByCategory(prioritized) : prioritized;

        if (capped.length === 0) return;

        // Phase 4: Capacity fill (≤ 540 min)
        const trimmed = fillDayToCapacity(capped, hub);

        if (trimmed.length === 0) return;

        // Phase 5: Route optimise
        const optimised = optimizeRoute(hub, trimmed);

        filledZones.push(optimised);

        console.log(`[generateItinerary] Zone — ${optimised.length} spots | ${optimised.map(s => `${s.name} (${CATEGORY_TO_FILTER[s.category] ?? s.category})`).join(', ')}`);
    });

    if (filledZones.length === 0) {
        console.warn('[generateItinerary] Filters produced no valid day plans.');
        return {};
    }

    // ── Distribute zones into day slots ────────────────────────────────────
    const result = {};

    if (filledZones.length <= dayCount) {
        filledZones.forEach((spots, i) => { result[i + 1] = spots; });
        for (let d = filledZones.length + 1; d <= dayCount; d++) { result[d] = []; }
    } else {
        for (let d = 1; d < dayCount; d++) { result[d] = filledZones[d - 1]; }
        const overflow = filledZones.slice(dayCount - 1).flat();
        const sorted = sortByProximity(overflow, hub.coordinates);
        const prioritized = sortByPriority(sorted);
        const capped = capActive ? capByCategory(prioritized) : prioritized;
        const trimmed = fillDayToCapacity(capped, hub);
        result[dayCount] = optimizeRoute(hub, trimmed);
    }

    console.log('[generateItinerary] Final result:', Object.keys(result).map(d => `Day ${d}: ${result[d].length} spots`));

    return result;
};