"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResultsView({ result, onReset, resumeText, jobDescription, analysisId }) {
  const score = result.matchScore || 0;
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState("");
  const router = useRouter();

  function getScoreColor() {
    if (score >= 75) return "var(--accent-green)";
    if (score >= 50) return "var(--accent-amber)";
    return "var(--accent-red)";
  }

  function getScoreLabel() {
    if (score >= 75) return "Strong Match";
    if (score >= 50) return "Moderate Match";
    return "Weak Match";
  }

  async function handleFixResume() {
    setIsRewriting(true);
    setRewriteError("");

    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          jobDescription,
          analysis: result,
          analysisId, // Passed to backend to cache the generated output
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Rewrite failed");
      }

      const usedModel = res.headers.get("X-Used-Model") || "unknown";
      console.log("-----------------------------------------");
      console.log(`✨ RESUME REWRITE COMPLETE!`);
      console.log(`🧠 AI Engine Used: ${usedModel}`);
      console.log("-----------------------------------------");

      // Download the DOCX file
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const jobTitle = result.jobTitle || "optimized";
      a.download = `resume_${jobTitle.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setRewriteError(err.message || "Something went wrong");
    } finally {
      setIsRewriting(false);
    }
  }

  return (
    <div className="relative min-h-screen">

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <div className="animate-fade-in-up flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Analysis Results
            </p>
            <h1 className="text-3xl font-bold text-white">
              {result.jobTitle || "Resume Analysis"}
            </h1>
          </div>
          {onReset && (
            <button onClick={onReset} className="btn-secondary text-sm px-5 py-2.5" id="new-analysis-btn">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Analysis
            </button>
          )}
        </div>

        {/* Score Card */}
        <div className="animate-fade-in-up glass-card p-8 mb-8 flex flex-col sm:flex-row items-center gap-8" style={{ animationDelay: "0.05s" }}>
          {/* Score Circle */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r="50" fill="none"
                stroke={getScoreColor()}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 314} 314`}
                style={{ transition: "stroke-dasharray 1s ease" }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-4xl font-bold" style={{ color: getScoreColor() }}>
                {score}
              </span>
              <span className="text-xs text-[var(--text-muted)]">/ 100</span>
            </div>
          </div>
          <div className="text-center sm:text-left flex-1">
            <p className="text-lg font-semibold mb-1" style={{ color: getScoreColor() }}>
              {getScoreLabel()}
            </p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-lg mb-4">
              {result.verdict}
            </p>
            {/* Fix My Resume Button */}
            <button
              onClick={handleFixResume}
              disabled={isRewriting}
              className="btn-primary text-sm px-6 py-3"
              id="fix-resume-btn"
            >
              {isRewriting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Download Optimized Resume
                </>
              )}
            </button>
            {rewriteError && (
              <p className="mt-2 text-xs text-[var(--accent-red)]">{rewriteError}</p>
            )}
          </div>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Strong Matches */}
          <div className="animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
              <h2 className="text-sm font-semibold text-white">
                Strong Matches ({result.strongMatches?.length || 0})
              </h2>
            </div>
            <div className="space-y-3">
              {result.strongMatches?.map((item, i) => (
                <div key={i} className="glass-card px-4 py-3">
                  <p className="text-sm font-medium text-[var(--accent-green)] mb-0.5">{item.skill}</p>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.detail}</p>
                </div>
              ))}
              {(!result.strongMatches || result.strongMatches.length === 0) && (
                <p className="text-xs text-[var(--text-muted)] italic">No strong matches found</p>
              )}
            </div>
          </div>

          {/* Weak Matches */}
          <div className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-amber)]" />
              <h2 className="text-sm font-semibold text-white">
                Undersold ({result.weakMatches?.length || 0})
              </h2>
            </div>
            <div className="space-y-3">
              {result.weakMatches?.map((item, i) => (
                <div key={i} className="glass-card px-4 py-3">
                  <p className="text-sm font-medium text-[var(--accent-amber)] mb-0.5">{item.skill}</p>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.detail}</p>
                </div>
              ))}
              {(!result.weakMatches || result.weakMatches.length === 0) && (
                <p className="text-xs text-[var(--text-muted)] italic">No undersold skills found</p>
              )}
            </div>
          </div>

          {/* Missing Skills */}
          <div className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-red)]" />
              <h2 className="text-sm font-semibold text-white">
                Missing ({result.missingSkills?.length || 0})
              </h2>
            </div>
            <div className="space-y-3">
              {result.missingSkills?.map((item, i) => (
                <div key={i} className="glass-card px-4 py-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-sm font-medium text-[var(--accent-red)]">{item.skill}</p>
                    <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#111] border ${
                      item.importance === "critical"
                        ? "border-[var(--accent-red)]/30 text-[var(--accent-red)]"
                        : item.importance === "important"
                        ? "border-[var(--accent-amber)]/30 text-[var(--accent-amber)]"
                        : "border-white/20 text-white"
                    }`}>
                      {item.importance}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.detail}</p>
                </div>
              ))}
              {(!result.missingSkills || result.missingSkills.length === 0) && (
                <p className="text-xs text-[var(--text-muted)] italic">No missing skills found</p>
              )}
            </div>
          </div>
        </div>

        {/* Keywords to Add */}
        {result.keywordsToAdd && result.keywordsToAdd.length > 0 && (
          <div className="animate-fade-in-up mb-8" style={{ animationDelay: "0.25s" }}>
            <h2 className="text-sm font-semibold text-white mb-3">
              Keywords to Add to Your Resume
            </h2>
            <div className="flex flex-wrap gap-2">
              {result.keywordsToAdd.map((keyword, i) => (
               <span
                  key={i}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#111] text-[#ccc] border border-[#333] hover:text-white hover:border-[#666] transition-colors"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Practice Interview Section */}
        {analysisId && (
          <div className="animate-fade-in-up mb-8" style={{ animationDelay: "0.3s" }}>
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              <h2 className="text-lg font-semibold text-white">Practice Interview</h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-5 max-w-xl">
              Our AI interviewer will ask you targeted questions based on your gap analysis. Speak naturally — your answers will be graded and scored.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Quick Fire Card */}
              <button
                onClick={() => router.push(`/interview?mode=quickfire&analysisId=${analysisId}`)}
                className="glass-card p-6 text-left hover:border-white/30 hover:bg-[#111] transition-all cursor-pointer group"
                id="quickfire-btn"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#111] border border-[#333] flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold group-hover:text-white transition-colors">Quick Fire</h3>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">~2 minutes • 3 questions</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Rapid practice round. 3 direct questions targeting your weakest skills. Perfect for a quick warm-up.
                </p>
              </button>

              {/* Deep Dive Card */}
              <button
                onClick={() => router.push(`/interview?mode=deepdive&analysisId=${analysisId}`)}
                className="glass-card p-6 text-left hover:border-white/30 hover:bg-[#111] transition-all cursor-pointer group"
                id="deepdive-btn"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#111] border border-[#333] flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold group-hover:text-white transition-colors">Deep Dive</h3>
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">~10 minutes • 6-8 questions</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Full mock interview with follow-up questions, behavioral round, and detailed AI feedback at the end.
                </p>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
