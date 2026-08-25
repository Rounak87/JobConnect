import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "literally", "sort of", "kind of"];
const HEDGE_PHRASES = ["i think", "maybe", "i'm not sure", "probably", "i guess", "i believe"];
const ASSERTIVE_PHRASES = ["i did", "i built", "i implemented", "we achieved", "i led", "i designed", "i resolved"];

/**
 * Clean and tokenize text
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Dimension 2: Communication metrics (deterministic)
 */
export function computeCommunicationMetrics(transcriptText) {
  const words = tokenize(transcriptText);
  const totalWords = words.length;

  if (totalWords === 0) {
    return {
      totalWords: 0,
      fillerRatio: 0,
      vocabularyRichness: 0,
      avgSentenceLength: 0,
      confidenceScore: 5,
      fillerCount: 0,
    };
  }

  // 1. Filler words count
  let fillerCount = 0;
  const lowerText = transcriptText.toLowerCase();
  for (const filler of FILLER_WORDS) {
    const parts = lowerText.split(new RegExp(`\\b${filler}\\b`, "g"));
    fillerCount += parts.length - 1;
  }
  const fillerRatio = Math.round((fillerCount / totalWords) * 100) / 100;

  // 2. TTR (Type-Token Ratio) for vocabulary richness
  const uniqueWords = new Set(words);
  const ttr = Math.round((uniqueWords.size / totalWords) * 100) / 100;

  // 3. Avg sentence length
  const sentences = transcriptText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? Math.round(totalWords / sentences.length) : totalWords;

  // 4. Confidence (Hedge vs Assertive)
  let hedgeCount = 0;
  for (const hedge of HEDGE_PHRASES) {
    const parts = lowerText.split(new RegExp(`\\b${hedge}\\b`, "g"));
    hedgeCount += parts.length - 1;
  }

  let assertiveCount = 0;
  for (const assertive of ASSERTIVE_PHRASES) {
    const parts = lowerText.split(new RegExp(`\\b${assertive}\\b`, "g"));
    assertiveCount += parts.length - 1;
  }

  const confidenceScore = Math.min(10, Math.max(0, 5 + assertiveCount - hedgeCount));

  return {
    totalWords,
    fillerRatio,
    vocabularyRichness: ttr,
    avgSentenceLength,
    confidenceScore,
    fillerCount,
  };
}

/**
 * Dimension 3: Keyword coverage (deterministic)
 */
export function computeKeywordCoverage(transcriptText, missingSkills = [], weakMatches = []) {
  const textLower = transcriptText.toLowerCase();
  const targetSkills = [
    ...missingSkills.map((s) => s.skill),
    ...weakMatches.map((s) => s.skill),
  ];

  if (targetSkills.length === 0) {
    return {
      coveredSkills: [],
      coverageScore: 100,
      totalTarget: 0,
      coveredCount: 0,
    };
  }

  const coveredSkills = targetSkills.filter((skill) =>
    textLower.includes(skill.toLowerCase())
  );

  const coverageScore = Math.round((coveredSkills.length / targetSkills.length) * 100);

  return {
    coveredSkills,
    coverageScore,
    totalTarget: targetSkills.length,
    coveredCount: coveredSkills.length,
  };
}

/**
 * Dimension 4: Response length distribution (deterministic)
 * Underprepared: <50 words
 * Rambling: >300 words
 * Optimal: 100-200 words
 */
export function computeResponseLengthScore(userAnswers = []) {
  if (userAnswers.length === 0) {
    return { score: 100, avgLength: 0, optimalPct: 100 };
  }

  let optimalCount = 0;
  let totalWords = 0;

  for (const ans of userAnswers) {
    const words = ans.split(/\s+/).filter(Boolean).length;
    totalWords += words;
    if (words >= 100 && words <= 200) {
      optimalCount++;
    }
  }

  const avgLength = Math.round(totalWords / userAnswers.length);
  const optimalPct = Math.round((optimalCount / userAnswers.length) * 100);

  // Score calculated as optimal percentage, with some points for decent lengths (50-300 words)
  let score = optimalPct;
  if (score < 50) {
    // If not optimal, give partial credit if within a broader healthy range (50-250 words)
    let decentCount = 0;
    for (const ans of userAnswers) {
      const words = ans.split(/\s+/).filter(Boolean).length;
      if (words >= 50 && words <= 250) decentCount++;
    }
    score = Math.max(score, Math.round((decentCount / userAnswers.length) * 70));
  }

  return {
    score,
    avgLength,
    optimalPct,
  };
}

/**
 * Dimensions 1 & 5: LLM-based STAR & Technical Depth scoring
 */
export async function computeLlmInterviewEvaluation(transcriptText, jobDescription) {
  const systemPrompt = `You are a professional technical interviewer and grading assistant.
Analyze the following transcript of the candidate's responses during a mock interview for a job with the description below.

Grading dimensions to assess:
1. STAR Framework (Situation, Task, Action, Result) - Score 0-10 for each.
   - Situation: Did they establish context?
   - Task: Did they state their responsibility?
   - Action: Did they explain concrete steps they took?
   - Result: Did they quantify outcomes/metrics?
2. Technical Depth - Score 0-100.
   - Did they demonstrate deep concept understanding or just throw surface buzzwords?
3. Constructive Feedback - A short bulleted list of 2-3 specific improvements for their next interview.
4. Sample Answer Rewrites - Provide 1-2 concrete examples rephrasing the candidate's actual answer into an exemplary STAR-method response.

Return the grading as a JSON object with this structure:
{
  "star": {
    "situation": <number 0-10>,
    "task": <number 0-10>,
    "action": <number 0-10>,
    "result": <number 0-10>,
    "total": <number 0-40>
  },
  "technicalDepth": <number 0-100>,
  "feedback": ["<feedback 1>", "<feedback 2>"],
  "sampleAnswers": [
    {
      "originalSnippet": "<Brief summary of what candidate said>",
      "improvedSampleAnswer": "<High-impact STAR format response with metrics and deep technical detail>"
    }
  ]
}

Return ONLY valid JSON. No explanations, no markdown code blocks.`;

  const userPrompt = `JOB DESCRIPTION:\n${jobDescription}\n\nTRANSCRIPT:\n${transcriptText}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text);
  } catch (err) {
    console.error("[InterviewScorer] LLM evaluation failed:", err);
    // Return mock/default grades in case of API failure
    return {
      star: { situation: 7, task: 7, action: 7, result: 5, total: 26 },
      technicalDepth: 70,
      feedback: ["Provide more quantitative results for your projects.", "Elaborate more on the technical challenges faced."],
      sampleAnswers: [
        {
          originalSnippet: "I worked on a web app and used SQL for queries.",
          improvedSampleAnswer: "In my recent project (Situation), I was tasked with accelerating database response times (Task). I redesigned the indexing strategy and optimized SQL JOIN queries (Action), reducing query execution latency by 35% (Result)."
        }
      ]
    };
  }
}
