/**
 * Haversine Formula Helper for Distance in Kilometers
 */
export const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371.0; // Radius of the Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

interface PolylinePoint {
  latitude: number;
  longitude: number;
  timestamp?: number;
}

/**
 * Standard Google Polyline algorithm encoder for point coordinates.
 */
export const encodePolyline = (points: { latitude: number; longitude: number }[]): string => {
  let result = '';
  let prevLat = 0;
  let prevLng = 0;

  const encodeValue = (val: number): string => {
    let num = val < 0 ? ~(val << 1) : val << 1;
    let chunkStr = '';
    while (num >= 0x20) {
      chunkStr += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
      num >>= 5;
    }
    chunkStr += String.fromCharCode(num + 63);
    return chunkStr;
  };

  for (const point of points) {
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);

    const dLat = lat - prevLat;
    const dLng = lng - prevLng;

    prevLat = lat;
    prevLng = lng;

    result += encodeValue(dLat) + encodeValue(dLng);
  }

  return result;
};

/**
 * Standard Google Polyline algorithm decoder.
 */
export const decodePolyline = (str: string): { latitude: number; longitude: number }[] => {
  const len = str.length;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: { latitude: number; longitude: number }[] = [];

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return coordinates;
};

/**
 * Compresses a trail of coordinate points into a single string using Google Polyline and delta-encoded timestamps.
 */
export const compressTrail = (points: PolylinePoint[]): string => {
  if (!points || points.length === 0) return '';

  // 1. Encode lat/lng as standard polyline
  const polyStr = encodePolyline(points);

  // 2. Encode timestamps (base36 delta list)
  const timestamps: string[] = [];
  if (points.length > 0) {
    const firstTs = points[0].timestamp || Date.now();
    timestamps.push(firstTs.toString(36));

    let prevTs = firstTs;
    for (let i = 1; i < points.length; i++) {
      const ts = points[i].timestamp || prevTs;
      const delta = ts - prevTs;
      timestamps.push(delta.toString(36));
      prevTs = ts;
    }
  }

  return `p1|${polyStr}|${timestamps.join(',')}`;
};

/**
 * Decompresses a trail from our compressed format back to an array of coordinate points.
 * Retains full backward compatibility with uncompressed JSON formats.
 */
export const decompressTrail = (compressed: any): PolylinePoint[] => {
  if (!compressed) return [];

  // If it's already an array, return it directly (legacy fallback)
  if (Array.isArray(compressed)) {
    return compressed;
  }

  if (typeof compressed !== 'string') {
    return [];
  }

  if (!compressed.startsWith('p1|')) {
    try {
      return JSON.parse(compressed);
    } catch {
      return [];
    }
  }

  const parts = compressed.split('|');
  if (parts.length < 3) return [];

  const polyStr = parts[1];
  const tsStr = parts[2];

  const coords = decodePolyline(polyStr);
  const tsParts = tsStr.split(',');

  const trail: PolylinePoint[] = [];
  let currentTs = 0;

  for (let i = 0; i < coords.length; i++) {
    if (i === 0 && tsParts[0]) {
      currentTs = parseInt(tsParts[0], 36);
    } else if (tsParts[i]) {
      currentTs += parseInt(tsParts[i], 36);
    }

    trail.push({
      latitude: coords[i].latitude,
      longitude: coords[i].longitude,
      timestamp: currentTs,
    });
  }

  return trail;
};
