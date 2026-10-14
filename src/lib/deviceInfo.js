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
 * Clean device title like Google Accounts (e.g. "Chrome on Mac", "Safari on iPhone")
 */
function formatCleanDeviceName(browserObj, osObj, deviceObj) {
  const b = browserObj.name || 'Browser';
  const o = osObj.name || '';
  const model = deviceObj.model || '';
  const vendor = deviceObj.vendor || '';

  if (o.includes('Mac OS') || o.includes('macOS')) {
    return `${b} on Mac`;
  }
  if (o.includes('Windows')) {
    return `${b} on Windows`;
  }
  if (model.toLowerCase().includes('iphone') || o.toLowerCase().includes('ios')) {
    return `${b} on iPhone`;
  }
  if (model.toLowerCase().includes('ipad')) {
    return `${b} on iPad`;
  }
  if (model) {
    const fullModel = vendor && !model.toLowerCase().includes(vendor.toLowerCase()) ? `${vendor} ${model}` : model;
    return `${b} on ${fullModel}`;
  }
  if (o) {
    return `${b} on ${o}`;
  }
  return b;
}

/**
 * Parse client request to extract device name and device type
 */
function getDeviceDetails(req) {
  const uaString = req.headers['user-agent'] || '';
  const parser = new UAParser(uaString);
  const result = parser.getResult();

  let type = result.device.type || 'desktop';
  const uaLower = uaString.toLowerCase();
  if (type !== 'mobile' && type !== 'tablet') {
    if (uaLower.includes('tablet') || uaLower.includes('ipad')) {
      type = 'tablet';
    } else if (uaLower.includes('mobile') || uaLower.includes('iphone') || uaLower.includes('android')) {
      type = 'mobile';
    } else {
      type = 'desktop';
    }
  }

  const deviceName = formatCleanDeviceName(result.browser, result.os, result.device);

  // Extract client IP
  const forwarded = req.headers['x-forwarded-for'];
  let rawIp = forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || req.ip || '');
  const ip = cleanIp(rawIp);

  return {
    deviceName,
    deviceType: type,
    browser: result.browser.name || 'Browser',
    os: result.os.name || 'OS',
    ip,
    userAgent: uaString.substring(0, 300)
  };
}

/**
 * Resolve accurate location using high-accuracy Indian ISP data (ipwho.is / ipinfo.io)
 */
async function resolveLocation(ip, clientLocationHint = null) {
  if (clientLocationHint && typeof clientLocationHint === 'string' && clientLocationHint.trim()) {
    return clientLocationHint.trim();
  }

  if (!ip || isPrivateIp(ip)) {
    return 'In-Store / Local Network';
  }

  if (geoCache.has(ip)) {
    return geoCache.get(ip);
  }

  try {
    const fetch = global.fetch || require('node-fetch');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    const res = await fetch(`https://ipwho.is/${ip}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        let loc = '';
        if (data.region && data.country) {
          loc = `${data.region}, ${data.country} (Approximate)`;
        } else if (data.country) {
          loc = `${data.country} (Approximate)`;
        }
        if (loc) {
          geoCache.set(ip, loc);
          return loc;
        }
      }
    }
  } catch (err) {
    // Timeout or network error - fallback below
  }

  // Secondary fallback: ipinfo.io
  try {
    const fetch = global.fetch || require('node-fetch');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`https://ipinfo.io/${ip}/json`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.country) {
        const countryName = data.country === 'IN' ? 'India' : data.country;
        const region = data.region;
        const loc = region ? `${region}, ${countryName} (Approximate)` : `${countryName} (Approximate)`;
        geoCache.set(ip, loc);
        return loc;
      }
    }
  } catch {}

  const fallback = 'India (Approximate)';
  geoCache.set(ip, fallback);
  return fallback;
}

module.exports = {
  getDeviceDetails,
  resolveLocation,
  cleanIp
};
