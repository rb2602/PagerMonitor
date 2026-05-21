#!/usr/bin/env node
'use strict';

/**
 * Downloads all named street ways within Slovenia's bounding box from the
 * Overpass API and saves a deduplicated, sorted JSON array to
 * backend/data/si_streets.json.
 *
 * Run once (or periodically) to populate the street prefix index:
 *   node backend/scripts/fetchStreets.js
 *
 * Requires Node >=18. Takes ~30-90 s depending on network.
 */

const fs   = require('fs');
const path = require('path');
const http  = require('https');

const OUT = path.join(__dirname, '../data/si_streets.json');

// Bounding box for Slovenia (avoids unreliable area() pipeline on Overpass mirrors)
// bbox order: south,west,north,east
const QUERY = `[out:json][timeout:120][bbox:45.42,13.38,46.88,16.61];
way["highway"]["name"];
out tags;`;

const ENDPOINTS = [
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.openstreetmap.fr',
];

function postOverpass(host, query) {
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
          'User-Agent':     'PagerMonitor-fetchStreets/1.0',
          'Accept':         'application/json',
        },
        timeout: 120_000,
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from ${host}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
        });
      },
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout on ${host}`)); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Fetching Slovenian street data from Overpass API...');
  console.log('Query: bounding box 45.42,13.38 → 46.88,16.61\n');

  let json = null;
  for (const host of ENDPOINTS) {
    process.stdout.write(`Trying ${host} ... `);
    try {
      json = await postOverpass(host, QUERY);
      console.log('OK');
      break;
    } catch (e) {
      console.log(e.message);
    }
  }

  if (!json?.elements?.length) {
    console.error('\nAll endpoints failed or returned no data.');
    process.exit(1);
  }

  const names = [...new Set(
    json.elements
      .map(e => e.tags?.name)
      .filter(n => typeof n === 'string' && n.trim().length > 2),
  )].sort((a, b) => a.localeCompare(b, 'sl'));

  fs.writeFileSync(OUT, JSON.stringify(names));
  const rel = path.relative(process.cwd(), OUT);
  console.log(`\nSaved ${names.length} unique street names to ${rel}`);
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
