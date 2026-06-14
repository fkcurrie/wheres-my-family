import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  TextInput,
  Share,
  AppState,
  Vibration,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import MapView, { Marker, Polyline } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ShieldAlert,
  Battery as BatteryIcon,
  RefreshCw,
  Navigation,
  Info,
  Share2,
} from 'lucide-react-native';
// Remove static expo-observe import to prevent native module crashes on standard Expo Go

const LOCATION_TRACKING_TASK_NAME = 'background-location-task';
const MANTLE_DB_URL = 'https://mantledb.sh/v2/wheresmyfamily-fkctors/all_locations';
const MANTLE_KEY = '923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b';

// --- Global Diagnostic Triage Logger ---
const addDiagnosticLog = async (msg: string) => {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const formatted = `[${timestamp}] ${msg}`;
  console.log(formatted);
  try {
    const raw = await AsyncStorage.getItem('diagnostic_logs');
    let logs = raw ? JSON.parse(raw) : [];
    logs.unshift(formatted); // Add to beginning (latest logs first)
    if (logs.length > 80) {
      logs = logs.slice(0, 80); // Cap at 80 items to avoid storing too much data
    }
    await AsyncStorage.setItem('diagnostic_logs', JSON.stringify(logs));
  } catch (e) {
    console.warn('Error saving diagnostic log:', e);
  }
};

// --- Haversine Formula Helper for Distance ---
const getDistanceInMiles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 3958.8; // Radius of the Earth in miles
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

// --- Gradient Trail Helpers ---
// Interpolate color from Emerald Green (most recent) to Vibrant Red (approaching 24h old)
const interpolateTrailColor = (ageMs: number): { solid: string; glow: string } => {
  const limit = 24 * 60 * 60 * 1000; // 24 hours in ms
  // Clamp ratio between 0 and 1
  const ratio = Math.max(0, Math.min(1, ageMs / limit));
  
  // Emerald Green: rgb(34, 197, 94) -> R=34, G=197, B=94
  // Vibrant Red: rgb(239, 68, 68) -> R=239, G=68, B=68
  const r = Math.round(34 + (239 - 34) * ratio);
  const g = Math.round(197 + (68 - 197) * ratio);
  const b = Math.round(94 + (68 - 94) * ratio);
  
  return {
    solid: `rgb(${r}, ${g}, ${b})`,
    glow: `rgba(${r}, ${g}, ${b}, 0.25)`
  };
};

// Retrieve the timestamp for a given coordinate by finding the closest point in the raw trail (since OSRM matching strips timestamps)
const getCoordinateTimestamp = (
  coord: { latitude: number; longitude: number },
  rawTrail: any[] | undefined,
  index: number,
  total: number
): number => {
  // If the raw trail point at the same index exists and has the same length, we can assume a direct 1-to-1 match
  if (rawTrail && rawTrail[index] && rawTrail[index].timestamp && rawTrail.length === total) {
    return rawTrail[index].timestamp;
  }
  
  // Otherwise, match based on physical distance to the closest raw coordinate
  if (rawTrail && rawTrail.length > 0) {
    let minDistance = Infinity;
    let closestTimestamp = rawTrail[0].timestamp || Date.now();
    for (const pt of rawTrail) {
      if (!pt.timestamp) continue;
      // Use squared distance for speed (no Math.sqrt needed)
      const dist = Math.pow(pt.latitude - coord.latitude, 2) + Math.pow(pt.longitude - coord.longitude, 2);
      if (dist < minDistance) {
        minDistance = dist;
        closestTimestamp = pt.timestamp;
      }
    }
    return closestTimestamp;
  }
  
  // Fallback to relative index ratio if rawTrail is missing timestamps or empty
  const limit = 24 * 60 * 60 * 1000;
  const ratio = index / (total > 1 ? total - 1 : 1);
  return Date.now() - (1 - ratio) * limit;
};

// --- Helper to get real battery percentage, charging state, and App active status ---
const getRealBatteryAndActivity = async () => {
  let batteryLevel = 100;
  let isCharging = false;
  try {
    const level = await Battery.getBatteryLevelAsync();
    batteryLevel = level >= 0 ? Math.round(level * 100) : 100;

    const state = await Battery.getBatteryStateAsync();
    isCharging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  } catch (err) {
    console.warn('[Battery Fetch Error]:', err);
  }

  // Active means the app is currently in the foreground (hence phone is unlocked and user is active)
  // Locked means the app is in background or inactive state (which happens when screen is locked or app is closed)
  const appState = AppState.currentState;
  const deviceStatus = appState === 'active' ? 'Active' : 'Phone locked';

  return { batteryLevel, isCharging, deviceStatus };
};

// --- Local cache to avoid publishing when stationary (battery optimizer) ---
let lastPublishedLat: number | null = null;
let lastPublishedLng: number | null = null;
let lastPublishedTime: number = 0;

// --- Weather & Severe Weather Alert Fetcher (Open-Meteo) ---
const getWeatherAndAlerts = async (latitude: number, longitude: number) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.current) {
      const temp = Math.round(json.current.temperature_2m);
      const code = json.current.weather_code;

      let emoji = '☀️';
      let desc = 'Clear';
      let isSevere = false;

      if (code === 0) {
        emoji = '☀️';
        desc = 'Clear sky';
      } else if ([1, 2, 3].includes(code)) {
        emoji = '⛅';
        desc = 'Partly cloudy';
      } else if ([45, 48].includes(code)) {
        emoji = '🌫️';
        desc = 'Foggy';
      } else if ([51, 53, 55].includes(code)) {
        emoji = '🌧️';
        desc = 'Drizzle';
      } else if ([61, 63, 65].includes(code)) {
        emoji = '🌧️';
        desc = code === 65 ? 'Heavy rain' : 'Rain';
        if (code === 65) isSevere = true;
      } else if ([71, 73, 75].includes(code)) {
        emoji = '❄️';
        desc = code === 75 ? 'Heavy snow' : 'Snow';
        if (code === 75) isSevere = true;
      } else if ([80, 81, 82].includes(code)) {
        emoji = '🌦️';
        desc = code === 82 ? 'Torrential showers' : 'Showers';
        if (code === 82) isSevere = true;
      } else if ([95, 96, 99].includes(code)) {
        emoji = '⛈️';
        desc = 'Thunderstorms';
        isSevere = true;
      }

      return { temp, emoji, desc, isSevere };
    }
  } catch (err) {
    console.warn('[Weather Fetch Error]:', err);
  }
  return null;
};

