#!/usr/bin/env node
'use strict';

/**
 * Downloads all named street ways in Slovenia from the Overpass API and saves
 * a deduplicated, sorted JSON array to backend/data/si_streets.json.
 *
 * Run once (or periodically) to populate the street prefix index:
 *   node backend/scripts/fetchStreets.js
 *
 * Requires Node >=18 (uses built-in fetch). Takes ~30-90 s depending on network.
 */

const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../data/si_streets.json');

// Slovenia's fixed OSM area ID (relation 218657 + 3600000000)
// Using this is more reliable than tag-based area selectors across Overpass instances
const QUERY = `[out:json][timeout:120];
area(3600218657)->.si;
(
  way(area.si)["highway"]["name"];
);
out tags;`;

const ENDPOINT = 'https://overpass-api.de/api/interpreter';

async function fetchOverpass(query) {
  // Try POST first (preferred for long queries), fall back to GET
  for (const method of ['POST', 'GET']) {
    const opts = method === 'POST'
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(150_000),
        }
      : {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(150_000),
        };

    const url = method === 'GET'
      ? `${ENDPOINT}?data=${encodeURIComponent(query)}`
      : ENDPOINT;

    process.stdout.write(`Trying ${method} ${ENDPOINT} ... `);
    const res = await fetch(url, opts);
    if (res.ok) {
      console.log(`${res.status} OK`);
      return res.json();
    }
    console.log(`${res.status} ${res.statusText} — trying next method`);
  }
  throw new Error('All Overpass request methods failed');
}

async function main() {
  console.log('Fetching Slovenian street data from Overpass API...');
  console.log('(This may take 30-90 seconds)\n');

  const json = await fetchOverpass(QUERY);

  if (!json?.elements?.length) {
    console.error('No elements returned. Check the query or try again later.');
    process.exit(1);
  }

  const names = [...new Set(
    json.elements
      .map(e => e.tags?.name)
      .filter(n => typeof n === 'string' && n.trim().length > 2),
  )].sort((a, b) => a.localeCompare(b, 'sl'));

  fs.writeFileSync(OUT, JSON.stringify(names));
  console.log(`\nSaved ${names.length} unique street names to ${path.relative(process.cwd(), OUT)}`);
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
