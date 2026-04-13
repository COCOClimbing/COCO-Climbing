import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://oexaqytotrxqbxmzqabu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nI7aNpJ895AcZy0hsCGEiw_3yW1oCAT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Deletes the currently signed-in user's auth account via a SECURITY DEFINER
// SQL function — no service role key needed in the client.
export async function adminDeleteUser(_uid: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { error: error.message };
  return { error: null };
}
