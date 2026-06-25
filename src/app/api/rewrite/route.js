import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import connectToDatabase from "@/lib/mongodb";
import Analysis from "@/models/Analysis";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  SectionType,
} from "docx";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
- Rewrite bullet points to naturally incorporate these missing keywords where truthful: use the gap analysis data
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
  "gemini-3.1-pro-preview",
];

async function callGeminiWithFallback(prompt, systemInstruction) {
  let lastError = null;

  for (const model of MODELS) {
    try {
      console.log(`[Rewrite] Trying model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });
      console.log(`[Rewrite] ✓ Success with model: ${model}`);
      return { response, usedModel: model };
    } catch (err) {
      lastError = err;
      console.warn(`[Rewrite] ✗ ${model} failed:`, JSON.stringify({
        status: err?.status,
        code: err?.code,
        message: err?.message?.substring(0, 200),
        name: err?.name,
      }));
      
      continue;
    }
  }
  
  console.error("[Rewrite] All AI models failed. Last error:", lastError);
  return { response: null, usedModel: null };
}

function buildDocx(data) {
  const children = [];

  // ── Name ──
  if (data.contactInfo?.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: data.contactInfo.name.toUpperCase(),
            bold: true,
            size: 32,
            font: "Calibri",
            color: "1a1a2e",
          }),
        ],
      })
    );
  }

  // ── Contact Line ──
  const contactParts = [
    data.contactInfo?.email,
    data.contactInfo?.phone,
    data.contactInfo?.location,
    data.contactInfo?.linkedin,
  ].filter(Boolean);

  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: contactParts.join("  |  "),
            size: 18,
            font: "Calibri",
            color: "555555",
          }),
        ],
      })
    );
  }

  
  function addSectionHeading(title) {
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 100 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
        },
        children: [
          new TextRun({
            text: title.toUpperCase(),
            bold: true,
            size: 22,
            font: "Calibri",
            color: "1a1a2e",
          }),
        ],
      })
    );
  }

  // ── Summary ──
  if (data.summary) {
    addSectionHeading("Professional Summary");
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: data.summary,
            size: 20,
            font: "Calibri",
            color: "333333",
          }),
        ],
      })
    );
  }

  // ── Experience ──
  if (data.experience && data.experience.length > 0) {
    addSectionHeading("Experience");
    for (const job of data.experience) {
      // Job title + Company
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 20 },
          children: [
            new TextRun({
              text: job.title || "",
              bold: true,
              size: 21,
              font: "Calibri",
            }),
            new TextRun({
              text: job.company ? `  —  ${job.company}` : "",
              size: 21,
              font: "Calibri",
              color: "555555",
            }),
          ],
        })
      );
      // Duration
      if (job.duration) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: job.duration,
                italics: true,
                size: 18,
                font: "Calibri",
                color: "777777",
              }),
            ],
          })
        );
      }
      // Bullet points
      if (job.bullets) {
        for (const bullet of job.bullets) {
          children.push(
            new Paragraph({
              spacing: { after: 40 },
              bullet: { level: 0 },
              children: [
                new TextRun({
                  text: bullet,
                  size: 20,
                  font: "Calibri",
                  color: "333333",
                }),
              ],
            })
          );
        }
      }
    }
  }

  // ── Skills ──
  if (data.skills && data.skills.length > 0) {
    addSectionHeading("Skills");
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: data.skills.join("  •  "),
            size: 20,
            font: "Calibri",
            color: "333333",
          }),
        ],
      })
    );
  }

  // ── Projects ──
  if (data.projects && data.projects.length > 0) {
    addSectionHeading("Projects");
    for (const proj of data.projects) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 20 },
          children: [
            new TextRun({
              text: proj.name || "",
              bold: true,
              size: 21,
              font: "Calibri",
            }),
            new TextRun({
              text: proj.tech ? `  (${proj.tech})` : "",
              size: 19,
              font: "Calibri",
              color: "777777",
            }),
          ],
        })
      );
      if (proj.description) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: proj.description,
                size: 20,
                font: "Calibri",
                color: "333333",
              }),
            ],
          })
        );
      }
    }
  }

  // ── Education ──
  if (data.education && data.education.length > 0) {
    addSectionHeading("Education");
    for (const edu of data.education) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [
            new TextRun({
              text: edu.degree || "",
              bold: true,
              size: 21,
              font: "Calibri",
            }),
            new TextRun({
              text: edu.school ? `  —  ${edu.school}` : "",
              size: 21,
              font: "Calibri",
              color: "555555",
            }),
            new TextRun({
              text: edu.year ? `  (${edu.year})` : "",
              italics: true,
              size: 19,
              font: "Calibri",
              color: "777777",
            }),
          ],
        })
      );
    }
  }

  // ── Certifications ──
  if (data.certifications && data.certifications.length > 0) {
    addSectionHeading("Certifications");
    for (const cert of data.certifications) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: cert,
              size: 20,
              font: "Calibri",
              color: "333333",
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  });

  return doc;
}

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
    let usedModel = "cached";

    // 1. Check if we already have the rewrittenData cached in the database
    if (analysisId) {
      try {
        await connectToDatabase();
        const existingDoc = await Analysis.findById(analysisId);
        if (existingDoc && existingDoc.rewrittenData) {
          console.log("[Rewrite] ✓ Cache hit! Skipping AI generation.");
          rewrittenData = existingDoc.rewrittenData;
        }
      } catch (dbErr) {
        console.error("Failed to check cache:", dbErr);
      }
    }

    // 2. If no cache, call Gemini to generate the rewrite
    if (!rewrittenData) {
      const userPrompt = `RESUME TEXT:\n${resumeText}\n\n---\n\nJOB DESCRIPTION:\n${jobDescription}\n\n---\n\nGAP ANALYSIS:\n${JSON.stringify(analysis, null, 2)}`;
      
      const result = await callGeminiWithFallback(userPrompt, REWRITE_PROMPT);
      if (!result.response) {
        return NextResponse.json(
          { error: "All AI models are currently unavailable. Please wait a minute and try again." },
          { status: 429 }
        );
      }
      
      usedModel = result.usedModel;

      try {
        rewrittenData = JSON.parse(result.response.text);
      } catch {
        console.error("Failed to parse rewrite response:", result.response.text);
        return NextResponse.json(
          { error: "AI returned invalid data. Please try again." },
          { status: 500 }
        );
      }

      // 3. Save the newly generated data back to the database to cache it for next time
      if (analysisId) {
        try {
          await Analysis.findByIdAndUpdate(analysisId, { rewrittenData });
          console.log("[Rewrite] ✓ Saved generated rewrite to database cache.");
        } catch (dbErr) {
          console.error("Failed to save rewrite to cache:", dbErr);
        }
      }
    }

    // Generate the DOCX
    const doc = buildDocx(rewrittenData);
    const buffer = await Packer.toBuffer(doc);

    // Return as downloadable file
    const jobTitle = analysis?.jobTitle || "optimized";
    const filename = `resume_${jobTitle.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.docx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Used-Model": usedModel || "unknown",
      },
    });
  } catch (error) {
    console.error("Rewrite API error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong during rewrite" },
      { status: 500 }
    );
  }
}
