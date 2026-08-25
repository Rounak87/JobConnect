"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ResultsView from "@/components/ResultsView";

export default function SessionPage() {
  return (
    <ProtectedRoute>
      <SessionContent />
    </ProtectedRoute>
  );
}

function SessionContent() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();
  
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchSession() {
      if (!user?.uid || !id) return;
      
      try {
        const res = await fetch(`/api/session?id=${id}&uid=${user.uid}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to load session");
        }
        
        setSession(data.session);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchSession();
  }, [id, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Session Not Found</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          {error || "This analysis may have been deleted or does not exist."}
        </p>
        <button onClick={() => router.push("/dashboard")} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <ResultsView
      result={session.gapAnalysis}
      resumeText={session.resumeText}
      jobDescription={session.jobDescription}
      analysisId={session._id || id}
      scoringBreakdown={session.scoringBreakdown}
      atsScore={session.atsScore}
      interviewScorecard={session.interviewScorecard}
      interviewTranscript={session.interviewTranscript}
      interviewHistory={session.interviewHistory}
      onReset={() => router.push("/dashboard")}
    />
  );
}
