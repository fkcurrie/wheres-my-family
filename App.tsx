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
import { ShieldAlert, Share2, RefreshCw, Info, MessageSquare } from 'lucide-react-native';

// --- Modular Service & Component Imports ---
import { addDiagnosticLog } from './src/services/Logger';
import { checkAndHandleNudge, requestNotificationPermissions } from './src/services/Notifications';
import { cleanAndSortTrail, fetchSnappedTrail, updateAndGetLocalTrail } from './src/services/OSRM';
import {
  fetchMantleDB,
  publishLocation,
  requestNudgeMember,
  deleteMember,
  clearNudgeState,
} from './src/services/MantleDB';
import { getDistanceInKm } from './src/services/Helpers';
import { FamilyMember, TrailCoord } from './src/types';

import Onboarding from './src/components/Onboarding';
import FamilyList from './src/components/FamilyList';
import MapViewContainer from './src/components/MapViewContainer';
import LogTerminal from './src/components/LogTerminal';
import FeedbackModal from './src/components/FeedbackModal';

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

// --- Speed-Adaptive Tracking Controller ---
/**
 * Dynamic battery-aware speed tracking controller.
 * Scales tracking resolution based on current movement speed (e.g. driving vs. walking/stationary).
 * @param speed Current speed in meters per second (1 m/s = 3.6 km/h)
 */
export const updateBackgroundTrackingMode = async (speed: number) => {
  try {
    const isMovingFast = speed > 8; // Speed > 8 m/s (~29 km/h) is considered driving
    const currentMode = await AsyncStorage.getItem('tracking_mode');
    const targetMode = isMovingFast ? 'fast' : 'standard';

    if (currentMode === targetMode) {
      return; // Already configured in correct mode
    }

    await AsyncStorage.setItem('tracking_mode', targetMode);
    await addDiagnosticLog(
      `[Adaptive GPS] Speed: ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(1)} km/h). Reconfiguring background location to ${targetMode.toUpperCase()} mode.`
    );

    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK_NAME);
    if (isRegistered) {
      const options = isMovingFast
        ? {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, // 5s interval when driving
            distanceInterval: 5, // 5m precision when driving
            deferredUpdatesInterval: 5000,
            deferredUpdatesDistance: 5,
          }
        : {
            accuracy: Location.Accuracy.High,
            timeInterval: 30000, // 30s standard interval
            distanceInterval: 50, // 50m standard precision
            deferredUpdatesInterval: 30000,
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
    }
  } catch (err: any) {
    console.warn('[Adaptive Tracking Error]:', err);
    await addDiagnosticLog(`[Adaptive Tracking Error] Failed: ${err.message}`);
  }
};

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
          // Cache historical trail coordinates
          for (let i = 0; i < sortedLocations.length - 1; i++) {
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
            // Adapt background tracking rate dynamically based on current speed
            await updateBackgroundTrackingMode(speed);

            await publishLocation(
              savedName,
              latestLoc.coords.latitude,
              latestLoc.coords.longitude,
              speed > 8 ? 'Driving Mode' : 'Background Tracking',
              {},
              latestLoc.timestamp
            );
          }

          // Immediately check for family nudges
          await checkAndHandleNudge(savedName);
        }
      } catch (err) {
        console.error('[Background Location Task Error]:', err);
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
  const [panicActive, setPanicActive] = useState<boolean>(false);
  const [updatingLocation, setUpdatingLocation] = useState<boolean>(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [showTriageConsole, setShowTriageConsole] = useState<boolean>(false);
  const [feedbackVisible, setFeedbackVisible] = useState<boolean>(false);

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
        // Direct local nudge foreground handling
        if (userName && data[userName] && data[userName].nudgeRequested === true) {
          Vibration.vibrate([0, 500, 200, 500]);
          await addDiagnosticLog(`[Nudge] RECEIVED a nudge vibration request in foreground!`);
          Alert.alert('📳 Family Nudge!', 'Someone in your family is nudging you to check in!');
          await clearNudgeState(userName, data[userName]);
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

            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
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
  }, [userName]);

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
          // If already snapped, avoid re-fetching
          if (newSnappedTrails[member.id]) continue;

          try {
            await addDiagnosticLog(`[OSRM] Requesting snapped route caching for ${member.name}`);
            const snapped = await fetchSnappedTrail(cleanTrail);
            newSnappedTrails[member.id] = snapped;
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
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      await addDiagnosticLog(`[Background Fetch] Registered periodic nudge check (15m).`);
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
        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK_NAME, {
          accuracy: Location.Accuracy.High,
          timeInterval: 30000,
          distanceInterval: 0,
          deferredUpdatesInterval: 30000,
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
        setIsBackgroundTracking(true);
        setPermissionStatus('Granted (Background Active)');
        await addDiagnosticLog('[Background Sync] REGISTERED successfully. Interval: 30 sec.');
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
    } catch (err) {
      Alert.alert('Nudge Failed', 'Failed to dispatch notification nudge.');
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
            } catch (err) {
              Alert.alert('Error', 'Could not remove device.');
            }
          },
        },
      ]
    );
  };

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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Live Map View Container */}
        <MapViewContainer
          userLocation={userLocation}
          familyMembers={familyMembers}
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
          handleDeleteMember={handleDeleteMember}
        />

        {/* Global Real-time Diagnostics Terminal Overlay */}
        <LogTerminal
          showTriageConsole={showTriageConsole}
          setShowTriageConsole={setShowTriageConsole}
        />

        {/* Version Footer */}
        <Text style={styles.footerText}>
          Where's my family!! • v1.0.10{'\n'}
          E2EE Data Residency: Canada, Switzerland, or Iceland
        </Text>
      </ScrollView>

      {/* Slide-Up Feedback Drawer Modal */}
      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
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
