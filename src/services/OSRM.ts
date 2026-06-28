import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDistanceInKm } from './Helpers';
import { addDiagnosticLog } from './Logger';
import { TrailCoord } from '../types';

const ROUTE_CACHE_KEY = 'osrm_route_cache_v1';
const MAX_ROUTE_CACHE_ENTRIES = 150;

// In-memory cache for ultra-fast checks without disk hits
const inMemoryRouteCache: Record<string, TrailCoord[]> = {};
let isRouteCacheLoaded = false;

// Load Route Cache from AsyncStorage on startup
const ensureRouteCacheLoaded = async () => {
  if (isRouteCacheLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(ROUTE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(inMemoryRouteCache, parsed);
    }
  } catch (e) {
    console.warn('[OSRM Cache] Error loading route cache from storage:', e);
  } finally {
    isRouteCacheLoaded = true;
  }
};

// Save a snapped route to persistent cache
const saveRouteToCache = async (hash: string, coords: TrailCoord[]) => {
  try {
    await ensureRouteCacheLoaded();
    inMemoryRouteCache[hash] = coords;

    // Prune cache if it grows too large (simple FIFO)
    const keys = Object.keys(inMemoryRouteCache);
    if (keys.length > MAX_ROUTE_CACHE_ENTRIES) {
      const deleteCount = keys.length - MAX_ROUTE_CACHE_ENTRIES;
      for (let i = 0; i < deleteCount; i++) {
        delete inMemoryRouteCache[keys[i]];
      }
    }

    await AsyncStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(inMemoryRouteCache));
  } catch (e) {
    console.warn('[OSRM Cache] Error saving route to cache:', e);
  }
};

/**
 * Spatial-Chaining De-interleaving Algorithm for Trail Cleaning
 */
