import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Battery, BatteryLow, BatteryMedium, BatteryCharging } from 'lucide-react-native';
import { FamilyMember } from '../types';

interface FamilyListProps {
  familyMembers: FamilyMember[];
  userName: string | null;
  lastUpdatedTime: string;
  handleNudgeMember: (member: FamilyMember) => void;
  handlePingMember: (member: FamilyMember) => void;
  handleDeleteMember: (member: FamilyMember) => void;
  onMemberPress?: (member: FamilyMember) => void;
}

// --- Platform SVG Logos ---
const AppleLogo = ({ size = 13, color = '#94a3b8' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.85 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.91 18.39 7.14 19.59 9.82C19.49 9.88 17.5 10.97 17.52 13.51C17.55 16.56 20.18 17.58 20.21 17.59C20.19 17.65 19.78 18.96 18.71 19.5M15.97 4.17C16.63 3.37 17.07 2.28 16.95 1C16 1.05 14.9 1.61 14.25 2.41C13.68 3.19 13.19 4.31 13.34 5.56C14.39 5.64 15.4 5.02 15.97 4.17Z" />
  </Svg>
);

const AndroidLogo = ({ size = 13, color = '#3ddc84' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M17.52 12a1.24 1.24 0 1 1-1.24-1.24 1.24 1.24 0 0 1 1.24 1.24zM8.96 10.76A1.24 1.24 0 1 0 10.2 12a1.24 1.24 0 0 0-1.24-1.24zM12 5a7.84 7.84 0 0 0-6.16 3h12.32A7.84 7.84 0 0 0 12 5zm5.72-1.9l1.15-2a.37.37 0 0 0-.13-.5.37.37 0 0 0-.5.13l-1.17 2a8.61 8.61 0 0 0-6.14 0l-1.17-2a.37.37 0 0 0-.5-.13.37.37 0 0 0-.13.5l1.15 2A8.44 8.68 0 0 0 3 11h18a8.44 8.68 0 0 0-3.28-7.9z" />
  </Svg>
);

const getMemberPlatform = (member: FamilyMember, userName: string | null) => {
  if (member.platform) return member.platform;
  if (member.name === userName) return Platform.OS;

  let hash = 0;
  const name = member.name || '';
  for (let i = 0; i < name.length; i++) {
    hash += name.charCodeAt(i);
  }
  return hash % 2 === 0 ? 'android' : 'ios';
};

/**
 * Memoized Family Member Card representing a single device's status and tracking state
 */
const FamilyMemberCard = React.memo(
  ({
    member,
    userName,
    handleNudgeMember,
    handlePingMember,
    handleDeleteMember,
    onMemberPress,
  }: {
    member: FamilyMember;
    userName: string | null;
    handleNudgeMember: (member: FamilyMember) => void;
    handlePingMember: (member: FamilyMember) => void;
    handleDeleteMember: (member: FamilyMember) => void;
    onMemberPress?: (member: FamilyMember) => void;
  }) => {
    return (
      <View style={styles.familyCard}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onMemberPress?.(member)}
        >
          <View style={styles.rowBetween}>
            <View style={styles.familyMemberInfo}>
              <View style={[styles.colorIndicator, { backgroundColor: member.color }]} />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.familyName}>
                    {member.name === userName ? `${member.name} (You)` : member.name}
                  </Text>
                  {getMemberPlatform(member, userName) === 'android' ? (
                    <AndroidLogo size={13} color="#3ddc84" />
                  ) : (
                    <AppleLogo size={13} color="#94a3b8" />
                  )}
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
                        {member.weatherTemp}°C
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
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
        </TouchableOpacity>

        <View style={styles.familyDivider} />

        <View style={styles.familyFooter}>
          <View style={styles.batteryRow}>
            {member.charging ? (
              <BatteryCharging color="#10b981" size={16} />
            ) : member.battery < 20 ? (
              <BatteryLow color="#ef4444" size={16} />
            ) : member.battery < 60 ? (
              <BatteryMedium color="#94a3b8" size={16} />
            ) : (
              <Battery color="#94a3b8" size={16} />
            )}
            <Text style={[styles.batteryText, member.battery < 20 && styles.lowBatteryText]}>
              {member.battery}% {member.charging ? '(Charging)' : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
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
              onPress={() => handlePingMember(member)}
            >
              <Text style={styles.pingText}>Ping Device</Text>
            </TouchableOpacity>
            {member.name !== userName && (
              <TouchableOpacity
                style={[styles.pingButton, { backgroundColor: '#ef4444' }]}
                onPress={() => handleDeleteMember(member)}
              >
                <Text style={styles.pingText}>🗑️ Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  },
  (prev, next) => {
    // Exact structural equality comparison to protect against rendering thrashing
    return (
      prev.member.id === next.member.id &&
      prev.member.name === next.member.name &&
      prev.member.status === next.member.status &&
      prev.member.battery === next.member.battery &&
      prev.member.charging === next.member.charging &&
      prev.member.deviceStatus === next.member.deviceStatus &&
      prev.member.distance === next.member.distance &&
      prev.member.lastSeen === next.member.lastSeen &&
      prev.member.weatherTemp === next.member.weatherTemp &&
      prev.member.weatherIsSevere === next.member.weatherIsSevere &&
      prev.member.nudgeRequested === next.member.nudgeRequested &&
      prev.member.pingRequested === next.member.pingRequested &&
      prev.userName === next.userName
    );
  }
);

export default function FamilyList({
  familyMembers,
  userName,
  lastUpdatedTime,
  handleNudgeMember,
  handlePingMember,
  handleDeleteMember,
  onMemberPress,
}: FamilyListProps) {
  return (
    <View style={{ marginTop: 10 }}>
      {/* List Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>Family Members</Text>
        {lastUpdatedTime ? (
          <Text style={styles.lastUpdatedText}>Updated: {lastUpdatedTime}</Text>
        ) : null}
      </View>

      {/* Member Cards */}
      {familyMembers.map((member) => (
        <FamilyMemberCard
          key={member.id}
          member={member}
          userName={userName}
          handleNudgeMember={handleNudgeMember}
          handlePingMember={handlePingMember}
          handleDeleteMember={handleDeleteMember}
          onMemberPress={onMemberPress}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
});
