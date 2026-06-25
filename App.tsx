import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Share,
  AppState,
  Vibration,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import MapView from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ShieldAlert,
  Share2,
  RefreshCw,
  MessageSquare,
  Settings,
  Info,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react-native';

// --- Modular Service & Component Imports ---
import { addDiagnosticLog } from './src/services/Logger';
import { checkAndHandleNudge, requestNotificationPermissions } from './src/services/Notifications';
import { cleanAndSortTrail, fetchSnappedTrail, updateAndGetLocalTrail } from './src/services/OSRM';
import {
  fetchMantleDB,
  publishLocation,
  requestNudgeMember,
  requestPingMember,
  deleteMember,
  clearNudgeState,
} from './src/services/MantleDB';
import { getDistanceInKm } from './src/services/Helpers';
import { FamilyMember, TrailCoord } from './src/types';
import { initQueueDatabase } from './src/services/SqliteQueue';

import Onboarding from './src/components/Onboarding';
import FamilyList from './src/components/FamilyList';
import MapViewContainer from './src/components/MapViewContainer';
import LogTerminal from './src/components/LogTerminal';
import FeedbackModal from './src/components/FeedbackModal';
import SettingsModal from './src/components/SettingsModal';
import { loadCustomFamilyKey } from './src/services/Crypto';

// --- Background Task Names ---
const LOCATION_TRACKING_TASK_NAME = 'background-location-task';
const BACKGROUND_FETCH_TASK_NAME = 'background-fetch-nudge-task';

// --- Global References for Stale Closure Prevention in Tasks ---
const globalStateRef = {
  userName: null as string | null,
};

// --- Background Fetch Task Definition ---
TaskManager.defineTask(BACKGROUND_FETCH_TASK_NAME, async () => {
  try {
    const savedName = globalStateRef.userName || (await AsyncStorage.getItem('user_name'));
    if (savedName) {
      await addDiagnosticLog(
        `[Background Fetch] Periodic check-in triggered for user: "${savedName}"`
      );

      // 1. Force location update when background fetch runs
      try {
        const { status: backStatus } = await Location.getBackgroundPermissionsAsync();
        if (backStatus === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (loc && loc.coords) {
            await addDiagnosticLog(
              `[Background Fetch GPS] Acquired position. Accuracy: ${loc.coords.accuracy?.toFixed(1) ?? 'N/A'}m. Publishing.`
            );
            await publishLocation(
              savedName,
              loc.coords.latitude,
              loc.coords.longitude,
              'Stationary Check-in (BG)',
              {},
              loc.timestamp
            );
          }
        } else {
          await addDiagnosticLog(
            `[Background Fetch Warning] Background GPS permission not granted.`
          );
        }
      } catch (locErr: any) {
        console.warn('[Background Fetch Location Sync Error]:', locErr);
        await addDiagnosticLog(
          `[Background Fetch GPS Error] Failed to fetch position: ${locErr.message || String(locErr)}`
        );
      }

      // 2. Poll/Process background nudges & pings
      const nudgeTriggered = await checkAndHandleNudge(savedName);
      return nudgeTriggered
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    }
  } catch (err) {
    console.error('[Background Fetch Task Error]:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
  return BackgroundFetch.BackgroundFetchResult.NoData;
});

// --- Geofencing Background Task Name ---
const GEOFENCING_TASK_NAME = 'background-geofencing-task';

// --- Unified Tracking State Controller & Geofencing ---
/**
 * Advanced tracking state controller.
 * Unifies fast tracking (driving), standard tracking, and passive dormant geofencing sleep/wakeup.
 */
export const updateTrackingToMode = async (
  mode: 'fast' | 'standard' | 'passive',
  lastCoords?: { latitude: number; longitude: number }
) => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK_NAME);
    if (!isRegistered) return;

    const currentMode = await AsyncStorage.getItem('tracking_mode');
    if (currentMode === mode && mode !== 'passive') {
      return; // Already in target mode
    }

    const remoteStandard = await AsyncStorage.getItem('remote_standard_interval');
    const remoteFast = await AsyncStorage.getItem('remote_fast_interval');
    const standardInterval = remoteStandard ? parseInt(remoteStandard, 10) : 30000;
    const fastInterval = remoteFast ? parseInt(remoteFast, 10) : 5000;

    if (mode === 'passive' && lastCoords) {
      // 1. Unregister active high-frequency updates and start passive geofencing
      await addDiagnosticLog(
        `[Geofencing] Entering PASSIVE Dormant State. Registering 100m geofence at (${lastCoords.latitude.toFixed(4)}, ${lastCoords.longitude.toFixed(4)}).`
      );

      // Down-scale GPS updates to 10-minute intervals to conserve maximum battery power
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10 * 60 * 1000,
        distanceInterval: 100,
        deferredUpdatesInterval: 10 * 60 * 1000,
        deferredUpdatesDistance: 100,
        pausesUpdatesAutomatically: true,
        foregroundService: {
          notificationTitle: "Where's my family!! Passive Mode",
          notificationBody: '💤 Dormant power-saving state active. Wake up on movement.',
          notificationColor: '#475569',
          killServiceOnDestroy: false,
        },
        showsBackgroundLocationIndicator: false,
      });

      // Register geofence
      await Location.startGeofencingAsync(GEOFENCING_TASK_NAME, [
        {
          identifier: 'stationary-fence',
          latitude: lastCoords.latitude,
          longitude: lastCoords.longitude,
          radius: 100, // 100 meters boundary
          notifyOnExit: true,
          notifyOnEnter: false,
        },
      ]);

      await AsyncStorage.setItem('tracking_mode', 'passive');
    } else {
      // mode is 'fast' or 'standard'
      // Stop geofencing since we are moving/active
      try {
        const isGeoRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK_NAME);
        if (isGeoRegistered) {
          await Location.stopGeofencingAsync(GEOFENCING_TASK_NAME);
        }
      } catch {}

      const isMovingFast = mode === 'fast';
      const options = isMovingFast
        ? {
            accuracy: Location.Accuracy.High,
            timeInterval: fastInterval,
            distanceInterval: 5,
            deferredUpdatesInterval: fastInterval,
            deferredUpdatesDistance: 5,
          }
        : {
            accuracy: Location.Accuracy.High,
            timeInterval: standardInterval,
            distanceInterval: 50,
            deferredUpdatesInterval: standardInterval,
            deferredUpdatesDistance: 50,
          };

      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
        ...options,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: {
          notificationTitle: "Where's my family!! Active",
          notificationBody: isMovingFast
            ? '🚀 Fast tracking active (Driving Mode enabled).'
            : 'Sharing your live location with your family in the background.',
          notificationColor: '#e11d48',
          killServiceOnDestroy: false,
        },
        showsBackgroundLocationIndicator: true,
      });

      await AsyncStorage.setItem('tracking_mode', mode);
      await addDiagnosticLog(
        `[Tracking State] Transitioned to ${mode.toUpperCase()} tracking mode.`
      );
    }
  } catch (err: any) {
    console.warn('[Tracking State Transition Error]:', err);
    await addDiagnosticLog(`[Geofencing Error] Mode switch failed: ${err.message}`);
  }
};