export const cleanAndSortTrail = (rawTrail: any[] | undefined): any[] => {
  if (!rawTrail || rawTrail.length === 0) return [];

  // 1. Filter out invalid/empty coordinates
  const validPoints = rawTrail.filter(
    (pt) =>
      pt &&
      typeof pt.latitude === 'number' &&
      typeof pt.longitude === 'number' &&
      pt.latitude !== 0 &&
      pt.longitude !== 0
  );

  if (validPoints.length <= 1) return validPoints;

  // 2. Sort chronologically by timestamp
  validPoints.sort((a, b) => {
    const t1 = a.timestamp || 0;
    const t2 = b.timestamp || 0;
    return t1 - t2;
  });

  // 3. Cluster points into sequential "chains" to separate interleaved devices/streams
  const chains: any[][] = [];

  for (const pt of validPoints) {
    let bestChain: any[] | null = null;
    let minDistance = Infinity;

    for (const chain of chains) {
      const lastPt = chain[chain.length - 1];
      const dist = getDistanceInKm(lastPt.latitude, lastPt.longitude, pt.latitude, pt.longitude);
      const dtMs = (pt.timestamp || 0) - (lastPt.timestamp || 0);

      // Speed check
      let isSpeedReasonable = false;
      if (dtMs > 0) {
        const dtHours = dtMs / (1000 * 60 * 60);
        const speedKmh = dist / dtHours;
        if (speedKmh <= 190) {
          isSpeedReasonable = true;
        }
      } else if (dtMs === 0) {
        // Same timestamp: allow if extremely close spatially (duplicate/sync overlap)
        if (dist < 0.03) {
          isSpeedReasonable = true;
        }
      }

      // Spatial proximity check (bypass speed filter if consecutive points are within 0.8 km)
      const isSpatiallyClose = dist < 0.8; // 0.8 km

      if (isSpeedReasonable || isSpatiallyClose) {
        if (dist < minDistance) {
          minDistance = dist;
          bestChain = chain;
        }
      }
    }

    if (bestChain) {
      bestChain.push(pt);
    } else {
      // Create a new chain
      chains.push([pt]);
    }
  }

  // 4. Select and assemble chains
  // Filter out single-point chains as noise
  const validChains = chains.filter((c) => c.length >= 2);
  if (validChains.length === 0) {
    return chains.length > 0 ? chains[0] : [];
  }

  // Calculate characteristics for each chain
  const processedChains: any[] = [];
  for (const chain of validChains) {
    let maxSpanDist = 0;
    for (const pt of chain) {
      const dist = getDistanceInKm(
        chain[0].latitude,
        chain[0].longitude,
        pt.latitude,
        pt.longitude
      );
      if (dist > maxSpanDist) maxSpanDist = dist;
    }

    let totalDist = 0;
    for (let i = 0; i < chain.length - 1; i++) {
      totalDist += getDistanceInKm(
        chain[i].latitude,
        chain[i].longitude,
        chain[i + 1].latitude,
        chain[i + 1].longitude
      );
    }

    // Attach custom properties to the array object
    (chain as any).maxSpanDist = maxSpanDist;
    (chain as any).cumulativeDistance = totalDist;
    (chain as any).startTime = chain[0].timestamp;
    (chain as any).endTime = chain[chain.length - 1].timestamp;
    processedChains.push(chain);
  }

  // Filter out stationary simultaneous noise chains (e.g. tablet left at home)
  const hasActiveMovingChain = processedChains.some((c) => (c as any).maxSpanDist > 0.32);

  let finalChains = processedChains;
  if (hasActiveMovingChain) {
    finalChains = processedChains.filter((c) => {
      if ((c as any).maxSpanDist > 0.08) return true; // Keep if moving

      // Stationary. Check if it overlaps with an active moving chain
      const overlaps = processedChains.some((mc) => {
        if (mc === c || (mc as any).maxSpanDist <= 0.08) return false;
        // Overlaps in time with a buffer of 10s
        return (
          ((c as any).startTime >= (mc as any).startTime - 10000 &&
            (c as any).startTime <= (mc as any).endTime + 10000) ||
          ((c as any).endTime >= (mc as any).startTime - 10000 &&
            (c as any).endTime <= (mc as any).endTime + 10000)
        );
      });

      if (overlaps) {
        addDiagnosticLog(
          `[De-interleaving] Filtered out static home-device pollution at [${c[0].latitude.toFixed(4)}, ${c[0].longitude.toFixed(4)}] during active movement.`
        ).catch((err) => console.warn(err));
        return false;
      }
      return true;
    });
  }

  // Sort final chains by start time to maintain overall chronological structure
  finalChains.sort((a, b) => (a as any).startTime - (b as any).startTime);

  const result: any[] = [];
  for (const chain of finalChains) {
    result.push(...chain);
  }

  return result;
};

/**
 * Perpendicular Distance Helper for RDP Simplification
 */
export const getPerpendicularDistance = (
  pt: TrailCoord,
  lineStart: TrailCoord,
  lineEnd: TrailCoord
) => {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;

  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      Math.pow(pt.latitude - lineStart.latitude, 2) +
        Math.pow(pt.longitude - lineStart.longitude, 2)
    );
  }

  const t =
    ((pt.longitude - lineStart.longitude) * dx + (pt.latitude - lineStart.latitude) * dy) /
    (dx * dx + dy * dy);

  let nearestX = lineStart.longitude + t * dx;
  let nearestY = lineStart.latitude + t * dy;

  if (t < 0) {
    nearestX = lineStart.longitude;
    nearestY = lineStart.latitude;
  } else if (t > 1) {
    nearestX = lineEnd.longitude;
    nearestY = lineEnd.latitude;
  }

  return Math.sqrt(Math.pow(pt.longitude - nearestX, 2) + Math.pow(pt.latitude - nearestY, 2));
};

/**
 * Ramer-Douglas-Peucker (RDP) Simplification Algorithm
 */
