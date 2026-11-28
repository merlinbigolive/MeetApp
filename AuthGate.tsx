import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  isValidEmail, isValidOtp, isValidPhone,
  normalizeEmail, normalizeOtp, normalizePhone,
} from './authValidation';
import { ensureProfileExists } from './profileBootstrap';

type AuthMode = 'login' | 'signup';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [mode, setMode] = useState<AuthMode>('login');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let alive = true;
    let authEventVersion = 0;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventVersion += 1;
      if (alive) {
        setSession(nextSession);
        setChecking(false);
      }
    });
    const versionBeforeSessionCheck = authEventVersion;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || authEventVersion !== versionBeforeSessionCheck) return;
      if (error) setMessage(error.message);
      setSession(data.session);
      setChecking(false);
    }).catch((error: any) => {
      if (!alive || authEventVersion !== versionBeforeSessionCheck) return;
      setMessage(error?.message || 'Could not restore your session. Please try again.');
      setChecking(false);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user.email) setEmail(session.user.email);
    if (!session || !supabase || !session.user.email_confirmed_at) {
      setProfileReady(false);
      setProfileError('');
      return;
    }
    let active = true;
    const client = supabase;
    setProfileReady(false);
    setProfileError('');
    const createProfileIfMissing = async () => {
      try {
        await ensureProfileExists({
          user: session.user,
          findProfile: async (userId: string) => {
            const { data, error } = await client
              .from('profiles').select('id').eq('id', userId).maybeSingle();
            if (error) throw new Error('Could not check your profile: ' + error.message);
            return !!data;
          },
          insertProfile: async (payload: { id: string; username: string; display_name: string }) => {
            const { error } = await client.from('profiles').insert(payload);
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
          },
        });
        if (active) setProfileReady(true);
      } catch (error: any) {
        if (active) setProfileError(error?.message || 'Profile setup failed. Please try again.');
      }
    };

    void createProfileIfMissing();
    return () => { active = false; };
  }, [session, profileAttempt]);

  const sendPhoneCode = async () => {
    const client = supabase;
    if (!client || busy) return;
    const cleanPhone = normalizePhone(phone);
    if (!isValidPhone(cleanPhone)) {
      setMessage('Enter your full international phone number, including + and country code.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = phoneCodeSent
        ? await client.auth.resend({ type: 'sms', phone: cleanPhone })
        : await client.auth.signInWithOtp({
            phone: cleanPhone,
            options: { shouldCreateUser: mode === 'signup' },
          });
      if (error) setMessage(error.message);
      else {
        setPhone(cleanPhone);
        setPhoneCode('');
        setPhoneCodeSent(true);
        setMessage('SMS verification code sent. Check your messages.');
      }
    } catch (error: any) {
      setMessage(error?.message || 'Could not send the SMS code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyPhoneCode = async () => {
    const client = supabase;
    if (!client || busy) return;
    const token = normalizeOtp(phoneCode);
    if (!isValidOtp(token)) {
      setMessage('Enter the 6-digit code sent to your phone.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await client.auth.verifyOtp({
        phone: normalizePhone(phone),
        token,
        type: 'sms',
      });
      if (error) setMessage(error.message);
    } catch (error: any) {
      setMessage(error?.message || 'Could not verify the SMS code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendEmailVerification = async () => {
    const client = supabase;
    if (!client || !session || busy) return;
    const cleanEmail = normalizeEmail(email);
    if (!isValidEmail(cleanEmail)) {
      setMessage('Enter a valid email address to secure your MEEi account.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const currentEmail = normalizeEmail(session.user.email || '');
      const { error } = currentEmail === cleanEmail
        ? await client.auth.resend({ type: 'email_change', email: cleanEmail })
        : await client.auth.updateUser({ email: cleanEmail });
      if (error) setMessage(error.message);
      else {
        setEmail(cleanEmail);
        setEmailCode('');
        setEmailCodeSent(true);
        setMessage('Email verification code sent. Your account will open after verification.');
      }
    } catch (error: any) {
      setMessage(error?.message || 'Could not send the email verification code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    const client = supabase;
    if (!client || !session || busy) return;
    const token = normalizeOtp(emailCode);
    if (!isValidOtp(token)) {
      setMessage('Enter the 6-digit code sent to your email.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await client.auth.verifyOtp({
        email: normalizeEmail(email),
        token,
        type: 'email_change',
      });
      if (error) setMessage(error.message);
      else setMessage('Email verified. Finishing your account setup…');
    } catch (error: any) {
      setMessage(error?.message || 'Could not verify the email code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#B8F34A" /></View>;
  }

  if (session && !session.user.email_confirmed_at) {
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.panel}>
          <Text style={styles.brand}>MEEi</Text>
          <Text style={styles.heading}>Secure your account</Text>
          <Text style={styles.subheading}>Your phone is verified. Add and verify an email address to protect account recovery.</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor="#829080"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!emailCodeSent && !busy}
            style={styles.input}
          />
          {emailCodeSent && (
            <TextInput
              value={emailCode}
              onChangeText={setEmailCode}
              placeholder="6-digit email code"
              placeholderTextColor="#829080"
              keyboardType="number-pad"
              maxLength={6}
              style={styles.input}
            />
          )}
          <Pressable disabled={busy} onPress={emailCodeSent ? verifyEmailCode : sendEmailVerification} style={styles.button}>
            {busy ? <ActivityIndicator color="#102016" /> :
              <Text style={styles.buttonText}>{emailCodeSent ? 'Verify email' : 'Send verification code'}</Text>}
          </Pressable>
          {emailCodeSent && (
            <>
              <Pressable disabled={busy} onPress={sendEmailVerification}>
                <Text style={styles.link}>Resend code</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => { setEmailCodeSent(false); setEmailCode(''); setMessage(''); }}>
                <Text style={styles.link}>Use a different email</Text>
              </Pressable>
            </>
          )}
          {!!message && <Text style={styles.message}>{message}</Text>}
          <Text style={styles.footnote}>Email is a security and recovery contact, never a MEEi login method.</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (session && !profileReady) {
    if (profileError) {
      return (
        <View style={styles.loading}>
          <Text style={styles.heading}>Finish setting up your profile</Text>
          <Text style={styles.message}>{profileError}</Text>
          <Pressable onPress={() => setProfileAttempt(value => value + 1)} style={styles.button}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return <View style={styles.loading}><ActivityIndicator size="large" color="#B8F34A" /></View>;
  }
  if (session) return <>{children}</>;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.panel}>
        <Text style={styles.brand}>MEEi</Text>
        <Text style={styles.heading}>Welcome to MEEi</Text>
        <Text style={styles.subheading}>Continue securely with your phone number.</Text>
        {!supabase ? (
          <Text style={styles.error}>Supabase is not configured yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the Expo project's environment variables.</Text>
        ) : (
          <>
            <View style={styles.modeRow}>
              <Pressable onPress={() => { setMode('login'); setPhoneCodeSent(false); setPhoneCode(''); setMessage(''); }} style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}>
                <Text style={[styles.modeText, mode === 'login' && styles.modeTextActive]}>Log in</Text>
              </Pressable>
              <Pressable onPress={() => { setMode('signup'); setPhoneCodeSent(false); setPhoneCode(''); setMessage(''); }} style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}>
                <Text style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>Sign up</Text>
              </Pressable>
            </View>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor="#829080"
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!phoneCodeSent && !busy}
              style={styles.input}
            />
            <Text style={styles.hint}>Include + and your country code (international format).</Text>
            {phoneCodeSent && (
              <TextInput
                value={phoneCode}
                onChangeText={setPhoneCode}
                placeholder="6-digit SMS code"
                placeholderTextColor="#829080"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.input}
              />
            )}
            <Pressable disabled={busy} onPress={phoneCodeSent ? verifyPhoneCode : sendPhoneCode} style={styles.button}>
              {busy ? <ActivityIndicator color="#102016" /> :
                <Text style={styles.buttonText}>{phoneCodeSent ? 'Verify phone number' : mode === 'signup' ? 'Send sign-up code' : 'Send login code'}</Text>}
            </Pressable>
            {phoneCodeSent && (
              <>
                <Pressable disabled={busy} onPress={sendPhoneCode}>
                  <Text style={styles.link}>Resend SMS code</Text>
                </Pressable>
                <Pressable disabled={busy} onPress={() => { setPhoneCodeSent(false); setPhoneCode(''); setMessage(''); }}>
                  <Text style={styles.link}>Change phone number</Text>
                </Pressable>
              </>
            )}
          </>
        )}
        {!!message && <Text style={styles.message}>{message}</Text>}
        <Text style={styles.footnote}>One verified phone number is used for each MEEi account. Email is verified separately after phone sign-in.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B120D', justifyContent: 'center', padding: 24 },
  loading: { flex: 1, backgroundColor: '#0B120D', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 14 },
  brand: { color: '#B8F34A', fontSize: 38, fontWeight: '900', textAlign: 'center', letterSpacing: 3 },
  heading: { color: '#F2F7EC', fontSize: 23, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  subheading: { color: '#B2BDAE', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  modeButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#344331', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111B13' },
  modeButtonActive: { backgroundColor: '#B8F34A', borderColor: '#B8F34A' },
  modeText: { color: '#C5D0C0', fontWeight: '700' },
  modeTextActive: { color: '#102016' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#40513A', borderRadius: 13, paddingHorizontal: 15, color: '#F2F7EC', backgroundColor: '#111B13' },
  hint: { color: '#899787', fontSize: 11, marginTop: -8 },
  button: { minHeight: 52, borderRadius: 13, backgroundColor: '#B8F34A', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#102016', fontWeight: '900', fontSize: 15 },
  link: { color: '#B8F34A', textAlign: 'center', fontWeight: '700', padding: 8 },
  message: { color: '#C7D5BE', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  error: { color: '#F5C477', fontSize: 13, textAlign: 'center', lineHeight: 20, padding: 12, backgroundColor: '#2B2111', borderRadius: 10 },
  footnote: { color: '#899787', fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 12 },
});