// --- Weather caching global cache to optimize battery & mobile data ---
let lastWeatherLat: number | null = null;
let lastWeatherLng: number | null = null;
let lastWeatherTime: number = 0;
let lastWeatherValue: any = null;

const getWeatherAndAlertsCached = async (latitude: number, longitude: number) => {
  const now = Date.now();
  // Reuse weather data if it was fetched within last 30 minutes and we have not moved more than 2 miles
  if (
    lastWeatherValue &&
    now - lastWeatherTime < 30 * 60 * 1000 &&
    lastWeatherLat !== null &&
    lastWeatherLng !== null
  ) {
    const dist = getDistanceInMiles(latitude, longitude, lastWeatherLat, lastWeatherLng);
    if (dist < 2.0) {
      console.log(
        '[Weather Optimizer]: Reusing cached weather (moved ' +
          dist.toFixed(2) +
          ' miles). Saved network query.'
      );
      await addDiagnosticLog(
        `[Weather Cache] Cache hit: using ${lastWeatherValue.temp}°C, ${lastWeatherValue.desc} (moved ${dist.toFixed(2)} mi)`
      );
      return lastWeatherValue;
    }
  }

  // Fetch fresh weather
  const fresh = await getWeatherAndAlerts(latitude, longitude);
  if (fresh) {
    lastWeatherLat = latitude;
    lastWeatherLng = longitude;
    lastWeatherTime = now;
    lastWeatherValue = fresh;
    await addDiagnosticLog(`[Weather API] Cache miss: fetched ${fresh.temp}°C, ${fresh.desc}`);
    return fresh;
  }
  return lastWeatherValue; // return last known weather if offline / query failed
};

interface TrailCoord {
  latitude: number;
  longitude: number;
}

// --- Perpendicular Distance Helper for RDP Simplification ---
const getPerpendicularDistance = (pt: TrailCoord, lineStart: TrailCoord, lineEnd: TrailCoord) => {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;
  
  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      Math.pow(pt.latitude - lineStart.latitude, 2) +
      Math.pow(pt.longitude - lineStart.longitude, 2)
    );
  }
  
  const t = ((pt.longitude - lineStart.longitude) * dx + (pt.latitude - lineStart.latitude) * dy) / (dx * dx + dy * dy);
  
  let nearestX = lineStart.longitude + t * dx;
  let nearestY = lineStart.latitude + t * dy;
  
  if (t < 0) {
    nearestX = lineStart.longitude;
    nearestY = lineStart.latitude;
  } else if (t > 1) {
    nearestX = lineEnd.longitude;
    nearestY = lineEnd.latitude;
  }
  
  return Math.sqrt(
    Math.pow(pt.longitude - nearestX, 2) +
    Math.pow(pt.latitude - nearestY, 2)
  );
};

// --- Ramer-Douglas-Peucker (RDP) Simplification Algorithm ---
const simplifyRDP = (points: TrailCoord[], epsilon: number): TrailCoord[] => {
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

// --- Fetch Snapped Trail Coordinates from OSRM Map-Matching or Routing API ---
const fetchSnappedTrail = async (points: TrailCoord[]): Promise<TrailCoord[]> => {
  if (points.length < 2) return points;
  
  // Simplify points first to keep the tracepoint count low, preventing URL length issues
  // 0.00008 (~8 meters) tolerance filters out raw GPS jitter while preserving key turn points
  const simplified = simplifyRDP(points, 0.00008);
  
  // OSRM expects coordinates in [longitude,latitude] format separated by semicolons
  const coordsString = simplified.map(pt => `${pt.longitude},${pt.latitude}`).join(';');
  
  // 1. Try OSRM Routing API first: It ALWAYS guarantees a continuous, connected route
  // that follows the street/path network, even if points are sparse or have large GPS gaps.
  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
  
  try {
    const response = await fetch(routeUrl);
    const data = await response.json();
    
    if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
      const routeGeometry = data.routes[0].geometry;
      if (routeGeometry && routeGeometry.coordinates) {
        // Map geojson [longitude, latitude] coordinates back to React Native Maps {latitude, longitude} format
        return routeGeometry.coordinates.map((coord: [number, number]) => ({
          latitude: coord[1],
          longitude: coord[0]
        }));
      }
    }
    console.log('[OSRM Route Info]: Routing not possible or returned code:', data?.code, '- Trying map-matching fallback.');
  } catch (err) {
    console.warn('[OSRM Route Error]: Failed to fetch routed trail:', err);
  }
  
  // 2. Fallback to OSRM Map-Matching API if routing fails (or is unavailable)
  const matchUrl = `https://router.project-osrm.org/match/v1/driving/${coordsString}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(matchUrl);
    const data = await response.json();
    
    if (data && data.code === 'Ok' && data.matchings && data.matchings[0]) {
      const matchGeometry = data.matchings[0].geometry;
      if (matchGeometry && matchGeometry.coordinates) {
        return matchGeometry.coordinates.map((coord: [number, number]) => ({
          latitude: coord[1],
          longitude: coord[0]
        }));
      }
    }
    console.warn('[OSRM Match Warning]: API returned code:', data?.code);
  } catch (err) {
    console.warn('[OSRM Match Error]: Failed to fetch snapped trail:', err);
  }
  
  // 3. Graceful fallback to the simplified raw trail if both APIs are offline/fail
  return simplified;
};

// --- Local cache of the user's historical coordinates for 24h trail ---
const updateAndGetLocalTrail = async (latitude: number, longitude: number) => {
  try {
    const rawTrail = await AsyncStorage.getItem('user_trail');
    let trail = rawTrail ? JSON.parse(rawTrail) : [];

    const now = Date.now();

    // Avoid spamming identical coordinates: log high-density (30s) while moving, and low-density (5m) when stationary
    if (trail.length > 0) {
      const lastPoint = trail[trail.length - 1];
      const dist = getDistanceInMiles(latitude, longitude, lastPoint.latitude, lastPoint.longitude);
      const timeElapsed = now - lastPoint.timestamp;

      const isMoving = dist >= 0.005; // ~8 meters movement
      const shouldLog = (isMoving && timeElapsed >= 30 * 1000) || (timeElapsed >= 5 * 60 * 1000);

      if (shouldLog) {
        trail.push({ latitude, longitude, timestamp: now });
      }
    } else {
      trail.push({ latitude, longitude, timestamp: now });
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

// --- Helper to publish location directly to MantleDB ---
const publishLocation = async (
  name: string,
  latitude: number,
  longitude: number,
  status: string = 'Active',
  extraData: any = {}
) => {
  try {
    const now = Date.now();
    const isForced = ['App Started', 'Manual Refresh', 'Onboarding Completed'].includes(status);

    // Throttling: Skip publishing if stationary (< 50 meters / ~0.03 miles) and updated within last 15 minutes
    if (
      !isForced &&
      lastPublishedLat !== null &&
      lastPublishedLng !== null &&
      now - lastPublishedTime < 15 * 60 * 1000
    ) {
      const dist = getDistanceInMiles(latitude, longitude, lastPublishedLat, lastPublishedLng);
      if (dist < 0.03) {
        console.log(
          '[Battery Optimizer]: Stationary (moved ' +
            dist.toFixed(4) +
            ' miles). Skipping MantleDB update to conserve power.'
        );
        await addDiagnosticLog(
          `[Sync Idle] Stationary (moved ${dist.toFixed(4)} mi). Bypassed publish.`
        );
        return;
      }
    }

    // Cache current publication
    lastPublishedLat = latitude;
    lastPublishedLng = longitude;
    lastPublishedTime = now;

    const info = await getRealBatteryAndActivity();

    // Fetch live weather context if coordinates are available
    let weatherInfo = null;
    try {
      weatherInfo = await getWeatherAndAlertsCached(latitude, longitude);
    } catch (e) {
      console.warn('[Weather integration bypassed]:', e);
    }

    // Get updated historical trail
    let localTrail: any[] = [];
    try {
      localTrail = await updateAndGetLocalTrail(latitude, longitude);
    } catch (e) {
      console.warn('[Local trail fetch bypassed]:', e);
    }

    const payload = {
      [name]: {
        name,
        latitude,
        longitude,
        status,
        battery: info.batteryLevel,
        charging: info.isCharging,
        deviceStatus: info.deviceStatus,
        updatedAt: Date.now(),
        ...(weatherInfo
          ? {
              weatherTemp: weatherInfo.temp,
              weatherEmoji: weatherInfo.emoji,
              weatherDesc: weatherInfo.desc,
              weatherIsSevere: weatherInfo.isSevere,
            }
          : {}),
        ...(localTrail && localTrail.length > 0 ? { trail: localTrail } : {}),
        ...extraData,
      },
    };

    await fetch(MANTLE_DB_URL, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Mantle-Key': MANTLE_KEY,
      },
      body: JSON.stringify(payload),
    });
    console.log(
      '[Background Sync]: Successfully published location for',
      name,
      'Battery:',
      info.batteryLevel,
      'Status:',
      info.deviceStatus
    );
    await addDiagnosticLog(
      `[Sync Success] Coords: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (${status}). Bat: ${info.batteryLevel}%`
    );
  } catch (err) {
    console.error('[Background Sync Error]:', err);
    await addDiagnosticLog(
      `[Sync Error] Failed to publish location: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};

