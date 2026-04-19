import { calculateDistance } from './distance';

const isValidCoordinates = (coordinates) => {
    return (
        Array.isArray(coordinates) &&
        coordinates.length >= 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number' &&
        !isNaN(coordinates[0]) &&
        !isNaN(coordinates[1])
    );
};

const resolveStartCoordinates = (hub, options = {}) => {
    if (isValidCoordinates(options.startCoordinates)) {
        return options.startCoordinates;
    }
    return isValidCoordinates(hub?.coordinates) ? hub.coordinates : null;
};

const getTimeBucket = (spot) => {
    const raw = String(spot?.best_time_of_day || '').toLowerCase().trim();

    if (!raw || raw === 'any') return 'daytime';

    if (
        raw.includes('morning') ||
        raw.includes('sunrise') ||
        raw.includes('breakfast')
    ) {
        return 'morning';
    }

    if (
        raw.includes('sunset') ||
        raw.includes('evening') ||
        raw.includes('dinner') ||
        raw.includes('night')
    ) {
        return 'evening';
    }

    return 'daytime';
};

const hasExplicitTimeContext = (spots) => {
    return spots.some((spot) => getTimeBucket(spot) !== 'daytime');
};

const solveGreedyFromStart = (startCoordinates, spots) => {
    if (!Array.isArray(spots) || spots.length < 2) return spots;

    const remaining = [...spots];
    const ordered = [];
    let currentLocation = startCoordinates;

    while (remaining.length > 0) {
        let bestSpotIndex = 0;
        let minDistance = Infinity;

        remaining.forEach((spot, index) => {
            const dist = calculateDistance(currentLocation, spot.geometry.coordinates);
            if (dist < minDistance) {
                minDistance = dist;
                bestSpotIndex = index;
            }
        });

        const nextSpot = remaining.splice(bestSpotIndex, 1)[0];
        ordered.push(nextSpot);
        currentLocation = nextSpot.geometry.coordinates;
    }

    return ordered;
};

const solveWithTimeContext = (hub, spots, startCoordinates) => {
    const buckets = {
        morning: [],
        daytime: [],
        evening: [],
    };

    spots.forEach((spot) => {
        buckets[getTimeBucket(spot)].push(spot);
    });

    let currentLocation = startCoordinates;
    const finalOrder = [];

    ['morning', 'daytime', 'evening'].forEach((bucketKey) => {
        const bucketSpots = buckets[bucketKey];
        if (bucketSpots.length === 0) return;

        const bucketOrder = solveGreedyFromStart(currentLocation, bucketSpots);
        finalOrder.push(...bucketOrder);
        currentLocation = bucketOrder[bucketOrder.length - 1].geometry.coordinates;
    });

    return finalOrder;
};

// --- THE CONSTRAINED SOLVER (Respects Locks) ---
const solveWithLocks = (hub, spots, startCoordinates) => {
    // 1. Create the "Shelf" (Empty array of correct length)
    const finalOrder = new Array(spots.length).fill(null);
    
    // 2. The Pool of available spots (Unlocked ones)
    let pool = [];

    // 3. Phase 1: Glue the Anchors
    spots.forEach((spot, index) => {
        if (spot.locked) {
            // If it's locked, it stays in its EXACT index
            finalOrder[index] = spot;
        } else {
            // If unlocked, it goes into the pool to be sorted
            pool.push(spot);
        }
    });

    // 4. Phase 2: Fill the Gaps
    let currentLocation = startCoordinates;

    for (let i = 0; i < finalOrder.length; i++) {
        // CASE A: The slot is already filled (Anchor)
        if (finalOrder[i] !== null) {
            const anchor = finalOrder[i];
            // We just update our location to this anchor and move on
            currentLocation = anchor.geometry.coordinates;
            continue; 
        }

        // CASE B: The slot is empty. Find the best fit from the pool.
        let bestSpotIndex = -1;
        let minDistance = Infinity;

        pool.forEach((spot, poolIndex) => {
            const dist = calculateDistance(currentLocation, spot.geometry.coordinates);
            if (dist < minDistance) {
                minDistance = dist;
                bestSpotIndex = poolIndex;
            }
        });

        // We found the winner for this empty slot
        if (bestSpotIndex !== -1) {
            const winner = pool[bestSpotIndex];
            finalOrder[i] = winner;
            
            // Move our virtual car to this spot
            currentLocation = winner.geometry.coordinates;
            
            // Remove it from the pool so we don't visit it twice
            pool.splice(bestSpotIndex, 1);
        }
    }

    return finalOrder;
};

// --- MAIN EXPORT ---
export const optimizeRoute = (hub, spots, options = {}) => {
    if (!spots || spots.length < 2) return spots;

    const startCoordinates = resolveStartCoordinates(hub, options);
    if (!startCoordinates) return spots;

    // Check if ANY constraints exist
    const hasLocks = spots.some(s => s.locked);

    if (hasLocks) {
        // If the user set constraints, we MUST use the constraint solver.
        // (Brute force is too hard to combine with locks for now)
        return solveWithLocks(hub, spots, startCoordinates);
    }

    // If spots have explicit daypart context (morning/evening/etc),
    // keep that ordering intent before distance minimization.
    if (hasExplicitTimeContext(spots)) {
        return solveWithTimeContext(hub, spots, startCoordinates);
    }
    
    // If NO locks, we can use our fancy Brute Force for small lists
    // (This creates the "Perfect" route when the user gives us total freedom)
    else if (spots.length < 10) {
        return solveBruteForce(hub, spots, startCoordinates);
    } else {
        return solveWithLocks(hub, spots, startCoordinates); // Fallback to greedy for large lists
    }
};

// --- BRUTE FORCE (Kept for fully unlocked lists) ---
const solveBruteForce = (hub, spots, startCoordinates) => {
    let bestOrder = spots;
    let minTotalDistance = Infinity;
    let bestFirstLegDist = Infinity;
    
    const getPermutations = (arr) => {
        const output = [];
        const swap = (a, b) => { const temp = arr[a]; arr[a] = arr[b]; arr[b] = temp; };
        const generate = (n) => {
            if (n === 1) { output.push([...arr]); return; }
            for (let i = 0; i < n; i++) {
                generate(n - 1);
                swap(n % 2 ? 0 : i, n - 1);
            }
        };
        generate(arr.length);
        return output;
    };

    const indices = spots.map((_, i) => i);
    const allPermutations = getPermutations(indices);

    allPermutations.forEach(perm => {
        let currentDist = 0;
        const firstLegDist = calculateDistance(startCoordinates, spots[perm[0]].geometry.coordinates);
        currentDist += firstLegDist;

        for (let i = 0; i < perm.length - 1; i++) {
            currentDist += calculateDistance(
                spots[perm[i]].geometry.coordinates, 
                spots[perm[i+1]].geometry.coordinates
            );
        }

        currentDist += calculateDistance(
            spots[perm[perm.length - 1]].geometry.coordinates,
            startCoordinates
        );

        if (currentDist < minTotalDistance - 0.1) { 
            minTotalDistance = currentDist;
            bestOrder = perm.map(i => spots[i]);
            bestFirstLegDist = firstLegDist;
        } 
        else if (Math.abs(currentDist - minTotalDistance) <= 0.1) {
            if (firstLegDist < bestFirstLegDist) {
                minTotalDistance = currentDist;
                bestOrder = perm.map(i => spots[i]);
                bestFirstLegDist = firstLegDist;
            }
        }
    });

    return bestOrder;
};
