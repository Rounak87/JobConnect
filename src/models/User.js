import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      index: true,
    },
    displayName: {
      type: String,
      default: "Anonymous User",
    },
    photoURL: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// In Next.js, models might be compiled multiple times due to hot-reloading
export default mongoose.models.User || mongoose.model("User", UserSchema);