// --- Background Task Definition ---
TaskManager.defineTask(LOCATION_TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Background Task Error]:', error);
    await addDiagnosticLog(`[Background Error] OS Task Error: ${error.message}`);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations[0]) {
      const coords = locations[0].coords;
      console.log('[Background Location Update]:', coords);
      await addDiagnosticLog(`[Background Task] OS triggered GPS tick.`);
      try {
        const savedName = await AsyncStorage.getItem('user_name');
        if (savedName) {
          await publishLocation(
            savedName,
            coords.latitude,
            coords.longitude,
            'Background Tracking'
          );
        } else {
          await addDiagnosticLog(
            `[Background Task Warning] Name not set in AsyncStorage, skipping publish.`
          );
        }
      } catch (err) {
        console.error('[Background Sync task-level error]:', err);
        await addDiagnosticLog(
          `[Background Sync Error] task-level: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
});

// Mock Initial Family Data
const INITIAL_FAMILY: any[] = [];

function MainApp() {
  const [isBackgroundTracking, setIsBackgroundTracking] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('Unknown');
  const [familyMembers, setFamilyMembers] = useState(INITIAL_FAMILY);
  const [panicActive, setPanicActive] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState(false);
  const [showTrails, setShowTrails] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [inputName, setInputName] = useState('');
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [hasCenteredOnce, setHasCenteredOnce] = useState(false);

  // --- Triage Console States & Helpers ---
  const [showTriageConsole, setShowTriageConsole] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);

  const loadDiagnosticLogs = async () => {
    try {
      const raw = await AsyncStorage.getItem('diagnostic_logs');
      const logs = raw ? JSON.parse(raw) : [];
      setDiagnosticLogs(logs);
    } catch (e) {
      console.warn('Failed to load diagnostic logs:', e);
    }
  };

  const clearDiagnosticLogs = async () => {
    try {
      await AsyncStorage.setItem('diagnostic_logs', JSON.stringify([]));
      setDiagnosticLogs([]);
      await addDiagnosticLog('[Console] Logs cleared by user.');
    } catch (e) {
      console.warn('Failed to clear diagnostic logs:', e);
    }
  };

  const shareDiagnosticLogs = async () => {
    try {
      const raw = await AsyncStorage.getItem('diagnostic_logs');
      const logs: string[] = raw ? JSON.parse(raw) : [];
      if (logs.length === 0) {
        Alert.alert('No Logs', 'There are no diagnostic logs to share yet.');
        return;
      }
      const formattedLogs = logs.join('\n');
      await Share.share({
        title: "Where's my family!! Diagnostic Logs",
        message: `Where's my family!! System Diagnostic Log Trail:\n\n${formattedLogs}`,
      });
      await addDiagnosticLog('[Console] Log trail shared.');
    } catch (e: any) {
      Alert.alert('Sharing Failed', e.message || String(e));
    }
  };

  useEffect(() => {
    if (showTriageConsole) {
      loadDiagnosticLogs();
    }
  }, [showTriageConsole]);

  // --- Mutable refs to prevent interval tear-downs & stale closures ---
  const userNameRef = useRef<string | null>(userName);
  const userLocationRef = useRef<Location.LocationObject | null>(userLocation);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // New Feature States
  const [snappedTrails, setSnappedTrails] = useState<Record<string, TrailCoord[]>>({});
  const lastTrailHashes = useRef<Record<string, string>>({});

  // --- Map Matching for Family Trails ---
  useEffect(() => {
    let active = true;
    
    const processTrails = async () => {
      const newSnappedTrails = { ...snappedTrails };
      let changed = false;
      
      for (const member of familyMembers) {
        if (!member.trail || member.trail.length < 2) {
          if (snappedTrails[member.id]) {
            delete newSnappedTrails[member.id];
            delete lastTrailHashes.current[member.id];
            changed = true;
          }
          continue;
        }
        
        // Create a unique hash/string of the raw trail coordinates
        const hash = member.trail.map((pt: any) => `${pt.latitude.toFixed(6)},${pt.longitude.toFixed(6)}`).join('|');
        const prevHash = lastTrailHashes.current[member.id];
        
        if (hash !== prevHash) {
          lastTrailHashes.current[member.id] = hash;
          
          // Fetch snapped coordinates from OSRM map matching API
          const snapped = await fetchSnappedTrail(member.trail);
          if (active) {
            newSnappedTrails[member.id] = snapped;
            changed = true;
          }
        }
      }
      
      if (changed && active) {
        setSnappedTrails(newSnappedTrails);
      }
    };
    
    if (showTrails && familyMembers.length > 0) {
      processTrails();
    }
  }, [familyMembers, showTrails]);

  // --- EAS Observe Performance Mark ---
  useEffect(() => {
    if (!isLoadingUser) {
      try {
        safeMarkInteractive();
      } catch (err) {
        console.warn('[EAS Observe Error]:', err);
      }
    }
  }, [isLoadingUser]);

  // --- Poll Family Locations ---
  useEffect(() => {
    if (!userName) return;

    // Initial fetch
    fetchFamilyLocations();

    // Poll every 10 seconds stably without interval teardowns on GPS updates
    const interval = setInterval(fetchFamilyLocations, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]); // Only re-run if userName changes, keeping the timer stable

  // --- Auto-center map on first coordinate load ---
  useEffect(() => {
    if (userLocation && !hasCenteredOnce && mapRef.current) {
      setHasCenteredOnce(true);
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.coords.latitude,
          longitude: userLocation.coords.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        1000
      );
    }
  }, [userLocation, hasCenteredOnce]);

  // --- Real-time Foreground Location Watcher ---
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 30000, // Update every 30 seconds
              distanceInterval: 10, // Or every 10 meters
            },
            async (loc) => {
              setUserLocation(loc);
              const saved = userNameRef.current; // Fast 100% in-memory read (bypasses slow disk I/O)
              await addDiagnosticLog(
                `[Foreground Watcher] GPS updated: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`
              );
              if (saved) {
                await publishLocation(
                  saved,
                  loc.coords.latitude,
                  loc.coords.longitude,
                  'Auto foreground update'
                );
              }
            }
          );
          console.log('[Foreground Watcher]: Started active real GPS watcher.');
          await addDiagnosticLog('[Foreground Watcher] Active GPS watcher subscription started.');
        }
      } catch (err) {
        console.warn('Error setting up foreground watcher:', err);
        await addDiagnosticLog(
          `[Foreground Watcher Error] Start failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    if (userName) {
      startWatching();
    }

    return () => {
      if (subscription) {
        subscription.remove();
        console.log('[Foreground Watcher]: Stopped active watcher.');
        addDiagnosticLog('[Foreground Watcher] Active GPS watcher subscription stopped.');
      }
    };
  }, [userName]);

  // --- Check Permissions and Task State on Mount ---
  useEffect(() => {
    loadUser();
    checkTrackingState();
  }, []);

  const loadUser = async () => {
    try {
      const saved = await AsyncStorage.getItem('user_name');
      if (saved) {
        await addDiagnosticLog(`[App Mount] Loaded profile name: "${saved}"`);
        setUserName(saved);
      } else {
        await addDiagnosticLog(`[App Mount] No profile name found. Redirecting to onboarding.`);
      }
    } catch (e) {
      console.warn(e);
      await addDiagnosticLog(
        `[App Mount Error] Failed to load name: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setIsLoadingUser(false);
    }
  };

  // --- Center Map on User's Location ---
  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.coords.latitude,
          longitude: userLocation.coords.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        1000
      );
    }
  };

  // --- Send Nudge to Member ---
  const handleNudgeMember = async (member: any) => {
    try {
      const payload = {
        [member.name]: {
          name: member.name,
          latitude: member.latitude,
          longitude: member.longitude,
          status: member.status,
          battery: member.battery,
          charging: member.charging,
          deviceStatus: member.deviceStatus,
          updatedAt: member.updatedAt || Date.now(),
          weatherTemp: member.weatherTemp,
          weatherEmoji: member.weatherEmoji,
          weatherDesc: member.weatherDesc,
          weatherIsSevere: member.weatherIsSevere,
          nudgeRequested: true,
        },
      };
      await fetch(MANTLE_DB_URL, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Mantle-Key': MANTLE_KEY,
        },
        body: JSON.stringify(payload),
      });
      Alert.alert('Nudge Sent 📳', `Sent a silent vibration trigger to ${member.name}!`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not send nudge.');
    }
  };

  // --- Fetch Other Family Locations from MantleDB ---
  const fetchFamilyLocations = async () => {
    try {
      const res = await fetch(MANTLE_DB_URL, {
        headers: {
          'X-Mantle-Key': MANTLE_KEY,
        },
      });
      const data = await res.json();
      if (data && !data.error) {
        // Check for local nudges
        if (userName && data[userName] && data[userName].nudgeRequested === true) {
          Vibration.vibrate([0, 500, 200, 500]);
          await addDiagnosticLog(`[Nudge] RECEIVED a nudge vibration request from family!`);
          Alert.alert('📳 Family Nudge!', 'Someone in your family is nudging you to check in!');

          // Clear nudge state
          const clearedUser = {
            ...data[userName],
            nudgeRequested: false,
          };
          fetch(MANTLE_DB_URL, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-Mantle-Key': MANTLE_KEY,
            },
            body: JSON.stringify({
              [userName]: clearedUser,
            }),
          }).catch((err) => console.warn('Error clearing nudge flag:', err));
        }

        const currentUserLoc = userLocationRef.current; // Read from Ref to prevent stale closures

        const fetchedMembers = Object.keys(data)
          .filter((key) => !key.startsWith('_'))
          .map((key) => {
            const m = data[key];

            let distanceStr = '0.1 mi';
            if (currentUserLoc && m.latitude !== undefined && m.longitude !== undefined) {
              const dist = getDistanceInMiles(
                currentUserLoc.coords.latitude,
                currentUserLoc.coords.longitude,
                m.latitude,
                m.longitude
              );
              distanceStr = dist < 0.1 ? 'Just here' : `${dist.toFixed(1)} mi`;
            }

            let lastSeenStr = 'Just now';
            if (m.updatedAt) {
              const diffMin = Math.round((Date.now() - m.updatedAt) / 60000);
              if (diffMin > 0) {
                lastSeenStr = diffMin === 1 ? '1m ago' : `${diffMin}m ago`;
              }
            }

            let displayStatus = m.status || 'Active';

            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
            const colorIdx =
              Math.abs(key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) %
              colors.length;

            return {
              id: `fetched-${key}`,
              name: key,
              status: displayStatus,
              distance: distanceStr,
              battery: m.battery || 100,
              charging: m.charging || false,
              deviceStatus: m.deviceStatus || 'Active',
              lastSeen: lastSeenStr,
              latitude: m.latitude,
              longitude: m.longitude,
              color: colors[colorIdx],
              isReal: true,
              weatherTemp: m.weatherTemp,
              weatherEmoji: m.weatherEmoji,
              weatherDesc: m.weatherDesc,
              weatherIsSevere: m.weatherIsSevere,
              nudgeRequested: m.nudgeRequested || false,
              updatedAt: m.updatedAt,
              trail: m.trail || [],
            };
          });

        // Filter out mock members that match a real member's name (case-insensitive) or match the current user
        const realNames = fetchedMembers.map((fm) => fm.name.toLowerCase());
        const remainingMock = INITIAL_FAMILY.filter(
          (m) =>
            !realNames.includes(m.name.toLowerCase()) &&
            m.name.toLowerCase() !== userName?.toLowerCase()
        );

        // Keep current user in family list
        const filteredFetched = fetchedMembers;

        setFamilyMembers([...filteredFetched, ...remainingMock]);

        // Update the last updated time using the local device's clock
        const now = new Date();
        const localTimeString = now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setLastUpdatedTime(localTimeString);
      }
    } catch (e) {
      console.warn('Error fetching family locations:', e);
      await addDiagnosticLog(
        `[Poll Error] Failed to sync family locations: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  const handleSaveName = async () => {
    if (!inputName.trim()) {
      Alert.alert('Name Required', 'Please enter your name to identify yourself.');
      return;
    }
    const trimmed = inputName.trim();
    try {
      await AsyncStorage.setItem('user_name', trimmed);
      setUserName(trimmed);
      if (userLocation) {
        await publishLocation(
          trimmed,
          userLocation.coords.latitude,
          userLocation.coords.longitude,
          'Onboarding Completed'
        );
      }
    } catch {
      Alert.alert('Error', 'Could not save your name.');
    }
  };

  const checkTrackingState = async () => {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK_NAME);
      setIsBackgroundTracking(isRegistered);
      await addDiagnosticLog(`[App Mount] Checked task registered state: ${isRegistered}`);

      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();

      let permDesc = 'Denied / Unasked';
      if (foreground.granted && background.granted) {
        permDesc = 'Granted (Background Active)';
        setPermissionStatus('Granted (Background Active)');
      } else if (foreground.granted) {
        permDesc = 'Foreground Only';
        setPermissionStatus('Foreground Only');
      } else {
        setPermissionStatus('Denied / Unasked');
      }
      await addDiagnosticLog(`[App Mount] Location permissions: "${permDesc}"`);

      // Fetch initial single location
      if (foreground.granted) {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setUserLocation(loc);
        const saved = await AsyncStorage.getItem('user_name');
        if (saved) {
          await publishLocation(saved, loc.coords.latitude, loc.coords.longitude, 'App Started');
        }
      }
    } catch (e) {
      console.warn(e);
      await addDiagnosticLog(
        `[App Mount Error] checkTrackingState failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  // --- Toggle Background Location Tracking ---
  const toggleBackgroundTracking = async (value: boolean) => {
    try {
      if (value) {
        await addDiagnosticLog(
          `[Background Sync] Requesting foreground/background GPS permissions...`
        );
        // Request Permissions
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
          await addDiagnosticLog(`[Background Sync Error] Foreground permission denied.`);
          Alert.alert(
            'Permission Denied',
            'Foreground location permission is required to track location.'
          );
          return;
        }

        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          await addDiagnosticLog(`[Background Sync Error] Background permission denied.`);
          Alert.alert(
            'Background Permission Required',
            'To track persistently even after app close and reboots, please set location permission to "Always Allow" in your system Settings.'
          );
          return;
        }

        // Start tracking task with high-efficiency battery profiles
        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: 30000, // 30 seconds
          distanceInterval: 15, // 15 meters
          deferredUpdatesInterval: 30000, // batch updates every 30 seconds
          deferredUpdatesDistance: 15, // batch updates every 15 meters
          pausesUpdatesAutomatically: true, // hibernates on iOS when still
          activityType: Location.ActivityType.AutomotiveNavigation, // iOS automotive profiles
          foregroundService: {
            notificationTitle: "Where's my family!! Active",
            notificationBody: 'Sharing your live location with your family in the background.',
            notificationColor: '#e11d48',
          },
          showsBackgroundLocationIndicator: true,
        });

        setIsBackgroundTracking(true);
        setPermissionStatus('Granted (Background Active)');
        await addDiagnosticLog(
          `[Background Sync] REGISTERED successfully. Interval: 30 sec, dist: 15m.`
        );
        Alert.alert(
          'Background Sharing Enabled',
          'Your location is now being tracked and shared in the background. It will persist across app closed states and device reboots.'
        );
      } else {
        // Stop tracking task
        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK_NAME);
        if (isRegistered) {
          await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME);
        }
        setIsBackgroundTracking(false);
        setPermissionStatus('Foreground Only');
        await addDiagnosticLog(`[Background Sync] UNREGISTERED background location task.`);
        Alert.alert('Background Sharing Disabled', 'Persistent tracking stopped.');
      }
    } catch (error: any) {
      await addDiagnosticLog(
        `[Background Sync Error] Toggle failed: ${error.message || String(error)}`
      );
      Alert.alert('Error', error.message || 'An error occurred setting up background task.');
      console.error(error);
    }
  };

  // --- Force Location Refresh ---
  const refreshLocation = async () => {
    setUpdatingLocation(true);
    await addDiagnosticLog(`[Manual Refresh] Requesting fresh high-accuracy GPS coordinates...`);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setUserLocation(loc);
        await addDiagnosticLog(
          `[Manual Refresh] Coords fetched: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`
        );

        if (userName) {
          await publishLocation(
            userName,
            loc.coords.latitude,
            loc.coords.longitude,
            'Manual Refresh'
          );
        }

        // Pull down other family members immediately
        await fetchFamilyLocations();
      } else {
        await addDiagnosticLog(`[Manual Refresh Error] Foreground permission denied.`);
        Alert.alert('Permission Denied', 'Foreground location permission is needed.');
      }
    } catch (e: any) {
      await addDiagnosticLog(`[Manual Refresh Error] Failed: ${e.message || String(e)}`);
      Alert.alert('Refresh Failed', e.message || 'Could not fetch current coordinates.');
    } finally {
      setUpdatingLocation(false);
    }
  };

  // --- Share App Invitation with Family ---
  const shareAppInvite = async () => {
    // EAS & TestFlight installation links for our family members:
    // Frank can replace this with his actual TestFlight public link (e.g. https://testflight.apple.com/join/xxxxxx)
    const TESTFLIGHT_JOIN_LINK = 'https://testflight.apple.com/join/YOUR_CODE'; 
    const ANDROID_PREVIEW_LINK = 'https://expo.dev/accounts/fkctor/projects/wheres-my-family/builds';

    const inviteMessage = 
      `Join our family tracking map on "Where's my family!!" 📍\n` +
      `Frank built this custom app just for our family to keep each other safe!\n\n` +
      `📱 FOR IPHONE (iOS) USERS:\n` +
      `1. Install the free "TestFlight" app from the App Store.\n` +
      `2. Tap our family join link to install "Where's my family!!":\n` +
      `${TESTFLIGHT_JOIN_LINK}\n\n` +
      `🤖 FOR ANDROID USERS:\n` +
      `1. Tap this link to download and install our preview app (APK):\n` +
      `${ANDROID_PREVIEW_LINK}\n` +
      `(Download the latest "preview" build, click "Install", and allow installation if prompted by your browser).\n\n` +
      `✨ ONCE INSTALLED:\n` +
      `- Open the app and enter your name to show up on the family map.\n` +
      `- IMPORTANT: Set Location permissions to "Always Allow" (Background Tracking) so we can keep each other safe even when the phone is locked in your pocket! 🔒`;

    try {
      await Share.share({
        message: inviteMessage,
      });
    } catch (error) {
      console.warn('Sharing failed:', error);
    }
  };

  // --- Toggle Panic Alarm ---
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const triggerPanic = () => {
    const newState = !panicActive;
    setPanicActive(newState);
    if (newState) {
      Alert.alert(
        '🚨 EMERGENCY PANIC TRIGGERED',
        'Your family has been alerted with your current coordinates! A loud sound simulation has started.',
        [{ text: 'Dismiss Alarm', onPress: () => setPanicActive(false) }]
      );
    }
  };

  if (isLoadingUser) {
    return (
      <View style={[styles.window, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style="light" />
        <Text style={{ color: '#fff', fontSize: 16 }}>Loading Where's my family!!...</Text>
      </View>
    );
  }

  if (!userName) {
    return (
      <View style={[styles.window, { justifyContent: 'center', padding: 24 }]}>
        <StatusBar style="light" />
        <View style={styles.onboardingCard}>
          <ShieldAlert
            color="#f43f5e"
            size={54}
            style={{ alignSelf: 'center', marginBottom: 16 }}
          />
          <Text style={styles.onboardingTitle}>Where's my family!!</Text>
          <Text style={styles.onboardingSubtitle}>
            Identify who is using this phone to share and view locations with your family.
          </Text>

          <Text style={styles.inputLabel}>Who is this?</Text>
          <TextInput
            style={styles.onboardingInput}
            value={inputName}
            onChangeText={setInputName}
            placeholder="e.g. Mum, Dad, Chloe, Jack"
            placeholderTextColor="#64748b"
            autoFocus
          />

          <TouchableOpacity style={styles.onboardingButton} onPress={handleSaveName}>
            <Text style={styles.onboardingButtonText}>Save & Start Tracking</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.window, panicActive && styles.panicWindow]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <ShieldAlert color="#f43f5e" size={28} />
          <Text style={styles.headerTitle}>Where's my family!!</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.shareIconHeader}
            onPress={shareAppInvite}
            accessibilityLabel="Share app instructions"
          >
            <Share2 color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Map Simulator Visual Box */}
        <View style={styles.mapCard}>
          <View style={styles.mapHeaderRow}>
            <Text style={styles.mapHeader}>Live Family Locator Map</Text>
            <View style={styles.trailToggleRow}>
              <Text style={styles.trailToggleLabel}>Show 24h Trails</Text>
              <Switch
                value={showTrails}
                onValueChange={setShowTrails}
                trackColor={{ false: '#0f172a', true: '#3b82f6' }}
                thumbColor={showTrails ? '#60a5fa' : '#475569'}
              />
            </View>
          </View>

          <View style={styles.mapCanvas}>
            <MapView
              ref={mapRef}
              style={{ width: '100%', height: '100%' }}
              initialRegion={{
                latitude: userLocation?.coords.latitude || 43.6532,
                longitude: userLocation?.coords.longitude || -79.3832,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              <Marker
                coordinate={{
                  latitude: userLocation?.coords.latitude || 43.6532,
                  longitude: userLocation?.coords.longitude || -79.3832,
                }}
                title="You"
                description="Your current location"
                pinColor="#f43f5e"
              />
              {familyMembers.map((member) => {
                const memberLat =
                  member.latitude !== undefined
                    ? member.latitude
                    : (userLocation?.coords.latitude || 43.6532) + member.latOffset / 5000;
                const memberLng =
                  member.longitude !== undefined
                    ? member.longitude
                    : (userLocation?.coords.longitude || -79.3832) + member.lngOffset / 5000;
                return (
                  <Marker
                    key={member.id}
                    coordinate={{
                      latitude: memberLat,
                      longitude: memberLng,
                    }}
                    title={member.name}
                    description={`${member.status} (${member.distance})`}
                    pinColor={member.color}
                  />
                );
              })}

              {showTrails &&
                familyMembers.map((member) => {
                  if (!member.trail || member.trail.length < 2) {
                    return null;
                  }
                  
                  // Use snapped coordinates from OSRM if available, otherwise fall back to raw trail coords
                  const coordinates = snappedTrails[member.id] || member.trail.map((pt: any) => ({
                    latitude: pt.latitude,
                    longitude: pt.longitude,
                  }));

                  if (coordinates.length < 2) {
                    return null;
                  }

                  // Render individual segments with color-graded polylines
                  const segments: React.ReactNode[] = [];
                  for (let i = 0; i < coordinates.length - 1; i++) {
                    const pt1 = coordinates[i];
                    const pt2 = coordinates[i + 1];
                    
                    const ts1 = getCoordinateTimestamp(pt1, member.trail, i, coordinates.length);
                    const ts2 = getCoordinateTimestamp(pt2, member.trail, i + 1, coordinates.length);
                    const avgTimestamp = (ts1 + ts2) / 2;
                    const ageMs = Math.max(0, Date.now() - avgTimestamp);
                    
                    const colors = interpolateTrailColor(ageMs);

                    segments.push(
                      <React.Fragment key={`trail-segment-${member.id}-${i}`}>
                        {/* Subtle outer glow border for depth */}
                        <Polyline
                          coordinates={[pt1, pt2]}
                          strokeColor={colors.glow}
                          strokeWidth={8}
                          lineJoin="round"
                          lineCap="round"
                        />
                        {/* Inner smooth, solid sleek path */}
                        <Polyline
                          coordinates={[pt1, pt2]}
                          strokeColor={colors.solid}
                          strokeWidth={3}
                          lineJoin="round"
                          lineCap="round"
                        />
                      </React.Fragment>
                    );
                  }

                  return (
                    <React.Fragment key={`trail-group-${member.id}`}>
                      {segments}
                    </React.Fragment>
                  );
                })}
            </MapView>

            {/* Center On Me Floating Button Overlay */}
            {userLocation && (
              <TouchableOpacity
                style={styles.centerButton}
                onPress={centerOnUser}
                activeOpacity={0.7}
                accessibilityLabel="Center on my location"
              >
                <Navigation color="#fff" size={16} fill="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.mapFooter}>Real-time Map centred on your device location</Text>
        </View>

        {/* Severe Weather Alert Banner */}
        {familyMembers.some((m) => m.weatherIsSevere) && (
          <View
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderWidth: 1,
              borderColor: '#ef4444',
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 20 }}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>
                Severe Weather Alert
              </Text>
              <Text style={{ color: '#fca5a5', fontSize: 12, marginTop: 2 }}>
                {familyMembers
                  .filter((m) => m.weatherIsSevere)
                  .map((m) => m.name)
                  .join(' & ')}{' '}
                is currently experiencing hazardous conditions (
                {familyMembers.find((m) => m.weatherIsSevere)?.weatherDesc || 'Thunderstorms'}).
              </Text>
            </View>
          </View>
        )}

        {/* Family Cards List */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Family Members</Text>
          {lastUpdatedTime ? (
            <Text style={styles.lastUpdatedText}>Updated: {lastUpdatedTime}</Text>
          ) : null}
        </View>

        {familyMembers.map((member) => (
          <View key={member.id} style={styles.familyCard}>
            <View style={styles.rowBetween}>
              <View style={styles.familyMemberInfo}>
                <View style={[styles.colorIndicator, { backgroundColor: member.color }]} />
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.familyName}>
                      {member.name === userName ? `${member.name} (You)` : member.name}
                    </Text>
                    {member.weatherTemp !== undefined && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: '#0f172a',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 12,
                          gap: 4,
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>{member.weatherEmoji}</Text>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                          {member.weatherTemp}°
                        </Text>
                      </View>
                    )}
                    {member.weatherIsSevere && (
                      <View
                        style={{
                          backgroundColor: '#ef4444',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 12,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>
                          ⚠️ SEVERE
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: member.deviceStatus === 'Active' ? '#10b981' : '#64748b',
                      }}
                    />
                    <Text
                      style={{
                        color: member.deviceStatus === 'Active' ? '#34d399' : '#94a3b8',
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {member.deviceStatus || 'Active'}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: 11 }}>•</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>{member.status}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.familyRightSide}>
                <Text style={styles.familyDistance}>{member.distance}</Text>
                <Text style={styles.familyLastSeen}>Seen {member.lastSeen}</Text>
              </View>
            </View>

            <View style={styles.familyDivider} />

            <View style={styles.familyFooter}>
              <View style={styles.batteryRow}>
                <BatteryIcon
                  color={member.battery < 20 ? '#ef4444' : member.charging ? '#10b981' : '#9ca3af'}
                  size={16}
                />
                <Text style={[styles.batteryText, member.battery < 20 && styles.lowBatteryText]}>
                  {member.battery}% {member.charging ? '(Charging)' : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {member.name !== userName && (
                  <TouchableOpacity
                    style={[styles.pingButton, { backgroundColor: '#3b82f6' }]}
                    onPress={() => handleNudgeMember(member)}
                  >
                    <Text style={styles.pingText}>📳 Nudge</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.pingButton}
                  onPress={() =>
                    Alert.alert(
                      `Ping Sent`,
                      `Requested immediate location update from ${member.name}.`
                    )
                  }
                >
                  <Text style={styles.pingText}>Ping Device</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {/* Tracking Controls Status Card */}
        <View style={[styles.card, { marginTop: 20 }]}>
          <View style={styles.rowBetween}>
            <View style={styles.iconDescRow}>
              <Navigation color="#3b82f6" size={24} />
              <View style={styles.textColumn}>
                <Text style={styles.cardTitle}>Background Tracking</Text>
                <Text style={styles.cardSubtitle}>Persists across boots & close</Text>
              </View>
            </View>
            <Switch
              value={isBackgroundTracking}
              onValueChange={toggleBackgroundTracking}
              trackColor={{ false: '#374151', true: '#10b981' }}
              thumbColor={isBackgroundTracking ? '#34d399' : '#9ca3af'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.statusDetailRow}>
            <Info color="#9ca3af" size={16} />
            <Text style={styles.statusText}>
              Status:{' '}
              <Text
                style={{ fontWeight: 'bold', color: isBackgroundTracking ? '#10b981' : '#f59e0b' }}
              >
                {permissionStatus}
              </Text>
            </Text>
          </View>

          {userLocation && (
            <View style={styles.coordsBlock}>
              <Text style={styles.coordsHeader}>My Coordinates ({userName})</Text>
              <Text style={styles.coordsBody}>
                Lat: {userLocation.coords.latitude.toFixed(6)} | Lng:{' '}
                {userLocation.coords.longitude.toFixed(6)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.refreshButton, updatingLocation && styles.disabledButton]}
            onPress={refreshLocation}
            disabled={updatingLocation}
          >
            <RefreshCw color="#fff" size={16} style={updatingLocation ? styles.spin : null} />
            <Text style={styles.refreshButtonText}>
              {updatingLocation ? 'Locating...' : 'Force Update Live Location'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Share Invite Card */}
        <View style={[styles.inviteCard, { marginTop: 10 }]}>
          <View style={styles.rowBetween}>
            <View style={styles.iconDescRow}>
              <Share2 color="#f43f5e" size={24} />
              <View style={styles.textColumn}>
                <Text style={styles.cardTitle}>Add Family Members</Text>
                <Text style={styles.cardSubtitle}>Share setup instructions & link</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.inviteButton} onPress={shareAppInvite}>
              <Text style={styles.inviteButtonText}>Invite</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Triage Diagnostics Button */}
        <TouchableOpacity
          style={[styles.triageToggleButton, showTriageConsole && styles.triageActiveButton]}
          onPress={() => setShowTriageConsole(!showTriageConsole)}
          activeOpacity={0.8}
        >
          <Text style={styles.triageToggleText}>
            {showTriageConsole ? '🛑 Close Diagnostics Panel' : '🔧 Open Diagnostics & Logs'}
          </Text>
        </TouchableOpacity>

        {/* Triage Diagnostics Console Panel */}
        {showTriageConsole && (
          <View style={styles.triageCard}>
            <View style={styles.triageHeader}>
              <View style={styles.triageHeaderTitleCol}>
                <View style={styles.triagePulseDot} />
                <Text style={styles.triageHeaderTitle}>System Diagnostics Console</Text>
              </View>
              <Text style={styles.triageDeviceText}>Local Node Diagnostics</Text>
            </View>

            <ScrollView
              style={styles.triageLogsContainer}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
              {diagnosticLogs.length === 0 ? (
                <Text style={styles.triageNoLogsText}>
                  No logs found. Perform some actions to populate.
                </Text>
              ) : (
                diagnosticLogs.map((log, idx) => (
                  <Text key={`log-${idx}`} style={styles.triageLogLine}>
                    {log}
                  </Text>
                ))
              )}
            </ScrollView>

            <View style={styles.triageActionsRow}>
              <TouchableOpacity style={styles.triageActionButton} onPress={loadDiagnosticLogs}>
                <Text style={styles.triageActionText}>🔄 Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.triageActionButton, styles.triageClearButton]}
                onPress={clearDiagnosticLogs}
              >
                <Text style={styles.triageActionText}>🧹 Clear Logs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.triageActionButton, styles.triageShareButton]}
                onPress={shareDiagnosticLogs}
              >
                <Text style={styles.triageActionText}>📋 Share Logs</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Version/Build Footer */}
        <View style={styles.footerBlock}>
          <Text style={styles.footerText}>Where's my family!! • v1.2.0</Text>
          <Text style={styles.footerSubText}>Build 112 • Commit e81aa3b</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Styling
const styles = StyleSheet.create({
  window: {
    flex: 1,
    backgroundColor: '#0f172a', // Slate 900
    paddingTop: Platform.OS === 'android' ? 40 : 50,
  },
  panicWindow: {
    backgroundColor: '#310d0d', // Deep red
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  alertCount: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareIconHeader: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  inviteCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  inviteButton: {
    backgroundColor: '#f43f5e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: '#1e293b', // Slate 800
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconDescRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textColumn: {
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 14,
  },
  statusDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  coordsBlock: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  coordsHeader: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  coordsBody: {
    color: '#38bdf8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    marginTop: 4,
  },
  refreshButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  disabledButton: {
    backgroundColor: '#1d4ed8',
    opacity: 0.6,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  spin: {
    // Optional animation tag helper
  },
  mapCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  mapHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  trailToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trailToggleLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  mapHeader: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginBottom: 0,
  },
  mapCanvas: {
    width: '100%',
    height: 240,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#334155',
  },
  mapRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.4)',
  },
  userDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f43f5e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  userDotPulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
  },
  userDotLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    position: 'absolute',
    marginTop: 36,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  familyDot: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  dotNameContainer: {
    position: 'absolute',
    top: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dotName: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  mapFooter: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 10,
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 0,
    marginTop: 0,
  },
  lastUpdatedText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  familyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  familyMemberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorIndicator: {
    width: 6,
    height: 36,
    borderRadius: 3,
  },
  familyName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  familyStatus: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  familyRightSide: {
    alignItems: 'flex-end',
  },
  familyDistance: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: 'bold',
  },
  familyLastSeen: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  familyDivider: {
    height: 1,
    backgroundColor: '#293548',
    marginVertical: 10,
  },
  familyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batteryText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  lowBatteryText: {
    color: '#f87171',
    fontWeight: 'bold',
  },
  centerButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.9)', // Slate 800 semi-transparent
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569', // Slate 600
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  pingButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: '#293548',
  },
  pingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  panicButton: {
    backgroundColor: '#e11d48', // Rose 600
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    shadowColor: '#f43f5e',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  panicButtonActive: {
    backgroundColor: '#4c0519', // Dark burgundy rose
    borderColor: '#e11d48',
    borderWidth: 1,
  },
  panicButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  onboardingCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
  onboardingTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  onboardingSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  inputLabel: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  onboardingInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#fff',
    fontSize: 16,
    padding: 12,
    marginBottom: 20,
  },
  onboardingButton: {
    backgroundColor: '#f43f5e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  footerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 10,
    paddingVertical: 10,
  },
  footerText: {
    color: '#475569', // Slate 600
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footerSubText: {
    color: '#334155', // Slate 700
    fontSize: 9,
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  triageToggleButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  triageActiveButton: {
    borderColor: '#10b981',
    backgroundColor: '#0f172a',
  },
  triageToggleText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  triageCard: {
    backgroundColor: '#020617', // Dark slate/almost black
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    marginTop: 10,
  },
  triageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 8,
    marginBottom: 8,
  },
  triageHeaderTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triagePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  triageHeaderTitle: {
    color: '#10b981', // Neon green
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  triageDeviceText: {
    color: '#475569',
    fontSize: 10,
  },
  triageLogsContainer: {
    maxHeight: 180,
    minHeight: 100,
    backgroundColor: '#090d16',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  triageNoLogsText: {
    color: '#475569',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    marginTop: 20,
  },
  triageLogLine: {
    color: '#34d399', // bright light green
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
    marginBottom: 4,
  },
  triageActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  triageActionButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  triageClearButton: {
    borderColor: '#ef4444',
  },
  triageShareButton: {
    borderColor: '#3b82f6',
  },
  triageActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});

// Safe helper to mark interactive dynamically to prevent startup crash in Expo Go
function safeMarkInteractive() {
  console.log('[EAS Observe]: Performance monitoring disabled on SDK 54.');
}

// Safe wrapper for EAS Observe Root (bypasses native crashes in Expo Go)
function SafeObserveRoot({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: '#0f172a' }}>{children}</View>;
}

export default function App() {
  return (
    <SafeObserveRoot>
      <MainApp />
    </SafeObserveRoot>
  );
}
