export interface TrailCoord {
  latitude: number;
  longitude: number;
  timestamp?: number;
}

export interface WeatherInfo {
  temp: number;
  emoji: string;
  desc: string;
  isSevere: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  status: string;
  distance: string;
  battery: number;
  charging: boolean;
  deviceStatus: string;
  lastSeen: string;
  latitude?: number;
  longitude?: number;
  color: string;
  isReal?: boolean;
  weatherTemp?: number;
  weatherEmoji?: string;
  weatherDesc?: string;
  weatherIsSevere?: boolean;
  nudgeRequested?: boolean;
  pingRequested?: boolean;
  updatedAt?: number;
  trail?: TrailCoord[];
  platform?: string;
  latOffset?: number;
  lngOffset?: number;
  source?: 'HTTPS' | 'SMS';
  network?: {
    networkType: 'wifi' | 'cellular' | 'none' | 'unknown';
    networkGen?: string;
    wifiSSID?: string;
    wifiStrength?: number;
    latencyMs: number;
    connectionBars: number;
  };
}
