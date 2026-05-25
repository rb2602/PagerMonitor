'use strict';
const { broadcast }  = require('./websocket');
const { getSetting } = require('./database');
const logger = require('../utils/logger');

// ── Per-source tracking ───────────────────────────────────────────────────────
// sourceId → last message time (ms). Populated by registerSource / recordMessage.
const sourceTimes    = new Map();
// Sources currently in alert state
const alertedSources = new Set();
let checkTimer = null;

// ── Source lifecycle ──────────────────────────────────────────────────────────
/** Call when a pipeline starts so the source is tracked even before its first message. */
function registerSource(sourceId) {
  if (!sourceTimes.has(sourceId)) {
    sourceTimes.set(sourceId, Date.now());
    logger.debug(`Dead air: registered source "${sourceId}"`);
  }
}

/** Call on intentional stop — removes source so no spurious alerts fire. */
function unregisterSource(sourceId) {
  if (!sourceId) return;
  sourceTimes.delete(sourceId);
  const wasAlerted = alertedSources.delete(sourceId);
  if (wasAlerted) broadcastState();   // update UI immediately
  logger.debug(`Dead air: unregistered source "${sourceId}"`);
}

// ── Record a message ──────────────────────────────────────────────────────────
/**
 * Call whenever a decoded message arrives.
 * sourceId should match what was passed to registerSource().
 * Falls back to 'sdr' for single-dongle legacy callers.
 */
function recordMessage(sourceId = 'sdr') {
  sourceTimes.set(sourceId, Date.now());
  if (alertedSources.has(sourceId)) {
    alertedSources.delete(sourceId);
    logger.info(`Dead air: recovered — ${sourceId}`);
    broadcastState();
  }
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────
function buildSilentSources() {
  const now = Date.now();
  return [...alertedSources].map(id => ({
    id,
    lastMessage: new Date(sourceTimes.get(id) ?? now).toISOString(),
    silentMs:    now - (sourceTimes.get(id) ?? now),
  }));
}

function broadcastState() {
  const silentSources = buildSilentSources();
  const state = silentSources.length > 0 ? 'alert' : 'recovered';
  broadcast({ type: 'dead_air', state, silentSources });
}

// ── Periodic check ────────────────────────────────────────────────────────────
function startDeadAirCheck() {
  clearInterval(checkTimer);
  checkTimer = setInterval(() => {
    const cfg = getSetting('dead_air_config', { enabled: false, thresholdHours: 6 });
    if (!cfg.enabled || sourceTimes.size === 0) return;

    const threshold = (cfg.thresholdHours || 6) * 3600 * 1000;
    const now       = Date.now();
    let   changed   = false;

    for (const [id, lastMs] of sourceTimes) {
      const silent = now - lastMs;
      if (silent >= threshold && !alertedSources.has(id)) {
        alertedSources.add(id);
        const hours = Math.round(silent / 3600000);
        logger.warn(`Dead air: "${id}" silent for ${hours}h (threshold: ${cfg.thresholdHours}h)`);
        changed = true;
      }
    }

    if (changed) broadcastState();
  }, 60_000);
}

function stopDeadAirCheck() { clearInterval(checkTimer); }

module.exports = { recordMessage, registerSource, unregisterSource, startDeadAirCheck, stopDeadAirCheck };
