import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Analysis from "@/models/Analysis";
import User from "@/models/User";
import { getSessionFromCache } from "@/lib/sessionCache";
import { getSessionFromFileDb } from "@/lib/fileDb";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const uid = searchParams.get("uid");

    if (!id) {
      return NextResponse.json(
        { error: "Missing id parameter" },
        { status: 400 }
      );
    }

    // Check in-memory cache first if local session
    if (id.startsWith("session_")) {
      const cached = getSessionFromCache(id);
      if (cached) {
        return NextResponse.json({ success: true, session: cached });
      }
    }

    try {
      await connectToDatabase();
      const userDoc = await User.findOne({ firebaseUid: uid });
      if (userDoc) {
        const session = await Analysis.findOne({
          _id: id,
          userId: userDoc._id,
        }).lean();
        if (session) {
          return NextResponse.json({ success: true, session });
        }
      }
    } catch (dbErr) {
      console.warn("[SessionAPI] DB connection failed, falling back to cache.");
    }

    // Fallback to in-memory session cache or persistent file DB
    const cachedSession = getSessionFromCache(id) || getSessionFromFileDb(id);
    if (cachedSession) {
      return NextResponse.json({ success: true, session: cachedSession });
    }

    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  } catch (error) {
    console.error("API /session error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
