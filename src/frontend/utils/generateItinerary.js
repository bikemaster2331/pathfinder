import { TRAVEL_HUBS } from '../constants/location';
import { calculateDistance, calculateTimeUsage } from './distance';
import { optimizeRoute } from './optimize';

// ─────────────────────────────────────────────────────────────────────────────
// ZONE DICTIONARY
//
// Catanduanes is a vertical island. Virac sits at the south.
// Traveling north means picking a corridor: the east coast road or the west.
// We respect that geography here.
//
// Zones are defined as named buckets of municipalities.
// The ZONE_PLANS object maps "how many days" → an ordered array of zones,
// where each zone is an array of municipality strings.
//
// Zone order matters — Day 1 is always the first zone (closest to hub),
// Day N is always the last (furthest). The proximity sort in Phase 3
// handles micro-ordering within each zone.
//
// Municipalities:
//   SOUTH  → Virac, San Andres, Bato
//   EAST   → Gigmoto, Caramoran
//   WEST   → Baras, San Miguel
//   NORTH  → Bagamanoc, Panganiban, Viga, Pandan
// ─────────────────────────────────────────────────────────────────────────────

const ALL_MUNICIPALITIES = [
    'Virac', 'San Andres', 'Bato',
    'Gigmoto', 'Caramoran',
    'Baras', 'San Miguel',
    'Bagamanoc', 'Panganiban', 'Viga', 'Pandan'
];

