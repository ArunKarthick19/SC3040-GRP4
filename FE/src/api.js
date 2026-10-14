import { supabase } from './supabaseClient'

// Backend address. Unset (e.g. on Vercel, where /api is the backend on the same domain) means this site's own /api.
export const API_URL = import.meta.env.VITE_API_URL || ''

export async function api(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session && { Authorization: `Bearer ${session.access_token}` }),
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

//FE: a helper that attaches the token automatically?