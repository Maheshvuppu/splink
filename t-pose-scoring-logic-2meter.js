/* T-POSE SCORING LOGIC - 2M (Same as 1M) */
let singleLegStanceState = {
    testStart: null, 
    currentHoldMetrics: [],  // Metrics for current hold attempt
    bestHoldMetrics: [],     // Metrics from the best (longest) hold
    currentHoldMs: 0, 
    bestHoldMs: 0,
    stanceLeg: null, 
    bestStanceLeg: null,     // Track which leg had the best hold
    pendingStance: null, 
    pendingMs: 0, 
    lastTimestamp: null,
    feedbackCooldownMs: 0, 
    positionWarned: false
};
const SINGLE_LEG_TEST_WINDOW = 10000;
const STANCE_GAP_THRESHOLD = 0.02;
const STANCE_CONFIRM_MS = 400;
const STANCE_LOSS_MS = 450;
const MIN_VALID_HOLD_SECONDS = 5;

function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }
const asymmetricQuality = (value, target, lowerOkOffset, upperOkOffset, lowerZeroOffset, upperZeroOffset) => {
    const delta = value - target;
    if (delta >= lowerOkOffset && delta <= upperOkOffset) return 1;
    if (delta < lowerOkOffset) {
        if (delta <= lowerZeroOffset) return 0;
        return clamp(1 - (lowerOkOffset - delta) / (lowerOkOffset - lowerZeroOffset), 0, 1);
    }
    if (delta >= upperZeroOffset) return 0;
    return clamp(1 - (delta - upperOkOffset) / (upperZeroOffset - upperOkOffset), 0, 1);
};

