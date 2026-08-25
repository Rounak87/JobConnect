/**
 * sessionCache.js — In-memory session store fallback
 * Ensures that if MongoDB Atlas is offline, paused, or IP-blocked,
 * all session IDs, gap analyses, rewrites, and interview scorecards
 * continue working 100% seamlessly in local memory.
 */

global.inMemorySessions = global.inMemorySessions || new Map();

export function saveSessionToCache(id, data) {
  if (!id || !data) return;
  global.inMemorySessions.set(String(id), {
    ...data,
    updatedAt: new Date(),
  });
}

export function getSessionFromCache(id) {
  if (!id) return null;
  return global.inMemorySessions.get(String(id)) || null;
}

export function updateSessionInCache(id, partialData) {
  if (!id) return;
  const existing = getSessionFromCache(id) || {};
  global.inMemorySessions.set(String(id), {
    ...existing,
    ...partialData,
    updatedAt: new Date(),
  });
}
