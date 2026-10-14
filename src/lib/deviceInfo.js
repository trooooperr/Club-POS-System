const UAParser = require('ua-parser-js');

// Simple in-memory cache for IP geo-location lookups
const geoCache = new Map();

/**
 * Clean IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
 */
function cleanIp(ip) {
  if (!ip) return '';
  let cleaned = ip.trim();
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }
  return cleaned;
}

/**
 * Check if IP is localhost or a private LAN IP
 */
function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return false;
}

/**
 * Parse client request to extract device name and device type
 */
function getDeviceDetails(req) {
  const uaString = req.headers['user-agent'] || '';
  const parser = new UAParser(uaString);
  const result = parser.getResult();

  const browser = result.browser.name || 'Web Browser';
  const os = result.os.name ? `${result.os.name}${result.os.version ? ' ' + result.os.version.split('.')[0] : ''}` : 'Unknown OS';
  
  let type = result.device.type || 'desktop';
  if (type !== 'mobile' && type !== 'tablet') {
    // Check if tablet or mobile in UA
    const uaLower = uaString.toLowerCase();
    if (uaLower.includes('tablet') || uaLower.includes('ipad')) {
      type = 'tablet';
    } else if (uaLower.includes('mobile') || uaLower.includes('iphone') || uaLower.includes('android')) {
      type = 'mobile';
    } else {
      type = 'desktop';
    }
  }

  const deviceModel = result.device.model ? `${result.device.vendor || ''} ${result.device.model}`.trim() : '';
  const deviceName = deviceModel ? `${browser} on ${deviceModel} (${os})` : `${browser} on ${os}`;

  // Extract client IP
  const forwarded = req.headers['x-forwarded-for'];
  let rawIp = forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || '');
  const ip = cleanIp(rawIp);

  return {
    deviceName,
    deviceType: type,
    browser: result.browser.name || 'Browser',
    os: result.os.name || 'Unknown OS',
    ip,
    userAgent: uaString.substring(0, 300)
  };
}

/**
 * Resolve location from IP asynchronously (with short timeout and caching)
 */
async function resolveLocation(ip) {
  if (!ip || isPrivateIp(ip)) {
    return 'In-Store / Local Network';
  }

  if (geoCache.has(ip)) {
    return geoCache.get(ip);
  }

  try {
    const fetch = global.fetch || require('node-fetch');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200); // 1.2s timeout max

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        const parts = [data.city, data.regionName, data.country].filter(Boolean);
        const loc = parts.join(', ') || 'Unknown Location';
        geoCache.set(ip, loc);
        return loc;
      }
    }
  } catch (err) {
    // Timeout or network error - non-critical
  }

  const fallback = 'India (Online)';
  geoCache.set(ip, fallback);
  return fallback;
}

module.exports = {
  getDeviceDetails,
  resolveLocation,
  cleanIp
};
