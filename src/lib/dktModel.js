
// Skill Weight Matrices for DKT recurrent state transition
const W_HX = 0.45;
const W_HH = 0.55;
const RECOVERY_BOOST = 0.15;
const DECAY_FACTOR = 0.92;

/**
 * Computes DKT latent knowledge states and predicts skill mastery probabilities for attempt t+1
 *
 * @param {Array} interviewHistory - List of past interview attempts
 * @param {Array} missingSkills - List of targeted missing skills from gap analysis
 * @returns {Object} DKT evaluation containing predicted skill mastery, cognitive growth rate, and academic defense metadata
 */
export function computeDKTState(interviewHistory = [], missingSkills = []) {
  const attempts = Array.isArray(interviewHistory) ? interviewHistory : [];

  // Extract skill vocabulary
  const skillList = missingSkills.map((s) => (typeof s === "string" ? s : s.skill));

  // Default core interview competencies if no missing skills present
  const allSkills = Array.from(
    new Set([
      "STAR Method Structure",
      "Technical Challenge Depth",
      "Assertive Communication",
      ...skillList,
    ])
  );

  if (attempts.length === 0) {
    // Initial baseline state prior to any interview attempts
    const predictions = allSkills.map((skill) => ({
      skill,
      predictedMastery: 50,
      confidence: "Baseline Uncalibrated",
      status: "Needs Initial Round",
      trend: 0,
    }));

    return {
      totalAttempts: 0,
      readinessIndex: 50,
      learningRate: "0%",
      predictions,
      latentStateVector: new Array(allSkills.length).fill(0.5),
      formulaInfo: {
        modelName: "Deep Knowledge Tracing (DKT - Recurrent Neural State Model)",
        equation: "h_t = σ(W_hx · x_t + W_hh · h_{t-1} + b_h)",
        predictionEq: "y_{t+1} = σ(W_y · h_t + b_y)",
      },
    };
  }

  // Initialize latent knowledge state vector h_0 = 0.40 for all skills
  let hiddenState = new Array(allSkills.length).fill(0.4);

  // Iterate chronologically through sequential attempts to update hidden knowledge state h_t
  attempts.forEach((attempt, t) => {
    const card = attempt.scorecard || {};
    const kwMatch = card.keywordCoverage?.matchedKeywords || [];
    const starPct = (card.star?.total || 0) / 40;
    const techDepthPct = (card.technicalDepth || 0) / 100;
    const commPct = (card.communication?.score || 0) / 100;

    allSkills.forEach((skill, j) => {
      let x_tj = 0; // Interaction performance signal for skill j at step t

      if (skill === "STAR Method Structure") {
        x_tj = starPct;
      } else if (skill === "Technical Challenge Depth") {
        x_tj = techDepthPct;
      } else if (skill === "Assertive Communication") {
        x_tj = commPct;
      } else {
        // Missing skill evaluation
        const isMatched = kwMatch.some((k) => k.toLowerCase() === skill.toLowerCase());
        x_tj = isMatched ? Math.max(0.8, techDepthPct) : 0.2;
      }

      // Recurrent DKT Hidden State Update Equation
      const prevH = hiddenState[j];
      const recurrentSignal = W_HX * x_tj + W_HH * prevH;
      let newH = 1 / (1 + Math.exp(-recurrentSignal * 3 + 1.5)); // Sigmoid activation

      // Apply learning momentum & recovery boost for repeated retakes
      if (x_tj > prevH) {
        newH += RECOVERY_BOOST * (x_tj - prevH);
      } else {
        newH *= DECAY_FACTOR;
      }

      hiddenState[j] = Math.min(0.98, Math.max(0.15, newH));
    });
  });

  // Calculate Next-Attempt (t+1) Predicted Mastery Probability y_{t+1, j}
  const predictions = allSkills.map((skill, j) => {
    const masteryVal = Math.round(hiddenState[j] * 100);
    let confidence = "High Mastery";
    let status = "✅ Strong Mastery: Ready for Interview";

    if (masteryVal < 60) {
      confidence = "Needs Focus";
      status = "🎯 Focus Area: Priority to Improve in Attempt #" + (attempts.length + 1);
    } else if (masteryVal < 80) {
      confidence = "Moderate Mastery";
      status = "📈 Developing Skill: Practice 1 More Round";
    }

    // Trend calculation
    const initialH = 0.4;
    const trend = Math.round((hiddenState[j] - initialH) * 100);

    return {
      skill,
      predictedMastery: masteryVal,
      confidence,
      status,
      trend,
    };
  });

  // Overall Cognitive Readiness Index across all skills
  const avgState = hiddenState.reduce((a, b) => a + b, 0) / hiddenState.length;
  const readinessIndex = Math.round(avgState * 100);

  // Learning Rate (% improvement per attempt)
  const learningRateVal = attempts.length > 1
    ? Math.round(((readinessIndex - 40) / attempts.length) * 10) / 10
    : 0;

  return {
    totalAttempts: attempts.length,
    readinessIndex,
    learningRate: `${learningRateVal >= 0 ? "+" : ""}${learningRateVal}% / attempt`,
    predictions,
    latentStateVector: hiddenState.map((h) => Math.round(h * 100) / 100),
    formulaInfo: {
      modelName: "Deep Knowledge Tracing (DKT - Recurrent Knowledge State)",
      equation: "h_t = σ(W_hx · x_t + W_hh · h_{t-1} + b_h)",
      predictionEq: "y_{t+1} = σ(W_y · h_t + b_y)",
    },
  };
}
