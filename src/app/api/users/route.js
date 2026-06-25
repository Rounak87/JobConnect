import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, email, displayName, photoURL } = body;

    if (!uid || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Use findOneAndUpdate with upsert: true to either update existing or create new
    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      {
        email,
        displayName: displayName || "Anonymous User",
        photoURL: photoURL || null,
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("API /users error:", error);
    return NextResponse.json(
      { error: "Failed to save user profile" },
      { status: 500 }
    );
  }
}
