"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [dbError, setDbError] = useState("");

  useEffect(() => {
    async function fetchHistory() {
      if (!user?.uid) return;
      try {
        const res = await fetch(`/api/history?uid=${user.uid}`);
        const data = await res.json();
        if (data.success) {
          setHistory(data.history || []);
        } else if (data.errorType === "database_connection_error") {
          setDbError(data.error);
        } else {
          console.error("Failed to fetch history:", data.error);
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, [user]);

  async function handleDeleteSession(e, sessionId) {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/session?id=${sessionId}&uid=${user?.uid || ""}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setHistory((prev) => prev.filter((h) => h._id !== sessionId));
      } else {
        alert(data.error || "Failed to delete session");
      }
    } catch (err) {
      console.error("Delete session error:", err);
      alert("Failed to delete session. Please try again.");
    }
  }

  // Compute Progress Intelligence
  const totalSessions = history.length;
  const avgScore = totalSessions > 0 
    ? Math.round(history.reduce((acc, cur) => acc + (cur.matchScore || 0), 0) / totalSessions) 
    : "—";

  const optimizedCount = history.filter(h => h.rewrittenData).length;

  const gradedInterviews = history.filter(h => h.interviewScorecard?.compositeScore);
  const avgInterviewScore = gradedInterviews.length > 0
    ? Math.round(gradedInterviews.reduce((acc, cur) => acc + cur.interviewScorecard.compositeScore, 0) / gradedInterviews.length)
    : "—";

  // Score growth trend
  const sortedByTime = [...history].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const trend = sortedByTime.length > 1 
    ? Math.round(((sortedByTime[sortedByTime.length - 1].matchScore - sortedByTime[0].matchScore) / Math.max(sortedByTime[0].matchScore, 1)) * 100)
    : 0;

  // Longitudinal chronic skill gap tracking
  const skillFrequency = {};
  history.forEach(s => {
    const missing = s.gapAnalysis?.missingSkills || [];
    missing.forEach(m => {
      if (m.skill) {
        const canonical = m.skill.trim();
        skillFrequency[canonical] = (skillFrequency[canonical] || 0) + 1;
      }
    });
  });
  const persistentGaps = Object.entries(skillFrequency)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([skill, count]) => ({ skill, count }))
    .slice(0, 4);

  return (
    <div className="relative min-h-screen">

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        {/* Welcome Header */}
        <div className="animate-fade-in-up mb-10">
          <div className="flex items-center gap-4 mb-2">
            {user?.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-12 h-12 rounded-full ring-1 ring-[#333]"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <h1 className="text-3xl font-bold text-white">
                Welcome back, {user?.displayName?.split(" ")[0]}
              </h1>
              <p className="text-[var(--text-secondary)] text-sm mt-0.5">
                Ready to optimize your next application?
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Card */}
        <div
          className="animate-fade-in-up mb-10"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="glass-card p-8 flex flex-col sm:flex-row items-center justify-between gap-6 border border-[#222]">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Start a New Analysis
              </h2>
              <p className="text-[var(--text-secondary)] text-sm max-w-md">
                Upload your resume and paste a job description to get an
                AI-powered gap analysis and optimized resume.
              </p>
            </div>
            <Link href="/analyze" className="btn-primary whitespace-nowrap" id="new-analysis-btn">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Analysis
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div
          className="animate-fade-in-up grid grid-cols-1 sm:grid-cols-4 gap-5 mb-10"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="glass-card px-6 py-5">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Total Sessions
            </p>
            <p className="text-3xl font-bold text-white">{loadingHistory ? "..." : totalSessions}</p>
          </div>
          <div className="glass-card px-6 py-5">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Avg Match Score
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-white">{loadingHistory ? "..." : avgScore}</p>
              {trend !== 0 && !loadingHistory && (
                <span className={`text-xs font-bold ${trend > 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
                  {trend > 0 ? `+${trend}%` : `${trend}%`} ↑
                </span>
              )}
            </div>
          </div>
          <div className="glass-card px-6 py-5">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Resumes Optimized
            </p>
            <p className="text-3xl font-bold text-white">{loadingHistory ? "..." : optimizedCount}</p>
          </div>
          <div className="glass-card px-6 py-5">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Avg Interview Rating
            </p>
            <p className="text-3xl font-bold text-white">{loadingHistory ? "..." : avgInterviewScore}</p>
          </div>
        </div>

        {/* Chronic Skill Gaps Tracker Widget */}
        {!loadingHistory && persistentGaps.length > 0 && (
          <div className="animate-fade-in-up mb-10" style={{ animationDelay: "0.25s" }}>
            <div className="glass-card p-6 border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/[0.02]">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-[var(--accent-amber)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <h3 className="text-sm font-semibold text-white">Chronic Skill Gaps Detected</h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 max-w-2xl">
                These skills keep appearing as missing across multiple job applications you analyzed. Consider practicing mock interviews targeting these gaps:
              </p>
              <div className="flex flex-wrap gap-2.5">
                {persistentGaps.map(({ skill, count }) => (
                  <span key={skill} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#111] text-[var(--accent-amber)] border border-[var(--accent-amber)]/25 flex items-center gap-1.5">
                    {skill}
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-[var(--accent-amber)]/10 text-white">
                      {count}x missing
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Session History */}
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Recent Sessions
          </h2>
          
          {dbError ? (
            <div className="glass-card p-6 border border-[var(--accent-red)]/35 bg-[var(--accent-red)]/10 flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--accent-red)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-[var(--accent-red)] text-sm font-semibold mb-1">Database connection issue</p>
                <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{dbError}</p>
              </div>
            </div>
          ) : loadingHistory ? (
            <div className="glass-card py-16 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-3 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-[var(--text-secondary)] text-sm">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="glass-card py-16 flex flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#111] border border-[#333]">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <p className="text-[var(--text-secondary)] text-sm mb-1">
                No sessions yet
              </p>
              <p className="text-[var(--text-muted)] text-xs">
                Start your first analysis to see results here
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((item) => (
                <Link href={`/dashboard/session/${item._id}`} key={item._id}>
                  <div className="glass-card p-6 flex flex-col justify-between h-full hover:border-white/30 hover:bg-[#111] transition-all cursor-pointer group">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-white font-semibold line-clamp-1 group-hover:text-white transition-colors">{item.jobTitle}</h3>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                            item.matchScore >= 75 ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20" :
                            item.matchScore >= 50 ? "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20" :
                            "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20"
                          }`}>
                            {item.matchScore} / 100
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSession(e, item._id)}
                            title="Delete session"
                            aria-label="Delete session"
                            className="p-1 rounded-md text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-[var(--text-secondary)] text-xs line-clamp-2 mb-3 leading-relaxed">
                        {item.gapAnalysis?.verdict || "No verdict available"}
                      </p>
                      {item.interviewScorecard ? (
                        <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-emerald-300 flex items-center gap-1.5">
                            🎙️ Mock Interview Scorecard
                          </span>
                          <span className="text-xs font-bold text-emerald-400">
                            {item.interviewScorecard.compositeScore} / 100
                          </span>
                        </div>
                      ) : (
                        <div className="mb-4 px-3 py-1.5 rounded-lg bg-[#111] border border-[#222] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                          <span>🎙️ Mock Interview</span>
                          <span className="text-[var(--accent-blue)] font-semibold">Start Practice →</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-medium">
                        View Results 
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
