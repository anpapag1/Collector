import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const signUp = useAuthStore((s) => s.signUp);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const handleSignUp = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const { error: signUpError } = await signUp(email.trim(), password);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    setSubmittedEmail(email.trim());
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color="#3f4946" />
        </TouchableOpacity>

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Sign up to sync your entries</Text>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#7a847f"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>

          <View>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#7a847f"
              secureTextEntry
              textContentType="newPassword"
            />
          </View>

          <View>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor="#7a847f"
              secureTextEntry
              textContentType="newPassword"
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{loading ? 'Creating account…' : 'Sign up'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkTextBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={!!submittedEmail}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <MaterialIcons name="mark-email-read" size={44} color="#006a60" />
            <Text style={styles.modalTitle}>Check your email</Text>
            <Text style={styles.modalSubtitle}>
              We sent a verification link to{'\n'}
              <Text style={styles.modalEmail}>{submittedEmail}</Text>.
              {'\n'}Tap it to finish creating your account.
            </Text>
            <TouchableOpacity
              style={[styles.submitBtn, { alignSelf: 'stretch' }]}
              onPress={() => router.replace('/(auth)/login')}
              activeOpacity={0.85}
            >
              <Text style={styles.submitText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f4fbf8',
  },
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#171d1b',
  },
  modalSubtitle: {
    fontSize: 13.5,
    color: '#3f4946',
    textAlign: 'center',
    lineHeight: 19,
  },
  modalEmail: {
    fontWeight: '700',
    color: '#171d1b',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#171d1b',
  },
  subtitle: {
    fontSize: 14,
    color: '#3f4946',
    marginTop: 6,
    marginBottom: 28,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3f4946',
    marginBottom: 7,
  },
  input: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bec9c4',
    backgroundColor: '#fff',
    fontSize: 15,
    color: '#171d1b',
  },
  errorText: {
    fontSize: 13,
    color: '#ba1a1a',
  },
  submitBtn: {
    backgroundColor: '#006a60',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  linkBtn: {
    alignItems: 'center',
    marginTop: 8,
    padding: 6,
  },
  linkText: {
    fontSize: 13.5,
    color: '#3f4946',
  },
  linkTextBold: {
    color: '#006a60',
    fontWeight: '700',
  },
});
