import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { V4_CONFIG } from './config.js';

export const supabaseClient = createClient(
  V4_CONFIG.supabaseUrl,
  V4_CONFIG.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: V4_CONFIG.authStorageKey
    }
  }
);
