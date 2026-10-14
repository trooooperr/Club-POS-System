/**
 * geo.js — Browser Geolocation + Reverse Geocoding utility
 *
 * Uses the browser's native Geolocation API + OpenStreetMap Nominatim
 * to convert lat/lng into a human-readable city string.
 * No API key required. Free forever.
 *
 * Result is cached in sessionStorage so we don't spam the API.
 */

const GEO_CACHE_KEY        = 'humtum_geo_location';
const GEO_CACHE_TTL        = 30 * 60 * 1000; // 30 minutes
const GEO_PERMISSION_KEY   = 'humtum_geo_permission'; // 'granted' | 'denied' | 'prompt'

/**
 * Reverse geocode lat/lng → "City, State, Country" string using Nominatim.
 */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const addr = data?.address || {};

    // Build a clean "City, State, Country" string
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.suburb ||
      '';
    const state   = addr.state || '';
    const country = addr.country || '';

    const parts = [city, state, country].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  } catch {
    return null;
  }
}

/**
 * Get browser GPS coordinates (wrapped in a Promise).
 * Resolves with { lat, lng } or rejects if denied/unavailable.
 */
function getBrowserCoords(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { timeout, maximumAge: 5 * 60 * 1000 } // Accept 5-min cached GPS
    );
  });
}

/**
 * Query the current browser permission state without triggering a popup.
 * Returns: 'granted' | 'denied' | 'prompt' | 'unknown'
 */
export async function getGeoPermissionState() {
  try {
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      try { sessionStorage.setItem(GEO_PERMISSION_KEY, result.state); } catch {}
      return result.state; // 'granted' | 'denied' | 'prompt'
    }
  } catch {}
  return 'unknown';
}

/**
 * Proactively request location permission — triggers the browser popup if not yet decided.
 * Call this early (e.g. on login page mount) so the popup appears before login,
 * not during the login API call.
 *
 * Returns the resolved location string, or null if denied.
 */
export async function requestGeoPermission() {
  try {
    const { lat, lng } = await getBrowserCoords(10000);
    const location = await reverseGeocode(lat, lng);
    if (location) {
      try {
        sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ location, timestamp: Date.now() }));
        sessionStorage.setItem(GEO_PERMISSION_KEY, 'granted');
      } catch {}
      return location;
    }
  } catch (err) {
    const code = err?.code;
    // PERMISSION_DENIED = 1
    if (code === 1) {
      try { sessionStorage.setItem(GEO_PERMISSION_KEY, 'denied'); } catch {}
    }
  }
  return null;
}

/**
 * Main export: get the user's real city as a string.
 *
 * - Checks sessionStorage cache first (valid for 30 min)
 * - If permission already granted, fetches silently
 * - If permission denied, returns null immediately (no popup)
 * - Never throws — always safe to call
 *
 * @returns {Promise<string|null>} e.g. "Noida, Uttar Pradesh, India" or null
 */
export async function getGeoLocation() {
  // 1. Return from cache if fresh
  try {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const { location, timestamp } = JSON.parse(cached);
      if (location && Date.now() - timestamp < GEO_CACHE_TTL) {
        return location;
      }
    }
  } catch {}

  // 2. Check permission state — don't trigger popup here, just read it
  const permState = await getGeoPermissionState();
  if (permState === 'denied') return null; // Already denied, skip silently

  // 3. Try browser GPS (may show popup if state is 'prompt' or 'unknown')
  try {
    const { lat, lng } = await getBrowserCoords();
    const location = await reverseGeocode(lat, lng);

    if (location) {
      try {
        sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ location, timestamp: Date.now() }));
        sessionStorage.setItem(GEO_PERMISSION_KEY, 'granted');
      } catch {}
      return location;
    }
  } catch {
    // Permission denied or GPS error — fail silently
  }

  return null;
}

/**
 * Clear the cached location (call after logout).
 */
export function clearGeoCache() {
  try {
    sessionStorage.removeItem(GEO_CACHE_KEY);
    sessionStorage.removeItem(GEO_PERMISSION_KEY);
  } catch {}
}
