"use client";

import { useState, useRef, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import ResultsView from "@/components/ResultsView";

export default function AnalyzePage() {
  return (
    <ProtectedRoute>
      <AnalyzeContent />
    </ProtectedRoute>
  );
}

// Loading messages that cycle during analysis
const LOADING_STEPS = [
  "Extracting text from your resume...",
  "Reading job requirements...",
  "Comparing skills and experience...",
  "Identifying gaps and strengths...",
  "Scoring your match...",
  "Generating recommendations...",
];

const SAMPLE_JDS = {
  "Web Dev": "We are looking for a Full Stack Web Developer with 3+ years of experience in React.js, Node.js, and TypeScript. You should be comfortable building REST APIs, managing MongoDB databases, and creating responsive user interfaces using modern CSS frameworks like Tailwind. Experience with Next.js and server-side rendering is a big plus.",
  "Data Scientist": "Seeking a Data Scientist to build predictive models and analyze large datasets. Must have strong proficiency in Python, Pandas, and Scikit-Learn. Experience with machine learning frameworks like TensorFlow or PyTorch is required. You will work closely with engineering to deploy models to production.",
  "Data Analyst": "We need a Data Analyst to translate business requirements into actionable insights. Requirements include strong SQL skills, experience with data visualization tools (Tableau, PowerBI), and proficiency in Excel. You will be responsible for creating dashboards, running A/B tests, and presenting findings.",
  "AI Engineer": "Looking for an AI Engineer to develop and integrate LLM-powered features. Strong experience with Python, LangChain, and OpenAI/Gemini APIs is required. You should understand RAG architectures, prompt engineering, and vector databases (Pinecone, Weaviate)."
};

function AnalyzeContent() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [jobDescription, setJobDescription] = useState("");

  // Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [analysisId, setAnalysisId] = useState(null);
  const [scoringBreakdown, setScoringBreakdown] = useState(null);
  const [atsScore, setAtsScore] = useState(null);

  const fileInputRef = useRef(null);
  const loadingIntervalRef = useRef(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const validateFile = useCallback((selectedFile) => {
    setFileError("");
    if (!selectedFile) return false;
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith(".docx")) {
      setFileError("Only .docx files are accepted.");
      return false;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFileError("File must be under 5MB.");
      return false;
    }
    return true;
  }, []);

  function handleFileChange(e) {
    const selected = e.target.files[0];
    if (selected && validateFile(selected)) {
      setFile(selected);
    } else {
      setFile(null);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && validateFile(dropped)) {
      setFile(dropped);
    } else if (dropped) {
      setFile(null);
    }
  }

  function removeFile() {
    setFile(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // Run analysis
  async function handleAnalyze() {
    if (!file || jobDescription.trim().length < 20) return;

    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisResult(null);
    setLoadingStep(0);

    // Cycle through loading messages
    let step = 0;
    loadingIntervalRef.current = setInterval(() => {
      step = (step + 1) % LOADING_STEPS.length;
      setLoadingStep(step);
    }, 2500);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("jobDescription", jobDescription);
      if (user?.uid) {
        formData.append("uid", user.uid);
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      setAnalysisResult(data.analysis);
      setAnalysisId(data.analysisId);
      setResumeText(data.resumeText || "");
      setScoringBreakdown(data.scoringBreakdown || null);
      setAtsScore(data.atsScore || null);
      
      console.log("-----------------------------------------");
      console.log(`✅ ANALYSIS COMPLETE!`);
      console.log(`🧠 AI Engine Used: ${data.model}`);
      console.log("-----------------------------------------");
    } catch (err) {
      setAnalysisError(err.message || "Something went wrong");
    } finally {
      setIsAnalyzing(false);
      clearInterval(loadingIntervalRef.current);
    }
  }

  // Reset everything for a new analysis
  function handleReset() {
    setFile(null);
    setFileError("");
    setJobDescription("");
    setAnalysisResult(null);
    setAnalysisError("");
    setScoringBreakdown(null);
    setAtsScore(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const isReady = file && jobDescription.trim().length > 20;

  // ─── RESULTS VIEW ───
  if (analysisResult) {
    return (
      <ResultsView
        result={analysisResult}
        onReset={handleReset}
        resumeText={resumeText}
        jobDescription={jobDescription}
        analysisId={analysisId}
        scoringBreakdown={scoringBreakdown}
        atsScore={atsScore}
      />
    );
  }

  // ─── LOADING VIEW ───
  if (isAnalyzing) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-[#222] rounded-full" />
            <div className="absolute inset-0 w-16 h-16 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg mb-2">
              Analyzing your resume...
            </p>
            <p className="text-[var(--text-secondary)] text-sm transition-all duration-300">
              {LOADING_STEPS[loadingStep]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── INPUT VIEW ───
  return (
    <div className="relative min-h-screen">

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        {/* Page Header */}
        <div className="animate-fade-in-up mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            Analyze Your Resume
          </h1>
          <p className="text-[var(--text-secondary)] text-sm max-w-lg">
            Upload your DOCX resume and paste the job description you&apos;re
            targeting. Our AI will analyze the gap and help you optimize.
          </p>
        </div>

        {/* Error Banner */}
        {analysisError && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20 flex items-start gap-3">
            <svg className="w-5 h-5 text-[var(--accent-red)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-[var(--accent-red)] text-sm font-medium">Analysis Failed</p>
              <p className="text-[var(--accent-red)]/80 text-xs mt-0.5">{analysisError}</p>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left — File Upload */}
          <div className="animate-fade-in-up flex flex-col h-full" style={{ animationDelay: "0.1s" }}>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
              Resume Upload
            </label>
            <div
              className={`upload-zone flex-1 flex flex-col items-center justify-center ${isDragOver ? "drag-over" : ""} ${file ? "file-selected" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".docx"
                onChange={handleFileChange}
                className="hidden"
                id="resume-upload"
              />
              {!file ? (
                <>
                  <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#111] border border-[#333]">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-white mb-1">Drag & drop your resume here</p>
                  <p className="text-xs text-[var(--text-muted)]">or click to browse • DOCX only • Max 5MB</p>
                </>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-green)]/10 shrink-0">
                    <svg className="w-6 h-6 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{file.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(); }}
                    className="shrink-0 p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-all cursor-pointer"
                    id="remove-file-btn"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {fileError && (
              <p className="mt-2 text-xs text-[var(--accent-red)] flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {fileError}
              </p>
            )}
          </div>

          {/* Right — Job Description */}
          <div className="animate-fade-in-up flex flex-col h-full" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <label htmlFor="job-description" className="block text-sm font-medium text-[var(--text-secondary)]">
                Job Description
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(SAMPLE_JDS).map((role) => (
                  <button
                    key={role}
                    onClick={() => setJobDescription(SAMPLE_JDS[role])}
                    className="text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-md bg-[#111] border border-[#333] text-[var(--text-secondary)] hover:text-white hover:bg-[#222] transition-all"
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative flex-1 flex flex-col">
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder={`Paste the full job description here...\n\nExample:\n"We are looking for a Senior Frontend Developer with 3+ years of experience in React.js, TypeScript, and Node.js..."`}
                className="w-full flex-1 min-h-[242px] px-5 py-4 rounded-xl bg-[#0a0a0a] border border-[#222] text-sm text-white placeholder-[var(--text-muted)] leading-relaxed resize-none focus:outline-none focus:border-white focus:ring-1 focus:ring-white/30 transition-all"
              />
              <div className="absolute right-3 bottom-3 text-xs text-[var(--text-muted)]">
                {jobDescription.length} chars
              </div>
            </div>
            {jobDescription.length > 0 && jobDescription.trim().length <= 20 && (
              <p className="mt-2 text-xs text-[var(--accent-amber)] flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                Paste more of the job description for better results
              </p>
            )}
          </div>
        </div>

        {/* Analyze Button */}
        <div className="animate-fade-in-up mt-8 flex justify-center" style={{ animationDelay: "0.3s" }}>
          <button
            disabled={!isReady}
            onClick={handleAnalyze}
            className="btn-primary text-base px-10 py-4"
            id="analyze-btn"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            Analyze Resume
          </button>
        </div>

        <p className="animate-fade-in-up mt-4 text-center text-xs text-[var(--text-muted)]" style={{ animationDelay: "0.35s" }}>
          {isReady
            ? "Ready to analyze! Click the button above."
            : "Upload a resume and paste a job description to get started."}
        </p>
      </div>
    </div>
  );
}