const ZONE_PLANS = {
    1: [
        // 1 day — everything is fair game, proximity sort wins
        ALL_MUNICIPALITIES
    ],
    2: [
        // South base camp
        ['Virac', 'San Andres', 'Bato', 'Baras', 'San Miguel'],
        // North push
        ['Gigmoto', 'Caramoran', 'Bagamanoc', 'Panganiban', 'Viga', 'Pandan'],
    ],
    3: [
        // Day 1 — Virac and immediate surroundings (easiest day, good warmup)
        ['Virac', 'San Andres'],
        // Day 2 — East corridor and southern inland
        ['Bato', 'Baras', 'San Miguel', 'Gigmoto', 'Caramoran'],
        // Day 3 — Full north run
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

// For trips longer than 7 days, reuse the 7-day plan.
// The capacity loop will distribute overflow into bonus days automatically.
const getZonePlan = (dayCount) => {
    const clampedDays = Math.min(dayCount, 7);
    return ZONE_PLANS[clampedDays] || ZONE_PLANS[7];
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY MATCHING
//
// The GeoJSON spot has a `category` field. We compare it against the
// user's selectedActivities object { Swimming: true, Hiking: false, ... }.
//
// Matching is case-insensitive and partial — "beach_swimming" still matches
// "Swimming".
// ─────────────────────────────────────────────────────────────────────────────

const matchesActivity = (spot, selectedActivities) => {
    const activeKeys = Object.entries(selectedActivities)
        .filter(([, v]) => v)
        .map(([k]) => k.toLowerCase());

    // If the user selected nothing, show everything
    if (activeKeys.length === 0) return true;

    // Check every possible field the GeoJSON might use for activity/category
    const fieldsToCheck = [
        spot.category,
        spot.type,
        spot.activity_type,
        spot.activities,
        spot.spot_type,
        spot.tags,
    ]
        .filter(Boolean)
        .map(v => (Array.isArray(v) ? v.join(' ') : String(v)).toLowerCase());

    // No category field at all — include it anyway, don't hide it
    if (fieldsToCheck.length === 0) return true;

    return activeKeys.some(key =>
        fieldsToCheck.some(field => field.includes(key))
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET MATCHING
//
// budgetFilter is the array already computed by Itinerary.jsx:
//   ['low']               → slider at 0–33
//   ['low', 'medium']     → slider at 34–66
//   ['low', 'medium', 'high'] → slider at 67–100
//
// Handles both word format ('low'/'medium'/'high') and
// peso-sign format ('\u20b1'/'\u20b1\u20b1'/'\u20b1\u20b1\u20b1') in the GeoJSON.
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
//
// Reads the raw GeoJSON FeatureCollection and returns a flat array of
// spot property objects that pass both the budget and activity gates.
// Each object gets the geometry attached directly for convenience.
// ─────────────────────────────────────────────────────────────────────────────

const filterSpotPool = (allSpots, budgetFilter, selectedActivities) => {
    if (!allSpots?.features?.length) {
        console.warn('[generateItinerary] allSpots is empty or not a FeatureCollection');
        return [];
    }

    // DEBUG: Log a sample spot so you can see the actual field names
    const sampleProps = allSpots.features[0]?.properties;
    console.log('[generateItinerary] Sample spot fields:', Object.keys(sampleProps || {}));
    console.log('[generateItinerary] Sample spot:', sampleProps);
    console.log('[generateItinerary] budgetFilter:', budgetFilter);
    console.log('[generateItinerary] selectedActivities:', selectedActivities);

    const filtered = allSpots.features
        .filter(feature => {
            const props = feature?.properties;
            const geom = feature?.geometry;
            if (!props || !geom?.coordinates) return false;
            // Reject spots with malformed coordinates (must be [lng, lat] with 2+ numbers)
            const coords = geom.coordinates;
            if (!Array.isArray(coords) || coords.length < 2 ||
                typeof coords[0] !== 'number' || typeof coords[1] !== 'number' ||
                isNaN(coords[0]) || isNaN(coords[1])) return false;

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
//
// Assigns each filtered spot to a zone bucket based on its municipality.
// Spots with an unrecognised municipality fall into a catch-all overflow
// bucket and get appended to the last zone.
// ─────────────────────────────────────────────────────────────────────────────

const clusterByZone = (filteredSpots, zonePlan) => {
    // Build a lookup: municipality → zone index
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

    // Append unrecognised municipalities to the last zone
    if (overflow.length > 0) {
        buckets[buckets.length - 1].push(...overflow);
    }

    return buckets; // Array of arrays, index = zone/day index
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: PROXIMITY SORT
//
// Within a zone bucket, sort spots by straight-line distance from the hub.
// This gives the capacity loop a greedy-friendly ordering — closest first —
// so we fill the day with the most accessible spots before hitting the limit.
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
//
// The hard 540-minute (9-hour) daily gate.
//
// We iterate the proximity-sorted bucket and push spots one at a time,
// calling calculateTimeUsage after each push. The moment adding a spot
// would breach 540 minutes, we stop — that spot and everything after it
// is discarded from this day.
//
// This runs BEFORE optimizeRoute() so we never optimise spots we're
// about to throw away. A list that passes the time gate in linear order
// is guaranteed to pass it after route optimisation shortens drive times.
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_CAPACITY_MINUTES = 540; // 9-hour day

const fillDayToCapacity = (sortedSpots, hub) => {
    const accepted = [];

    for (const spot of sortedSpots) {
        const candidate = [...accepted, spot];
        const { totalUsed } = calculateTimeUsage(hub, candidate);

        if (totalUsed <= DAILY_CAPACITY_MINUTES) {
            accepted.push(spot);
        }
        // If this spot doesn't fit, skip it but keep trying the next ones.
        // A short spot later in the list might still slip in.
    }

    return accepted;
};

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5: ROUTE OPTIMISATION
//
// Now that each day holds a small, capacity-validated list, it is safe to
// run the TSP solver. optimizeRoute() uses brute-force permutations for
// lists < 10 spots (10! = 3.6 million — manageable) and falls back to
// the greedy nearest-neighbour for larger lists.
//
// Typical day arrays after Phase 4 will be 3–7 spots, well inside the
// brute-force safe zone.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
//
// generateItinerary({
//   hub,                // hub object from TRAVEL_HUBS { name, coordinates }
//   dayCount,           // integer, 1–7+
//   budgetFilter,       // string[], e.g. ['low', 'medium']
//   selectedActivities, // { Swimming: true, Hiking: false, ... }
//   allSpots,           // raw GeoJSON FeatureCollection
// })
//
// Returns: { 1: spot[], 2: spot[], ... }  (keyed by 1-based day number)
//
// This object is ready to be injected directly into:
//   setStoredDays({ ...result })
//   setAddedSpots(result[1])
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

    // ── Phase 1: Filter ────────────────────────────────────────────────────
    const pool = filterSpotPool(allSpots, budgetFilter, selectedActivities);

    if (pool.length === 0) {
        console.warn('[generateItinerary] No spots match the current filters.');
        return {};
    }

    // ── Phase 2: Zone clustering ───────────────────────────────────────────
    const zonePlan = getZonePlan(dayCount);
    const zoneBuckets = clusterByZone(pool, zonePlan);

    // ── Phases 3–5: Per-zone processing ────────────────────────────────────
    //
    // We collect all non-empty processed zones first, then distribute them
    // across the requested dayCount. If we have more days than zones with
    // spots, the extra days are padded with [] so the UI never shows a
    // mysteriously missing day. If we have fewer days than zones, we merge
    // the overflow back into the last zone's bucket via a catch-all pass.
    // ──────────────────────────────────────────────────────────────────────

    const filledZones = []; // each entry = optimised spot array for one zone

    zoneBuckets.forEach((bucket) => {
        if (bucket.length === 0) return;

        // Phase 3: Proximity sort
        const sorted = sortByProximity(bucket, hub.coordinates);

        // Phase 4: Capacity fill (trim to ≤ 540 min)
        const trimmed = fillDayToCapacity(sorted, hub);

        if (trimmed.length === 0) return;

        // Phase 5: Route optimise the survivors
        const optimised = optimizeRoute(hub, trimmed);

        filledZones.push(optimised);
    });

    if (filledZones.length === 0) {
        console.warn('[generateItinerary] Filters produced no valid day plans.');
        return {};
    }

    // Distribute filled zones into day slots.
    // If we have MORE zones than days, merge the tail zones into the last day
    // (they were already capacity-trimmed so this is safe).
    // If we have FEWER zones than days, pad the remaining days with [].
    const result = {};

    if (filledZones.length <= dayCount) {
        // Assign each zone to its own day
        filledZones.forEach((spots, i) => {
            result[i + 1] = spots;
        });
        // Pad remaining days with empty arrays
        for (let d = filledZones.length + 1; d <= dayCount; d++) {
            result[d] = [];
        }
    } else {
        // More zones than days — assign first (dayCount-1) zones normally,
        // merge everything else into the last day and re-capacity-check
        for (let d = 1; d < dayCount; d++) {
            result[d] = filledZones[d - 1];
        }
        // Merge remaining zones into one pool and re-fill for the last day
        const overflow = filledZones.slice(dayCount - 1).flat();
        const sorted = sortByProximity(overflow, hub.coordinates);
        const trimmed = fillDayToCapacity(sorted, hub);
        result[dayCount] = optimizeRoute(hub, trimmed);
    }

    console.log('[generateItinerary] Final result days:', Object.keys(result).map(d => `Day ${d}: ${result[d].length} spots`));

    return result;
};