import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setMessage(error.message);
      setSession(data.session);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) setSession(nextSession);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setProfileReady(false);
      return;
    }
    let active = true;
    const client = supabase;
    setProfileReady(false);
    const createProfileIfMissing = async () => {
      try {
        const { data, error } = await client
          .from('profiles').select('id').eq('id', session.user.id).maybeSingle();
        if (error) {
          if (active) setMessage('Login successful, but profile setup could not be checked: ' + error.message);
          return;
        }
        if (!data) {
          const emailName = (session.user.email || 'usayuser').split('@')[0]
            .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) || 'usayuser';
          const username = emailName + '_' + session.user.id.slice(0, 6);
          const displayName = session.user.user_metadata?.display_name || emailName;
          const { error: insertError } = await client.from('profiles').insert({
            id: session.user.id,
            username,
            display_name: displayName,
          });
          if (insertError && active) {
            setMessage('Login successful, but profile setup failed: ' + insertError.message);
          }
        }
      } catch (error: any) {
        if (active) setMessage('Profile setup failed: ' + (error?.message || 'Please try again.'));
      } finally {
        if (active) setProfileReady(true);
      }
    };
    createProfileIfMissing();
    return () => { active = false; };
  }, [session]);

  const sendCode = async () => {
    const client = supabase;
    if (!client) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await client.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setEmail(cleanEmail);
      setSent(true);
      setMessage('A one-time code has been sent to your email.');
    }
  };

  const verifyCode = async () => {
    const client = supabase;
    if (!client) return;
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setMessage('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    });
    setBusy(false);
    if (error) setMessage(error.message);
  };

  if (checking) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#258FEA" /></View>;
  }
  if (session && !profileReady) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#258FEA" /></View>;
  }
  if (session) return <>{children}</>;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.panel}>
        <Text style={styles.brand}>USay</Text>
        <Text style={styles.heading}>Welcome to USay</Text>
        <Text style={styles.subheading}>Sign in with your email to continue.</Text>
        {!supabase ? (
          <Text style={styles.error}>Supabase is not configured yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the Expo project's environment variables.</Text>
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#8A98A5"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sent && !busy}
              style={styles.input}
            />
            {sent && (
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="6-digit email code"
                placeholderTextColor="#8A98A5"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.input}
              />
            )}
            <Pressable disabled={busy} onPress={sent ? verifyCode : sendCode} style={styles.button}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> :
                <Text style={styles.buttonText}>{sent ? 'Verify email code' : 'Send email code'}</Text>}
            </Pressable>
            {sent && <Pressable disabled={busy} onPress={() => { setSent(false); setCode(''); setMessage(''); }}>
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>}
          </>
        )}
        {!!message && <Text style={styles.message}>{message}</Text>}
        <Text style={styles.footnote}>Your email is used to secure your USay account.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', padding: 24 },
  loading: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 14 },
  brand: { color: '#258FEA', fontSize: 36, fontWeight: '900', textAlign: 'center', letterSpacing: 2 },
  heading: { color: '#172B3A', fontSize: 23, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  subheading: { color: '#667887', fontSize: 14, textAlign: 'center', marginBottom: 10 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#DCE8F1', borderRadius: 13, paddingHorizontal: 15, color: '#172B3A', backgroundColor: '#FFFFFF' },
  button: { minHeight: 50, borderRadius: 13, backgroundColor: '#258FEA', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  link: { color: '#258FEA', textAlign: 'center', fontWeight: '700', padding: 8 },
  message: { color: '#526B7D', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  error: { color: '#B45309', fontSize: 13, textAlign: 'center', lineHeight: 20, padding: 12, backgroundColor: '#FFF7ED', borderRadius: 10 },
  footnote: { color: '#8A98A5', fontSize: 11, textAlign: 'center', marginTop: 12 },
});
