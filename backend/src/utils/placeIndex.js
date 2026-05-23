'use strict';

const fs   = require('fs');
const path = require('path');

// countryCode → Map<normKey → [{name, municipality, lat, lng}]> | null
const _indexes = new Map();

// Same normalization as streetIndex for consistency
function _norm(s) {
  return s.toLowerCase()
    .replace(/š/g, 's').replace(/č/g, 'c').replace(/ž/g, 'z')
    .replace(/ć/g, 'c').replace(/đ/g, 'd')
    .trim();
}

// Slovenian case endings — index stems so inflected forms ("Gabrjah" → "Gabrje") match
const CASE_ENDINGS = ['ah', 'ih', 'em', 'ju', 'ev', 'ov', 'a', 'e', 'i', 'u'];

function _stems(normName) {
  const variants = new Set([normName]);
  for (const sfx of CASE_ENDINGS) {
    if (normName.endsWith(sfx) && normName.length - sfx.length >= 3) {
      variants.add(normName.slice(0, normName.length - sfx.length));
    }
  }
  return variants;
}

function _buildIndex(places) {
  const map = new Map();
  for (const p of places) {
    if (!p.name || !p.municipality) continue;
    for (const key of _stems(_norm(p.name))) {
      if (!map.has(key)) map.set(key, []);
      const arr = map.get(key);
      if (!arr.some(x => x.name === p.name && x.municipality === p.municipality)) {
        arr.push({ name: p.name, municipality: p.municipality, lat: p.lat, lng: p.lng });
      }
    }
  }
  return map;
}

function _getIndex(countryCode = 'si') {
  if (_indexes.has(countryCode)) return _indexes.get(countryCode);
  const file = path.join(__dirname, `../../data/${countryCode}_places.json`);
  let idx = null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(raw) && raw.length > 0) idx = _buildIndex(raw);
  } catch (_) { /* file absent or malformed — graceful degradation */ }
  _indexes.set(countryCode, idx);
  return idx;
}

function hasData(countryCode = 'si') {
  return _getIndex(countryCode) !== null;
}

function lookupWord(word, countryCode = 'si') {
  const idx = _getIndex(countryCode);
  if (!idx) return [];
  return idx.get(_norm(word)) || [];
}

/**
 * Given hint words extracted from message context near a street keyword, return
 * the best settlement+municipality match or null.
 *
 * confidence = 1.0  — only one municipality matches
 * confidence ≥ 0.70 — multiple matches but score gap is clear (municipality named in message)
 * confidence < 0.70 — ambiguous tie; caller should omit municipality from Nominatim query
 */
function disambiguate(hints, messageText, countryCode = 'si') {
  const msgNorm = _norm(messageText);

  for (const hint of hints) {
    const matches = lookupWord(hint, countryCode);
    if (!matches.length) continue;

    if (matches.length === 1) return { ...matches[0], confidence: 1.0 };

    // Multiple municipalities for this settlement — score by context signals
    const scored = matches.map(m => {
      let score = 0.5;
      // Municipality name explicitly present in message → strong disambiguation signal
      if (msgNorm.includes(_norm(m.municipality))) score += 0.45;
      return { ...m, score };
    }).sort((a, b) => b.score - a.score);

    const gap = scored[0].score - (scored[1]?.score ?? 0);
    return { ...scored[0], confidence: Math.min(0.95, 0.4 + gap * 1.2) };
  }

  return null;
}

module.exports = { disambiguate, lookupWord, hasData };
