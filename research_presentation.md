# Project Name: JobConnect - Adaptive AI Interview & Resume System

## 1. Project Overview
JobConnect is an advanced Multi-Modal Knowledge Tracing and AI Coaching platform. It transforms the standard job preparation process by seamlessly connecting intelligent resume optimization with a real-time, adaptive voice interview system. Unlike standard CRUD applications, this project formulates candidate interview progression as a **Sequential Knowledge Tracing Problem**. It starts by mathematically analyzing a candidate's resume against a Job Description (JD) to find skill gaps, provides a split-editor for AI-driven refinement, and culminates in a real-time conversational voice interview. Using **Deep Knowledge Tracing (DKT-LSTM)**, the system tracks how a candidate's latent skill mastery evolves across repeated voice interview attempts, giving predictive insights and targeted AI coaching.

---

## 2. Module 1: AI Resume Surgeon & The 3-Signal Algorithm
When a candidate uploads their Resume and pastes a Job Description, the system doesn't just look for basic keywords. It uses a **3-Signal Hybrid Scoring Engine** to calculate a highly accurate Match Score.

### The 3 Algorithms:
1. **TF-IDF (Lexical Overlap):** Measures exact keyword matches and frequency between the resume and JD.
2. **High-Dimensional Vector Cosine Similarity (Semantic Match):** Uses AI embeddings (HuggingFace/Gemini) to understand the *meaning* of words. Even if the resume says "React" and the JD says "Frontend Framework", the semantic model knows they match.
3. **LLM Contextual Reasoning:** A Large Language Model reads the context to verify if the candidate actually applied the skill in a project.

### Mathematical Formulation (Resume Score):
**FinalScore = (0.20 × S_TFIDF) + (0.30 × S_Semantic) + (0.50 × S_LLM)**
*Where `S_Semantic` is calculated using Cosine Similarity:* 
`Cosine Similarity (u, v) = (u · v) / (||u|| × ||v||)`

---

## 3. Module 2: Interactive Split-Editor & Generation
Once the initial analysis is complete, candidates are taken to the **Split-Editor UI**.
- **Left Panel (Original & Gap Analysis):** Highlights matched skills in green and missing skills in red.
- **Right Panel (AI Generation):** Candidates can click "Rewrite using AI" to automatically inject missing skills into their experience bullet points using the STAR (Situation, Task, Action, Result) method.
- **ATS Bounding:** Post-rewrite, the system recalculates the ATS score, intentionally bounding it between 82-89% to avoid triggering recruiter spam filters (100% scores look suspicious).

---

## 4. Module 3: Real-Time Voice Interview & Evaluation
The platform features a **Live Conversational AI Interviewer** powered by WebRTC (via Vapi). 

### How it works in the Background (For Teachers/Evaluators):
1. **Dynamic Prompt Injection:** The AI interviewer reads the candidate's resume and the *Missing Skills* from the gap analysis. It dynamically formulates questions to test the candidate on the exact skills they were missing.
2. **Real-Time Audio Streaming:** Audio is streamed with ultra-low latency, and the conversation is transcribed in real-time.
3. **6-Dimension Rubric Evaluation:** Once the call ends, the backend runs 5 parallel analysis pipelines on the spoken transcript to generate a composite score:
   - **STAR Framework** (LLM - 30%)
   - **Technical Depth** (LLM - 25%)
   - **Skill Gap Coverage** (Deterministic Regex - 20%)
   - **Communication Clarity & Filler Word Ratio** (Deterministic - 15%)
   - **Response Length Fit** (Deterministic - 10%)

---

## 5. Module 4: Deep Knowledge Tracing (DKT-LSTM)
The crown jewel of the research paper. The platform uses **Deep Knowledge Tracing** to model a candidate's mastery state over time based on their sequential interview attempts.

### How it Works:
Instead of just averaging scores, DKT predicts: *"Based on Attempt #1, what is the probability that the candidate will correctly answer a question on SQL in Attempt #2?"*

### Mathematical Formulation (DKT):
1. **Recurrent State Update (LSTM Memory):**
   `h_t = σ(W_hx · x_t + W_hh · h_{t-1} + b_h)`
   *`h_t` represents the candidate's evolving hidden cognitive memory state across attempts.*
2. **Next-Attempt Predictive Probability:**
   `y_t = σ(W_y · h_t + b_y)`
   *`y_t` is the predicted probability (0-100%) that the candidate will master a specific skill in their next interview.*

### UI Output (Cognitive Shift):
The UI displays the **Predicted Readiness Index** and calculates the **Cognitive Shift** (percentage growth or decay in skill mastery compared to the starting baseline), guiding candidates on exactly what to focus on in their next round.
