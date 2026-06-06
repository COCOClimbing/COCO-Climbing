import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Alert } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase, adminDeleteUser } from './supabase';
import { mergeData, upsertProfile, getCloudProfile, reuploadMissingMedia } from './cloudSync';
import { setCloudUserId } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profileName: string | null;
  avatarUrl: string | null;
  username: string | null;
  hometown: string | null;
  bio: string | null;
  isPrivate: boolean;
  pendingRequestCount: number;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, username?: string, isPrivate?: boolean) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [hometown, setHometown] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const syncedRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (event === 'INITIAL_SESSION') {
        setLoading(false);
      }
    });

    // Safety net: if INITIAL_SESSION never fires (e.g. network timeout), unblock the splash after 8s
    const timeout = setTimeout(() => setLoading(false), 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Set cloud user ID and load profile + sync when user changes
  useEffect(() => {
    setCloudUserId(user?.id ?? null);

    if (user) {
      loadProfile(user.id);
      refreshPendingCount(user.id);
      if (!syncedRef.current) {
        syncedRef.current = true;
        handleSyncOnLogin(user.id);
      }
    } else {
      setProfileName(null);
      setAvatarUrl(null);
      setUsername(null);
      setHometown(null);
      setBio(null);
      setIsPrivate(false);
      setPendingRequestCount(0);
      syncedRef.current = false;
    }
  }, [user]);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('name, avatar_url, username, hometown, bio, is_private')
      .eq('id', userId)
      .single();
    if (data) {
      setProfileName(data.name);
      setAvatarUrl(data.avatar_url);
      setUsername(data.username ?? null);
      setHometown(data.hometown ?? null);
      setBio(data.bio ?? null);
      setIsPrivate(data.is_private ?? false);
      if (data.name) supabase.auth.updateUser({ data: { display_name: data.name } });
    }
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  async function refreshPendingCount(userId?: string): Promise<void> {
    const uid = userId ?? user?.id;
    if (!uid) return;
    try {
      const { count } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', uid)
        .eq('status', 'pending');
      setPendingRequestCount(count ?? 0);
    } catch {
      // ignore errors silently
    }
  }

  async function handleSyncOnLogin(userId: string) {
    try {
      await reuploadMissingMedia(userId);
      await mergeData(userId);
    } catch (e) {
      console.warn('Sync error:', e);
    }
  }

  async function syncNow() {
    if (!user) return;
    try {
      await reuploadMissingMedia(user.id);
      await mergeData(user.id);
    } catch (e) {
      console.warn('Sync error:', e);
    }
  }

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signUp(email: string, password: string, name: string, usernameArg?: string, isPrivateArg?: boolean): Promise<{ error: string | null }> {
    // Clear previous user's local data and reset onboarding so the new account
    // always goes through the setup flow
    await AsyncStorage.multiRemove([
      'coco_climbs',
      'coco_sessions',
      'coco_named_projects',
      '@coco_onboarding_prefs',
    ]);

    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
    if (error) return { error: error.message };

    // Auto sign-in after sign up
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return { error: signInError.message };

    const userId = signInData.user?.id ?? data.user?.id;
    if (userId) {
      await upsertProfile(userId, name, undefined, usernameArg, undefined, undefined, isPrivateArg);
      setProfileName(name);
      if (usernameArg) setUsername(usernameArg);
      if (isPrivateArg !== undefined) setIsPrivate(isPrivateArg);
    }
    return { error: null };
  }

  async function updatePassword(password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    setIsPasswordRecovery(false);
    return { error: null };
  }

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
  }

  async function signOut() {
    await AsyncStorage.multiRemove([
      'coco_climbs',
      'coco_sessions',
      'coco_named_projects',
      'coco_theme_mode',
      'coco_theme_accent',
      'coco_grade_system',
      'coco_preferred_display_grades',
      'coco_last_climb_type',
      '@coco_onboarding_prefs',
    ]);
    await supabase.auth.signOut();
  }

  async function deleteAccount(): Promise<{ error: string | null }> {
    if (!user) return { error: 'Not signed in' };
    try {
      const uid = user.id;

      // Delete avatar files from storage (not covered by DB cascade)
      const { data: avatarFiles } = await supabase.storage.from('avatars').list(uid);
      if (avatarFiles && avatarFiles.length > 0) {
        const paths = avatarFiles.map(f => `${uid}/${f.name}`);
        await supabase.storage.from('avatars').remove(paths);
      }

      // Delete auth user — cascades to all related DB tables
      const { error: adminError } = await adminDeleteUser(uid);
      if (adminError) throw new Error(adminError);

      // Clear local data and sign out
      await AsyncStorage.clear();
      await supabase.auth.signOut();
      return { error: null };
    } catch (e: any) {
      return { error: e.message ?? 'Failed to delete account' };
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      profileName,
      avatarUrl,
      username,
      hometown,
      bio,
      isPrivate,
      pendingRequestCount,
      isPasswordRecovery,
      signIn,
      signUp,
      signOut,
      deleteAccount,
      refreshProfile,
      syncNow,
      refreshPendingCount,
      updatePassword,
      clearPasswordRecovery,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