/**
 * Speed-adaptive background tracking controller.
 */
export const updateBackgroundTrackingMode = async (speed: number) => {
  const targetMode = speed > 8 ? 'fast' : 'standard';
  await updateTrackingToMode(targetMode);
};

// --- Geofencing Background Task Registration ---
TaskManager.defineTask(GEOFENCING_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('[Geofencing Task Error]:', error);
    await addDiagnosticLog(`[Geofencing Error] OS task failed: ${error.message}`);
    return;
  }
  if (data) {
    const { eventType, region } = data;
    if (eventType === Location.GeofencingEventType.Exit) {
      await addDiagnosticLog(
        `[Geofencing Wakeup] Left boundary "${region.identifier}". Restoring standard active tracking.`
      );
      try {
        await Location.stopGeofencingAsync(GEOFENCING_TASK_NAME);
      } catch {}

      await updateTrackingToMode('standard');
    }
  }
});

// --- Background Location Tracking Task Definition ---
TaskManager.defineTask(LOCATION_TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Background Task Error]:', error);
    await addDiagnosticLog(`[Background Error] OS Task Error: ${error.message}`);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const sortedLocations = [...locations].sort((a, b) => a.timestamp - b.timestamp);
      try {
        const savedName = globalStateRef.userName || (await AsyncStorage.getItem('user_name'));
        if (savedName) {
          // Cache all coordinates to guarantee high-density 24h trail integrity
          for (let i = 0; i < sortedLocations.length; i++) {
            const loc = sortedLocations[i];
            if (loc && loc.coords) {
              await updateAndGetLocalTrail(
                loc.coords.latitude,
                loc.coords.longitude,
                loc.timestamp
              );
            }
          }

          // Publish the latest background coordinate to MantleDB
          const latestLoc = sortedLocations[sortedLocations.length - 1];
          if (latestLoc && latestLoc.coords) {
            const speed = latestLoc.coords.speed ?? 0;
            const currentMode = await AsyncStorage.getItem('tracking_mode');

            if (speed <= 0.3 && currentMode !== 'passive') {
              // Track stationary ticks to prevent sudden geofence entries due to GPS bounce
              const stationaryCountStr =
                (await AsyncStorage.getItem('stationary_tick_count')) || '0';
              const count = parseInt(stationaryCountStr, 10) + 1;
              await AsyncStorage.setItem('stationary_tick_count', count.toString());

              if (count >= 3) {
                await updateTrackingToMode('passive', {
                  latitude: latestLoc.coords.latitude,
                  longitude: latestLoc.coords.longitude,
                });
                await AsyncStorage.setItem('stationary_tick_count', '0');

                await publishLocation(
                  savedName,
                  latestLoc.coords.latitude,
                  latestLoc.coords.longitude,
                  'Stationary (Dormant)',
                  {},
                  latestLoc.timestamp
                );
              } else {
                await updateBackgroundTrackingMode(speed);
                await publishLocation(
                  savedName,
                  latestLoc.coords.latitude,
                  latestLoc.coords.longitude,
                  'Background Tracking',
                  {},
                  latestLoc.timestamp
                );
              }
            } else {
              // Reset stationary counter if speed is active
              await AsyncStorage.setItem('stationary_tick_count', '0');

              if (currentMode === 'passive') {
                // Device is moving again, exit passive state
                await updateTrackingToMode('standard');
              } else {
                await updateBackgroundTrackingMode(speed);
              }

              await publishLocation(
                savedName,
                latestLoc.coords.latitude,
                latestLoc.coords.longitude,
                speed > 8 ? 'Driving Mode' : 'Background Tracking',
                {},
                latestLoc.timestamp
              );
            }
          }

          // Immediately check for family nudges
          await checkAndHandleNudge(savedName);
        }
      } catch (err: any) {
        console.error('[Background Location Task Error]:', err);
        await addDiagnosticLog(
          `[Background GPS Error] Failed processing updates: ${err.message || String(err)}`
        );
      }
    }
  }
});

