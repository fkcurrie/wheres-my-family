import React, { useState } from 'react';
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
  Alert,
} from 'react-native';
import { X, Key, UserCheck } from 'lucide-react-native';
import { parseSMSToLocation } from '../services/SMSPackager';
import { FamilyMember } from '../types';

interface ImportSMSModalProps {
  visible: boolean;
  onClose: () => void;
  familyMembers: FamilyMember[];
  onImportSuccess: (
    memberName: string,
    parsed: {
      latitude: number;
      longitude: number;
      battery: number;
      updatedAt: number;
      status: string;
    }
  ) => void;
}

export default function ImportSMSModal({
  visible,
  onClose,
  familyMembers,
  onImportSuccess,
}: ImportSMSModalProps) {
  const [payload, setPayload] = useState<string>('');
  const [parsedData, setParsed] = useState<any | null>(null);

  const handleDecrypt = () => {
    if (!payload.trim()) {
      Alert.alert('Payload Required', 'Please paste the received SMS text payload.');
      return;
    }

    const parsed = parseSMSToLocation(payload.trim());
    if (!parsed) {
      Alert.alert(
        'Decryption Failed',
        'Could not decrypt or parse the payload. Make sure it starts with "WMF-SOS:" and that you are using the EXACT SAME family E2EE passkey as the sender!'
      );
      return;
    }

    setParsed(parsed);
  };

  const handleSelectMember = (name: string) => {
    if (!parsedData) return;
    onImportSuccess(name, parsedData);
    setPayload('');
    setParsed(null);
    onClose();
  };

  const handleClose = () => {
    setPayload('');
    setParsed(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTitleRow}>
              <Key color="#38bdf8" size={24} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Import SMS Location</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X color="#94a3b8" size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {!parsedData ? (
              <>
                <Text style={styles.infoLabel}>Paste SMS Payload String</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={payload}
                  onChangeText={setPayload}
                  placeholder="Paste payload starting with WMF-SOS: here..."
                  placeholderTextColor="#475569"
                  multiline={true}
                  numberOfLines={4}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.helperText}>
                  When a family member sends an SMS coordinate backup because they have no internet,
                  copy their text message and paste it above to decrypt their physical location.
                </Text>

                <TouchableOpacity
                  style={styles.decryptButton}
                  onPress={handleDecrypt}
                  activeOpacity={0.8}
                >
                  <Text style={styles.decryptButtonText}>🔑 Decrypt & Verify E2EE Payload</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.successBox}>
                  <Text style={styles.successTitle}>✅ E2EE Payload Decrypted!</Text>
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Latitude:</Text>
                    <Text style={styles.dataValue}>{parsedData.latitude.toFixed(6)}</Text>
                  </View>
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Longitude:</Text>
                    <Text style={styles.dataValue}>{parsedData.longitude.toFixed(6)}</Text>
                  </View>
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Battery:</Text>
                    <Text style={styles.dataValue}>{parsedData.battery}%</Text>
                  </View>
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Status:</Text>
                    <Text style={styles.dataValue}>{parsedData.status}</Text>
                  </View>
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Timestamp:</Text>
                    <Text style={styles.dataValue}>
                      {new Date(parsedData.updatedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>

                <View style={styles.sectionHeader}>
                  <UserCheck color="#10b981" size={16} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionLabel}>Select Sender Name</Text>
                </View>
                <Text style={styles.helperText}>
                  Whose location was decrypted? Tap their name below to instantly update their
                  location:
                </Text>

                <View style={styles.membersList}>
                  {familyMembers.length === 0 ? (
                    <Text style={styles.noMembersText}>No family members found to update.</Text>
                  ) : (
                    familyMembers.map((member) => (
                      <TouchableOpacity
                        key={member.id}
                        style={[styles.memberRow, { borderColor: member.color }]}
                        onPress={() => handleSelectMember(member.name)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.colorBubble, { backgroundColor: member.color }]} />
                        <Text style={styles.memberNameText}>{member.name}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.decryptButton, styles.cancelButton]}
                  onPress={() => setParsed(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelButtonText}>↩️ Back to Paste Payload</Text>
                </TouchableOpacity>
              </>
            )}
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
  infoLabel: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
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
  textArea: {
    minHeight: 100,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlignVertical: 'top',
  },
  helperText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 16,
  },
  decryptButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#3b82f6',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  decryptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  successBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  successTitle: {
    color: '#34d399',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dataLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  dataValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionLabel: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  membersList: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 8,
    marginBottom: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#1e293b',
    marginBottom: 8,
  },
  colorBubble: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  memberNameText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  noMembersText: {
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 12,
    fontSize: 13,
  },
  cancelButton: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    shadowColor: 'transparent',
  },
  cancelButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
});
