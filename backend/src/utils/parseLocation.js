'use strict';

const COUNTRY_NAMES = {
  si:'Slovenia', de:'Germany', at:'Austria', it:'Italy', fr:'France',
  gb:'United Kingdom', nl:'Netherlands', be:'Belgium', ch:'Switzerland',
  pl:'Poland', cz:'Czech Republic', sk:'Slovakia', hu:'Hungary',
  hr:'Croatia', rs:'Serbia', ba:'Bosnia and Herzegovina',
  us:'United States', ca:'Canada', au:'Australia', nz:'New Zealand',
};

const DECIMAL_RE = /(-?\d{1,3}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/;
const LAT_LON_RE = /LAT[=:]\s*(-?\d+\.?\d*)\s+LON[=:]\s*(-?\d+\.?\d*)/i;
const NSEW_RE    = /([NS])\s*(\d+\.\d+)\s+([EW])\s*(\d+\.\d+)/i;
const DMS_RE     = /(\d+)°(\d+)'(\d+(?:\.\d+)?)"([NS])\s+(\d+)°(\d+)'(\d+(?:\.\d+)?)"([EW])/i;

function dms(deg, min, sec, dir) {
  const d = +deg + +min / 60 + +sec / 3600;
  return (dir === 'S' || dir === 'W') ? -d : d;
}
function valid(lat, lng) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function suffixCandidates(text, countryCode = 'si') {
  const country = COUNTRY_NAMES[countryCode] || countryCode.toUpperCase();
  const words = text.trim().split(/\s+/);
  const candidates = [];
  for (let i = 0; i < words.length - 1; i++) {
    const suffix = words.slice(i).join(' ');
    if (/\d/.test(suffix)) candidates.push(`${suffix}, ${country}`);
  }
  return candidates;
}

function parseLocation(text, countryCode = 'si') {
  if (!text) return { lat: null, lng: null };

  let m = DECIMAL_RE.exec(text);
  if (m) { const lat = parseFloat(m[1]), lng = parseFloat(m[2]); if (valid(lat, lng)) return { lat, lng }; }

  m = LAT_LON_RE.exec(text);
  if (m) { const lat = parseFloat(m[1]), lng = parseFloat(m[2]); if (valid(lat, lng)) return { lat, lng }; }

  m = NSEW_RE.exec(text);
  if (m) {
    const lat = m[1].toUpperCase() === 'S' ? -parseFloat(m[2]) : parseFloat(m[2]);
    const lng = m[3].toUpperCase() === 'W' ? -parseFloat(m[4]) : parseFloat(m[4]);
    if (valid(lat, lng)) return { lat, lng };
  }

  m = DMS_RE.exec(text);
  if (m) {
    const lat = dms(m[1], m[2], m[3], m[4].toUpperCase());
    const lng = dms(m[5], m[6], m[7], m[8].toUpperCase());
    if (valid(lat, lng)) return { lat, lng };
  }

  // No explicit coords — detect address candidates for deferred geocoding
  if (/\d/.test(text)) {
    const candidates = suffixCandidates(text, countryCode);
    if (candidates.length > 0) return { lat: null, lng: null, candidates };
  }

  return { lat: null, lng: null };
}

// ── Rate-limited Nominatim geocoder ──────────────────────────────────────────
// Nominatim policy: max 1 request/second. All requests share a single serial
// queue so concurrent message bursts don't trigger 429s.
const _geoCache = new Map();        // "query|cc" → result  (capped at 500 entries)
let   _geoChain = Promise.resolve(); // serialises every HTTP request globally

function _enqueue(work) {
  const slot = _geoChain.then(work);
  // Hold the queue for 1.1 s after each attempt, success or failure
  _geoChain = slot.then(() => new Promise(r => setTimeout(r, 1100)),
                         () => new Promise(r => setTimeout(r, 1100)));
  return slot;
}

async function geocodeAddress(candidates, countryCode = 'si') {
  const queries = (Array.isArray(candidates) ? candidates : [candidates].filter(Boolean)).slice(0, 3);

  for (const query of queries) {
    if (!query?.trim()) continue;
    const key = `${query}|${countryCode}`;
    if (_geoCache.has(key)) return _geoCache.get(key);

    const result = await _enqueue(async () => {
      if (_geoCache.has(key)) return _geoCache.get(key); // filled while queued
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const url = `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(query)}&countrycode=${countryCode}&format=json&limit=1`;
        const r = await fetch(url, {
          headers: { 'Accept-Language': 'sl,en', 'User-Agent': 'PagerMonitor/2.1' },
          signal: ctrl.signal,
        });
        if (!r.ok) return null;
        const data = await r.json();
        if (data?.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), query };
        return null;
      } catch { return null; }
      finally { clearTimeout(timer); }
    });

    if (result) {
      _geoCache.set(key, result);
      if (_geoCache.size > 500) _geoCache.delete(_geoCache.keys().next().value);
      return result;
    }
  }
  return null;
}

module.exports = { parseLocation, geocodeAddress };
