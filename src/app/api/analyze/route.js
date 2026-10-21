import { NextResponse } from "next/server";
import mammoth from "mammoth";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";
import Analysis from "@/models/Analysis";
import { generateGeminiContent } from "@/lib/gemini";
import {
  computeTfIdfScore,
  computeSemanticScore,
  computeHybridScore,
  computeATSScore,
} from "@/lib/scoring";
import { saveSessionToCache } from "@/lib/sessionCache";
import { saveAnalysisToFileDb } from "@/lib/fileDb";

const ANALYSIS_PROMPT = `You are an expert resume analyst and career coach. You will be given a candidate's resume text and a job description. Analyze how well the resume matches the job description.

Return your analysis as a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):

{
  "matchScore": <number 0-100>,
  "jobTitle": "<extracted job title from JD>",
  "strongMatches": [
    { "skill": "<skill/experience name>", "detail": "<why this is a strong match>" }
  ],
  "weakMatches": [
    { "skill": "<skill/experience name>", "detail": "<what the candidate has but undersold or poorly worded>" }
  ],
  "missingSkills": [
    { "skill": "<skill name>", "importance": "critical" | "important" | "nice-to-have", "detail": "<why this matters>" }
  ],
  "keywordsToAdd": ["<exact keyword from JD missing from resume>"],
  "verdict": "<2-3 sentence plain English summary of the candidate's fit>"
}

Rules:
- matchScore should reflect realistic assessment. 80+ means very strong fit, 50-79 moderate, below 50 weak.
- strongMatches: skills/experience the candidate clearly has that align with the JD.
- weakMatches: things the candidate has but didn't highlight well enough.
- missingSkills: required/preferred skills completely absent from the resume.
- keywordsToAdd: exact phrases or terms from the JD that should appear on the resume.
- Be specific and actionable in every detail field.
- Return ONLY valid JSON. No explanations before or after.`;

export async function POST(request) {
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get("file");
    const jobDescription = formData.get("jobDescription");
    const uid = formData.get("uid");

    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { error: "No resume file uploaded" },
        { status: 400 }
      );
    }
    if (!jobDescription || jobDescription.trim().length < 20) {
      return NextResponse.json(
        { error: "Job description is too short" },
        { status: 400 }
      );
    }

    // Extract text from DOCX using mammoth
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mammothResult = await mammoth.extractRawText({ buffer });
    const resumeText = mammothResult.value;

    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json(
        { error: "Could not extract enough text from the resume. Make sure it's a valid DOCX file." },
        { status: 400 }
      );
    }

    // Call Gemini with dual-key rotation and multi-model fallback
    const userPrompt = `RESUME TEXT:\n${resumeText}\n\n---\n\nJOB DESCRIPTION:\n${jobDescription}`;

    let response = null;
    let usedModel = null;

    try {
      const geminiResult = await generateGeminiContent({
        contents: userPrompt,
        systemInstruction: ANALYSIS_PROMPT,
        responseMimeType: "application/json",
      });
      response = geminiResult.response;
      usedModel = geminiResult.usedModel;
    } catch (geminiError) {
      console.error("[Analyze] Gemini call failed:", geminiError);
      return NextResponse.json(
        { error: `AI analysis service temporarily unavailable: ${geminiError.message}` },
        { status: 429 }
      );
    }

    // Parse the JSON response
    const analysisText = response.text;
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch {
      console.error("Failed to parse Gemini response:", analysisText);
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 500 }
      );
    }

    // ── Hybrid Scoring Pipeline ──────────────────────────────────────────
    // Signal 1: TF-IDF keyword match (deterministic, lexical)
    const tfidfResult = computeTfIdfScore(resumeText, jobDescription);
    console.log(`[Analyze] TF-IDF score: ${tfidfResult.score}`);

    // Signal 2: Semantic similarity (optional, requires HUGGINGFACE_API_KEY)
    const semanticScore = await computeSemanticScore(resumeText, jobDescription);
    console.log(`[Analyze] Semantic score: ${semanticScore ?? "unavailable"}`);

    // Signal 3: LLM score (Gemini — already computed above)
    const llmScore = analysis.matchScore || 0;

    // Fuse signals → Hybrid Score
    const hybridResult = computeHybridScore({
      tfidf: tfidfResult.score,
      semantic: semanticScore,
      llm: llmScore,
    });
    console.log(`[Analyze] Hybrid score: ${hybridResult.hybridScore}`);

    // ATS Readiness Score (pure deterministic, no API)
    const atsResult = computeATSScore(resumeText, jobDescription);
    console.log(`[Analyze] ATS score: ${atsResult.total}/100`);

    // Bundle scoring data to return and store
    const scoringBreakdown = {
      tfidf: { score: tfidfResult.score, matchedTerms: tfidfResult.matchedTerms, missingTerms: tfidfResult.missingTerms, topJdTerms: tfidfResult.topJdTerms },
      semantic: semanticScore,
      llm: llmScore,
      hybrid: hybridResult,
    };
    // ─────────────────────────────────────────────────────────────────────

    // Bundle session payload
    const sessionPayload = {
      jobTitle: analysis.jobTitle || "Unknown Role",
      jobDescription,
      resumeText,
      matchScore: hybridResult.hybridScore,
      gapAnalysis: analysis,
      scoringBreakdown,
      atsScore: atsResult,
      createdAt: new Date(),
    };

    // Save directly to primary MongoDB Atlas
    let analysisId = null;
    try {
      await connectToDatabase();
      const effectiveUid = uid || "local_user";
      let userDoc = await User.findOne({ firebaseUid: effectiveUid });
      if (!userDoc) {
        userDoc = await User.create({
          firebaseUid: effectiveUid,
          email: effectiveUid === "local_user" ? "guest@jobconnect.local" : `${effectiveUid}@jobconnect.local`,
          displayName: effectiveUid === "local_user" ? "Guest User" : "JobConnect User",
        });
      }

      const doc = await Analysis.create({
        userId: userDoc._id,
        ...sessionPayload,
      });
      analysisId = String(doc._id);
      saveSessionToCache(analysisId, sessionPayload);
      console.log("[Analyze] ✓ Saved analysis directly to MongoDB:", analysisId, "for user:", userDoc.email);
    } catch (dbError) {
      console.error("[Analyze] MongoDB write error:", dbError.message);
      const localRecord = saveAnalysisToFileDb({
        uid: uid || "local_user",
        ...sessionPayload,
      });
      analysisId = localRecord ? String(localRecord._id) : `session_${Date.now()}`;
      saveSessionToCache(analysisId, sessionPayload);
    }

    return NextResponse.json({
      success: true,
      analysis,
      analysisId,
      model: usedModel,
      resumeText,
      resumeTextLength: resumeText.length,
      scoringBreakdown,
      atsScore: atsResult,
    });
  } catch (error) {
    console.error("Analysis API error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong during analysis" },
      { status: 500 }
    );
  }
}
