import { getDistanceInKm } from './Helpers';
import { addDiagnosticLog } from './Logger';
import { WeatherInfo } from '../types';

let lastWeatherLat: number | null = null;
let lastWeatherLng: number | null = null;
let lastWeatherTime: number = 0;
let lastWeatherValue: WeatherInfo | null = null;

export const getWeatherAndAlerts = async (
  latitude: number,
  longitude: number
): Promise<WeatherInfo | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm`;
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

export const getWeatherAndAlertsCached = async (
  latitude: number,
  longitude: number
): Promise<WeatherInfo | null> => {
  const now = Date.now();
  // Reuse weather data if it was fetched within last 30 minutes and we have not moved more than 3.2 km (2 miles)
  if (
    lastWeatherValue &&
    now - lastWeatherTime < 30 * 60 * 1000 &&
    lastWeatherLat !== null &&
    lastWeatherLng !== null
  ) {
    const dist = getDistanceInKm(latitude, longitude, lastWeatherLat, lastWeatherLng);
    if (dist < 3.2) {
      console.log(
        `[Weather Optimizer]: Reusing cached weather (moved ${dist.toFixed(2)} km). Saved network query.`
      );
      await addDiagnosticLog(
        `[Weather Cache] Cache hit: using ${lastWeatherValue.temp}°C, ${lastWeatherValue.desc} (moved ${dist.toFixed(2)} km)`
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
export { lastWeatherValue };
