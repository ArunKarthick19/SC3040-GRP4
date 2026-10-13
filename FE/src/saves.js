// Buyers' saved searches and bookmarked flats, stored in Supabase (supabase/buyer_saves_setup.sql).
// Row Level Security limits every query to the signed-in user's own rows.
import { supabase } from './supabaseClient';

// Supabase's error when the tables don't exist yet
const MISSING_TABLE = 'PGRST205';

function check({ data, error }) {
  if (error?.code === MISSING_TABLE) {
    throw new Error('Saving isn\'t set up yet: run supabase/buyer_saves_setup.sql in the Supabase SQL Editor.');
  }
  if (error) throw new Error(error.message);
  return data;
}

export const blockKey = (b) => `${b.block}|${b.street}|${b.flat_type}`;

export async function listSearches() {
  return check(await supabase.from('saved_searches').select('*').order('created_at', { ascending: false }));
}

export async function saveSearch(name, criteria) {
  return check(await supabase.from('saved_searches').insert({ name, criteria }).select().single());
}

export async function deleteSearch(id) {
  check(await supabase.from('saved_searches').delete().eq('id', id));
}

export async function listBookmarks() {
  return check(await supabase.from('bookmarks').select('*').order('created_at', { ascending: false }));
}

// `block` is a block from the map (with nearest_mrt / nearest_bus)
export async function saveBookmark(block, town, flatType, year) {
  return check(await supabase.from('bookmarks').insert({
    town,
    block: block.block,
    street: block.street,
    flat_type: flatType,
    median_price: block.median_price,
    transactions: block.transactions,
    lat: block.lat,
    lng: block.lng,
    nearest_mrt: block.nearest_mrt ?? null,
    nearest_bus: block.nearest_bus ?? null,
    data_year: year,
  }).select().single());
}

export async function deleteBookmark(id) {
  check(await supabase.from('bookmarks').delete().eq('id', id));
}
