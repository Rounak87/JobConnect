import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "local_db.json");

// Explicitly disconnected per request: all reads and writes route strictly to primary MongoDB
export const IS_LOCAL_DB_CONNECTED = process.env.ENABLE_LOCAL_FILE_DB === "true";

function ensureFile() {
  if (!IS_LOCAL_DB_CONNECTED) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(
      FILE_PATH,
      JSON.stringify({ users: [], analyses: [] }, null, 2),
      "utf-8"
    );
  }
}

function readDb() {
  ensureFile();
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { users: [], analyses: [] };
  }
}

function writeDb(data) {
  ensureFile();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[FileDB] Failed to write local DB file:", err);
  }
}

export function saveAnalysisToFileDb(payload) {
  if (!IS_LOCAL_DB_CONNECTED) return null;
  const db = readDb();
  const id = payload._id || `analysis_${Date.now()}`;
  const record = {
    ...payload,
    _id: id,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Prepend so newest is first
  db.analyses.unshift(record);
  writeDb(db);
  return record;
}

export function getHistoryFromFileDb(uid) {
  if (!IS_LOCAL_DB_CONNECTED) return [];
  const db = readDb();
  if (!uid) return db.analyses;
  return db.analyses.filter((a) => a.uid === uid || a.firebaseUid === uid || true);
}

export function getSessionFromFileDb(id) {
  if (!IS_LOCAL_DB_CONNECTED) return null;
  const db = readDb();
  return db.analyses.find((a) => String(a._id) === String(id)) || null;
}

export function updateSessionInFileDb(id, partial) {
  if (!IS_LOCAL_DB_CONNECTED) return null;
  const db = readDb();
  const idx = db.analyses.findIndex((a) => String(a._id) === String(id));
  if (idx !== -1) {
    db.analyses[idx] = {
      ...db.analyses[idx],
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    writeDb(db);
    return db.analyses[idx];
  } else {
    // Insert shell if it doesn't exist in local DB (Mongo fallback scenario)
    const newRecord = {
      _id: id,
      ...partial,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.analyses.unshift(newRecord);
    writeDb(db);
    return newRecord;
  }
}

export function saveUserToFileDb(userPayload) {
  if (!IS_LOCAL_DB_CONNECTED) return null;
  const db = readDb();
  const idx = db.users.findIndex((u) => u.firebaseUid === userPayload.firebaseUid);
  if (idx !== -1) {
    db.users[idx] = { ...db.users[idx], ...userPayload };
  } else {
    db.users.push(userPayload);
  }
  writeDb(db);
  return userPayload;
}
