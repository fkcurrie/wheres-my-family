import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_LIMIT = 80;
const DEBOUNCE_DELAY_MS = 10000; // 10 seconds debounce

let logsBuffer: string[] = [];
let isLoaded = false;
let flushTimeout: NodeJS.Timeout | null = null;

// Initialize and load logs from disk into in-memory buffer
const ensureLoaded = async (): Promise<string[]> => {
  if (isLoaded) {
    return logsBuffer;
  }
  try {
    const raw = await AsyncStorage.getItem('diagnostic_logs');
    if (raw) {
      logsBuffer = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Logger] Error loading diagnostic logs from disk:', e);
  } finally {
    isLoaded = true;
  }
  return logsBuffer;
};

// Immediate disk flush
const flushLogsToDisk = async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  try {
    await AsyncStorage.setItem('diagnostic_logs', JSON.stringify(logsBuffer));
    console.log('[Logger] Flushed diagnostic logs to disk successfully.');
  } catch (e) {
    console.warn('[Logger] Error flushing diagnostic logs to disk:', e);
  }
};

export const addDiagnosticLog = async (msg: string) => {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const formatted = `[${timestamp}] ${msg}`;
  console.log(formatted);

  // Ensure buffer is loaded
  await ensureLoaded();

  // Prepend to buffer (latest first)
  logsBuffer.unshift(formatted);
  if (logsBuffer.length > LOG_LIMIT) {
    logsBuffer = logsBuffer.slice(0, LOG_LIMIT);
  }

  // Schedule/debounce disk flush to avoid physical disk I/O bottlenecks
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  flushTimeout = setTimeout(() => {
    flushLogsToDisk();
  }, DEBOUNCE_DELAY_MS);
};

export const getDiagnosticLogs = async (): Promise<string[]> => {
  return await ensureLoaded();
};

export const clearDiagnosticLogs = async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  logsBuffer = [];
  isLoaded = true;
  try {
    await AsyncStorage.setItem('diagnostic_logs', JSON.stringify([]));
    console.log('[Logger] Cleared diagnostic logs on disk.');
  } catch (e) {
    console.warn('[Logger] Error clearing diagnostic logs on disk:', e);
  }
};
