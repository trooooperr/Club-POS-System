const rawBaseProd = import.meta.env.VITE_API_URL_PROD || '';
const rawBase = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'production' ? rawBaseProd : '');

// SAFETY: If VITE_API_URL is accidentally set to localhost BUT we are on a real domain (like Render),
// ignore the localhost setting and use the current window origin instead.
const useLocationOrigin = !rawBase || 
  (rawBase.includes('localhost') && !window.location.hostname.includes('localhost'));

let resolvedBase = rawBase;
if (useLocationOrigin) {
  try {
    const rawUrl = new URL(rawBase || window.location.origin);
    const resolvedUrl = new URL(window.location.origin);
    const isLocalIpOrHost = 
      /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(window.location.hostname) ||
      window.location.hostname === 'localhost' ||
      window.location.hostname.endsWith('.local');
      
    if (isLocalIpOrHost && rawUrl.port) {
      resolvedUrl.port = rawUrl.port;
    }
    resolvedBase = resolvedUrl.origin;
  } catch (e) {
    resolvedBase = window.location.origin;
  }
}

export const API_BASE = resolvedBase.replace(/\/$/, '');

export function apiUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return `${API_BASE}${path}`;
}

// ── Token storage keys ───────────────────────────────────────────
export const TOKEN_KEY         = 'humtum_token_v2';
export const REFRESH_TOKEN_KEY = 'humtum_refresh_token_v2';
export const AUTH_KEY          = 'humtum_auth_v2';
export const SESSION_KEY       = 'humtum_session_id';

// Prevent multiple simultaneous refresh calls
let _refreshPromise = null;

/**
 * Attempt to silently refresh the access token using the HttpOnly cookie or stored refresh token.
 * Uses a shared promise so concurrent 401s don't trigger multiple refresh calls.
 * Returns the new access token on success, or null on failure.
 */
async function tryRefreshToken() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ refreshToken: refreshToken || undefined }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (!data.token) return null;

      // Rotate tokens in storage
      localStorage.setItem(TOKEN_KEY, data.token);
      if (data.refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      }
      if (data.sessionId) {
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }
      return data.token;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

/**
 * Force logout — clear all auth state and redirect to login.
 */
export function forceLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (window.location.pathname !== '/login') {
    window.location.reload();
  }
}

/**
 * Authenticated fetch — automatically includes JWT access token & credentials (cookies).
 * On 401 it silently refreshes the token once and retries; only then does it force logout.
 */
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    ...options.headers,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set Content-Type for JSON bodies if not already set
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions = {
    cache:       'no-store',
    credentials: 'include',
    ...options,
    headers,
  };

  let res = await fetch(url, fetchOptions);

  // ── Silent refresh on 401 ────────────────────────────────────────
  if (res.status === 401) {
    const newToken = await tryRefreshToken();

    if (newToken) {
      // Retry the original request with the new access token
      const retryHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` };
      res = await fetch(url, { ...fetchOptions, headers: retryHeaders });
    }

    // If still 401 after refresh attempt → force logout
    if (res.status === 401) {
      forceLogout();
      throw new Error('Session expired');
    }
  }

  return res;
}