export const simplifyRDP = (points: TrailCoord[], epsilon: number): TrailCoord[] => {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = getPerpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const results1 = simplifyRDP(points.slice(0, index + 1), epsilon);
    const results2 = simplifyRDP(points.slice(index), epsilon);
    return results1.slice(0, results1.length - 1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
};

/**
 * Fetch Snapped Trail Coordinates from OSRM Map-Matching or Routing API (with persistent cache checking)
 */
export const fetchSnappedTrail = async (points: TrailCoord[]): Promise<TrailCoord[]> => {
  if (points.length < 2) return points;

  // Simplify points first to keep the tracepoint count low, preventing URL length issues
  // 0.00008 (~8 meters) tolerance filters out raw GPS jitter while preserving key turn points
  const simplified = simplifyRDP(points, 0.00008);

  // Generate a unique coordinate route hash for caching
  const hash = simplified
    .map((pt) => `${pt.latitude.toFixed(6)},${pt.longitude.toFixed(6)}`)
    .join('|');

  // Check persistent caching layers
  await ensureRouteCacheLoaded();
  if (inMemoryRouteCache[hash]) {
    console.log('[OSRM Cache] Cache hit: utilizing cached snapped coordinate trail.');
    return inMemoryRouteCache[hash];
  }

  // OSRM expects coordinates in [longitude,latitude] format separated by semicolons
  const coordsString = simplified.map((pt) => `${pt.longitude},${pt.latitude}`).join(';');

  // 1. Try OSRM Routing API first: It ALWAYS guarantees a continuous, connected route
  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(routeUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
      const routeGeometry = data.routes[0].geometry;
      if (routeGeometry && routeGeometry.coordinates) {
        const snapped = routeGeometry.coordinates.map((coord: [number, number]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        await saveRouteToCache(hash, snapped);
        return snapped;
      }
    }
    console.log(
      '[OSRM Route Info]: Routing not possible or returned code:',
      data?.code,
      '- Trying map-matching fallback.'
    );
  } catch (err) {
    console.warn('[OSRM Route Error]: Failed to fetch routed trail:', err);
  }

  // 2. Fallback to OSRM Map-Matching API if routing fails (or is unavailable)
  const matchUrl = `https://router.project-osrm.org/match/v1/driving/${coordsString}?overview=full&geometries=geojson`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(matchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (data && data.code === 'Ok' && data.matchings && data.matchings[0]) {
      const matchGeometry = data.matchings[0].geometry;
      if (matchGeometry && matchGeometry.coordinates) {
        const snapped = matchGeometry.coordinates.map((coord: [number, number]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));
        await saveRouteToCache(hash, snapped);
        return snapped;
      }
    }
    console.warn('[OSRM Match Warning]: API returned code:', data?.code);
  } catch (err) {
    console.warn('[OSRM Match Error]: Failed to fetch snapped trail:', err);
  }

  // 3. Graceful fallback to the simplified raw trail if both APIs are offline/fail
  return simplified;
};

/**
 * Local cache of the user's historical coordinates for 24h trail
 */
export const updateAndGetLocalTrail = async (
  latitude: number,
  longitude: number,
  timestamp?: number
) => {
  try {
    const rawTrail = await AsyncStorage.getItem('user_trail');
    let trail = rawTrail ? JSON.parse(rawTrail) : [];

    const now = Date.now();
    const recordTime = timestamp || now;

    // Avoid spamming identical coordinates: log high-density (30s) while moving, and low-density (5m) when stationary
    if (trail.length > 0) {
      const lastPoint = trail[trail.length - 1];
      const dist = getDistanceInKm(latitude, longitude, lastPoint.latitude, lastPoint.longitude);
      const timeElapsed = recordTime - lastPoint.timestamp;

      const isMoving = dist >= 0.008; // ~8 meters movement
      const shouldLog = (isMoving && timeElapsed >= 30 * 1000) || timeElapsed >= 5 * 60 * 1000;

      if (shouldLog) {
        trail.push({ latitude, longitude, timestamp: recordTime });
      }
    } else {
      trail.push({ latitude, longitude, timestamp: recordTime });
    }

    // Filter out points older than 24 hours
    const limit = now - 24 * 60 * 60 * 1000;
    trail = trail.filter((pt: any) => pt.timestamp > limit);

    // Cap at 1000 points to fully cover a high-density 24h trail history on MantleDB payload
    if (trail.length > 1000) {
      trail = trail.slice(trail.length - 1000);
    }

    await AsyncStorage.setItem('user_trail', JSON.stringify(trail));
    return trail;
  } catch (err) {
    console.warn('[Trail caching error]:', err);
    return [];
  }
};
