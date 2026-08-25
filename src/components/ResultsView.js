"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { computeDKTState } from "@/lib/dktModel";

// ─── Text helpers ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build highlighted HTML for the original resume panel */
function buildHighlightedHTML(text, matchedTerms = [], missingTerms = []) {
  if (!text) return "";
  const allTerms = [
    ...missingTerms.map((t) => ({ term: t, type: "missing" })),
    ...matchedTerms.map((t) => ({ term: t, type: "matched" })),
  ].sort((a, b) => b.term.length - a.term.length);

  if (!allTerms.length) return escapeHtml(text).replace(/\n/g, "<br/>");

  const pattern = allTerms
    .map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`\\b(${pattern})\\b`, "gi");
  const termMap = {};
  for (const { term, type } of allTerms) termMap[term.toLowerCase()] = type;

  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, match.index)).replace(/\n/g, "<br/>"));
    }
    const type = termMap[match[0].toLowerCase()] || "matched";
    const cls =
      type === "matched"
        ? "bg-emerald-500/25 text-emerald-300 rounded-sm px-0.5 font-medium"
        : "bg-red-500/25 text-red-300 rounded-sm px-0.5 font-medium";
    parts.push(`<mark class="${cls}">${escapeHtml(match[0])}</mark>`);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length)
    parts.push(escapeHtml(text.slice(lastIndex)).replace(/\n/g, "<br/>"));
  return parts.join("");
}

/** Convert rewrittenData JSON → nicely formatted plain-text resume */
function rewrittenDataToText(data) {
  if (!data) return "";
  const SEP = "─".repeat(52);
  const lines = [];

  if (data.contactInfo?.name) {
    lines.push(data.contactInfo.name.toUpperCase());
  }
  const contact = [
    data.contactInfo?.email,
    data.contactInfo?.phone,
    data.contactInfo?.location,
    data.contactInfo?.linkedin,
  ].filter(Boolean).join("  |  ");
  if (contact) lines.push(contact);

  if (data.summary) {
    lines.push("", SEP, "PROFESSIONAL SUMMARY", SEP);
    lines.push(data.summary);
  }

  if (data.experience?.length) {
    lines.push("", SEP, "EXPERIENCE", SEP);
    for (const job of data.experience) {
      lines.push(`${job.title || ""}  —  ${job.company || ""}  (${job.duration || ""})`);
      for (const b of job.bullets || []) lines.push(`  • ${b}`);
      lines.push("");
    }
  }

  if (data.skills?.length) {
    lines.push(SEP, "SKILLS", SEP);
    lines.push(data.skills.join("  •  "));
  }

  if (data.projects?.length) {
    lines.push("", SEP, "PROJECTS", SEP);
    for (const proj of data.projects) {
      lines.push(`${proj.name || ""}  (${proj.tech || ""})`);
      if (proj.description) lines.push(`  ${proj.description}`);
      lines.push("");
    }
  }

  if (data.education?.length) {
    lines.push(SEP, "EDUCATION", SEP);
    for (const edu of data.education) {
      lines.push(`${edu.degree || ""}  —  ${edu.school || ""}  (${edu.year || ""})`);
    }
  }

  if (data.certifications?.length) {
    lines.push("", SEP, "CERTIFICATIONS", SEP);
    for (const cert of data.certifications) lines.push(`  • ${cert}`);
  }

  return lines.join("\n").trim();
}

/** Find which missingTerms now appear in the generated resume text */
function findNewlyCoveredKeywords(generatedText, missingTerms = []) {
  const lower = generatedText.toLowerCase();
  return missingTerms.filter((t) => lower.includes(t.toLowerCase()));
}

// ─── Score helpers ─────────────────────────────────────────────────────────────

