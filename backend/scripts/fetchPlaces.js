#!/usr/bin/env node
'use strict';

/**
 * Downloads all named settlements (city/town/village/hamlet) within Slovenia's
 * bounding box and assigns each one to the nearest municipality (občina) using
 * a spatial join against Overpass-provided municipality centres.
 *
 * If a settlement node carries an explicit addr:municipality or
 * is_in:municipality tag that takes priority over the spatial join.
 *
 * Output: backend/data/si_places.json — array of
 *   { name, municipality, lat, lng }
 *
 * Run once (or periodically to refresh):
 *   node backend/scripts/fetchPlaces.js
 *
 * Requires Node >=18. Takes ~30-60 s depending on network.
 */

const fs   = require('fs');
const path = require('path');
const http = require('https');

// Country code from CLI argument (e.g. "node fetchPlaces.js hr")
const CC = (process.argv[2] || 'si').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);

const BBOXES = {
  si: '45.42,13.38,46.88,16.61',
  hr: '42.39,13.49,46.55,19.45',
  de: '47.27,5.87,55.06,15.04',
  at: '46.37,9.53,49.02,17.16',
  it: '35.49,6.63,47.10,18.52',
  ch: '45.82,5.96,47.81,10.49',
  fr: '41.34,-5.14,51.09,9.56',
  gb: '49.87,-8.62,60.86,1.77',
  pl: '49.00,14.12,54.84,24.15',
  hu: '45.74,16.11,48.59,22.90',
  nz: '-47.35,166.43,-34.35,178.55',
  au: '-43.74,113.34,-10.41,153.64',
  ca: '41.68,-141.00,83.11,-52.64',
  us: '24.52,-124.77,49.38,-66.95',
};
// OSM admin_level for municipalities varies by country
const MUNI_LEVELS = { nz: '6', au: '6', us: '6', ca: '8' };

if (!BBOXES[CC]) { console.error(`Unknown country code: ${CC}. Add a bbox to BBOXES or check the code.`); process.exit(1); }
const BBOX = BBOXES[CC];

const OUT       = path.join(__dirname, `../data/${CC}_places.json`);
const ENDPOINTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.openstreetmap.fr',
];

// Municipalities: admin_level varies by country (8 = most of Europe, 6 = NZ/AU/US)
const muniLevel  = MUNI_LEVELS[CC] || '8';
const MUNI_QUERY = `[out:json][timeout:60][bbox:${BBOX}];
rel["admin_level"="${muniLevel}"]["name"];
out center tags;`;

// Settlements: place nodes with a name tag
const PLACE_QUERY = `[out:json][timeout:180][bbox:${BBOX}];
node["place"~"^(city|town|village|hamlet|suburb)$"]["name"];
out body;`;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function postOverpass(host, query, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = `data=${encodeURIComponent(query)}`;
    const req  = http.request(
      {
        hostname: host,
        path:     '/api/interpreter',
        method:   'POST',
        headers: {
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':     'PagerMonitor-fetchPlaces/1.0',
          'Accept':         'application/json',
        },
        timeout: timeoutMs,
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
        });
      },
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function fetchAny(query, label, timeoutMs) {
  for (const host of ENDPOINTS) {
    process.stdout.write(`  [${label}] ${host} ... `);
    try {
      const json = await postOverpass(host, query, timeoutMs);
      console.log('OK');
      return json;
    } catch (e) {
      console.log(e.message);
    }
  }
  throw new Error(`All endpoints failed for: ${label}`);
}

// ── Spatial join: nearest municipality centre ─────────────────────────────────

function distKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestMuni(lat, lon, munis) {
  let best = null, bestD = Infinity;
  for (const m of munis) {
    const d = distKm(lat, lon, m.lat, m.lng);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching place data for [${CC.toUpperCase()}] (municipalities + settlements)...\n`);

  const [muniJson, placeJson] = await Promise.all([
    fetchAny(MUNI_QUERY,  'municipalities', 60_000),
    fetchAny(PLACE_QUERY, 'settlements',   180_000),
  ]);

  const munis = muniJson.elements
    .filter(e => e.type === 'relation' && e.tags?.name && e.center)
    .map(e => ({ name: e.tags.name, lat: e.center.lat, lng: e.center.lon }));

  console.log(`\nFound ${munis.length} municipalities, ${placeJson.elements.length} settlement nodes`);

  if (munis.length === 0) {
    console.warn('No municipalities returned — places will be saved without municipality assignment.');
  }

  const places = [];
  for (const el of placeJson.elements) {
    const name = el.tags?.name;
    if (!name || typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;

    // Prefer explicit OSM municipality tag; fall back to nearest centre
    const municipality =
      el.tags['addr:municipality'] ||
      el.tags['is_in:municipality'] ||
      nearestMuni(el.lat, el.lon, munis)?.name;

    if (municipality) places.push({ name, municipality, lat: el.lat, lng: el.lon });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(places));
  const rel = path.relative(process.cwd(), OUT);
  console.log(`Saved ${places.length} settlement entries to ${rel}`);
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
