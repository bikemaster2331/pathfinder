import { calculateDistance } from './distance';

// --- THE CONSTRAINED SOLVER (Respects Locks) ---
const solveWithLocks = (hub, spots) => {
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
    let currentLocation = hub.coordinates;

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
export const optimizeRoute = (hub, spots) => {
    if (!hub || !spots || spots.length < 2) return spots;

    // Check if ANY constraints exist
    const hasLocks = spots.some(s => s.locked);

    if (hasLocks) {
        // If the user set constraints, we MUST use the constraint solver.
        // (Brute force is too hard to combine with locks for now)
        return solveWithLocks(hub, spots);
    } 
    
    // If NO locks, we can use our fancy Brute Force for small lists
    // (This creates the "Perfect" route when the user gives us total freedom)
    else if (spots.length < 10) {
        return solveBruteForce(hub, spots); 
    } else {
        return solveWithLocks(hub, spots); // Fallback to greedy for large lists
    }
};

// --- BRUTE FORCE (Kept for fully unlocked lists) ---
const solveBruteForce = (hub, spots) => {
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
        const firstLegDist = calculateDistance(hub.coordinates, spots[perm[0]].geometry.coordinates);
        currentDist += firstLegDist;

        for (let i = 0; i < perm.length - 1; i++) {
            currentDist += calculateDistance(
                spots[perm[i]].geometry.coordinates, 
                spots[perm[i+1]].geometry.coordinates
            );
        }

        currentDist += calculateDistance(
            spots[perm[perm.length - 1]].geometry.coordinates, 
            hub.coordinates
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