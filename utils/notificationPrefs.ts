import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_KEY = 'notification_prefs_v1';

export type NotificationPrefs = {
  session_tag: boolean;
  likes: boolean;
  comments: boolean;
};

const DEFAULTS: NotificationPrefs = {
  session_tag: true,
  likes: true,
  comments: true,
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
  await supabase.from('profiles').update({ notification_prefs: prefs }).eq('id', userId).catch(() => {});
}
