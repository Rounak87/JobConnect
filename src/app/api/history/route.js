import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";
import Analysis from "@/models/Analysis";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "Missing uid parameter" }, { status: 400 });
    }

    await connectToDatabase();

    const userDoc = await User.findOne({ firebaseUid: uid });
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch all analyses for this user, sorted by newest first
    const history = await Analysis.find({ userId: userDoc._id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error("API /history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
