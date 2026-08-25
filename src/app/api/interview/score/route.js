import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Analysis from "@/models/Analysis";
import User from "@/models/User";
import {
  computeCommunicationMetrics,
  computeKeywordCoverage,
  computeResponseLengthScore,
  computeLlmInterviewEvaluation,
} from "@/lib/interviewScorer";
import { updateSessionInCache, getSessionFromCache } from "@/lib/sessionCache";
import { updateSessionInFileDb, getSessionFromFileDb } from "@/lib/fileDb";
import { computeDKTState } from "@/lib/dktModel";

/**
 * POST /api/interview/score
 * Evaluates the transcript messages and saves the result to MongoDB.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { analysisId, uid, messages } = body;

    if (!analysisId || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Missing analysisId or messages array" },
        { status: 400 }
      );
    }

    const effectiveUid = uid || "local_user";

    let session = null;

    try {
      await connectToDatabase();
      const userDoc = await User.findOne({ firebaseUid: effectiveUid });
      if (userDoc) {
        session = await Analysis.findOne({
          _id: analysisId,
          userId: userDoc._id,
        });
      }
    } catch (dbErr) {
      console.warn("[InterviewScore] ⚠️ MongoDB Atlas connection failed, using local file/cache session.");
    }

    // Fallback to in-memory session cache or persistent file DB
    if (!session) {
      session = getSessionFromCache(analysisId) || getSessionFromFileDb(analysisId);
    }

    if (!session) {
      // Create a default session shell if missing so grading never crashes
      session = {
        jobDescription: "General Software Engineer role",
        gapAnalysis: { missingSkills: [], weakMatches: [] },
      };
    }

    // 2. Extract transcript strings
    const userAnswers = messages
      .filter((m) => m.role === "user" && m.committed?.trim())
      .map((m) => m.committed.trim());
    const transcriptText = messages
      .filter((m) => m.committed?.trim())
      .map((m) => `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.committed}`)
      .join("\n");

    // 3. Compute Deterministic Scores
    const commMetrics = computeCommunicationMetrics(userAnswers.join(" "));
    const missingSkills = session.gapAnalysis?.missingSkills || [];
    const weakMatches = session.gapAnalysis?.weakMatches || [];
    const keywordCoverage = computeKeywordCoverage(userAnswers.join(" "), missingSkills, weakMatches);
    const lengthMetrics = computeResponseLengthScore(userAnswers);

    // 4. Compute LLM Scores (STAR + Technical Depth)
    const llmEvaluation = await computeLlmInterviewEvaluation(transcriptText, session.jobDescription);

    // 5. Compute Composite Interview Score
    // Weight breakdown (rubric-backed):
    // - STAR Framework (LLM): 30% (converted from 0-40 to 0-100)
    // - Technical Depth (LLM): 25% (0-100)
    // - Keyword Coverage (Det): 20% (0-100)
    // - Communication Clarity (Det - confidence + filler word ratio combined): 15%
    // - Response Length Fit (Det): 10% (0-100)
    const starPct = (llmEvaluation.star.total / 40) * 100;
    const commClarityScore = (commMetrics.confidenceScore * 10) * 0.6 + (1 - commMetrics.fillerRatio) * 100 * 0.4;
    const finalCommClarity = Math.min(100, Math.max(0, Math.round(commClarityScore)));

    const compositeScore = Math.round(
      starPct * 0.3 +
      llmEvaluation.technicalDepth * 0.25 +
      keywordCoverage.coverageScore * 0.2 +
      finalCommClarity * 0.15 +
      lengthMetrics.score * 0.1
    );

    // 6. Save transcript and scorecard to Database
    const scorecard = {
      compositeScore,
      star: {
        ...llmEvaluation.star,
        score: Math.round(starPct),
      },
      technicalDepth: llmEvaluation.technicalDepth,
      keywordCoverage,
      communication: {
        ...commMetrics,
        score: finalCommClarity,
      },
      lengthFit: lengthMetrics,
      feedback: llmEvaluation.feedback,
      sampleAnswers: llmEvaluation.sampleAnswers || [],
      evaluatedAt: new Date(),
    };

    // Build attempt history record for tracking progress across retakes
    let existingHistory = Array.isArray(session.interviewHistory) ? session.interviewHistory : [];
    
    // If Attempt 1 was previously saved in interviewScorecard but not in interviewHistory array, preserve Attempt 1
    if (existingHistory.length === 0 && session.interviewScorecard) {
      existingHistory = [
        {
          attemptNumber: 1,
          compositeScore: session.interviewScorecard.compositeScore,
          evaluatedAt: session.interviewScorecard.evaluatedAt || new Date(),
          scorecard: session.interviewScorecard,
          transcript: session.interviewTranscript || [],
        },
      ];
    }

    const attemptRecord = {
      attemptNumber: existingHistory.length + 1,
      compositeScore: scorecard.compositeScore,
      evaluatedAt: new Date(),
      scorecard,
      transcript: messages,
    };
    const updatedHistory = [...existingHistory, attemptRecord];

    // Compute Deep Knowledge Tracing (DKT) latent state transition & next-attempt prediction
    const dktEvaluation = computeDKTState(updatedHistory, missingSkills);
    scorecard.dkt = dktEvaluation;

    updateSessionInCache(analysisId, {
      interviewTranscript: messages,
      interviewScorecard: scorecard,
      interviewHistory: updatedHistory,
      dktPrediction: dktEvaluation,
    });
    updateSessionInFileDb(analysisId, {
      interviewTranscript: messages,
      interviewScorecard: scorecard,
      interviewHistory: updatedHistory,
      dktPrediction: dktEvaluation,
    });

    try {
      await Analysis.findByIdAndUpdate(analysisId, {
        interviewTranscript: messages,
        interviewScorecard: scorecard,
        interviewHistory: updatedHistory,
        dktPrediction: dktEvaluation,
      });
      console.log(`[InterviewScore] ✓ Saved attempt #${attemptRecord.attemptNumber} (Score: ${compositeScore}) with DKT Readiness Index: ${dktEvaluation.readinessIndex}% for session: ${analysisId}`);
    } catch (dbErr) {
      console.warn(`[InterviewScore] ⚠️ Saved attempt #${attemptRecord.attemptNumber} to session cache fallback.`);
    }

    console.log(`[InterviewScore] ✓ Evaluated and saved scorecard for session: ${analysisId}. Score: ${compositeScore}`);

    return NextResponse.json({
      success: true,
      scorecard,
    });
  } catch (error) {
    console.error("Interview grading error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to grade interview response" },
      { status: 500 }
    );
  }
}
