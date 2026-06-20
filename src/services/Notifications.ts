import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDiagnosticLog } from './Logger';
import { MANTLE_DB_URL, MANTLE_KEY } from './MantleDB';

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
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
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
    if (data && !data.error && data[savedName] && data[savedName].nudgeRequested === true) {
      console.log(`[Nudge Backend] Nudge detected in background for user: "${savedName}"`);
      await addDiagnosticLog(
        `[Background Nudge] RECEIVED nudge in background! Triggering notification.`
      );

      // 1. Play vibration
      Vibration.vibrate([0, 500, 200, 500]);

      // 2. Schedule OS level local notification immediately
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📳 Family Nudge!',
          body: 'Someone in your family is nudging you to check in!',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          channelId: 'default',
        } as any,
      });

      // 3. Clear the nudgeRequested state in DB immediately
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
      return true;
    }
  } catch (err) {
    console.warn('[checkAndHandleNudge Error]:', err);
    await addDiagnosticLog(
      `[Background Nudge Error] Failed checking nudge: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return false;
};
