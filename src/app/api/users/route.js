import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";
import { saveUserToFileDb } from "@/lib/fileDb";

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

    const userPayload = {
      firebaseUid: uid,
      email,
      displayName: displayName || "Anonymous User",
      photoURL: photoURL || null,
    };

    try {
      await connectToDatabase();
      const user = await User.findOneAndUpdate(
        { firebaseUid: uid },
        userPayload,
        { new: true, upsert: true }
      );
      saveUserToFileDb(userPayload);
      return NextResponse.json({ success: true, user });
    } catch (dbErr) {
      console.warn("[UsersAPI] MongoDB Atlas unavailable, saved user profile to local file DB.");
      saveUserToFileDb(userPayload);
      return NextResponse.json({ success: true, user: userPayload });
    }
  } catch (error) {
    console.error("API /users error:", error);
    return NextResponse.json(
      { error: "Failed to save user profile" },
      { status: 500 }
    );
  }
}
