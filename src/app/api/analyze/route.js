import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";
import Analysis from "@/models/Analysis";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

    // Call Gemini with model fallback chain
    const userPrompt = `RESUME TEXT:\n${resumeText}\n\n---\n\nJOB DESCRIPTION:\n${jobDescription}`;

    const MODELS = [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-3.1-pro-preview",
    ];

    let response = null;
    let usedModel = null;
    let lastError = null;

    for (const model of MODELS) {
      try {
        console.log(`[Analyze] Trying model: ${model}`);
        response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: ANALYSIS_PROMPT,
            responseMimeType: "application/json",
          },
        });
        usedModel = model;
        console.log(`[Analyze] ✓ Success with: ${model}`);
        break;
      } catch (err) {
        lastError = err;
        // Log the FULL error so we can debug
        console.warn(`[Analyze] ✗ ${model} failed:`, JSON.stringify({
          status: err?.status,
          code: err?.code,
          message: err?.message?.substring(0, 200),
          name: err?.name,
        }));
        // ALWAYS try next model — don't stop on any error
        continue;
      }
    }

    if (!response) {
      const errMsg = lastError?.message?.substring(0, 300) || "Unknown error";
      return NextResponse.json(
        { error: `All AI models failed. Last error: ${errMsg}` },
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

    // Save to Database asynchronously if the user is logged in
    let analysisId = null;
    if (uid) {
      try {
        await connectToDatabase();
        const userDoc = await User.findOne({ firebaseUid: uid });
        
        if (userDoc) {
          const doc = await Analysis.create({
            userId: userDoc._id,
            jobTitle: analysis.jobTitle || "Unknown Role",
            jobDescription,
            resumeText,
            matchScore: analysis.matchScore || 0,
            gapAnalysis: analysis,
          });
          analysisId = doc._id;
          console.log("[Analyze] ✓ Saved analysis to database for user:", userDoc.email);
        }
      } catch (dbError) {
        console.error("[Analyze] ✗ Failed to save to database:", dbError);
        // We do not throw here because the analysis was successful and we still want to return it to the user.
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      analysisId,
      model: usedModel,
      resumeText,
      resumeTextLength: resumeText.length,
    });
  } catch (error) {
    console.error("Analysis API error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong during analysis" },
      { status: 500 }
    );
  }
}
