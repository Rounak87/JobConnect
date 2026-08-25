import mongoose from "mongoose";

const AnalysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jobTitle: {
      type: String,
      required: true,
    },
    jobDescription: {
      type: String,
      required: true,
    },
    resumeText: {
      type: String,
      required: true,
    },
    matchScore: {
      type: Number,
      required: true,
    },
    gapAnalysis: {
      type: Object, // We store the entire JSON object returned by Gemini here
      required: true,
    },
    rewrittenData: {
      type: Object, // Stores the rewritten JSON to avoid calling AI twice
      default: null,
    },
    scoringBreakdown: {
      type: Object, // Hybrid scoring signals: { tfidf, semantic, llm, hybrid }
      default: null,
    },
    atsScore: {
      type: Object, // ATS simulation result: { total, breakdown, wordCount, ... }
      default: null,
    },
    atsScoreAfterRewrite: {
      type: Object, // ATS score recomputed after Resume Surgeon optimizes the resume
      default: null,
    },
    interviewTranscript: {
      type: Array, // Stores the Vapi conversation history
      default: null,
    },
    interviewScorecard: {
      type: Object, // Structured response quality metrics and feedback
      default: null,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

export default mongoose.models.Analysis || mongoose.model("Analysis", AnalysisSchema);
