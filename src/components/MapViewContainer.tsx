import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Switch,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Navigation } from 'lucide-react-native';
import { FamilyMember, TrailCoord } from '../types';
import { cleanAndSortTrail } from '../services/OSRM';

interface MapViewContainerProps {
  userLocation: any | null;
  familyMembers: FamilyMember[];
  showTrails: boolean;
  setShowTrails: (val: boolean) => void;
  snappedTrails: Record<string, TrailCoord[]>;
  mapRef: React.RefObject<MapView | null>;
}

// --- Gradient Trail Helpers ---
// Interpolate color from Emerald Green (most recent) to Vibrant Red (approaching 24h old)
const interpolateTrailColor = (ageMs: number): { solid: string; glow: string } => {
  const limit = 24 * 60 * 60 * 1000; // 24 hours in ms
  const safeAgeMs = isNaN(ageMs) ? 0 : Math.max(0, Math.min(limit, ageMs));
  const ratio = safeAgeMs / limit;

  // Emerald Green: rgb(34, 197, 94) -> R=34, G=197, B=94
  // Vibrant Red: rgb(239, 68, 68) -> R=239, G=68, B=68
  const r = Math.round(34 + (239 - 34) * ratio);
  const g = Math.round(197 + (68 - 197) * ratio);
  const b = Math.round(94 + (68 - 94) * ratio);

  return {
    solid: `rgb(${r}, ${g}, ${b})`,
    glow: `rgba(${r}, ${g}, ${b}, 0.25)`,
  };
};

// Precompute timestamps for each snapped coordinate using a linear-sweep monotonic pointer
const precomputeTrailTimestamps = (
  coordinates: TrailCoord[],
  rawTrail: any[] | undefined
): number[] => {
  if (coordinates.length === 0) return [];
  
  const parseTimestamp = (val: any): number | null => {
    if (!val) return null;
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      if (num < 10000000000) return num * 1000;
      return num;
    }
    const parsedDate = Date.parse(val);
    if (!isNaN(parsedDate) && parsedDate > 0) {
      return parsedDate;
    }
    return null;
  };

  if (!rawTrail || rawTrail.length === 0) {
    const limit = 24 * 60 * 60 * 1000;
    const now = Date.now();
    return coordinates.map((_, i) => now - (1 - i / (coordinates.length - 1 || 1)) * limit);
  }

  const parsedTrail = rawTrail
    .map((pt) => ({
      latitude: pt.latitude,
      longitude: pt.longitude,
      timestamp: parseTimestamp(pt.timestamp) || Date.now(),
    }))
    .filter((pt) => pt.latitude !== 0 && pt.longitude !== 0);

  if (parsedTrail.length === 0) {
    const limit = 24 * 60 * 60 * 1000;
    const now = Date.now();
    return coordinates.map((_, i) => now - (1 - i / (coordinates.length - 1 || 1)) * limit);
  }

  const timestamps: number[] = [];
  let trailIdx = 0;

  for (let i = 0; i < coordinates.length; i++) {
    const coord = coordinates[i];
    let minDistance = Infinity;
    let bestIdx = trailIdx;

    // Search forward in a moving sliding window of size 25 (extremely fast and jitter-resistant)
    const searchEnd = Math.min(parsedTrail.length, trailIdx + 25);
    for (let j = trailIdx; j < searchEnd; j++) {
      const pt = parsedTrail[j];
      const dist =
        Math.pow(pt.latitude - coord.latitude, 2) + Math.pow(pt.longitude - coord.longitude, 2);
      if (dist < minDistance) {
        minDistance = dist;
        bestIdx = j;
      }
    }

    trailIdx = bestIdx;
    timestamps.push(parsedTrail[bestIdx].timestamp);
  }

  return timestamps;
};

/**
 * Highly optimized memoized Map Marker to prevent expensive native marker recreation
 */
const MemoizedMarker = React.memo(
  ({
    coordinate,
    title,
    description,
    pinColor,
  }: {
    coordinate: { latitude: number; longitude: number };
    title: string;
    description: string;
    pinColor: string;
  }) => {
    return (
      <Marker
        coordinate={coordinate}
        title={title}
        description={description}
        pinColor={pinColor}
      />
    );
  },
  (prev, next) => {
    return (
      prev.coordinate.latitude === next.coordinate.latitude &&
      prev.coordinate.longitude === next.coordinate.longitude &&
      prev.title === next.title &&
      prev.description === next.description &&
      prev.pinColor === next.pinColor
    );
  }
);

export default function MapViewContainer({
  userLocation,
  familyMembers,
  showTrails,
  setShowTrails,
  snappedTrails,
  mapRef,
}: MapViewContainerProps) {
  // Center Map on User's Location on Demand
  const centerOnUser = useCallback(() => {
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
  }, [userLocation, mapRef]);

  const userCoord = {
    latitude: userLocation?.coords.latitude || 43.6532,
    longitude: userLocation?.coords.longitude || -79.3832,
  };

  return (
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
            latitude: userCoord.latitude,
            longitude: userCoord.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {/* User's Marker */}
          {userLocation && (
            <MemoizedMarker
              coordinate={userCoord}
              title="You"
              description="Your current location"
              pinColor="#f43f5e"
            />
          )}

          {/* Family Members' Markers */}
          {familyMembers.map((member) => {
            const memberLat =
              member.latitude !== undefined
                ? member.latitude
                : (userLocation?.coords.latitude || 43.6532) + (member.latOffset || 0) / 5000;
            const memberLng =
              member.longitude !== undefined
                ? member.longitude
                : (userLocation?.coords.longitude || -79.3832) + (member.lngOffset || 0) / 5000;

            return (
              <MemoizedMarker
                key={member.id}
                coordinate={{ latitude: memberLat, longitude: memberLng }}
                title={member.name}
                description={`${member.status} (${member.distance})`}
                pinColor={member.color}
              />
            );
          })}

          {/* Color-graded Trails */}
          {showTrails &&
            familyMembers.map((member) => {
              const cleanTrail = cleanAndSortTrail(member.trail);
              if (cleanTrail.length < 2) return null;

              // Use snapped coordinates from OSRM if available, otherwise fall back to clean trail coords
              const coordinates =
                snappedTrails[member.id] ||
                cleanTrail.map((pt: any) => ({
                  latitude: pt.latitude,
                  longitude: pt.longitude,
                }));

              if (coordinates.length < 2) return null;

              // Precompute mapped timestamps for each segment endpoint in O(N + M) linear time
              const precomputedTimestamps = precomputeTrailTimestamps(coordinates, cleanTrail);

              // Render individual segments with color-graded polylines
              const segments: React.ReactNode[] = [];
              for (let i = 0; i < coordinates.length - 1; i++) {
                const pt1 = coordinates[i];
                const pt2 = coordinates[i + 1];

                const ts1 = precomputedTimestamps[i];
                const ts2 = precomputedTimestamps[i + 1];
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
                <React.Fragment key={`trail-group-${member.id}`}>{segments}</React.Fragment>
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
  );
}

const styles = StyleSheet.create({
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
  mapFooter: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 10,
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
});
