// Audit trail (supabase/audit_setup.sql): records what signed-in users do. Only admins can read it.
import { supabase } from './supabaseClient';

// Events, with the labels the admin page shows
export const EVENTS = {
  sign_up: 'Signed up',
  sign_in: 'Logged in',
  sign_out: 'Logged out',
  buyer_search: 'Buyer search',
  search_saved: 'Saved a search',
  flat_saved: 'Saved a flat',
  flat_removed: 'Removed a saved flat',
  valuation: 'Valuation',
  valuation_photos: 'Valuation with photos',
  profile_updated: 'Updated profile',
  password_changed: 'Changed password',
};

// Records an event for the signed-in user. Never throws: a logging failure
// (e.g. the table isn't set up yet) mustn't break what the user is doing.
export async function logEvent(event, details = null) {
  try {
    const { error } = await supabase.from('audit_log').insert({ event, details });
    if (error) console.warn('Audit log:', error.message);
  } catch (err) {
    console.warn('Audit log:', err.message);
  }
}

// Number of accounts (every account has a profile row)
export async function countUsers() {
  const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count;
}

export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

// Latest events, newest first, with each user's username
export async function listEvents(limit = 500) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, event, details, created_at, user_id, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}
