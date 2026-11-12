import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_KEY = 'notification_prefs_v1';

export type NotificationPrefs = {
  session_tag: boolean;
  likes: boolean;
  comments: boolean;
  new_follower: boolean;
};

const DEFAULTS: NotificationPrefs = {
  session_tag: true,
  likes: true,
  comments: true,
  new_follower: true,
};

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', userId)
      .single();
    if (data?.notification_prefs) return { ...DEFAULTS, ...data.notification_prefs };
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export async function saveNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(prefs)).catch(() => {});
  // The query builder has no .catch(); calling one threw before the update was
  // ever sent, so preferences only saved on the phone and the server (which
  // decides who gets pushes) never saw them. Await it and check the error.
  try {
    const { error } = await supabase.from('profiles').update({ notification_prefs: prefs }).eq('id', userId);
    if (error) console.warn('[notificationPrefs] save failed:', error.message);
  } catch (e) {
    console.warn('[notificationPrefs] save failed:', e);
  }
}
