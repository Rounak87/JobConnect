"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Vapi from "@vapi-ai/web";

export default function InterviewPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <InterviewContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function InterviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const mode = searchParams.get("mode") || "quickfire";
  const analysisId = searchParams.get("analysisId");

  const vapiRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | connecting | active | ended
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const durationRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [scorecard, setScorecard] = useState(null);
  const [isGrading, setIsGrading] = useState(false);
  const [gradingError, setGradingError] = useState("");

  // Auto-trigger grading when interview completes
  useEffect(() => {
    async function gradeInterview() {
      if (status !== "ended" || messages.length === 0 || scorecard || isGrading) return;

      setIsGrading(true);
      setGradingError("");

      try {
        // Ensure partial transcripts aren't lost if the call drops abruptly
        const finalizedMessages = messages.map(m => ({
          ...m,
          committed: m.committed?.trim() ? m.committed : (m.partial || ""),
        }));

        const res = await fetch("/api/interview/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId,
            uid: user?.uid || "local_user",
            messages: finalizedMessages,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to grade interview");

        setScorecard(data.scorecard);
      } catch (err) {
        console.error("Grading failed:", err);
        setGradingError(err.message || "Failed to automatically score interview responses.");
      } finally {
        setIsGrading(false);
      }
    }

    gradeInterview();
  }, [status, messages, user, analysisId, scorecard, isGrading]);

  const isQuickfire = mode === "quickfire";
  const assistantId = isQuickfire
    ? process.env.NEXT_PUBLIC_VAPI_ASSISTANT_QUICKFIRE
    : process.env.NEXT_PUBLIC_VAPI_ASSISTANT_DEEPDIVE;

  // 1. Fetch the analysis session data from DB
  useEffect(() => {
    async function loadSession() {
      if (!analysisId || !user?.uid) return;

      try {
        const res = await fetch(`/api/session?id=${analysisId}&uid=${user.uid}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to load session");

        setSession(data.session);
        setStatus("ready");
      } catch (err) {
        setError(err.message);
        setStatus("ended");
      }
    }

    loadSession();
  }, [analysisId, user]);

  // 2. Initialize Vapi instance
  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setError("Vapi public key is not configured.");
      return;
    }

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      console.log("[Vapi] Call started");
      setStatus("active");
      // Start timer
      durationRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    });

    vapi.on("call-end", () => {
      console.log("[Vapi] Call ended");
      setStatus("ended");
      if (durationRef.current) clearInterval(durationRef.current);
    });

    vapi.on("message", (msg) => {
      if (msg.type === "transcript" && msg.transcript) {
        const role = msg.role === "user" ? "user" : "assistant";
        const text = msg.transcript;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          
          if (!last || last.role !== role) {
            // New speaker turn
            if (msg.transcriptType === "final") {
              return [...prev, { role, committed: text + " ", partial: "" }];
            } else {
              return [...prev, { role, committed: "", partial: text }];
            }
          } else {
            // Same speaker turn update
            if (msg.transcriptType === "final") {
              return [
                ...prev.slice(0, -1),
                { role, committed: (last.committed || "") + text + " ", partial: "" },
              ];
            } else {
              return [
                ...prev.slice(0, -1),
                { ...last, partial: text },
              ];
            }
          }
        });
      }
    });

    vapi.on("speech-start", () => setIsSpeaking(true));
    vapi.on("speech-end", () => setIsSpeaking(false));

    vapi.on("error", (err) => {
      console.error("[Vapi] Error (full object):", JSON.stringify(err, null, 2));
      
      // Safely extract a string error message from Vapi's nested error structure
      let errorMsg = "An error occurred during the interview.";
      if (typeof err === "string") {
        errorMsg = err;
      } else if (typeof err?.message === "string") {
        errorMsg = err.message;
      } else if (typeof err?.error?.errorMsg === "string") {
        errorMsg = err.error.errorMsg;
      } else if (typeof err?.error?.msg === "string") {
        errorMsg = err.error.msg;
      }
      
      // Don't show "Meeting has ended" as an error — that's a normal call end
      if (errorMsg.includes("Meeting has ended") || errorMsg.includes("ejected")) {
        console.log("[Vapi] Call ended normally.");
        setStatus("ended");
        if (durationRef.current) clearInterval(durationRef.current);
        return;
      }
      
      setError(errorMsg);
      setStatus("ended");
      if (durationRef.current) clearInterval(durationRef.current);
    });

    return () => {
      vapi.stop();
      if (durationRef.current) clearInterval(durationRef.current);
    };
  }, []);

  // 3. Start the call
  function startInterview() {
    if (!vapiRef.current || !session || !assistantId) return;

    setStatus("connecting");
    setMessages([]);
    setCallDuration(0);

    // Build the dynamic context from the gap analysis
    const gapAnalysis = session.gapAnalysis || {};
    const missingSkills = (gapAnalysis.missingSkills || []).map((s) => s.skill).join(", ");
    const weakMatches = (gapAnalysis.weakMatches || []).map((s) => s.skill).join(", ");
    const strongMatches = (gapAnalysis.strongMatches || []).map((s) => s.skill).join(", ");
    const jobDesc = session.jobDescription?.substring(0, 800) || "not available";

    // Build a COMPLETE system prompt based on mode
    let systemPrompt;

    if (isQuickfire) {
      systemPrompt = `You are Alex, a friendly, conversational, and highly engaging technical interviewer. You are conducting a quick 3-question mock interview.

HOW TO ACT:
- Be incredibly natural, empathetic, and human. Listen carefully to the candidate.
- When they answer, REACT to what they said! Say things like "Oh, that's a really interesting approach," or "I see what you mean, but what if..." 
- Do not sound like a robot reading a script. Have a real conversation.
- You have exactly 3 questions. 
- Ask ONE question per turn. Keep your responses brief but warm.

YOUR 3 QUESTIONS:
Question 1: Ask about their most relevant project based on the job description below.
Question 2: Ask a technical question testing one of these areas they need to improve: ${missingSkills || weakMatches || "general web development"}.
Question 3: A situational question related to the job description.

AFTER QUESTION 3: Give them a quick compliment on their communication, say "That wraps up our quick-fire round. Check your dashboard for detailed feedback. Have a great day!" Do not ask any further questions.

JOB DESCRIPTION SUMMARY:
${jobDesc}

CANDIDATE PROFILE:
- Role: ${gapAnalysis.jobTitle || "Developer"}
- Strengths: ${strongMatches || "not specified"}
- Skills missing from their resume: ${missingSkills || "none identified"}
- Skills they undersold: ${weakMatches || "none"}

START BY SAYING EXACTLY: "Hey! Thanks for joining. I'm Alex. We're going to do a quick 3-question rapid-fire round for the ${gapAnalysis.jobTitle || "developer"} role. Let's jump right in..." then ask Question 1.`;
    } else {
      systemPrompt = `You are Alex, a senior technical interviewer. You are conducting a thorough, 10-minute mock interview.

HOW TO ACT:
- Be warm, conversational, and deeply engaging. Act like an empathetic human being.
- When the candidate speaks, actually respond to the substance of what they said. Say things like "That makes a lot of sense," or "I've run into that bug before too!" 
- If their answer is vague, naturally ask a follow-up: "Could you dig into that a bit more? How exactly did you implement it?"
- Do NOT sound like a quiz bot. Have a flowing conversation.
- Ask ONE question at a time. 

INTERVIEW FLOW:
1. INTRO: Start warmly. Ask them to introduce themselves and what excites them about the role.
2. PROJECT DIVE: Ask about a specific project from their resume. React to their answer, then ask a technical follow-up about a challenge they faced.
3. TECHNICAL SCENARIOS: Test these specific skills: ${missingSkills || weakMatches || "core technical skills"}. Don't ask definitions. Give them a scenario: "If we were building X, how would you use [Skill] to solve Y?"
4. BEHAVIORAL: Ask about a time they had a tight deadline or a disagreement with a coworker.
5. CLOSING: "Do you have any questions for me?" Answer briefly, then say: "Thanks for your time! Great conversation. Your detailed scorecard will be on your dashboard shortly."

JOB DESCRIPTION SUMMARY:
${jobDesc}

CANDIDATE PROFILE:
- Role: ${gapAnalysis.jobTitle || "Developer"}
- Strengths: ${strongMatches || "not specified"}
- Skills missing from their resume: ${missingSkills || "none identified"}
- Skills they undersold: ${weakMatches || "none"}

START BY SAYING EXACTLY: "Hi there! Thanks for joining. I'm Alex, and I'll be your interviewer today for the ${gapAnalysis.jobTitle || "developer"} position. Let's have a good conversation. To start off, tell me a bit about yourself."`;
    }

    const firstMsg = isQuickfire
      ? `Hey there! I'm Alex. We're going to do a quick 3-question rapid-fire round for your ${gapAnalysis.jobTitle || "developer"} application. Looking at your resume analysis, I noticed you have missing experience with ${missingSkills || 'some key technical areas'}. Let's jump right into your experience with that!`
      : `Hi! Thanks for joining today. I'm Alex, and I'll be conducting your technical interview for the ${gapAnalysis.jobTitle || "developer"} role. Based on your resume gap analysis, we noticed missing skills in ${missingSkills || 'some key areas'}. Let's start with how you'd handle building a project using ${missingSkills ? missingSkills.split(',')[0] : 'your core skills'}.`;

    console.log("[Interview] Starting Vapi call with resume gap analysis prompt override");
    console.log("[Interview] Mode:", mode);

    if (assistantId) {
      vapiRef.current.start(assistantId, {
        firstMessage: firstMsg,
        variableValues: {
          jobTitle: session.gapAnalysis?.jobTitle || "Developer",
          missingSkills: missingSkills || "none",
          weakMatches: weakMatches || "none",
        },
      });
    } else {
      vapiRef.current.start({
        model: {
          provider: "google",
          model: "gemini-2.5-flash",
          messages: [{ role: "system", content: systemPrompt }],
        },
        firstMessage: firstMsg,
      });
    }
  }

  // 4. End the call
  function endInterview() {
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
  }

  // Format seconds to mm:ss
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return (
    <div className="relative min-h-screen">

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        {/* Header */}
        <div className="animate-fade-in-up text-center mb-10">
          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
            AI Mock Interview
          </p>
          <h1 className="text-3xl font-bold text-white mb-1">
            {isQuickfire ? "⚡ Quick Fire" : "💬 Deep Dive"}
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            {isQuickfire
              ? "3 rapid questions • ~2 minutes"
              : "6-8 questions with follow-ups • ~10 minutes"}
          </p>
          {session && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Targeting role: <span className="text-white font-medium">{session.gapAnalysis?.jobTitle || "Unknown"}</span>
            </p>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="animate-fade-in-up mb-6 p-4 rounded-xl bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 flex items-start gap-3">
            <svg className="w-5 h-5 text-[var(--accent-red)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-[var(--accent-red)] text-sm font-medium">Error</p>
              <p className="text-[var(--accent-red)]/80 text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Main Interview Card */}
        <div className="animate-fade-in-up glass-card p-8" style={{ animationDelay: "0.1s" }}>
          
          {/* Loading State */}
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-[var(--text-secondary)] text-sm">Loading interview data...</p>
            </div>
          )}

          {/* Ready State — Start Button */}
          {status === "ready" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-xl shadow-white/10">
                <svg className="w-10 h-10 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Ready to Begin</h2>
              <p className="text-sm text-[var(--text-secondary)] text-center max-w-md mb-6">
                Make sure your microphone is enabled. The AI interviewer will ask you questions based on your resume gaps. Speak clearly and naturally.
              </p>
              <button
                onClick={startInterview}
                className="btn-primary text-base px-8 py-4"
                id="start-interview-btn"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
                Start Interview
              </button>
            </div>
          )}

          {/* Connecting State */}
          {status === "connecting" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full border-4 border-[#333] border-t-white animate-spin mb-6" />
              <p className="text-white font-medium mb-1">Connecting to interviewer...</p>
              <p className="text-[var(--text-muted)] text-xs">Please allow microphone access if prompted</p>
            </div>
          )}

          {/* Active Call State */}
          {status === "active" && (
            <div>
              {/* Timer and Status Bar */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${isSpeaking ? "bg-[var(--accent-green)] animate-pulse" : "bg-[var(--accent-amber)]"}`} />
                  <span className="text-sm text-[var(--text-secondary)]">
                    {isSpeaking ? "AI is speaking..." : "Listening to you..."}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-white">{formatTime(callDuration)}</span>
                  <button
                    onClick={endInterview}
                    className="px-4 py-2 rounded-xl bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 text-[var(--accent-red)] text-xs font-medium hover:bg-[var(--accent-red)]/20 transition-all"
                    id="end-interview-btn"
                  >
                    End Interview
                  </button>
                </div>
              </div>

              {/* Voice Visualizer */}
              <div className="flex items-center justify-center py-8 mb-6">
                <div className={`flex items-center gap-1.5 transition-all ${isSpeaking ? "scale-110" : "scale-100"}`}>
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-300 ${
                        isSpeaking 
                          ? "bg-white animate-pulse" 
                          : "bg-[#333]"
                      }`}
                      style={{
                        height: isSpeaking ? `${20 + Math.random() * 40}px` : "12px",
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Live Transcript */}
              <div className="max-h-64 overflow-y-auto space-y-3 scrollbar-thin pr-2">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#222] text-white rounded-br-md"
                          : "bg-[#111] text-[#ccc] rounded-bl-md border border-[#333]"
                      }`}
                    >
                      {msg.committed}
                      <span className="opacity-70">{msg.partial}</span>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Ended State */}
          {status === "ended" && messages.length > 0 && (
            <div className="flex flex-col gap-6 py-4 animate-fade-in-up">
              {isGrading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 border-2 border-[#1e1e1e] rounded-full" />
                    <div className="absolute inset-0 w-16 h-16 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-white font-semibold text-base mb-1">Evaluating Transcript</h3>
                    <p className="text-xs text-[var(--text-muted)]">Grading communication clarity, technical depth, and STAR structure...</p>
                  </div>
                </div>
              ) : gradingError ? (
                <div className="p-4 rounded-xl bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-[var(--accent-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <p className="text-[var(--accent-red)] text-sm font-semibold">Grading Failed</p>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{gradingError}</p>
                </div>
              ) : scorecard ? (
                <div className="space-y-6">
                  {/* Summary Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Score Circle */}
                    <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
                      <div className="relative flex items-center justify-center mb-3">
                        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                          <circle cx="60" cy="60" r="50" fill="none"
                            stroke={scorecard.compositeScore >= 75 ? "var(--accent-green)" : scorecard.compositeScore >= 50 ? "var(--accent-amber)" : "var(--accent-red)"}
                            strokeWidth="6" strokeLinecap="round"
                            strokeDasharray={`${(scorecard.compositeScore / 100) * 314} 314`} />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                          <span className="text-3xl font-bold text-white">{scorecard.compositeScore}</span>
                          <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Score</span>
                        </div>
                      </div>
                      <h4 className="text-sm font-semibold text-white mb-0.5">
                        {scorecard.compositeScore >= 75 ? "Strong Performance" : scorecard.compositeScore >= 50 ? "Average Performance" : "Needs Practice"}
                      </h4>
                      <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Overall Transcript Quality</p>
                    </div>

                    {/* Stats details */}
                    <div className="md:col-span-2 glass-card p-6 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-3">Performance Overview</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">STAR Structure</p>
                            <p className="text-lg font-bold text-white">{scorecard.star.total}/40</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Technical Depth</p>
                            <p className="text-lg font-bold text-white">{scorecard.technicalDepth}/100</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Keywords Covered</p>
                            <p className="text-lg font-bold text-white">{scorecard.keywordCoverage.coveredCount}/{scorecard.keywordCoverage.totalTarget}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Filler Word Ratio</p>
                            <p className="text-lg font-bold text-white">{Math.round(scorecard.communication.fillerRatio * 100)}%</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-4 pt-3 border-t border-[#1a1a1a]">
                        Evaluated on: {new Date(scorecard.evaluatedAt).toLocaleDateString()} at {new Date(scorecard.evaluatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {/* 6-Dimension Scorecard */}
                  <div className="glass-card p-6 space-y-5">
                    <h3 className="text-sm font-semibold text-white mb-4">6-Dimension Rubric Breakdown</h3>

                    {/* STAR Framework Progress Bars */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-semibold text-white">1. STAR Method Alignment</p>
                        <span className="text-xs font-bold text-[#a78bfa]">{scorecard.star.total}/40</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-[#111] border border-[#222] rounded-lg p-2">
                          <p className="text-[8px] text-[var(--text-muted)] uppercase tracking-wider">Situation</p>
                          <p className="text-xs font-bold text-white">{scorecard.star.situation}/10</p>
                        </div>
                        <div className="bg-[#111] border border-[#222] rounded-lg p-2">
                          <p className="text-[8px] text-[var(--text-muted)] uppercase tracking-wider">Task</p>
                          <p className="text-xs font-bold text-white">{scorecard.star.task}/10</p>
                        </div>
                        <div className="bg-[#111] border border-[#222] rounded-lg p-2">
                          <p className="text-[8px] text-[var(--text-muted)] uppercase tracking-wider">Action</p>
                          <p className="text-xs font-bold text-white">{scorecard.star.action}/10</p>
                        </div>
                        <div className="bg-[#111] border border-[#222] rounded-lg p-2">
                          <p className="text-[8px] text-[var(--text-muted)] uppercase tracking-wider">Result</p>
                          <p className="text-xs font-bold text-white">{scorecard.star.result}/10</p>
                        </div>
                      </div>
                    </div>

                    <hr className="border-[#1e1e1e]" />

                    {/* Technical Depth */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-xs font-semibold text-white">2. Technical Depth</p>
                        <span className="text-xs font-bold text-blue-400">{scorecard.technicalDepth}/100</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${scorecard.technicalDepth}%` }} />
                      </div>
                    </div>

                    <hr className="border-[#1e1e1e]" />

                    {/* Keyword Coverage */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-semibold text-white">3. Skill Gap Keyword Coverage</p>
                        <span className="text-xs font-bold text-emerald-400">{scorecard.keywordCoverage.coverageScore}%</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {scorecard.keywordCoverage.coveredSkills.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ✓ {s}
                          </span>
                        ))}
                        {scorecard.keywordCoverage.totalTarget === 0 && (
                          <span className="text-xs text-[var(--text-muted)] italic">No gap keywords targeted in this analysis</span>
                        )}
                        {scorecard.keywordCoverage.totalTarget > 0 && scorecard.keywordCoverage.coveredCount === 0 && (
                          <span className="text-xs text-[var(--accent-red)] italic">No missing skills were mentioned in your answers</span>
                        )}
                      </div>
                    </div>

                    <hr className="border-[#1e1e1e]" />

                    {/* Communication Clarity */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-semibold text-white">4. Communication & Confidence</p>
                        <span className="text-xs font-bold text-amber-400">{scorecard.communication.score}/100</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
                        <div className="flex justify-between p-2 rounded bg-[#111]">
                          <span>Assertiveness (Confidence)</span>
                          <span className="font-bold text-white">{scorecard.communication.confidenceScore}/10</span>
                        </div>
                        <div className="flex justify-between p-2 rounded bg-[#111]">
                          <span>Filler Word Ratio</span>
                          <span className="font-bold text-white">{Math.round(scorecard.communication.fillerRatio * 100)}%</span>
                        </div>
                      </div>
                    </div>

                    <hr className="border-[#1e1e1e]" />

                    {/* Response Length */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-semibold text-white">5. Answer Length Fit</p>
                        <span className="text-xs font-bold text-pink-400">{scorecard.lengthFit.score}/100</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
                        <div className="flex justify-between p-2 rounded bg-[#111]">
                          <span>Average Response Length</span>
                          <span className="font-bold text-white">{scorecard.lengthFit.avgLength} words</span>
                        </div>
                        <div className="flex justify-between p-2 rounded bg-[#111]">
                          <span>Optimal Fit (100-200 words)</span>
                          <span className="font-bold text-white">{scorecard.lengthFit.optimalPct}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Feedback & Coaching */}
                  <div className="glass-card p-6 border border-emerald-500/20 bg-emerald-500/5">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI Coaching & Constructive Feedback
                    </h3>
                    <ul className="space-y-2 text-xs text-[var(--text-secondary)] list-disc pl-4 leading-relaxed">
                      {scorecard.feedback.map((f, i) => (
                        <li key={i} className="hover:text-white transition-colors">{f}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Progress & Improvement Summary Banner */}
                  <div className="glass-card p-6 border border-purple-500/30 bg-purple-500/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 005.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">Interview Performance Tracked!</h4>
                        <p className="text-xs text-purple-200/80">
                          Score recorded: <strong className="text-white">{scorecard.compositeScore}/100</strong>. Keep practicing mock interviews to track your skill gap improvement trajectory on your dashboard.
                        </p>
                      </div>
                    </div>
                    <button onClick={() => router.push("/dashboard")} className="btn-primary text-xs px-5 py-2.5 whitespace-nowrap shrink-0">
                      View Progress Analytics →
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Transcript Review (Always available when interview ends) */}
              <div className="w-full glass-card p-5 max-h-72 overflow-y-auto">
                <h3 className="text-sm font-semibold text-white mb-3">Full Conversation Transcript</h3>
                <div className="space-y-3">
                  {messages.filter(m => m.committed?.trim()).map((msg, i) => (
                    <div key={i} className="flex gap-3">
                      <span className={`text-[10px] uppercase tracking-wider font-bold mt-0.5 shrink-0 ${
                        msg.role === "user" ? "text-white" : "text-[#888]"
                      }`}>
                        {msg.role === "user" ? "You" : "AI"}
                      </span>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{msg.committed}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="btn-secondary text-sm px-6 py-3"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={() => {
                    setScorecard(null);
                    setMessages([]);
                    setCallDuration(0);
                    setError("");
                    setGradingError("");
                    setStatus("ready");
                  }}
                  className="btn-primary text-sm px-6 py-3"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
