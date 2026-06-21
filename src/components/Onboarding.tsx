import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ShieldAlert } from 'lucide-react-native';

interface OnboardingProps {
  inputName: string;
  setInputName: (name: string) => void;
  handleSaveName: () => void;
}

export default function Onboarding({ inputName, setInputName, handleSaveName }: OnboardingProps) {
  return (
    <View style={[styles.window, { justifyContent: 'center', padding: 24 }]}>
      <StatusBar style="light" />
      <View style={styles.onboardingCard}>
        <ShieldAlert color="#f43f5e" size={54} style={{ alignSelf: 'center', marginBottom: 16 }} />
        <Text style={styles.onboardingTitle}>Where's my family!!</Text>
        <Text style={styles.onboardingSubtitle}>
          Identify who is using this phone to share and view locations with your family.
        </Text>

        <Text style={styles.inputLabel}>Who is this?</Text>
        <TextInput
          style={styles.onboardingInput}
          value={inputName}
          onChangeText={setInputName}
          placeholder="e.g. Mum, Dad, Chloe, Jack"
          placeholderTextColor="#64748b"
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleSaveName}
        />

        <TouchableOpacity style={styles.onboardingButton} onPress={handleSaveName}>
          <Text style={styles.onboardingButtonText}>Save & Start Tracking</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  onboardingCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
  onboardingTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  onboardingSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  inputLabel: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  onboardingInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#fff',
    fontSize: 16,
    padding: 12,
    marginBottom: 20,
  },
  onboardingButton: {
    backgroundColor: '#f43f5e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
