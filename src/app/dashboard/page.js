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

  useEffect(() => {
    async function fetchHistory() {
      if (!user?.uid) return;
      try {
        const res = await fetch(`/api/history?uid=${user.uid}`);
        const data = await res.json();
        if (data.success) {
          setHistory(data.history || []);
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, [user]);

  // Compute stats
  const totalSessions = history.length;
  const avgScore = totalSessions > 0 
    ? Math.round(history.reduce((acc, cur) => acc + (cur.matchScore || 0), 0) / totalSessions) 
    : "—";

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
          className="animate-fade-in-up grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10"
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
            <p className="text-3xl font-bold text-[var(--text-muted)]">{loadingHistory ? "..." : avgScore}</p>
          </div>
          <div className="glass-card px-6 py-5">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Resumes Optimized
            </p>
            <p className="text-3xl font-bold text-white">{loadingHistory ? "..." : totalSessions}</p>
          </div>
        </div>

        {/* Session History */}
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Recent Sessions
          </h2>
          
          {loadingHistory ? (
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
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-md shrink-0 ml-3 ${
                          item.matchScore >= 75 ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20" :
                          item.matchScore >= 50 ? "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20" :
                          "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20"
                        }`}>
                          {item.matchScore} / 100
                        </span>
                      </div>
                      <p className="text-[var(--text-secondary)] text-xs line-clamp-2 mb-4 leading-relaxed">
                        {item.gapAnalysis?.verdict || "No verdict available"}
                      </p>
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
