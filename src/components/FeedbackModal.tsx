import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { X, MessageSquare, AlertTriangle, Lightbulb, Zap, HelpCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDiagnosticLog } from '../services/Logger';
import { MANTLE_DB_URL, MANTLE_KEY } from '../services/MantleDB';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { id: 'Bug', label: 'Bug', icon: AlertTriangle, color: '#f43f5e' },
  { id: 'Feature', label: 'Feature', icon: Lightbulb, color: '#10b981' },
  { id: 'Optimization', label: 'Optimization', icon: Zap, color: '#eab308' },
  { id: 'Question', label: 'Question', icon: HelpCircle, color: '#38bdf8' },
];

export default function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<string>('Bug');
  const [title, setTitle] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isSuccess: boolean } | null>(
    null
  );

  const gatherDiagnostics = async () => {
    try {
      const userName = (await AsyncStorage.getItem('user_name')) || 'Not Set';
      const trackingMode = (await AsyncStorage.getItem('tracking_mode')) || 'unknown';
      const bgTrackingEnabled =
        (await AsyncStorage.getItem('background_tracking_enabled')) || 'unknown';
      const timestamp = new Date().toLocaleString();
      const os = Platform.OS;
      const osVersion = Platform.Version;

      return `

---
### 🛠️ Background Diagnostic Details (Triage)
| Field | Value |
| :--- | :--- |
| **User Account** | ${userName} |
| **Timestamp** | ${timestamp} (local) |
| **Platform / OS** | ${os} (Version ${osVersion}) |
| **Active Tracking Mode** | ${trackingMode} |
| **Background Service** | ${bgTrackingEnabled === 'true' ? 'Enabled' : 'Disabled'} |
`;
    } catch (err) {
      return `\n\n---\n### 🛠️ Background Diagnostic Details (Triage)\n*Failed to gather diagnostics automatically: ${err instanceof Error ? err.message : String(err)}*`;
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !details.trim()) {
      Alert.alert('Fields Required', 'Please fill in both the Title and Details fields.');
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    await addDiagnosticLog(
      `[Feedback] Dispatching ${category} issue: "${title}" to secure Toronto backend proxy`
    );

    // Category mapping to GitHub labels
    let label = 'bug';
    const cat = category.toLowerCase();
    if (cat === 'feature') label = 'enhancement';
    else if (cat === 'optimization') label = 'performance';
    else if (cat === 'question') label = 'question';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const diagnostics = await gatherDiagnostics();
      const finalBody = `${details.trim()}${diagnostics}`;

      const response = await fetch(MANTLE_DB_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mantle-Key': MANTLE_KEY,
        },
        body: JSON.stringify({
          type: 'feedback',
          title: `[Feedback] ${title.trim()}`,
          body: finalBody,
          labels: [label],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok && data.html_url) {
        await addDiagnosticLog(`[Feedback Success] Created GitHub issue: ${data.html_url}`);
        setStatusMessage({
          text: `Success! Created issue on GitHub!\n\n${data.html_url}`,
          isSuccess: true,
        });
        setTitle('');
        setDetails('');
      } else {
        const errMsg = data.message || 'GCP Backend rejected the feedback payload.';
        await addDiagnosticLog(`[Feedback Error] Backend rejected submission: ${errMsg}`);
        setStatusMessage({ text: errMsg, isSuccess: false });
      }
    } catch (err: any) {
      const errMsg =
        err.name === 'AbortError'
          ? 'Connection to backend timed out. Please check your network connection.'
          : 'Could not connect to backend. Please ensure your device is connected to the internet.';

      await addDiagnosticLog(`[Feedback Error] Connection failed: ${err.message || String(err)}`);
      setStatusMessage({ text: errMsg, isSuccess: false });
    } finally {
      setSubmitting(false);
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
              <MessageSquare color="#38bdf8" size={24} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Submit App Feedback</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X color="#94a3b8" size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>Select Category</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((item) => {
                const Icon = item.icon;
                const isSelected = category === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.categoryPill,
                      isSelected && {
                        borderColor: item.color,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                      },
                    ]}
                    onPress={() => setCategory(item.id)}
                    activeOpacity={0.7}
                  >
                    <Icon
                      color={isSelected ? item.color : '#64748b'}
                      size={15}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.categoryText,
                        isSelected && { color: '#fff', fontWeight: '700' },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Issue Title</Text>
            <TextInput
              style={styles.textInput}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., Adaptive GPS resolution is too slow"
              placeholderTextColor="#475569"
            />

            <Text style={styles.sectionLabel}>Feedback Details / Body</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={details}
              onChangeText={setDetails}
              placeholder="Provide context, reproduction steps, or optimization ideas. This description will generate an issue directly on the repository."
              placeholderTextColor="#475569"
              multiline={true}
              numberOfLines={6}
              textAlignVertical="top"
            />

            {statusMessage && (
              <View
                style={[
                  styles.statusBanner,
                  statusMessage.isSuccess ? styles.successBanner : styles.errorBanner,
                ]}
              >
                <Text
                  style={[
                    styles.statusBannerText,
                    statusMessage.isSuccess ? styles.successText : styles.errorText,
                  ]}
                >
                  {statusMessage.text}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <View style={styles.submitLoaderContainer}>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 10 }} />
                  <Text style={styles.submitButtonText}>Creating GitHub Issue...</Text>
                </View>
              ) : (
                <Text style={styles.submitButtonText}>Submit Issue to GitHub</Text>
              )}
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
    backgroundColor: 'rgba(15, 23, 42, 0.75)', // Slate-900 background with blur effect
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1e293b', // Slate-800
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
  sectionLabel: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#fff',
    fontSize: 14,
    padding: 12,
    marginBottom: 18,
  },
  textArea: {
    height: 120,
  },
  submitButton: {
    backgroundColor: '#3b82f6', // Premium Indigo / Royal blue
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#3b82f6',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  submitLoaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBanner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
  },
  successBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  errorBanner: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  statusBannerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  successText: {
    color: '#34d399',
  },
  errorText: {
    color: '#fb7185',
  },
});
