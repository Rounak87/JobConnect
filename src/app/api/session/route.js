import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Analysis from "@/models/Analysis";
import User from "@/models/User";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const uid = searchParams.get("uid");

    if (!id || !uid) {
      return NextResponse.json(
        { error: "Missing id or uid parameters" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Verify user exists and matches the uid
    const userDoc = await User.findOne({ firebaseUid: uid });
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch the specific analysis session
    const session = await Analysis.findOne({
      _id: id,
      userId: userDoc._id, // Ensure they own this analysis
    }).lean();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error("API /session error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
