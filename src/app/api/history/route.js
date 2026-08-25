import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";
import Analysis from "@/models/Analysis";
import { getHistoryFromFileDb } from "@/lib/fileDb";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "Missing uid parameter" }, { status: 400 });
    }

    try {
      await connectToDatabase();
      const userDoc = await User.findOne({ firebaseUid: uid });
      if (userDoc) {
        const history = await Analysis.find({ userId: userDoc._id })
          .sort({ createdAt: -1 })
          .lean();
        
        if (history && history.length > 0) {
          return NextResponse.json({ success: true, history });
        }
      }
    } catch (dbErr) {
      console.warn("[HistoryAPI] MongoDB Atlas unavailable, falling back to local file DB.");
    }

    // Persistent Local File DB Fallback
    const localHistory = getHistoryFromFileDb(uid);
    return NextResponse.json({ success: true, history: localHistory });
  } catch (error) {
    console.error("API /history error:", error);
    const localHistory = getHistoryFromFileDb();
    return NextResponse.json({ success: true, history: localHistory });
  }
}