export default function App() {
  const [userName, setUserName] = useState<string | null>(null);
  const [inputName, setInputName] = useState<string>('');
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);
  const [isBackgroundTracking, setIsBackgroundTracking] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('Unknown');

  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [snappedTrails, setSnappedTrails] = useState<Record<string, TrailCoord[]>>({});

  const [showTrails, setShowTrails] = useState<boolean>(false);
  const [panicActive] = useState<boolean>(false);
  const [updatingLocation, setUpdatingLocation] = useState<boolean>(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [showTriageConsole, setShowTriageConsole] = useState<boolean>(false);
  const [feedbackVisible, setFeedbackVisible] = useState<boolean>(false);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);

  // --- Remote Configuration & Dynamic Announcement States ---
  const [globalAnnouncement, setGlobalAnnouncement] = useState<{
    id: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'critical';
    dismissible: boolean;
  } | null>(null);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

  // Load dismissed announcements from cache on mount
  useEffect(() => {
    const loadDismissed = async () => {
      try {
        const raw = await AsyncStorage.getItem('dismissed_announcements');
        if (raw) {
          setDismissedAnnouncements(JSON.parse(raw));
        }
      } catch (err) {
        console.warn('[Remote Config] Error loading dismissed banners:', err);
      }
    };
    loadDismissed();
  }, []);

  const mapRef = useRef<MapView | null>(null);
  const userLocationRef = useRef<Location.LocationObject | null>(null);

  // Update global ref whenever username state changes
  useEffect(() => {
    globalStateRef.userName = userName;
  }, [userName]);

  // Keep location ref current for asynchronous updates
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Load registered profile from AsyncStorage on startup
  useEffect(() => {
    const initializeProfile = async () => {
      try {
        // Initialize SQLite transaction queue
        await initQueueDatabase();

        // Load custom encryption key if any
        const loadedKey = await loadCustomFamilyKey();
        await addDiagnosticLog(
          `[Crypto] Loaded active E2EE key signature: ${loadedKey === 'WheresMyFamilySecureKey2026' ? 'Default' : 'Custom'}`
        );

        // Check if background tracking preference is enabled
        let trackingEnabled = await AsyncStorage.getItem('background_tracking_enabled');
        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK_NAME);

        if (trackingEnabled === null && isRegistered) {
          // Auto-align preference on first boot if tasks are already registered
          trackingEnabled = 'true';
          await AsyncStorage.setItem('background_tracking_enabled', 'true');
        }

        if (trackingEnabled === 'true') {
          setIsBackgroundTracking(true);
          setPermissionStatus('Granted (Background Active)');

          // Aggressively re-register & resume background GPS updates on startup to ensure OS listeners are alive
          try {
            const remoteStandard = await AsyncStorage.getItem('remote_standard_interval');
            const standardInterval = remoteStandard ? parseInt(remoteStandard, 10) : 30000;

            await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
              accuracy: Location.Accuracy.High,
              timeInterval: standardInterval,
              distanceInterval: 0,
              deferredUpdatesInterval: standardInterval,
              deferredUpdatesDistance: 0,
              pausesUpdatesAutomatically: false,
              activityType: Location.ActivityType.AutomotiveNavigation,
              foregroundService: {
                notificationTitle: "Where's my family!! Active",
                notificationBody: 'Sharing your live location with your family in the background.',
                notificationColor: '#e11d48',
                killServiceOnDestroy: false,
              },
              showsBackgroundLocationIndicator: true,
            });
            await addDiagnosticLog(
              '[Background Sync] Re-registered active background GPS listener.'
            );
          } catch (locErr: any) {
            await addDiagnosticLog(
              `[Background Sync Error] Startup registration failed: ${locErr.message || String(locErr)}`
            );
          }

          // Ensure background fetch is also registered on startup
          const isFetchRegistered = await TaskManager.isTaskRegisteredAsync(
            BACKGROUND_FETCH_TASK_NAME
          );
          if (!isFetchRegistered) {
            await registerBackgroundFetchTask();
          }
        } else {
          setIsBackgroundTracking(false);
          if (isRegistered) {
            try {
              await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME);
            } catch {}
          }
        }

        const savedName = await AsyncStorage.getItem('user_name');
        if (savedName) {
          setUserName(savedName);
          setInputName(savedName);
          await addDiagnosticLog(`[Profile] Logged in as: "${savedName}"`);
        } else {
          await addDiagnosticLog('[Profile] No profile found. Loading onboarding overlay.');
        }
      } catch (err) {
        console.warn('Error loading user profile:', err);
      } finally {
        setIsLoadingUser(false);
      }
    };
    initializeProfile();
  }, []);

  // Request Notification Permissions & setup channels on startup
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  // Fetch Family Locations from MantleDB
  const fetchFamilyLocations = useCallback(async () => {
    try {
      const data = await fetchMantleDB();
      if (data && !data.error) {
        // Transparent Remote Configuration & Dynamic Announcement Banner Check
        if (data._config) {
          const config = data._config;

          // 1. Process active remote announcements
          if (config.announcement) {
            const ann = config.announcement;
            if (!dismissedAnnouncements.includes(ann.id)) {
              setGlobalAnnouncement(ann);
            } else {
              setGlobalAnnouncement(null);
            }
          } else {
            setGlobalAnnouncement(null);
          }

          // 2. Cache remote standard and driving intervals
          if (config.settings) {
            const remoteSettings = config.settings;
            if (remoteSettings.standardInterval) {
              await AsyncStorage.setItem(
                'remote_standard_interval',
                String(remoteSettings.standardInterval)
              );
            }
            if (remoteSettings.fastInterval) {
              await AsyncStorage.setItem(
                'remote_fast_interval',
                String(remoteSettings.fastInterval)
              );
            }
          }
        } else {
          setGlobalAnnouncement(null);
        }
        // Direct local nudge foreground handling
        if (userName && data[userName] && data[userName].nudgeRequested === true) {
          Vibration.vibrate([0, 500, 200, 500]);
          await addDiagnosticLog(`[Nudge] RECEIVED a nudge vibration request in foreground!`);
          Alert.alert('📳 Family Nudge!', 'Someone in your family is nudging you to check in!');
          await clearNudgeState(userName, data[userName]);
        }

        // Direct local ping foreground handling
        if (userName && data[userName] && data[userName].pingRequested === true) {
          await addDiagnosticLog(
            '[Ping] RECEIVED a ping request in foreground! Responding immediately.'
          );
          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            await publishLocation(
              userName,
              loc.coords.latitude,
              loc.coords.longitude,
              'Ping Response (FG)',
              { pingRequested: false }
            );
            await addDiagnosticLog(`[Ping Success] Responded to foreground ping.`);
          } catch (err: any) {
            console.warn('[Foreground Ping Response Error]:', err);
            await addDiagnosticLog(`[Foreground Ping Error] Failed: ${err.message || String(err)}`);
            // Clear pingRequested state anyway to prevent infinite loops
            await publishLocation(
              userName,
              userLocationRef.current?.coords.latitude || 46.8182,
              userLocationRef.current?.coords.longitude || 8.2275,
              'Ping Response (FG - Cache Fallback)',
              { pingRequested: false }
            );
          }
        }

        const currentUserLoc = userLocationRef.current;

        const fetchedMembers = Object.keys(data)
          .filter((key) => !key.startsWith('_'))
          .map((key) => {
            const m = data[key];

            let distanceStr = '0.1 km';
            if (currentUserLoc && m.latitude !== undefined && m.longitude !== undefined) {
              const dist = getDistanceInKm(
                currentUserLoc.coords.latitude,
                currentUserLoc.coords.longitude,
                m.latitude,
                m.longitude
              );
              distanceStr = dist < 0.15 ? 'Just here' : `${dist.toFixed(1)} km`;
            }

            let lastSeenStr = 'Just now';
            if (m.updatedAt) {
              const diffMin = Math.round((Date.now() - m.updatedAt) / 60000);
              if (diffMin > 0) {
                lastSeenStr = diffMin === 1 ? '1m ago' : `${diffMin}m ago`;
              }
            }

            const colors = [
              '#3b82f6', // Royal Blue
              '#10b981', // Emerald Green
              '#f59e0b', // Amber Orange
              '#ec4899', // Hot Pink
              '#8b5cf6', // Purple
              '#06b6d4', // Turquoise/Cyan
              '#ef4444', // Crimson Red
              '#f97316', // Orange
              '#eab308', // Sunflower Yellow
              '#14b8a6', // Teal
              '#d946ef', // Fuchsia
              '#6366f1', // Indigo
            ];
            const colorIdx =
              Math.abs(key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) %
              colors.length;

            return {
              id: `fetched-${key}`,
              name: key,
              status: m.status || 'Active',
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
              platform: m.platform,
            };
          });

        setFamilyMembers(fetchedMembers);

        // Update last sync text using device clock
        const now = new Date();
        setLastUpdatedTime(
          now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }
    } catch (e) {
      console.warn('Error fetching family locations:', e);
      await addDiagnosticLog(
        `[Poll Error] Failed syncing locations: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, [userName, dismissedAnnouncements]);

  // Periodic Polling (every 4 seconds) for real-time foreground updates
  useEffect(() => {
    fetchFamilyLocations();
    const interval = setInterval(fetchFamilyLocations, 4000);
    return () => clearInterval(interval);
  }, [fetchFamilyLocations]);

  // Resolve OSRM route snapping on demand when showTrails is active
  useEffect(() => {
    if (!showTrails) return;

    const snapTrailsForMembers = async () => {
      const newSnappedTrails = { ...snappedTrails };
      let changed = false;

      for (const member of familyMembers) {
        const cleanTrail = cleanAndSortTrail(member.trail);
        if (cleanTrail.length >= 2) {
          // Dynamic trail signature cache key
          const cacheKey = `${member.id}-${cleanTrail.length}-${member.updatedAt || 0}`;

          // If already snapped with this signature, avoid re-fetching
          if (newSnappedTrails[cacheKey]) continue;

          try {
            await addDiagnosticLog(`[OSRM] Requesting snapped route caching for ${member.name}`);
            const snapped = await fetchSnappedTrail(cleanTrail);
            newSnappedTrails[cacheKey] = snapped;
            changed = true;
          } catch (err) {
            console.warn(`[OSRM App Error]: Snap failed for ${member.name}:`, err);
          }
        }
      }

      if (changed) {
        setSnappedTrails(newSnappedTrails);
      }
    };

    snapTrailsForMembers();
  }, [showTrails, familyMembers, snappedTrails]);

  // Foreground GPS tracking setup with background permission requests
  useEffect(() => {
    let foregroundSub: { remove: () => void } | null = null;

    const setupForegroundLocationTracking = async () => {
      try {
        const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
        if (foreStatus !== 'granted') {
          setPermissionStatus('Denied');
          Alert.alert('Permission Denied', 'Foreground GPS permissions are required.');
          return;
        }

        // Get initial position
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation(current);
        await addDiagnosticLog(`[GPS Success] Acquired initial position.`);

        // Subscribe to real-time foreground updates
        foregroundSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000, // 4s updates
            distanceInterval: 1, // 1m sensitivity
          },
          async (loc) => {
            setUserLocation(loc);
            const speed = loc.coords.speed ?? 0;
            // Adapt background tracking dynamically based on speed
            await updateBackgroundTrackingMode(speed);

            // Auto-publish in foreground
            if (userName) {
              await publishLocation(
                userName,
                loc.coords.latitude,
                loc.coords.longitude,
                speed > 8 ? 'Driving Mode' : 'Active Foreground'
              );
            }
          }
        );

        setPermissionStatus('Granted (Active)');
      } catch (err) {
        console.warn('GPS initial watch setup error:', err);
      }
    };

    setupForegroundLocationTracking();

    return () => {
      if (foregroundSub) {
        foregroundSub.remove();
      }
    };
  }, [userName]);

  // Request & Verify Background Tasks Registration
  const registerBackgroundFetchTask = async () => {
    try {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK_NAME, {
        minimumInterval: 5 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      await addDiagnosticLog(`[Background Fetch] Registered periodic nudge & location check (5m).`);
    } catch (err: any) {
      await addDiagnosticLog(`[Background Fetch Error] Registration failed: ${err.message}`);
    }
  };

  const handleToggleBackgroundTracking = async (val: boolean) => {
    try {
      if (val) {
        // Request Background Permissions
        const { status: backStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backStatus !== 'granted') {
          Alert.alert(
            'Background Tracking Blocked',
            'To enable real-time safety tracking when your phone is in your pocket, please navigate to Settings -> App Permissions -> Location, and check "Always Allow".'
          );
          return;
        }

        // Ensure priority active delay transition
        const appState = AppState.currentState;
        if (appState !== 'active') {
          await new Promise<void>((resolve) => {
            const subscription = AppState.addEventListener('change', (nextState) => {
              if (nextState === 'active') {
                subscription.remove();
                resolve();
              }
            });
          });
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        // Register background tracking task
        const remoteStandard = await AsyncStorage.getItem('remote_standard_interval');
        const standardInterval = remoteStandard ? parseInt(remoteStandard, 10) : 30000;

        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: standardInterval,
          distanceInterval: 0,
          deferredUpdatesInterval: standardInterval,
          deferredUpdatesDistance: 0,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          foregroundService: {
            notificationTitle: "Where's my family!! Active",
            notificationBody: 'Sharing your live location with your family in the background.',
            notificationColor: '#e11d48',
            killServiceOnDestroy: false,
          },
          showsBackgroundLocationIndicator: true,
        });

        await registerBackgroundFetchTask();
        await AsyncStorage.setItem('background_tracking_enabled', 'true');
        setIsBackgroundTracking(true);
        setPermissionStatus('Granted (Background Active)');
        await addDiagnosticLog(
          `[Background Sync] REGISTERED successfully. Interval: ${(standardInterval / 1000).toFixed(0)} sec.`
        );
        Alert.alert(
          'Background Tracking Enabled',
          'Your location is now being securely shared in the background. It will persist even when the app is closed.'
        );
      } else {
        // Stop background updates
        const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK_NAME);
        if (isRegistered) {
          await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME);
        }

        const isFetchRegistered = await TaskManager.isTaskRegisteredAsync(
          BACKGROUND_FETCH_TASK_NAME
        );
        if (isFetchRegistered) {
          await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK_NAME);
        }

        await AsyncStorage.setItem('background_tracking_enabled', 'false');
        setIsBackgroundTracking(false);
        setPermissionStatus('Granted (Active Only)');
        await addDiagnosticLog('[Background Sync] UNREGISTERED by user.');
      }
    } catch (err: any) {
      console.warn('Background Toggle Error:', err);
      await addDiagnosticLog(`[Background Sync Error] Toggle failed: ${err.message}`);
    }
  };

  // Perform Immediate Manual Position Fetch & Sync
  const handleManualRefresh = async () => {
    if (!userName) return;
    setUpdatingLocation(true);
    await addDiagnosticLog('[Sync Action] Manual refresh requested by user.');
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setUserLocation(loc);
      await publishLocation(userName, loc.coords.latitude, loc.coords.longitude, 'Manual Refresh');
      await fetchFamilyLocations();
      Vibration.vibrate(100);
      Alert.alert('Location Synchronized', 'Your position has been freshly pushed to your family!');
    } catch (err: any) {
      Alert.alert('GPS Sync Failure', err.message || String(err));
    } finally {
      setUpdatingLocation(false);
    }
  };

  // Trigger Immediate Nudge Vibration request for family member
  const handleNudgeMember = async (member: FamilyMember) => {
    try {
      await requestNudgeMember(member);
      Alert.alert(
        '📳 Nudge Dispatched',
        `Successfully sent a high-importance nudge request to ${member.name}'s device.`
      );
      await addDiagnosticLog(`[Nudge Outbound] Nudged member: "${member.name}"`);
    } catch {
      Alert.alert('Nudge Failed', 'Failed to dispatch notification nudge.');
    }
  };

  // Trigger Immediate High-Accuracy GPS Ping request for family member
  const handlePingMember = async (member: FamilyMember) => {
    try {
      await requestPingMember(member);
      Alert.alert('📍 Ping Dispatched', `Requested immediate location update from ${member.name}.`);
      await addDiagnosticLog(`[Ping Outbound] Pinged member: "${member.name}"`);
    } catch {
      Alert.alert('Ping Failed', 'Failed to dispatch immediate GPS ping.');
    }
  };

  // Perform permanent deletion of device/member node
  const handleDeleteMember = async (member: FamilyMember) => {
    Alert.alert(
      'Remove Family Device?',
      `Are you sure you want to permanently delete and retire "${member.name}" from your active family tracking list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '🗑️ Delete Node',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMember(member.name);
              await addDiagnosticLog(`[Admin] Deleted retired member: "${member.name}"`);
              await fetchFamilyLocations();
              Alert.alert('Device Removed', `Successfully retired "${member.name}".`);
            } catch {
              Alert.alert('Error', 'Could not remove device.');
            }
          },
        },
      ]
    );
  };

  // Pan and center map to show selected family member
  const handleMemberPress = useCallback((member: FamilyMember) => {
    if (member.latitude !== undefined && member.longitude !== undefined && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: member.latitude,
          longitude: member.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        1000
      );
      Vibration.vibrate(50);
      addDiagnosticLog(`[UI] Focused map camera on selected member: "${member.name}"`);
    } else {
      Alert.alert(
        'Location Unavailable',
        `No coordinate data has been received yet for ${member.name}.`
      );
    }
  }, []);

  // Share App Invitation Instructions
  const shareAppInvite = async () => {
    const TESTFLIGHT_JOIN_LINK = 'https://testflight.apple.com/join/YOUR_CODE';
    const ANDROID_PREVIEW_LINK =
      'https://expo.dev/accounts/fkctor/projects/wheres-my-family/builds';

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
      await Share.share({ message: inviteMessage });
    } catch (e: any) {
      console.warn('Share app invite failure:', e);
    }
  };

  const handleSaveName = async () => {
    if (!inputName.trim()) {
      Alert.alert('Name Required', 'Please enter your name.');
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
      await fetchFamilyLocations();
    } catch (err) {
      console.warn('Save name error:', err);
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

  // If name profile is missing, force premium enrollment onboarding
  if (!userName) {
    return (
      <Onboarding
        inputName={inputName}
        setInputName={setInputName}
        handleSaveName={handleSaveName}
      />
    );
  }

  return (
    <View style={[styles.window, panicActive && styles.panicWindow]}>
      <StatusBar style="light" />

      {/* Premium Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <ShieldAlert color="#f43f5e" size={28} />
          <Text style={styles.headerTitle}>Where's my family!!</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.shareIconHeader}
            onPress={async () => {
              await addDiagnosticLog('[UI] Settings button pressed in header');
              setSettingsVisible(true);
            }}
            accessibilityLabel="System Settings"
          >
            <Settings color="#10b981" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareIconHeader}
            onPress={async () => {
              await addDiagnosticLog('[UI] Feedback button pressed in header');
              setFeedbackVisible(true);
            }}
            accessibilityLabel="Submit App Feedback"
          >
            <MessageSquare color="#38bdf8" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareIconHeader}
            onPress={shareAppInvite}
            accessibilityLabel="Share app instructions"
          >
            <Share2 color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Dynamic Remote Announcement Banner */}
      {globalAnnouncement && (
        <View
          style={[
            styles.banner,
            globalAnnouncement.type === 'warning' && styles.banner_warning,
            globalAnnouncement.type === 'success' && styles.banner_success,
            globalAnnouncement.type === 'critical' && styles.banner_critical,
            globalAnnouncement.type === 'info' && styles.banner_info,
          ]}
        >
          <View style={styles.bannerContent}>
            {globalAnnouncement.type === 'info' && <Info color="#38bdf8" size={18} />}
            {globalAnnouncement.type === 'warning' && <AlertTriangle color="#fbbf24" size={18} />}
            {globalAnnouncement.type === 'success' && <CheckCircle2 color="#34d399" size={18} />}
            {globalAnnouncement.type === 'critical' && <AlertTriangle color="#f87171" size={18} />}
            <Text
              style={[
                styles.bannerText,
                globalAnnouncement.type === 'warning' && styles.bannerText_warning,
                globalAnnouncement.type === 'success' && styles.bannerText_success,
                globalAnnouncement.type === 'critical' && styles.bannerText_critical,
                globalAnnouncement.type === 'info' && styles.bannerText_info,
              ]}
            >
              {globalAnnouncement.message}
            </Text>
          </View>
          {globalAnnouncement.dismissible && (
            <TouchableOpacity
              onPress={async () => {
                const updated = [...dismissedAnnouncements, globalAnnouncement.id];
                setDismissedAnnouncements(updated);
                await AsyncStorage.setItem('dismissed_announcements', JSON.stringify(updated));
                setGlobalAnnouncement(null);
                await addDiagnosticLog(
                  `[UI] Dismissed announcement banner: "${globalAnnouncement.id}"`
                );
              }}
              style={styles.bannerCloseButton}
              accessibilityLabel="Dismiss Announcement"
            >
              <X
                color={
                  globalAnnouncement.type === 'critical'
                    ? '#f87171'
                    : globalAnnouncement.type === 'warning'
                      ? '#fbbf24'
                      : globalAnnouncement.type === 'success'
                        ? '#34d399'
                        : '#64748b'
                }
                size={14}
              />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Live Map View Container */}
        <MapViewContainer
          userLocation={userLocation}
          familyMembers={familyMembers}
          userName={userName}
          showTrails={showTrails}
          setShowTrails={setShowTrails}
          snappedTrails={snappedTrails}
          mapRef={mapRef}
        />

        {/* Sync Status Info Bar */}
        <View style={styles.statusInfoRow}>
          <View style={styles.statusPill}>
            <View style={styles.pulseDot} />
            <Text style={styles.statusText}>{permissionStatus}</Text>
          </View>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={handleManualRefresh}
            disabled={updatingLocation}
          >
            <RefreshCw
              color="#38bdf8"
              size={13}
              style={{ transform: [{ rotate: updatingLocation ? '45deg' : '0deg' }] }}
            />
            <Text style={styles.syncButtonText}>
              {updatingLocation ? 'Syncing...' : 'Sync GPS Now'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Family Members Status List */}
        <FamilyList
          familyMembers={familyMembers}
          userName={userName}
          lastUpdatedTime={lastUpdatedTime}
          handleNudgeMember={handleNudgeMember}
          handlePingMember={handlePingMember}
          handleDeleteMember={handleDeleteMember}
          onMemberPress={handleMemberPress}
        />

        {/* Global Real-time Diagnostics Terminal Overlay */}
        <LogTerminal
          showTriageConsole={showTriageConsole}
          setShowTriageConsole={setShowTriageConsole}
        />

        {/* Version Footer */}
        <Text style={styles.footerText}>
          Where's my family!! • v1.0.23 🚀{'\n'}
          E2EE Data Residency: Toronto, Canada 🇨🇦
        </Text>
      </ScrollView>

      {/* Slide-Up Feedback Drawer Modal */}
      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />

      {/* Slide-Up Settings Drawer Modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        currentName={userName || ''}
        onSaveName={async (newName) => {
          await AsyncStorage.setItem('user_name', newName);
          setUserName(newName);
          if (userLocation) {
            await publishLocation(
              newName,
              userLocation.coords.latitude,
              userLocation.coords.longitude,
              'Name Updated'
            );
          }
          await fetchFamilyLocations();
        }}
        isBackgroundTracking={isBackgroundTracking}
        onToggleBackgroundTracking={handleToggleBackgroundTracking}
        onKeyChange={async () => {
          if (userName && userLocation) {
            await publishLocation(
              userName,
              userLocation.coords.latitude,
              userLocation.coords.longitude,
              'E2EE Key Updated'
            );
          }
          await fetchFamilyLocations();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  banner_info: {
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    borderBottomColor: 'rgba(14, 165, 233, 0.2)',
  },
  banner_warning: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderBottomColor: 'rgba(245, 158, 11, 0.2)',
  },
  banner_success: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderBottomColor: 'rgba(16, 185, 129, 0.2)',
  },
  banner_critical: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderBottomColor: 'rgba(239, 68, 68, 0.25)',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    flex: 1,
  },
  bannerText_info: {
    color: '#38bdf8',
  },
  bannerText_warning: {
    color: '#fbbf24',
  },
  bannerText_success: {
    color: '#34d399',
  },
  bannerText_critical: {
    color: '#f87171',
  },
  bannerCloseButton: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  window: {
    flex: 1,
    backgroundColor: '#0f172a', // Slate 900
    paddingTop: Platform.OS === 'ios' ? 50 : 25,
  },
  panicWindow: {
    backgroundColor: '#450a0a', // Dark red
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b', // Slate 800
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  shareIconHeader: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)', // Ocean blue semi-transparent glow
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38bdf8', // Blue neon
    marginRight: 8,
  },
  statusText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  syncButtonText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  footerText: {
    color: '#334155',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 30,
    fontWeight: '600',
  },
});
