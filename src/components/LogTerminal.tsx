import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { getDiagnosticLogs, clearDiagnosticLogs } from '../services/Logger';

interface LogTerminalProps {
  showTriageConsole: boolean;
  setShowTriageConsole: (show: boolean) => void;
}

export default function LogTerminal({
  showTriageConsole,
  setShowTriageConsole,
}: LogTerminalProps) {
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);

  const loadDiagnosticLogsLocal = async () => {
    try {
      const logs = await getDiagnosticLogs();
      setDiagnosticLogs(logs);
    } catch (e) {
      console.warn('Failed to load diagnostic logs:', e);
    }
  };

  const clearDiagnosticLogsLocal = async () => {
    try {
      await clearDiagnosticLogs();
      setDiagnosticLogs([]);
    } catch (e) {
      console.warn('Failed to clear diagnostic logs:', e);
    }
  };

  const shareDiagnosticLogsLocal = async () => {
    try {
      const logs = await getDiagnosticLogs();
      if (logs.length === 0) {
        Alert.alert('No Logs', 'There are no diagnostic logs to share yet.');
        return;
      }
      const formattedLogs = logs.join('\n');
      await Share.share({
        title: "Where's my family!! Diagnostic Logs",
        message: `Where's my family!! System Diagnostic Log Trail:\n\n${formattedLogs}`,
      });
    } catch (e: any) {
      Alert.alert('Sharing Failed', e.message || String(e));
    }
  };

  useEffect(() => {
    if (showTriageConsole) {
      loadDiagnosticLogsLocal();
    }
  }, [showTriageConsole]);

  return (
    <View style={{ marginTop: 15 }}>
      {/* Triage Diagnostics Button */}
      <TouchableOpacity
        style={[styles.triageToggleButton, showTriageConsole && styles.triageActiveButton]}
        onPress={() => setShowTriageConsole(!showTriageConsole)}
        activeOpacity={0.8}
      >
        <Text style={styles.triageToggleText}>
          {showTriageConsole ? '🛑 Close Diagnostics Panel' : '🔧 Open Diagnostics & Logs'}
        </Text>
      </TouchableOpacity>

      {/* Triage Diagnostics Console Panel */}
      {showTriageConsole && (
        <View style={styles.triageCard}>
          <View style={styles.triageHeader}>
            <View style={styles.triageHeaderTitleCol}>
              <View style={styles.triagePulseDot} />
              <Text style={styles.triageHeaderTitle}>System Diagnostics Console</Text>
            </View>
            <Text style={styles.triageDeviceText}>Local Node Diagnostics</Text>
          </View>

          <ScrollView
            style={styles.triageLogsContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
            {diagnosticLogs.length === 0 ? (
              <Text style={styles.triageNoLogsText}>
                No logs found. Perform some actions to populate.
              </Text>
            ) : (
              diagnosticLogs.map((log, idx) => (
                <Text key={`log-${idx}`} style={styles.triageLogLine}>
                  {log}
                </Text>
              ))
            )}
          </ScrollView>

          <View style={styles.triageActionsRow}>
            <TouchableOpacity style={styles.triageActionButton} onPress={loadDiagnosticLogsLocal}>
              <Text style={styles.triageActionText}>🔄 Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.triageActionButton, styles.triageClearButton]}
              onPress={clearDiagnosticLogsLocal}
            >
              <Text style={styles.triageActionText}>🧹 Clear Logs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.triageActionButton, styles.triageShareButton]}
              onPress={shareDiagnosticLogsLocal}
            >
              <Text style={styles.triageActionText}>📋 Share Logs</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  triageToggleButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triageActiveButton: {
    borderColor: '#10b981',
    backgroundColor: '#0f172a',
  },
  triageToggleText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  triageCard: {
    backgroundColor: '#020617', // Dark slate/almost black
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    marginTop: 10,
  },
  triageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 8,
    marginBottom: 8,
  },
  triageHeaderTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triagePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  triageHeaderTitle: {
    color: '#10b981', // Neon green
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  triageDeviceText: {
    color: '#475569',
    fontSize: 10,
  },
  triageLogsContainer: {
    maxHeight: 180,
    minHeight: 100,
    backgroundColor: '#090d16',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  triageNoLogsText: {
    color: '#475569',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    marginTop: 20,
  },
  triageLogLine: {
    color: '#34d399', // bright light green
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
    marginBottom: 4,
  },
  triageActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  triageActionButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  triageClearButton: {
    borderColor: '#ef4444',
  },
  triageShareButton: {
    borderColor: '#3b82f6',
  },
  triageActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
