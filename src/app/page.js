"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-3 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-black selection:bg-white/20">
      {/* Subtle Grid Background */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]"
        style={{ backgroundSize: '64px 64px' }}
      />

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* Headline */}
        <h1
          className="animate-fade-in-up max-w-4xl text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight"
          style={{ animationDelay: "0.1s" }}
        >
          Optimize your career with <span className="text-white opacity-80 italic">precision.</span>
        </h1>

        {/* Subheadline */}
        <p
          className="animate-fade-in-up mt-8 max-w-2xl text-lg text-[var(--text-secondary)] leading-relaxed font-light"
          style={{ animationDelay: "0.2s" }}
        >
          Upload your resume, paste a job description, and get an instant gap analysis. Automatically rewrite your experience to perfectly match the role and practice with our AI interviewer.
        </p>

        {/* CTA */}
        <div
          className="animate-fade-in-up mt-10"
          style={{ animationDelay: "0.3s" }}
        >
          <GoogleSignInButton />
        </div>

        {/* Trust Indicators */}
        <p
          className="animate-fade-in-up mt-6 text-sm text-[var(--text-muted)]"
          style={{ animationDelay: "0.4s" }}
        >
          Free to use • No credit card • 30 second setup
        </p>

        {/* Feature Cards */}
        <div
          className="animate-fade-in-up mt-24 grid w-full max-w-6xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          style={{ animationDelay: "0.5s" }}
        >
          {/* Card 1 */}
          <div className="glass-card p-6 text-left hover:border-white/30">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#111] border border-[#333]">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-[15px] font-medium text-white mb-2">Gap Analysis</h3>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Identify missing skills and unoptimized keywords instantly.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-card p-6 text-left hover:border-white/30">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#111] border border-[#333]">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="text-[15px] font-medium text-white mb-2">Smart Rewrite</h3>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Automatically restructure bullet points using exact JD language.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-card p-6 text-left hover:border-white/30">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#111] border border-[#333]">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="text-[15px] font-medium text-white mb-2">Export to DOCX</h3>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Download a perfectly formatted, ATS-friendly resume file.
            </p>
          </div>

          {/* Card 4 */}
          <div className="glass-card p-6 text-left hover:border-white/30">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#111] border border-[#333]">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-[15px] font-medium text-white mb-2">Voice Interview</h3>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Practice answering questions tailored to your exact resume gaps.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