function scoreColor(s) {
  if (s >= 75) return "var(--accent-green)";
  if (s >= 50) return "var(--accent-amber)";
  return "var(--accent-red)";
}
function scoreLabel(s) {
  if (s >= 75) return "Strong Match";
  if (s >= 50) return "Moderate Match";
  return "Weak Match";
}
function atsLabel(s) {
  if (s >= 80) return "ATS-Optimised";
  if (s >= 60) return "Good";
  if (s >= 40) return "Needs Work";
  return "Weak";
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ResultsView({
  result,
  onReset,
  resumeText,
  jobDescription,
  analysisId,
  scoringBreakdown,
  atsScore,
  interviewScorecard,
  interviewTranscript,
  interviewHistory,
}) {
  const [activeTab, setActiveTab] = useState("resume"); // "resume" | "interview"
  const hybridScore = scoringBreakdown?.hybrid?.hybridScore ?? result.matchScore ?? 0;
  const tfidfScore = scoringBreakdown?.tfidf?.score ?? 55;
  const tfidf = scoringBreakdown?.tfidf;
  const llmScore = scoringBreakdown?.llm ?? result.matchScore ?? 0;
  const semanticScore = scoringBreakdown?.semantic ?? 78;
  const atsBefore = atsScore?.total ?? 0;
  const atsBreakdownBefore = atsScore?.breakdown;

  // DKT (Deep Knowledge Tracing) Predictive Knowledge State
  const dktData = useMemo(() => {
    if (interviewScorecard?.dkt) return interviewScorecard.dkt;
    const historyToUse = Array.isArray(interviewHistory) && interviewHistory.length > 0
      ? interviewHistory
      : (interviewScorecard ? [{ scorecard: interviewScorecard }] : []);
    return computeDKTState(historyToUse, result?.missingSkills || []);
  }, [interviewScorecard?.compositeScore, (interviewHistory || []).length, result?.jobTitle]);

  // Editor state
  const [editableOriginal, setEditableOriginal] = useState(resumeText || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [rewrittenData, setRewrittenData] = useState(null);
  const [editableRewrite, setEditableRewrite] = useState("");
  const [atsAfter, setAtsAfter] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const router = useRouter();

  // Newly-covered keywords (previously missing, now in generated text)
  const newlyCovered = useMemo(() => {
    if (!rewrittenData || !tfidf?.missingTerms) return [];
    return findNewlyCoveredKeywords(editableRewrite, tfidf.missingTerms);
  }, [rewrittenData, editableRewrite, tfidf]);

  async function handleGenerate() {
    setIsGenerating(true);
    setGenerateError("");
    setAtsAfter(null);
    try {
      const res = await fetch("/api/rewrite-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescription, analysis: result, analysisId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }
      const json = await res.json();
      setRewrittenData(json.rewrittenData);
      const text = rewrittenDataToText(json.rewrittenData);
      setEditableRewrite(text);
      if (json.atsAfter) setAtsAfter(json.atsAfter);
    } catch (err) {
      setGenerateError(err.message || "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescription, analysis: result, analysisId }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume_${(result.jobTitle || "optimized").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12">

        {/* ── Header ── */}
        <div className="animate-fade-in-up flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">Analysis Results</p>
            <h1 className="text-3xl font-bold text-white">{result.jobTitle || "Resume Analysis"}</h1>
          </div>
          {onReset && (
            <button onClick={onReset} className="btn-secondary text-sm px-5 py-2.5" id="new-analysis-btn">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New Analysis
            </button>
          )}
        </div>

        {/* ── Guided Workflow Roadmap ── */}
        <div className="animate-fade-in-up mb-6 glass-card px-6 py-3.5 border border-[#222]">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold">1</span>
              <span>1. Resume Gap Analysis ✓</span>
            </div>
            <span className="text-[#333]">→</span>
            <div className="flex items-center gap-2 text-purple-400 font-medium">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold">2</span>
              <span>2. Resume Surgeon Optimization ✓</span>
            </div>
            <span className="text-[#333]">→</span>
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <span className="w-5 h-5 rounded-full bg-amber-500/30 flex items-center justify-center text-[10px] font-bold animate-pulse">3</span>
              <span>3. AI Voice Mock Interview (Next Step)</span>
            </div>
            <span className="text-[#333]">→</span>
            <div className="flex items-center gap-2 text-[#666]">
              <span className="w-5 h-5 rounded-full bg-[#111] flex items-center justify-center text-[10px] font-bold">4</span>
              <span>4. Scorecard & Learning Graph</span>
            </div>
          </div>
        </div>

        {/* ── View Mode Navigation Tabs ── */}
        <div className="animate-fade-in-up mb-6 flex border-b border-[#222]">
          <button
            onClick={() => setActiveTab("resume")}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "resume"
                ? "border-emerald-400 text-white bg-emerald-500/5"
                : "border-transparent text-[var(--text-muted)] hover:text-white hover:bg-[#111]"
            }`}
          >
            📄 Resume & Gap Analysis
          </button>
          <button
            onClick={() => setActiveTab("interview")}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "interview"
                ? "border-purple-400 text-white bg-purple-500/5"
                : "border-transparent text-[var(--text-muted)] hover:text-white hover:bg-[#111]"
            }`}
          >
            🎙️ Mock Interview & Skill Progress
            {interviewScorecard && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {interviewScorecard.compositeScore}/100 Grade
              </span>
            )}
          </button>
        </div>

        {activeTab === "interview" ? (
          <div className="animate-fade-in-up space-y-6">
            {interviewScorecard ? (
              <>
                {/* Score Header */}
                <div className="glass-card p-6 border border-emerald-500/20 bg-emerald-500/5 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center font-bold text-2xl text-emerald-400 shrink-0">
                      {interviewScorecard.compositeScore}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Interview Performance Evaluated!</h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Targeting role: <strong className="text-white">{result.jobTitle || "Developer"}</strong>. Evaluated across 6 technical & behavioral dimensions.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => router.push(`/interview?mode=quickfire&analysisId=${analysisId}`)} className="btn-secondary text-xs px-4 py-2.5">
                      ⚡ Practice Again (~2m)
                    </button>
                    <button onClick={() => router.push(`/interview?mode=deepdive&analysisId=${analysisId}`)} className="btn-primary text-xs px-4 py-2.5">
                      💬 Retake Deep Dive (~10m)
                    </button>
                  </div>
                </div>

                {/* Interview Retake History & Score Progression Timeline */}
                <div className="glass-card p-6 border border-blue-500/25 bg-blue-500/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        📈 Interview Retake Score Progression ({(interviewHistory || []).length || 1} Attempt{((interviewHistory || []).length || 1) > 1 ? "s" : ""})
                      </h4>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {((interviewHistory || []).length || 1) > 1
                          ? "Shows your performance improvement across each retake round for this application."
                          : "Baseline attempt recorded! Practice another round to unlock your growth progression graph."}
                      </p>
                    </div>
                    {interviewHistory && interviewHistory.length >= 2 ? (
                      <span className="text-xs font-bold text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 self-start sm:self-auto">
                        +{interviewHistory[interviewHistory.length - 1].compositeScore - interviewHistory[0].compositeScore} pts overall growth ↑
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-blue-400 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 self-start sm:self-auto">
                        Baseline Attempt #1
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {(interviewHistory && interviewHistory.length > 0 ? interviewHistory : [{ attemptNumber: 1, compositeScore: interviewScorecard.compositeScore }]).map((att, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className={`px-4 py-3 rounded-xl border flex flex-col items-center min-w-[110px] ${
                          idx === ((interviewHistory || []).length - 1 || 0) ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300" : "bg-[#111] border-[#222] text-white"
                        }`}>
                          <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Attempt #{att.attemptNumber || idx + 1}</span>
                          <span className="text-xl font-bold mt-0.5">{att.compositeScore}<span className="text-xs text-[var(--text-muted)]">/100</span></span>
                          {idx > 0 && interviewHistory && att.compositeScore > interviewHistory[idx - 1].compositeScore && (
                            <span className="text-[9px] font-bold text-emerald-400">+{att.compositeScore - interviewHistory[idx - 1].compositeScore} pts ↑</span>
                          )}
                        </div>
                        {interviewHistory && idx < interviewHistory.length - 1 && (
                          <span className="text-[#444] font-bold text-sm">→</span>
                        )}
                      </div>
                    ))}

                    {(!interviewHistory || interviewHistory.length <= 1) && (
                      <div className="flex items-center gap-3">
                        <span className="text-[#444] font-bold text-sm">→</span>
                        <div className="px-4 py-3 rounded-xl border border-dashed border-[#333] bg-[#0a0a0a] flex flex-col items-center min-w-[130px] opacity-60">
                          <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Attempt #2</span>
                          <span className="text-xs font-bold text-amber-400 mt-1">Ready to Retake</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 🧠 Deep Knowledge Tracing (DKT) Predictive Skill Matrix */}
                {dktData && dktData.predictions?.length > 0 && (
                  <div className="glass-card p-6 border border-purple-500/30 bg-purple-950/10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-wider">
                            AI Research Model: DKT-LSTM
                          </span>
                          <h4 className="text-sm font-bold text-white">
                            🧠 Deep Knowledge Tracing: Next-Attempt Skill Predictions
                          </h4>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Models your latent cognitive knowledge state <span className="font-mono text-purple-300">h_t = σ(W_hx · x_t + W_hh · h_t-1)</span> to predict mastery for Attempt #{ (dktData.totalAttempts || 1) + 1 }.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
                        <div className="text-right">
                          <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Predicted Readiness Index</p>
                          <p className="text-2xl font-bold text-purple-300">{dktData.readinessIndex}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Predicted Skill Mastery Bars */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {dktData.predictions.map((p, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl bg-[#080808] border border-[#1e1e1e] flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-white">{p.skill}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              p.predictedMastery >= 80 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                              p.predictedMastery >= 60 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                              "bg-red-500/20 text-red-400 border border-red-500/30"
                            }`}>
                              {p.predictedMastery}% Mastery ({p.confidence})
                            </span>
                          </div>
                          
                          <div className="w-full h-2 rounded-full bg-[#1a1a1a] overflow-hidden mb-2">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${p.predictedMastery}%`,
                                background: p.predictedMastery >= 80 ? "#10b981" : p.predictedMastery >= 60 ? "#f59e0b" : "#ef4444"
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                            <span>Status: <strong className="text-white">{p.status?.startsWith("Target for") ? `🎯 Focus Area: Priority to Improve in Attempt #${(dktData.totalAttempts || 1) + 1}` : p.status}</strong></span>
                            {p.trend !== 0 && (
                              <span className={p.trend > 0 ? "text-emerald-400 font-bold" : "text-red-400"}>
                                {p.trend > 0 ? `+${p.trend}%` : `${p.trend}%`} Cognitive Shift
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Academic & Simple Explanation Note */}
                    <div className="mt-4 pt-3 border-t border-[#1e1e1e] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-purple-300">📐 Math Model:</span>
                        <code className="text-purple-300 font-mono bg-[#111] px-2 py-0.5 rounded border border-[#222]">y_t = σ(W_y · h_t + b_y)</code>
                        <span>(Predicts future attempt score using past memory vector)</span>
                      </div>
                      <div>
                        <span className="text-emerald-400 font-semibold">💡 Cognitive Shift:</span> Growth/decay in skill mastery vs baseline
                      </div>
                    </div>

                    {/* Academic Legend & Mathematical Glossary Box */}
                    <div className="mt-3 p-4 rounded-xl bg-[#080808] border border-[#1e1e1e] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          📚 Mathematical Model Legend & Variable Glossary
                        </span>
                        <span className="text-[10px] text-purple-300 font-mono">y_t = σ(W_y · h_t + b_y)</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-[11px] text-[var(--text-secondary)]">
                        <div className="p-2 rounded bg-[#111] border border-[#222]">
                          <strong className="text-purple-300 font-mono">y_t</strong>: Predicted score probability (0-100%) for Attempt t.
                        </div>
                        <div className="p-2 rounded bg-[#111] border border-[#222]">
                          <strong className="text-purple-300 font-mono">h_t</strong>: Hidden cognitive memory vector (remembers attempt performance).
                        </div>
                        <div className="p-2 rounded bg-[#111] border border-[#222]">
                          <strong className="text-purple-300 font-mono">σ (Sigmoid)</strong>: Squeezes predictions smoothly between 0% and 100%.
                        </div>
                        <div className="p-2 rounded bg-[#111] border border-[#222]">
                          <strong className="text-purple-300 font-mono">W_y, W_hx</strong>: Weight matrices mapping performance to skill states.
                        </div>
                        <div className="p-2 rounded bg-[#111] border border-[#222]">
                          <strong className="text-purple-300 font-mono">b_y</strong>: Bias parameter representing baseline skill confidence.
                        </div>
                        <div className="p-2 rounded bg-[#111] border border-[#222]">
                          <strong className="text-emerald-400">Cognitive Shift</strong>: Percentage growth/decay in skill mastery vs baseline.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6 Rubric Breakdown Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* STAR Method */}
                  <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold text-white">1. STAR Framework Structure</p>
                      <span className="text-xs font-bold text-blue-400">{interviewScorecard.star?.score || 0}/100</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-[10px] text-center">
                      <div className="p-1.5 rounded bg-[#111]"><p className="text-[var(--text-muted)]">S</p><p className="font-bold text-white">{interviewScorecard.star?.situation}/10</p></div>
                      <div className="p-1.5 rounded bg-[#111]"><p className="text-[var(--text-muted)]">T</p><p className="font-bold text-white">{interviewScorecard.star?.task}/10</p></div>
                      <div className="p-1.5 rounded bg-[#111]"><p className="text-[var(--text-muted)]">A</p><p className="font-bold text-white">{interviewScorecard.star?.action}/10</p></div>
                      <div className="p-1.5 rounded bg-[#111]"><p className="text-[var(--text-muted)]">R</p><p className="font-bold text-white">{interviewScorecard.star?.result}/10</p></div>
                    </div>
                  </div>

                  {/* Technical Depth */}
                  <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold text-white">2. Technical Depth</p>
                      <span className="text-xs font-bold text-purple-400">{interviewScorecard.technicalDepth}/100</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Evaluated on architectural reasoning, technical specificity, and accuracy for missing skill requirements.
                    </p>
                  </div>

                  {/* Keyword Coverage */}
                  <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold text-white">3. Skill Gap Coverage</p>
                      <span className="text-xs font-bold text-emerald-400">{interviewScorecard.keywordCoverage?.coverageScore || 0}%</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Covered {interviewScorecard.keywordCoverage?.coveredCount || 0} of {interviewScorecard.keywordCoverage?.totalCount || 0} targeted missing skills in verbal answers.
                    </p>
                  </div>

                  {/* Communication */}
                  <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold text-white">4. Communication & Confidence</p>
                      <span className="text-xs font-bold text-amber-400">{interviewScorecard.communication?.score || 0}/100</span>
                    </div>
                    <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
                      <span>Assertiveness: <strong className="text-white">{interviewScorecard.communication?.confidenceScore || 0}/10</strong></span>
                      <span>Filler Ratio: <strong className="text-white">{Math.round((interviewScorecard.communication?.fillerRatio || 0) * 100)}%</strong></span>
                    </div>
                  </div>

                  {/* Response Length & Conciseness */}
                  <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold text-white">5. Response Length & Conciseness</p>
                      <span className="text-xs font-bold text-cyan-400">{interviewScorecard.lengthFit?.score || 0}/100</span>
                    </div>
                    <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
                      <span>Avg Length: <strong className="text-white">{interviewScorecard.lengthFit?.avgLength || 0} words</strong></span>
                      <span>Optimal Fit: <strong className="text-white">{interviewScorecard.lengthFit?.optimalPct || 0}%</strong></span>
                    </div>
                  </div>

                  {/* Signal Weights Breakdown */}
                  <div className="glass-card p-5">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold text-white">6. Composite Score Fusion</p>
                      <span className="text-xs font-bold text-emerald-400">{interviewScorecard.compositeScore}/100</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-1">
                      Weighted: 30% STAR + 25% Tech + 20% Skills + 15% Comm + 10% Length
                    </p>
                  </div>
                </div>

                {/* AI Coaching Feedback */}
                {interviewScorecard.feedback?.length > 0 && (
                  <div className="glass-card p-6 border border-emerald-500/20 bg-emerald-500/5">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                      💡 AI Coaching & Constructive Feedback
                    </h3>
                    <ul className="space-y-2 text-xs text-[var(--text-secondary)] list-disc pl-4 leading-relaxed">
                      {interviewScorecard.feedback.map((f, i) => (
                        <li key={i} className="hover:text-white transition-colors">{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sample Answer Rewrites (How You Said vs How To Phrase It) */}
                {interviewScorecard.sampleAnswers?.length > 0 && (
                  <div className="glass-card p-6 border border-blue-500/20 bg-blue-500/5">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                      ✨ Exemplary STAR Answer Rewrites (How to Improve)
                    </h3>
                    <div className="space-y-4">
                      {interviewScorecard.sampleAnswers.map((item, i) => (
                        <div key={i} className="p-4 rounded-xl bg-[#0a0a0a] border border-[#1e1e1e] space-y-3">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">What You Said (Original Response)</span>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 italic leading-relaxed font-mono bg-[#111] p-2.5 rounded-lg border border-[#222]">
                              "{item.originalSnippet}"
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">✨ How To Phrase It (Exemplary STAR Format)</span>
                            <p className="text-xs text-emerald-300 mt-1 leading-relaxed bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/30">
                              {item.improvedSampleAnswer}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Skill Gap Mastery & Improvement Tracker */}
                <div className="glass-card p-6 border border-purple-500/20 bg-purple-500/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                        📈 Targeted Skill Gap Mastery & Improvement
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Tracks whether skills missing from your resume were successfully demonstrated in your spoken answers.
                      </p>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 self-start sm:self-auto">
                      {interviewScorecard.keywordCoverage?.coverageScore || 0}% Gaps Closed
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(result.missingSkills || []).map((item, i) => {
                      const skillName = typeof item === "string" ? item : item.skill;
                      const isCovered = (interviewScorecard.keywordCoverage?.matchedKeywords || []).some(
                        (k) => k.toLowerCase() === skillName.toLowerCase()
                      );
                      return (
                        <div key={i} className={`p-3.5 rounded-xl border flex items-center justify-between ${
                          isCovered ? "bg-emerald-950/20 border-emerald-500/30" : "bg-[#0a0a0a] border-[#222]"
                        }`}>
                          <div>
                            <p className="text-xs font-semibold text-white">{skillName}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {isCovered ? "Demonstrated in interview responses" : "Target for next interview round"}
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            isCovered
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}>
                            {isCovered ? "✓ Gap Closed" : "⚠️ Needs Practice"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full Recorded Conversation Transcript Review */}
                {((interviewTranscript && interviewTranscript.length > 0) || (interviewScorecard && interviewTranscript)) && (
                  <div className="glass-card p-6 border border-[#222]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        🎙️ Full Spoken Conversation Transcript
                      </h3>
                      <span className="text-[10px] text-[var(--text-muted)] px-2.5 py-1 rounded bg-[#111] border border-[#222]">
                        {(interviewTranscript || []).filter(m => m.committed?.trim()).length} Spoken Turns
                      </span>
                    </div>

                    <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-2">
                      {(interviewTranscript || []).filter((m) => m.committed?.trim()).length > 0 ? (
                        (interviewTranscript || []).filter((m) => m.committed?.trim()).map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                                msg.role === "user"
                                  ? "bg-emerald-500/10 text-emerald-100 border border-emerald-500/25 rounded-br-none"
                                  : "bg-[#111] text-[#ccc] border border-[#222] rounded-bl-none"
                              }`}
                            >
                              <p className="text-[9px] uppercase font-bold tracking-wider mb-1 text-[var(--text-muted)]">
                                {msg.role === "user" ? "You (Candidate)" : "AI Technical Interviewer"}
                              </p>
                              {msg.committed}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[var(--text-muted)] italic text-center py-4">
                          Transcript details saved to session.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="glass-card p-10 text-center flex flex-col items-center justify-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#111] border border-[#333] flex items-center justify-center">
                  <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">No Mock Interview Taken Yet for This Resume</h3>
                  <p className="text-xs text-[var(--text-secondary)] max-w-md">
                    Practice a voice mock interview tailored to this job description to receive your 6-rubric scorecard and track skill gap improvement trajectory.
                  </p>
                </div>
                <div className="flex gap-3 mt-2">
                  <button onClick={() => router.push(`/interview?mode=quickfire&analysisId=${analysisId}`)} className="btn-primary text-xs px-5 py-2.5">
                    ⚡ Start Quick Fire (~2 mins)
                  </button>
                  <button onClick={() => router.push(`/interview?mode=deepdive&analysisId=${analysisId}`)} className="btn-secondary text-xs px-5 py-2.5">
                    💬 Start Deep Dive (~10 mins)
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
        <div className="animate-fade-in-up grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5" style={{ animationDelay: "0.05s" }}>
          <div className="lg:col-span-2 glass-card p-7 flex flex-col items-center justify-center gap-4">
            <div className="relative flex items-center justify-center">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="60" cy="60" r="50" fill="none" stroke={scoreColor(hybridScore)} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(hybridScore / 100) * 314} 314`} style={{ transition: "stroke-dasharray 1s ease" }} />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-4xl font-bold" style={{ color: scoreColor(hybridScore) }}>{hybridScore}</span>
                <span className="text-xs text-[var(--text-muted)]">/ 100</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold mb-0.5" style={{ color: scoreColor(hybridScore) }}>{scoreLabel(hybridScore)}</p>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Hybrid Match Score</p>
            </div>
          </div>

          <div className="lg:col-span-3 glass-card p-6 flex flex-col">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-white mb-0.5">Score Breakdown</h2>
              <p className="text-[10px] text-[var(--text-muted)]">
                FinalScore = 0.2 × TF-IDF + 0.3 × Semantic + 0.5 × LLM
              </p>
            </div>
            <div className="space-y-4 flex-1">
              <SignalBar label="TF-IDF Keyword Match" sublabel="Lexical signal — exact keyword overlap" score={tfidfScore} weight="α = 0.20" color="#60a5fa" />
              <SignalBar label="Semantic Similarity" sublabel="Embedding cosine similarity (MiniLM)" score={semanticScore} weight="β = 0.30" color="#a78bfa" />
              <SignalBar label="LLM Contextual Score" sublabel="Gemini reasoning — semantic + structural fit" score={llmScore} weight="γ = 0.50" color="#34d399" />
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-4 pt-4 border-t border-[#1a1a1a]">{result.verdict}</p>
          </div>
        </div>

        {/* ── ATS Score Panel (Rendered ONLY after Optimised Resume Generation) ── */}
        {atsAfter && (
          <div className="animate-fade-in-up glass-card p-5 mb-5 border border-emerald-500/20 bg-emerald-500/[0.02]" style={{ animationDelay: "0.1s" }}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Score Display */}
              <div className="shrink-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Optimised Resume ATS Readiness</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-emerald-400">{atsAfter.total}</span>
                  <span className="text-sm text-[var(--text-muted)]">/ 100</span>
                  <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full ml-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                    ATS-Optimized
                  </span>
                </div>
              </div>

              {/* 5 Sub-dimension Bars */}
              <div className="flex-1 grid grid-cols-5 gap-2">
                {atsAfter.breakdown && Object.entries({
                  keywordDensity: { label: "Keywords", color: "#60a5fa" },
                  sectionPresence: { label: "Sections", color: "#a78bfa" },
                  quantification: { label: "Numbers", color: "#34d399" },
                  actionVerbs: { label: "Verbs", color: "#fbbf24" },
                  lengthFit: { label: "Length", color: "#f87171" },
                }).map(([key, { label, color }]) => {
                  const dim = atsAfter.breakdown[key];
                  if (!dim) return null;
                  const pct = Math.round((dim.score / dim.max) * 100);
                  return (
                    <div key={key} className="flex flex-col items-center gap-1">
                      <div className="w-full h-14 rounded-lg bg-[#111] border border-[#1e1e1e] flex flex-col items-center justify-end p-1 overflow-hidden relative">
                        <div className="absolute bottom-0 left-0 right-0 rounded-lg transition-all duration-700 opacity-80"
                          style={{ height: `${pct}%`, background: color }} />
                        <span className="relative text-[10px] font-bold text-white z-10 drop-shadow">
                          {dim.score}<span className="text-[8px] text-white/70">/{dim.max}</span>
                        </span>
                      </div>
                      <p className="text-[9px] text-[var(--text-muted)] text-center">{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── SPLIT EDITOR ── */}
        <div className="animate-fade-in-up mb-6" style={{ animationDelay: "0.15s" }}>
          {/* Editor header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Resume Editor</h2>
              <p className="text-[10px] text-[var(--text-muted)]">Both panels are editable — highlight legend applies to the original resume</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#10b981", opacity: 0.4 }} />
                <span className="text-[10px] text-[var(--text-muted)]">Matched</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#ef4444", opacity: 0.4 }} />
                <span className="text-[10px] text-[var(--text-muted)]">Missing</span>
              </div>
              {rewrittenData && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#10b981", opacity: 0.7 }} />
                  <span className="text-[10px] text-[var(--accent-green)] font-medium">Newly Added</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* ── LEFT — Original Resume ── */}
            <div className="flex flex-col gap-2">
              {/* Panel header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white">Original Resume</p>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                  {tfidf && (
                    <>
                      <span className="text-emerald-400 font-medium">✓ {tfidf.matchedTerms?.length || 0} matched</span>
                      <span className="text-red-400 font-medium">✗ {tfidf.missingTerms?.length || 0} missing</span>
                    </>
                  )}
                  <span className="px-2 py-0.5 rounded bg-[#111] border border-[#1e1e1e]">Editable</span>
                </div>
              </div>

              {/* Keyword chips for original */}
              {tfidf && (
                <div className="rounded-lg bg-[#080808] border border-[#1a1a1a] px-3 py-2.5 flex flex-wrap gap-1.5 max-h-16 overflow-y-auto scrollbar-thin">
                  {(tfidf.matchedTerms || []).slice(0, 10).map((t, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{t}</span>
                  ))}
                  {(tfidf.missingTerms || []).slice(0, 8).map((t, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">{t}</span>
                  ))}
                </div>
              )}

              {/* Editable textarea for original */}
              <textarea
                value={editableOriginal}
                onChange={(e) => setEditableOriginal(e.target.value)}
                className="flex-1 min-h-[480px] max-h-[560px] rounded-xl bg-[#080808] border border-[#1e1e1e] px-4 py-3.5 text-xs leading-relaxed text-[#bbb] font-mono resize-none focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 transition-all scrollbar-thin"
                spellCheck={false}
                id="original-resume-editor"
              />
            </div>

            {/* ── RIGHT — Generated Resume ── */}
            <div className="flex flex-col gap-2">
              {/* Panel header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white">
                  {rewrittenData ? "Optimised Resume" : "Optimised Resume"}
                </p>
                <div className="flex items-center gap-2">
                  {rewrittenData ? (
                    <>
                      {newlyCovered.length > 0 && (
                        <span className="text-[10px] font-medium text-[var(--accent-green)] px-2 py-0.5 rounded bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20">
                          +{newlyCovered.length} keywords added
                        </span>
                      )}
                      <button onClick={handleDownload} disabled={isDownloading}
                        className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-md bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/30 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/20 transition-all"
                        id="download-btn">
                        {isDownloading ? (
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        )}
                        Download .docx
                      </button>
                    </>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-[#111] border border-[#1e1e1e] text-[10px] text-[#444]">Generate to edit</span>
                  )}
                </div>
              </div>

              {/* Newly-covered keyword chips */}
              {rewrittenData && (
                <div className="rounded-lg bg-[#080808] border border-[#1a2a1a] px-3 py-2.5 flex flex-wrap gap-1.5 max-h-16 overflow-y-auto scrollbar-thin">
                  {newlyCovered.length > 0 ? (
                    newlyCovered.map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">✓ {t}</span>
                    ))
                  ) : (
                    <span className="text-[10px] text-[#444] italic">Newly added keywords will appear here</span>
                  )}
                  {(tfidf?.missingTerms || []).filter(t => !newlyCovered.includes(t)).slice(0, 5).map((t, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-[#555] border border-[#222]">{t}</span>
                  ))}
                </div>
              )}

              {/* Right panel body */}
              {!rewrittenData ? (
                <div className="flex-1 min-h-[480px] rounded-xl bg-[#080808] border border-[#1e1e1e] flex flex-col items-center justify-center gap-5 px-8">
                  {isGenerating ? (
                    <>
                      <div className="relative">
                        <div className="w-14 h-14 border-2 border-[#1e1e1e] rounded-full" />
                        <div className="absolute inset-0 w-14 h-14 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-white mb-1">Generating optimised resume...</p>
                        <p className="text-xs text-[var(--text-muted)]">AI rewriting bullets with missing keywords</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-[#0f0f0f] border border-[#1e1e1e] flex items-center justify-center">
                        <svg className="w-7 h-7 text-[#444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-white mb-1">Generate Optimised Resume</p>
                        <p className="text-xs text-[var(--text-muted)] max-w-xs leading-relaxed">
                          AI rewrites your resume with missing JD keywords, a tailored summary, and quantified bullets.
                        </p>
                      </div>
                      <button onClick={handleGenerate} className="btn-primary text-sm px-8 py-3" id="generate-btn">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        Generate Now
                      </button>
                      {generateError && <p className="text-xs text-[var(--accent-red)] text-center">{generateError}</p>}
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={editableRewrite}
                  onChange={(e) => setEditableRewrite(e.target.value)}
                  className="flex-1 min-h-[480px] max-h-[560px] rounded-xl bg-[#060f06] border border-[#1a2a1a] px-4 py-3.5 text-xs leading-relaxed text-[#d4ead4] font-mono resize-none focus:outline-none focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/10 transition-all scrollbar-thin"
                  spellCheck={false}
                  id="generated-resume-editor"
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Skills 3-Column ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          <SkillCol title="Strong Matches" items={result.strongMatches} dot="var(--accent-green)" delay="0.2s"
            renderItem={(item, i) => <SkillCard key={i} skill={item.skill} detail={item.detail} color="var(--accent-green)" />}
          />
          <SkillCol title="Undersold" items={result.weakMatches} dot="var(--accent-amber)" delay="0.25s"
            renderItem={(item, i) => <SkillCard key={i} skill={item.skill} detail={item.detail} color="var(--accent-amber)" />}
          />
          <SkillCol title="Missing" items={result.missingSkills} dot="var(--accent-red)" delay="0.3s"
            renderItem={(item, i) => (
              <div key={i} className="glass-card px-4 py-3">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-sm font-medium text-[var(--accent-red)]">{item.skill}</p>
                  <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#111] border ${
                    item.importance === "critical" ? "border-[var(--accent-red)]/30 text-[var(--accent-red)]"
                    : item.importance === "important" ? "border-[var(--accent-amber)]/30 text-[var(--accent-amber)]"
                    : "border-white/20 text-white"
                  }`}>{item.importance}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.detail}</p>
              </div>
            )}
          />
        </div>

        {/* Keywords */}
        {result.keywordsToAdd?.length > 0 && (
          <div className="animate-fade-in-up mb-6" style={{ animationDelay: "0.35s" }}>
            <h2 className="text-sm font-semibold text-white mb-3">Keywords to Add</h2>
            <div className="flex flex-wrap gap-2">
              {result.keywordsToAdd.map((kw, i) => (
                <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#111] text-[#ccc] border border-[#222] hover:text-white hover:border-[#444] transition-colors">{kw}</span>
              ))}
            </div>
          </div>
        )}

        {/* Practice Interview */}
        {analysisId && (
          <div className="animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
              <h2 className="text-lg font-semibold text-white">Practice Interview</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={() => router.push(`/interview?mode=quickfire&analysisId=${analysisId}`)} className="glass-card p-6 text-left hover:border-white/30 hover:bg-[#111] transition-all cursor-pointer group" id="quickfire-btn">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#111] border border-[#333] flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Quick Fire</h3>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">~2 min • 3 questions</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Rapid practice targeting your weakest skills.</p>
              </button>
              <button onClick={() => router.push(`/interview?mode=deepdive&analysisId=${analysisId}`)} className="glass-card p-6 text-left hover:border-white/30 hover:bg-[#111] transition-all cursor-pointer group" id="deepdive-btn">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#111] border border-[#333] flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Deep Dive</h3>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">~10 min • 6-8 questions</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Full mock interview with follow-ups and behavioral round.</p>
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function SignalBar({ label, sublabel, score, weight, color }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-xs font-medium text-white">{label}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{sublabel}</p>
        </div>
        <div className="text-right shrink-0 ml-4">
          <span className="text-sm font-bold" style={{ color }}>{score}</span>
          <span className="text-[10px] text-[var(--text-muted)]">/100</span>
          <p className="text-[9px] text-[#444] mt-0.5">{weight}</p>
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color, opacity: 0.85 }} />
      </div>
    </div>
  );
}

function SkillCol({ title, items, dot, delay, renderItem }) {
  return (
    <div className="animate-fade-in-up" style={{ animationDelay: delay }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full" style={{ background: dot }} />
        <h2 className="text-sm font-semibold text-white">{title} ({items?.length || 0})</h2>
      </div>
      <div className="space-y-3">
        {items?.length ? items.map(renderItem) : <p className="text-xs text-[var(--text-muted)] italic">None found</p>}
      </div>
    </div>
  );
}

function SkillCard({ skill, detail, color }) {
  return (
    <div className="glass-card px-4 py-3">
      <p className="text-sm font-medium mb-0.5" style={{ color }}>{skill}</p>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{detail}</p>
    </div>
  );
}
