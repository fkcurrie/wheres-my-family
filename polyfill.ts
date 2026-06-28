/* eslint-disable import/first */
// Polyfill global.crypto.getRandomValues for CryptoJS compatibility in React Native
try {
  const customGetRandomValues = function (array: any) {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };

  if (!global.crypto) {
    (global as any).crypto = {};
  }

  try {
    Object.defineProperty(global.crypto, 'getRandomValues', {
      value: customGetRandomValues,
      configurable: true,
      writable: true,
    });
  } catch (e) {
    // If global.crypto is read-only, we try to overwrite the global.crypto property itself
    Object.defineProperty(global, 'crypto', {
      value: { getRandomValues: customGetRandomValues },
      configurable: true,
      writable: true,
    });
  }
} catch (err) {
  console.warn('[Polyfill] Failed to configure global.crypto polyfill:', err);
}