function angle(A, B, C) {
    if (!A || !B || !C) return 0;
    const v1 = { x: A.x - B.x, y: A.y - B.y };
    const v2 = { x: C.x - B.x, y: C.y - B.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
    const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
    if (m1 === 0 || m2 === 0) return 999;
    return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
}

export function startTPoseBalanceTest() {
    singleLegStanceState = {
        testStart: performance.now(), 
        currentHoldMetrics: [], 
        bestHoldMetrics: [], 
        currentHoldMs: 0, 
        bestHoldMs: 0,
        stanceLeg: null, 
        bestStanceLeg: null,
        pendingStance: null, 
        pendingMs: 0, 
        lastTimestamp: performance.now(),
        feedbackCooldownMs: 0, 
        positionWarned: false
    };
}

export function updateTPoseBalance(lm, onRepSpeak, onTestFinish, inCorrectPosition = true, exercise = 't-pose') {
    if (!singleLegStanceState.testStart) return;
    if (!inCorrectPosition) return;

    const now = performance.now();
    const elapsed = now - singleLegStanceState.testStart;
    const delta = singleLegStanceState.lastTimestamp ? now - singleLegStanceState.lastTimestamp : 0;
    singleLegStanceState.lastTimestamp = now;

    if (elapsed > SINGLE_LEG_TEST_WINDOW) {
        if (onTestFinish) onTestFinish();
        return;
    }

    const leftAnkleY = lm[27].y;
    const rightAnkleY = lm[28].y;
    const ankleDiff = leftAnkleY - rightAnkleY;
    let candidateStance = null;
    if (ankleDiff > STANCE_GAP_THRESHOLD) candidateStance = 'left';
    else if (ankleDiff < -STANCE_GAP_THRESHOLD) candidateStance = 'right';

    if (!singleLegStanceState.stanceLeg) {
        if (!candidateStance) {
            singleLegStanceState.pendingStance = null;
            singleLegStanceState.pendingMs = 0;
            return;
        }
        if (singleLegStanceState.pendingStance === candidateStance) {
            singleLegStanceState.pendingMs += delta;
            if (singleLegStanceState.pendingMs >= STANCE_CONFIRM_MS) {
                singleLegStanceState.stanceLeg = candidateStance;
                singleLegStanceState.pendingStance = null;
                singleLegStanceState.pendingMs = 0;
                singleLegStanceState.currentHoldMs = 0;
            }
        } else {
            singleLegStanceState.pendingStance = candidateStance;
            singleLegStanceState.pendingMs = 0;
        }
        return;
    }

    if (!candidateStance || candidateStance !== singleLegStanceState.stanceLeg) {
        singleLegStanceState.pendingMs += delta;
        if (singleLegStanceState.pendingMs >= STANCE_LOSS_MS) {
            // Before resetting, check if current hold was the best
            if (singleLegStanceState.currentHoldMs > singleLegStanceState.bestHoldMs) {
                singleLegStanceState.bestHoldMs = singleLegStanceState.currentHoldMs;
                singleLegStanceState.bestHoldMetrics = [...singleLegStanceState.currentHoldMetrics];
                singleLegStanceState.bestStanceLeg = singleLegStanceState.stanceLeg;
            }
            // Reset for next hold attempt
            singleLegStanceState.pendingMs = 0;
            singleLegStanceState.pendingStance = null;
            singleLegStanceState.stanceLeg = null;
            singleLegStanceState.currentHoldMs = 0;
            singleLegStanceState.currentHoldMetrics = [];
        }
        return;
    }

    singleLegStanceState.pendingMs = 0;
    singleLegStanceState.currentHoldMs += delta;
    
    const stanceIndices = singleLegStanceState.stanceLeg === 'left'
        ? { hip: 23, knee: 25, ankle: 27 } : { hip: 24, knee: 26, ankle: 28 };
    const liftedIndices = singleLegStanceState.stanceLeg === 'left'
        ? { hip: 24, knee: 26, ankle: 28 } : { hip: 23, knee: 25, ankle: 27 };

    const stanceKnee = angle(lm[stanceIndices.hip], lm[stanceIndices.knee], lm[stanceIndices.ankle]);
    const liftedKnee = angle(lm[liftedIndices.hip], lm[liftedIndices.knee], lm[liftedIndices.ankle]);
    const liftedShoulder = singleLegStanceState.stanceLeg === 'left' ? lm[12] : lm[11];
    const liftedHipAngle = angle(liftedShoulder, lm[liftedIndices.hip], lm[liftedIndices.knee]);

    const shoulderMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
    const hipMid = { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 };
    const torsoAngle = angle(lm[stanceIndices.ankle], hipMid, shoulderMid);
    const torsoDeviation = Math.abs(180 - torsoAngle);
    const sway = Math.abs(hipMid.x - lm[stanceIndices.ankle].x);

    // Add to CURRENT hold metrics only
    singleLegStanceState.currentHoldMetrics.push({
        stanceKnee, liftedKnee, liftedHipAngle, torsoDeviation, sway,
        timestamp: elapsed, stanceLeg: singleLegStanceState.stanceLeg
    });
    
    // ONLY update best if current hold STRICTLY exceeds best time
    // This ensures we only keep metrics from the single longest hold
    if (singleLegStanceState.currentHoldMs > singleLegStanceState.bestHoldMs) {
        singleLegStanceState.bestHoldMs = singleLegStanceState.currentHoldMs;
        singleLegStanceState.bestHoldMetrics = [...singleLegStanceState.currentHoldMetrics];
        singleLegStanceState.bestStanceLeg = singleLegStanceState.stanceLeg;
    }
}

export function finishTPoseBalanceTest() {
    // Use the best hold metrics, not all accumulated metrics
    const metricsToUse = singleLegStanceState.bestHoldMetrics;
    const stanceLegToUse = singleLegStanceState.bestStanceLeg || singleLegStanceState.stanceLeg;
    
    if (metricsToUse.length === 0) {
        return { stanceKnee: 0, liftedKnee: 0, torsoDeviation: 0, sway: 0,
            holdTime: 0, formScore: 0, finalScore: 0, stanceLeg: stanceLegToUse };
    }
    
    const totalCount = metricsToUse.length;
    const avgMetrics = metricsToUse.reduce((acc, m) => ({
        stanceKnee: acc.stanceKnee + m.stanceKnee, liftedKnee: acc.liftedKnee + m.liftedKnee,
        liftedHipAngle: acc.liftedHipAngle + (m.liftedHipAngle || 0),
        torsoDeviation: acc.torsoDeviation + m.torsoDeviation, sway: acc.sway + m.sway
    }), { stanceKnee: 0, liftedKnee: 0, liftedHipAngle: 0, torsoDeviation: 0, sway: 0 });
    
    avgMetrics.stanceKnee /= totalCount;
    avgMetrics.liftedKnee /= totalCount;
    avgMetrics.liftedHipAngle /= totalCount;
    avgMetrics.torsoDeviation /= totalCount;
    avgMetrics.sway /= totalCount;
    
    const holdTimeSeconds = singleLegStanceState.bestHoldMs / 1000;
    const holdTime = Math.round(holdTimeSeconds * 10) / 10;
    const isValid = holdTimeSeconds >= MIN_VALID_HOLD_SECONDS;
    const legActuallyLifted = avgMetrics.liftedHipAngle < 160;
    
    if (!legActuallyLifted) {
        return { stanceKnee: Math.round(avgMetrics.stanceKnee), liftedKnee: Math.round(avgMetrics.liftedKnee),
            liftedHipAngle: Math.round(avgMetrics.liftedHipAngle), torsoDeviation: Math.round(avgMetrics.torsoDeviation),
            sway: Math.round(avgMetrics.sway * 1000) / 1000, holdTime, formScore: 0, finalScore: 0,
            stanceLeg: stanceLegToUse, isValid: false };
    }
    
    const stanceKneeQuality = clamp((avgMetrics.stanceKnee - 140) / 30, 0, 1);
    const torsoQuality = clamp((30 - avgMetrics.torsoDeviation) / 30, 0, 1);
    const swayQuality = clamp((0.2 - avgMetrics.sway) / 0.2, 0, 1);
    
    // Hip Angle Quality: Lower hip angle = higher thigh lift = better
    // 90° = thigh parallel to ground (excellent), 60° = very high lift (perfect)
    // 120° = minimal lift (poor), 160° = barely lifted (fail)
    let hipAngleQuality;
    if (avgMetrics.liftedHipAngle <= 70) {
        // Excellent - very high thigh lift
        hipAngleQuality = 1.0;
    } else if (avgMetrics.liftedHipAngle <= 90) {
        // Very good - thigh at or above parallel
        hipAngleQuality = 1.0 - (avgMetrics.liftedHipAngle - 70) / 80;  // 1.0 to 0.75
    } else if (avgMetrics.liftedHipAngle <= 110) {
        // Good - moderate lift
        hipAngleQuality = 0.75 - (avgMetrics.liftedHipAngle - 90) / 80;  // 0.75 to 0.5
    } else if (avgMetrics.liftedHipAngle <= 140) {
        // Fair - low lift
        hipAngleQuality = 0.5 - (avgMetrics.liftedHipAngle - 110) / 60;  // 0.5 to 0
    } else {
        hipAngleQuality = 0;
    }
    hipAngleQuality = clamp(hipAngleQuality, 0, 1);
    
    // Lifted Knee Quality: ~90° bent is ideal for balance
    // Allow range 70-110° as good
    let liftedKneeQuality;
    if (avgMetrics.liftedKnee >= 70 && avgMetrics.liftedKnee <= 110) {
        // Good range
        liftedKneeQuality = 1.0 - Math.abs(avgMetrics.liftedKnee - 90) / 40;
    } else if (avgMetrics.liftedKnee < 70) {
        liftedKneeQuality = clamp(avgMetrics.liftedKnee / 70, 0, 0.75);
    } else {
        liftedKneeQuality = clamp((180 - avgMetrics.liftedKnee) / 70, 0, 0.75);
    }
    liftedKneeQuality = clamp(liftedKneeQuality, 0, 1);

    const formScore = Math.round(clamp(
        stanceKneeQuality * 0.15 + torsoQuality * 0.10 + swayQuality * 0.05 +
        hipAngleQuality * 0.45 + liftedKneeQuality * 0.25, 0, 1) * 100);
    
    // Calculate final score with hold time component
    // Hold time matters significantly - need 5+ seconds for valid test
    const liftQualityTotal = hipAngleQuality + liftedKneeQuality;
    let finalScore;
    
    if (liftQualityTotal === 0) {
        finalScore = 0;
    } else if (!isValid) {
        // Did not meet minimum 5 second hold - significant penalty
        // Score capped at 50% max for invalid holds
        const holdPenalty = holdTimeSeconds / MIN_VALID_HOLD_SECONDS; // 0 to 1
        finalScore = Math.round(formScore * holdPenalty * 0.5);
    } else {
        // Valid hold (5+ seconds) - full scoring
        // 20% hold time bonus (up to 10 seconds), 80% form
        const holdBonus = Math.min(1, holdTimeSeconds / 10) * 100 * 0.2;
        finalScore = Math.round(holdBonus + formScore * 0.8);
    }
    
    return {
        stanceKnee: Math.round(avgMetrics.stanceKnee), liftedKnee: Math.round(avgMetrics.liftedKnee),
        liftedHipAngle: Math.round(avgMetrics.liftedHipAngle), torsoDeviation: Math.round(avgMetrics.torsoDeviation),
        sway: Math.round(avgMetrics.sway * 1000) / 1000, holdTime, formScore: Math.round(formScore),
        finalScore, stanceLeg: stanceLegToUse, isValid
    };
}

export function tPoseBalanceFinalScore(result) {
    return result?.finalScore || 0;
}

export function resetTPoseBalanceState() {
    singleLegStanceState = {
        testStart: null, 
        currentHoldMetrics: [], 
        bestHoldMetrics: [], 
        currentHoldMs: 0, 
        bestHoldMs: 0,
        stanceLeg: null, 
        bestStanceLeg: null,
        pendingStance: null, 
        pendingMs: 0, 
        lastTimestamp: null, 
        feedbackCooldownMs: 0
    };
}
