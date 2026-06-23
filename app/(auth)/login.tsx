import React, { useState } from 'react';
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
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import ScreenBubbles from '../../components/ScreenBubbles';

function GoogleLogo({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.7-2.1 5-4.5 6.5v5.4h7.3c4.3-3.9 6.9-9.8 6.9-15.9z"
      />
      <Path
        fill="#34A853"
        d="M24 47c6.1 0 11.2-2 15-5.5l-7.3-5.4c-2 1.3-4.5 2.1-7.7 2.1-5.9 0-10.9-3.9-12.7-9.2H3.8v5.6C7.5 42 15.2 47 24 47z"
      />
      <Path
        fill="#FBBC05"
        d="M11.3 28.9c-.5-1.3-.7-2.8-.7-4.3s.2-3 .7-4.3v-5.6H3.8C2.3 17.6 1.5 21 1.5 24.5s.8 6.9 2.3 9.8l7.5-5.4z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.9c3.3 0 6.3 1.1 8.6 3.4l6.5-6.5C35.2 4.2 30.1 2 24 2 15.2 2 7.5 7 3.8 14.6l7.5 5.6c1.8-5.4 6.8-9.3 12.7-9.3z"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useAuthStore((s) => s.signIn);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBackHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }

    const { error: signInError } = await signIn(email.trim(), password);
    if (signInError) {
      setError(signInError);
      return;
    }

    goBackHome();
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    const { error: googleError } = await signInWithGoogle();
    if (googleError) {
      setError(googleError);
      return;
    }

    goBackHome();
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
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={colors.text.secondary} />
        </TouchableOpacity>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to sync your entries</Text>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.text.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>

          <View>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordField}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={colors.text.placeholder}
                secureTextEntry={!passwordVisible}
                textContentType="password"
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

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.submitBtnDisabled]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <GoogleLogo />
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.linkText}>
              Don't have an account? <Text style={styles.linkTextBold}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.divider,
  },
  dividerText: {
    fontSize: 12,
    color: colors.text.placeholder,
  },
  googleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: 62,
    height: 62,
    backgroundColor: colors.background.white,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: colors.border.input,
  },
  linkBtn: {
    alignItems: 'center',
    marginTop: 8,
    padding: 6,
  },
  linkText: {
    fontSize: 13.5,
    color: colors.text.secondary,
  },
  linkTextBold: {
    color: colors.brand.primary,
    fontWeight: '700',
  },
});
