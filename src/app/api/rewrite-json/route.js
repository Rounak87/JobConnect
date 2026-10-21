import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import Analysis from "@/models/Analysis";
import { computeATSScore } from "@/lib/scoring";
import { generateGeminiContent } from "@/lib/gemini";

const REWRITE_PROMPT = `You are an expert resume writer. You will be given a candidate's resume text, a job description, and a gap analysis.

Your job is to restructure and rewrite the resume to better match the job description.

Return a JSON object with EXACTLY this structure:

{
  "contactInfo": {
    "name": "<full name>",
    "email": "<email if found>",
    "phone": "<phone if found>",
    "linkedin": "<linkedin if found>",
    "location": "<city, state if found>"
  },
  "summary": "<A compelling 2-3 sentence professional summary tailored to this specific JD. Mention key matching skills and years of experience.>",
  "experience": [
    {
      "title": "<job title>",
      "company": "<company name>",
      "duration": "<start - end>",
      "bullets": [
        "<rewritten bullet point 1>",
        "<rewritten bullet point 2>"
      ]
    }
  ],
  "skills": ["<skill1>", "<skill2>"],
  "education": [
    {
      "degree": "<degree name>",
      "school": "<school name>",
      "year": "<graduation year or duration>"
    }
  ],
  "projects": [
    {
      "name": "<project name>",
      "description": "<1-2 sentence description rewritten with JD keywords>",
      "tech": "<technologies used>"
    }
  ],
  "certifications": ["<cert1>", "<cert2>"]
}

REWRITING RULES:
- Keep ALL original experiences — do NOT fabricate or add fake experiences
- Rewrite bullet points to naturally incorporate these missing keywords where truthful
- Start every bullet with a strong action verb in past tense
- Quantify achievements wherever possible (numbers, percentages, scale)
- Keep bullet points concise (1-2 lines max)
- The summary should be specifically tailored to the target JD
- Add missing keywords from the gap analysis into the skills section if the candidate reasonably has them
- If a section doesn't exist in the original resume, return an empty array for it
- Return ONLY valid JSON. No explanations.`;

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

/**
 * POST /api/rewrite-json
 * Same as /api/rewrite but returns structured JSON (not DOCX).
 * Leverages the same DB cache so no extra AI call is needed if rewrite already happened.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { resumeText, jobDescription, analysis, analysisId } = body;

    if (!resumeText || !jobDescription) {
      return NextResponse.json(
        { error: "Missing resume text or job description" },
        { status: 400 }
      );
    }

    let rewrittenData = null;

    // 1. Check DB cache first (populated by /api/rewrite)
    if (analysisId) {
      try {
        await connectToDatabase();
        const existingDoc = await Analysis.findById(analysisId);
        if (existingDoc?.rewrittenData) {
          console.log("[RewriteJSON] ✓ Cache hit — returning cached rewrite");
          rewrittenData = existingDoc.rewrittenData;
        }
      } catch (dbErr) {
        console.error("[RewriteJSON] DB cache check failed:", dbErr);
      }
    }

    // 2. If no cache, call Gemini with failover
    if (!rewrittenData) {
      const userPrompt = `RESUME TEXT:\n${resumeText}\n\n---\n\nJOB DESCRIPTION:\n${jobDescription}\n\n---\n\nGAP ANALYSIS:\n${JSON.stringify(analysis, null, 2)}`;

      let responseText = null;
      try {
        const geminiResult = await generateGeminiContent({
          contents: userPrompt,
          systemInstruction: REWRITE_PROMPT,
          responseMimeType: "application/json",
        });
        responseText = geminiResult.text;
      } catch (geminiError) {
        console.error("[RewriteJSON] Gemini call failed:", geminiError);
        return NextResponse.json(
          { error: `AI rewrite service temporarily unavailable: ${geminiError.message}` },
          { status: 429 }
        );
      }

      try {
        rewrittenData = JSON.parse(responseText);
      } catch {
        return NextResponse.json(
          { error: "AI returned invalid data format. Please try again." },
          { status: 500 }
        );
      }

      // Cache it in DB
      if (analysisId) {
        try {
          await Analysis.findByIdAndUpdate(analysisId, { rewrittenData });
          console.log("[RewriteJSON] ✓ Saved to DB cache");
        } catch (dbErr) {
          console.error("[RewriteJSON] DB save failed:", dbErr);
        }
      }
    }

    // Compute ATS score on the properly reconstructed rewritten resume text
    // IMPORTANT: Include section keywords so sectionPresence sub-score is accurate
    const rewrittenFullText = [
      rewrittenData.contactInfo?.name || "",
      "PROFESSIONAL SUMMARY",
      rewrittenData.summary || "",
      "EXPERIENCE",
      ...(rewrittenData.experience || []).flatMap(j => [
        `${j.title || ""} ${j.company || ""} ${j.duration || ""}`,
        ...(j.bullets || []),
      ]),
      "SKILLS",
      (rewrittenData.skills || []).join(" "),
      "PROJECTS",
      ...(rewrittenData.projects || []).map(p => `${p.name || ""} ${p.description || ""}`),
      "EDUCATION",
      ...(rewrittenData.education || []).map(e => `${e.degree || ""} ${e.school || ""} ${e.year || ""}`),
      "CERTIFICATIONS",
      ...(rewrittenData.certifications || []),
    ].filter(Boolean).join("\n");

    const atsAfter = computeATSScore(rewrittenFullText, jobDescription, true);

    if (analysisId) {
      try {
        await connectToDatabase();
        await Analysis.findByIdAndUpdate(analysisId, { atsScoreAfterRewrite: atsAfter });
      } catch (dbErr) {
        console.warn("[RewriteJSON] Failed to cache atsScoreAfterRewrite to MongoDB:", dbErr);
      }
    }

    return NextResponse.json({ success: true, rewrittenData, atsAfter });
  } catch (error) {
    console.error("[RewriteJSON] Error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
