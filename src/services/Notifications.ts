import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { addDiagnosticLog } from './Logger';
import { MANTLE_DB_URL, MANTLE_KEY, publishLocation } from './MantleDB';

// Configure local notification behaviors globally
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldVibrate: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request OS Notification Permissions and configure custom high-importance channel on Android
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'android') {
      // 1. Create Default Channel with Lock Screen visibility
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // 2. Create Dedicated Nudges Channel with lock screen and heads-up enabled
      await Notifications.setNotificationChannelAsync('nudges', {
        name: 'Family Nudges',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: '#e11d48',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false, // Strict focus compliance
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: false,
          allowCriticalAlerts: false,
        },
      });
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      await addDiagnosticLog('[Notifications Warning] Permissions denied.');
      return false;
    }
    await addDiagnosticLog('[Notifications Success] Permissions granted.');
    return true;
  } catch (err: any) {
    await addDiagnosticLog(`[Notifications Error] Request failed: ${err.message || String(err)}`);
    return false;
  }
};

/**
 * Perform a background nudge polling check, vibrate, and schedule high-priority push
 */
export const checkAndHandleNudge = async (savedName: string): Promise<boolean> => {
  try {
    const res = await fetch(MANTLE_DB_URL, {
      headers: {
        'X-Mantle-Key': MANTLE_KEY,
      },
    });
    const data = await res.json();
    if (data && !data.error && data[savedName]) {
      const userData = data[savedName];
      let triggeredNudge = false;

      // 1. Process Background Ping (GPS Pull) Request
      if (userData.pingRequested === true) {
        console.log(`[Ping Backend] Ping detected in background for user: "${savedName}"`);
        await addDiagnosticLog(`[Background Ping] RECEIVED ping request! Responding immediately.`);
        try {
          // Immediately fetch the current high-accuracy location
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          // Publish the updated location with status "Ping Response (BG)" and clear the pingRequested flag
          await publishLocation(
            savedName,
            loc.coords.latitude,
            loc.coords.longitude,
            'Ping Response (BG)',
            { pingRequested: false }
          );
          await addDiagnosticLog(`[Background Ping] Successfully processed ping and pushed location.`);
        } catch (err: any) {
          console.warn('[Background Ping Response Error]:', err);
          await addDiagnosticLog(`[Background Ping Error] Failed: ${err.message || String(err)}`);
          // Clear pingRequested anyway to prevent infinite loops
          const clearedUser = {
            ...userData,
            pingRequested: false,
          };
          await fetch(MANTLE_DB_URL, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-Mantle-Key': MANTLE_KEY,
            },
            body: JSON.stringify({
              [savedName]: clearedUser,
            }),
          });
        }
      }

      // 2. Process Background Nudge Request
      if (userData.nudgeRequested === true) {
        console.log(`[Nudge Backend] Nudge detected in background for user: "${savedName}"`);
        await addDiagnosticLog(
          `[Background Nudge] RECEIVED nudge in background! Triggering notification.`
        );

        // Play vibration
        Vibration.vibrate([0, 500, 200, 500]);

        // Schedule OS level local notification immediately
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '📳 Family Nudge!',
            body: 'Someone in your family is nudging you to check in!',
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            interruptionLevel: 'active', // Respect Focus & DND, show immediately on lock screen (iOS)
          },
          trigger: {
            channelId: 'nudges',
          } as any,
        });

        // Clear the nudgeRequested state in DB immediately
        const clearedUser = {
          ...data[savedName],
          nudgeRequested: false,
        };
        await fetch(MANTLE_DB_URL, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Mantle-Key': MANTLE_KEY,
          },
          body: JSON.stringify({
            [savedName]: clearedUser,
          }),
        });
        await addDiagnosticLog('[Background Nudge] Cleared nudge flag on MantleDB.');
        triggeredNudge = true;
      }

      return triggeredNudge;
    }
  } catch (err) {
    console.warn('[checkAndHandleNudge Error]:', err);
    await addDiagnosticLog(
      `[Background Nudge Error] Failed checking nudge/ping: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return false;
};
