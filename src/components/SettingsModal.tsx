import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { X, Settings, User, Lock, Map, Eye, EyeOff } from 'lucide-react-native';
import { getActiveFamilyKey, setCustomFamilyKey } from '../services/Crypto';
import { addDiagnosticLog } from '../services/Logger';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  currentName: string;
  onSaveName: (name: string) => Promise<void>;
  isBackgroundTracking: boolean;
  onToggleBackgroundTracking: (val: boolean) => Promise<void>;
  onKeyChange: () => Promise<void>;
}

export default function SettingsModal({
  visible,
  onClose,
  currentName,
  onSaveName,
  isBackgroundTracking,
  onToggleBackgroundTracking,
  onKeyChange,
}: SettingsModalProps) {
  const [name, setName] = useState<string>(currentName);
  const [familyKey, setFamilyKey] = useState<string>('');
  const [showPasskey, setShowPasskey] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Load the active family key on open
  useEffect(() => {
    if (visible) {
      setName(currentName);
      setFamilyKey(getActiveFamilyKey());
    }
  }, [visible, currentName]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your name.');
      return;
    }

    setSaving(true);
    try {
      // 1. Save display name if changed
      if (name.trim() !== currentName) {
        await onSaveName(name.trim());
      }

      // 2. Save encryption key if changed
      const activeKey = getActiveFamilyKey();
      if (familyKey.trim() !== activeKey) {
        await setCustomFamilyKey(familyKey.trim());
        await addDiagnosticLog(`[Crypto] Encryption key changed by user.`);
        await onKeyChange();
      }

      Alert.alert(
        'Settings Saved',
        'Your system settings and E2EE configurations have been updated.'
      );
      onClose();
    } catch (err: any) {
      Alert.alert('Error Saving Settings', err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTitleRow}>
              <Settings color="#38bdf8" size={24} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>System Settings & E2EE</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X color="#94a3b8" size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Display Name Section */}
            <View style={styles.sectionHeader}>
              <User color="#38bdf8" size={16} style={{ marginRight: 6 }} />
              <Text style={styles.sectionLabel}>Your Display Name</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Mum, Dad, Chloe, Jack"
              placeholderTextColor="#475569"
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <Text style={styles.helperText}>
              This identifies your device node on the live maps of other family members.
            </Text>

            {/* Background Location Toggle */}
            <View style={styles.divider} />
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <View style={styles.sectionHeader}>
                  <Map color="#10b981" size={16} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionLabel}>Background Location Tracking</Text>
                </View>
                <Text style={styles.toggleDescription}>
                  Allows tracking when the phone is locked or app is in the background. Keep your
                  family updated continuously.
                </Text>
              </View>
              <Switch
                value={isBackgroundTracking}
                onValueChange={onToggleBackgroundTracking}
                trackColor={{ false: '#0f172a', true: '#10b981' }}
                thumbColor={isBackgroundTracking ? '#34d399' : '#475569'}
              />
            </View>

            {/* Encryption Key Section */}
            <View style={styles.divider} />
            <View style={styles.sectionHeader}>
              <Lock color="#f59e0b" size={16} style={{ marginRight: 6 }} />
              <Text style={styles.sectionLabel}>End-To-End (E2EE) Passkey</Text>
            </View>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.textInput, styles.passwordInput, { flex: 1, marginBottom: 0 }]}
                value={familyKey}
                onChangeText={setFamilyKey}
                placeholder="Enter custom family key"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPasskey}
              />
              <TouchableOpacity
                onPress={() => setShowPasskey(!showPasskey)}
                style={styles.eyeButton}
                activeOpacity={0.7}
              >
                {showPasskey ? (
                  <EyeOff color="#94a3b8" size={20} />
                ) : (
                  <Eye color="#94a3b8" size={20} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              Your family's coordinates are encrypted client-side using this key before uploading.
              To view each other's live coordinates, all family members must use the EXACT SAME key!
            </Text>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>
                {saving ? 'Saving System Configuration...' : 'Save & Sync Settings'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionLabel: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  textInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#fff',
    fontSize: 14,
    padding: 12,
    marginBottom: 6,
  },
  passwordInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  helperText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  toggleTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  toggleDescription: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 16,
  },
  submitButton: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#10b981',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 6,
  },
  eyeButton: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
