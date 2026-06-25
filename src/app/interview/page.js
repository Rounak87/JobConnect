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
      if (msg.type === "transcript") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          
          if (!last || last.role !== msg.role) {
            // Start of a new turn bubble
            if (msg.transcriptType === "partial") {
              return [...prev, { role: msg.role, committed: "", partial: msg.transcript }];
            } else {
              return [...prev, { role: msg.role, committed: msg.transcript + " ", partial: "" }];
            }
          } else {
            // Append to the existing turn bubble
            if (msg.transcriptType === "partial") {
              return [...prev.slice(0, -1), { ...last, partial: msg.transcript }];
            } else {
              return [...prev.slice(0, -1), { ...last, committed: last.committed + msg.transcript + " ", partial: "" }];
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

AFTER QUESTION 3: Give them a quick compliment on their communication, say "That wraps up our quick-fire round. Check your dashboard for detailed feedback. Have a great day!" and end the interview.

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

    console.log("[Interview] Starting INLINE assistant");
    console.log("[Interview] Mode:", mode);
    console.log("[Interview] Prompt preview:", systemPrompt.substring(0, 200));

    // Start Vapi with a FULLY INLINE assistant (no dashboard assistant needed)
    // This gives us 100% control over the system prompt
    vapiRef.current.start({
      model: {
        provider: "google",
        model: isQuickfire ? "gemini-2.5-flash" : "gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
      },
      voice: {
        provider: "vapi",
        voiceId: isQuickfire ? "Kai" : "Neil",
      },
      transcriber: {
        provider: "deepgram",
        language: "en",
      },
      firstMessage: isQuickfire
        ? `Hey! Welcome to your quick-fire round for the ${session.gapAnalysis?.jobTitle || "developer"} role. Let's jump right in.`
        : `Hi there! Thanks for joining. I'm Alex, and I'll be your interviewer today for the ${session.gapAnalysis?.jobTitle || "developer"} position. Let's have a good conversation. So, tell me a bit about yourself and what excites you about this role.`,
      maxDurationSeconds: isQuickfire ? 180 : 660,
      silenceTimeoutSeconds: 10, // Vapi requires this to be >= 10
    });
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
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-xl bg-[#111] border border-[#333] flex items-center justify-center mb-5">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-1">Interview Complete!</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                Duration: {formatTime(callDuration)}
              </p>
              <p className="text-xs text-[var(--text-muted)] mb-8 text-center max-w-md">
                Your transcript has been recorded. The scorecard feature is coming soon!
              </p>

              {/* Transcript Review */}
              <div className="w-full glass-card p-5 mb-6 max-h-72 overflow-y-auto">
                <h3 className="text-sm font-semibold text-white mb-3">Transcript</h3>
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

              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="btn-secondary text-sm px-6 py-3"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={() => {
                    setStatus("ready");
                    setMessages([]);
                    setCallDuration(0);
                    setError("");
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
