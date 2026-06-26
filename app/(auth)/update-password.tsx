import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { showDialog } from '../../store/dialogStore';
import { AppColors } from '../../theme/colors';
import { useAppColors, useThemedStyles } from '../../theme/useAppColors';
import ScreenBubbles from '../../components/ScreenBubbles';

// Reached only via the deep link from a password-reset email (see
// authStore.ts's applyUrl) — by the time this screen renders, the user
// should already have a valid (temporary recovery) session. We still guard
// against that not having happened (e.g. an expired/malformed link) below.
export default function UpdatePasswordScreen() {
  const colors = useAppColors();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const loading = useAuthStore((s) => s.loading);
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No recovery session means the deep link flow didn't complete (expired
    // link, malformed link, or the screen was reached some other way) — send
    // the user back to login rather than letting them sit on a dead form.
    // Guards against false positives: wait for `initialized` (until the
    // initial getSession()/listener setup resolves, `session` reads null
    // even for a legitimate recovery session that's about to land), and a
    // generous grace window on top of that. A cold-start recovery deep link
    // whose setSession() resolves can take a while; a short fixed timeout
    // could bounce a perfectly valid recovery session to login. This effect
    // re-runs whenever `session` changes, and the cleanup below clears any
    // pending timer — so the moment the recovery session lands, the redirect
    // is aborted and the early `return` on the next run keeps it aborted.
    // Only the genuinely sessionless case (expired/malformed link) survives
    // the full window and redirects.
    if (!initialized || session) return;
    const timer = setTimeout(() => {
      if (!useAuthStore.getState().session) {
        router.replace('/(auth)/login');
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [initialized, session]);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const { error: updateError } = await updatePassword(password);
    if (updateError) {
      setError(updateError);
      return;
    }
    showDialog({
      title: 'Password updated',
      message: 'Your password has been changed.',
      actions: [{ label: 'OK', onPress: () => router.replace('/') }],
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenBubbles />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.replace('/(auth)/login')}
        >
          <MaterialIcons name="close" size={24} color={colors.text.secondary} />
        </TouchableOpacity>

        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Choose a new password for your account</Text>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>New password</Text>
            <View style={styles.passwordField}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your new password"
                placeholderTextColor={colors.text.placeholder}
                secureTextEntry={!passwordVisible}
                textContentType="newPassword"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setPasswordVisible((visible) => !visible)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
              >
                <MaterialIcons
                  name={passwordVisible ? 'visibility-off' : 'visibility'}
                  size={22}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your new password"
              placeholderTextColor={colors.text.placeholder}
              secureTextEntry={!passwordVisible}
              textContentType="newPassword"
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{loading ? 'Updating…' : 'Update password'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.app,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 6,
    marginBottom: 28,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 7,
  },
  input: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.input,
    backgroundColor: colors.background.white,
    fontSize: 15,
    color: colors.text.primary,
  },
  passwordField: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeBtn: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 13,
    color: colors.text.danger,
  },
  submitBtn: {
    backgroundColor: colors.brand.primary,
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
    color: colors.text.inverse,
  },
});
