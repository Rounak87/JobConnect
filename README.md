# JobConnect

JobConnect is an AI-powered conversational voice interview practice platform. It evaluates a candidate's resume against target job descriptions to identify skill gaps, then dynamically configures real-time, lifelike voice mock interviews tailored precisely to those gaps. It also provides a visual resume editor to help bridge the identified shortcomings.

---

## Core Features

1. **Conversational Mock Interviews**
   - Integrates the Vapi AI Web SDK to run real-time, low-latency voice mock interviews with lifelike verbal responses.
   - Operates in two modes:
     - **Quick Fire**: A rapid 3-question session targeting identified resume gaps.
     - **Deep Dive**: A thorough 10-minute mock interview comprising introductions, technical challenges, behavioral questions, and a feedback scorecard.
   - Uses **Dynamic Prompting**: generates custom agent instructions on the fly, feeding candidate strengths, missing skills, and the target role into the voice engine.
   - Provides a live soundwave visualizer, real-time message transcript bubbles, and post-interview logs.

2. **AI Gap Analysis**
   - Extracts text from uploaded resumes and compares it to target job descriptions using Google Gemini.
   - Identifies match scores and lists strong matches, undersold skills, and critical missing keywords.
   - Serves as the data engine that dynamically feeds the mock interview setup.

3. **Interactive Resume Surgeon**
   - Provides a split-screen workspace to review original bullets alongside AI optimizations.
   - Integrates a real-time keyword sandbox where missing target skills check off as the user writes.
   - Allows exporting refined resume sections back into an ATS-friendly `.docx` file.

4. **Dashboard & History Tracking**
   - Manages and retrieves past sessions and transcripts stored in MongoDB.
   - Tracks metrics like interview frequency, match improvement, and session logs.

---

## Tech Stack

- **Voice Platform**: Vapi Web SDK (`@vapi-ai/web`) running Deepgram transcription and Gemini voice outputs
- **AI Engines**: Google Gemini SDK (`@google/genai`) for analysis and resume refinement
- **Framework**: Next.js (App Router, Client Component SSR, React Context)
- **Styling**: Tailwind CSS v4
- **Database**: MongoDB (Mongoose)
- **Authentication**: Firebase Client SDK (Google Sign-In)
- **Parsers**: `mammoth` (docx reader) & `docx` (docx writer)

---

## Directory Structure

```text
JobConnect/
├── public/                 # Static assets
├── src/
│   ├── app/                # Next.js App Router Pages
│   │   ├── page.js         # Landing Page
│   │   ├── globals.css     # Styling tokens & global styles
│   │   ├── layout.js       # Root layout & context wrapper
│   │   ├── analyze/        # Resume upload & gap trigger view
│   │   ├── dashboard/      # History & metrics dashboard
│   │   ├── interview/      # Voice mock interview interface
│   │   └── api/            # Serverless API routes
│   │       ├── analyze/    # Gemini analysis engine
│   │       ├── rewrite/    # Gemini optimizer + docx builder
│   │       ├── session/    # Session data retrieval
│   │       ├── history/    # User history retrieval
│   │       └── users/      # Firebase-to-MongoDB syncing
│   ├── components/         # Reusable UI components
│   │   ├── GoogleSignInButton.js
│   │   ├── Navbar.js
│   │   ├── ProtectedRoute.js
│   │   └── ResultsView.js
│   ├── context/
│   │   └── AuthContext.js  # Firebase Auth lifecycle context
│   ├── lib/
│   │   ├── firebase.js     # Firebase connection setup
│   │   └── mongodb.js      # Mongoose connection setup
│   └── models/
│       ├── User.js         # User schema
│       └── Analysis.js     # Analysis & caching schema
├── next.config.mjs         # Next.js configurations
└── package.json            # Scripts & dependencies
```

---

## Setup & Running Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Configure `.env.local` in the root folder with credentials for MongoDB, Firebase, Google Gemini API, and Vapi AI.

3. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).
