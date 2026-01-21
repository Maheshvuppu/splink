/* ============================================================
   SQUAT SCORING LOGIC - 1 METER DISTANCE
   
   Contains:
   - 1m-specific squat rep counting logic
   - 1m-specific scoring algorithms
   - Progressive heel lift detection for 1m
   - Knee angle tracking with percentile filtering
============================================================ */

import { squatState1m, hipDepth1m, symmetry, heelLift } from './squat-pose-detection-1meter.js';

// State
let repState = "UP";
let repCount = 0;
let kneeMin = 999;
let hipMin = 999;
let heelLifted = false;
let heelSeverityMax = 0;

// 1m-only knee tracking to avoid single-frame angle glitches (percentile-based min)
let kneeAngles1m = [];

function resetKnee1mTracking() {
    kneeAngles1m = [];
}

function percentile(values, p) {
    if (!values || values.length === 0) return 999;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
}

function robustKneeMin1m() {
    // Use ~15th percentile to ignore rare low spikes at 1m.
    if (kneeAngles1m.length < 7) {
        return kneeAngles1m.reduce((m, v) => Math.min(m, v), 999);
    }
    return percentile(kneeAngles1m, 0.15);
}

// 1m-only heel tracking (isolated from 2m logic)
let heel1mConsecutive = 0;
let heel1mMaxSeverity = 0;
let heel1mBaseline = {
    leftDiff: null,
    rightDiff: null,
    leftToeGroundY: null,
    rightToeGroundY: null
};

function resetHeel1mTracking(keepBaseline = false) {
    heel1mConsecutive = 0;
    heel1mMaxSeverity = 0;
    if (!keepBaseline) {
        heel1mBaseline = {
            leftDiff: null,
            rightDiff: null,
            leftToeGroundY: null,
            rightToeGroundY: null
        };
    }
}

export function warmupHeelBaselineBeforeGo(lm) {
    try {
        heelLift1m(lm, { state: 'UP' });
    } catch (e) {
        // Ignore warmup errors
    }
}

function ema(prev, next, alpha) {
    if (prev === null || prev === undefined) return next;
    return prev + (next - prev) * alpha;
}

function updateToeGroundBaseline(prevGroundY, toeY) {
    if (prevGroundY === null || prevGroundY === undefined) return toeY;
    const decayed = prevGroundY - 0.0005;
    return Math.max(decayed, toeY);
}

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

function heelLift1m(lm, st) {
    const L = { knee: 25, ankle: 27, heel: 29, toe: 31 };
    const R = { knee: 26, ankle: 28, heel: 30, toe: 32 };

    const vis = (p) => (p && (p.visibility ?? 1));
    const visibleEnough = (a, b, c, thr) => vis(a) >= thr && vis(b) >= thr && vis(c) >= thr;

    const compute = (idx, sideKey) => {
        const knee = lm[idx.knee];
        const ankle = lm[idx.ankle];
        const heel = lm[idx.heel];
        const toe = lm[idx.toe];
        if (!knee || !ankle || !heel || !toe) return null;

        if (!visibleEnough(ankle, heel, toe, 0.45) || vis(knee) < 0.35) return null;

        const shin = Math.abs(knee.y - ankle.y);
        if (!Number.isFinite(shin) || shin < 0.05) return null;

        const toeY = toe.y;
        const heelY = heel.y;
        const diff = toeY - heelY;

        if (st.state === 'UP') {
            heel1mBaseline[`${sideKey}Diff`] = ema(heel1mBaseline[`${sideKey}Diff`], diff, 0.12);
            heel1mBaseline[`${sideKey}ToeGroundY`] = updateToeGroundBaseline(
                heel1mBaseline[`${sideKey}ToeGroundY`],
                toeY
            );
        }

        const baseDiff = heel1mBaseline[`${sideKey}Diff`];
        const baseToeGroundY = heel1mBaseline[`${sideKey}ToeGroundY`];
        const refToeGroundY = (baseToeGroundY === null || baseToeGroundY === undefined)
            ? Math.max(toeY, heelY)
            : baseToeGroundY;

        const toeOnGround = toeY >= (refToeGroundY - (0.15 * shin));
        const deltaFromBase = (baseDiff === null || baseDiff === undefined) ? diff : (diff - baseDiff);
        // Increased thresholds to reduce false positives
        const lift = toeOnGround && deltaFromBase > (0.18 * shin) && diff > (0.20 * shin);

        const liftNorm = toeOnGround ? Math.max(0, deltaFromBase / shin) : 0;
        // Higher threshold for severity
        const severity = clamp((liftNorm - 0.15) / (0.35 - 0.15), 0, 1);

        return { lift, severity };
    };

    if (st.state === 'UP') {
        compute(L, 'left');
        compute(R, 'right');
        heel1mConsecutive = 0;
        heel1mMaxSeverity = 0;
        return { liftConfirmed: false, severityMax: 0 };
    }

    if (st.state !== 'DOWN' && st.state !== 'MID') {
        heel1mConsecutive = 0;
        heel1mMaxSeverity = 0;
        return { liftConfirmed: false, severityMax: 0 };
    }

    const l = compute(L, 'left');
    const r = compute(R, 'right');
    const liftThisFrame = Boolean((l && l.lift) || (r && r.lift));
    const severityThisFrame = Math.max(l?.severity ?? 0, r?.severity ?? 0);
    heel1mMaxSeverity = Math.max(heel1mMaxSeverity, severityThisFrame);

    if (liftThisFrame) {
        heel1mConsecutive++;
    } else {
        heel1mConsecutive = Math.max(0, heel1mConsecutive - 1);
    }

    return { liftConfirmed: heel1mConsecutive >= 3, severityMax: heel1mMaxSeverity };
}

let repData = [];
let testStart = null;
let finishing = false;

let currentRepBestFrame = null;
let lastDownCaptureAtMs = 0;
let lastCapturedKneeMin = 999;
let lastCapturedHipMin = 999;

const TEST_WINDOW = 12000;

const lerp01 = (a, b, x) => {
    if (b === a) return 0;
    return clamp((x - a) / (b - a), 0, 1);
};

// Detect staggered stance: one leg forward, one leg backward (lunge-like position)
// When user faces sideways to camera, forward/back leg difference shows as X-coordinate difference
function detectStaggeredStance(lm) {
    if (!lm || lm.length < 33) return { staggered: false, severity: 0 };
    
    // Landmark indices
    const leftHip = lm[23];
    const rightHip = lm[24];
    const leftAnkle = lm[27];
    const rightAnkle = lm[28];
    const leftKnee = lm[25];
    const rightKnee = lm[26];
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    
    if (!leftHip || !rightHip || !leftAnkle || !rightAnkle || !leftKnee || !rightKnee) {
        return { staggered: false, severity: 0 };
    }
    
    // Check visibility - require good visibility
    const vis = (p) => (p && (p.visibility ?? 1));
    if (vis(leftAnkle) < 0.4 || vis(rightAnkle) < 0.4 || vis(leftKnee) < 0.4 || vis(rightKnee) < 0.4) {
        return { staggered: false, severity: 0 };
    }
    
    // Calculate torso height for normalization
    let torsoHeight = 0.3;
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipY = (leftHip.y + rightHip.y) / 2;
        torsoHeight = Math.abs(hipY - shoulderY);
        if (torsoHeight < 0.1) torsoHeight = 0.3;
    }
    
    // CHECK 1: X-coordinate difference between ankles (horizontal spread when sideways)
    // When one foot is forward and one is back, they appear at different X positions
    const ankleXDiff = Math.abs(leftAnkle.x - rightAnkle.x);
    const ankleXThreshold = torsoHeight * 0.25; // 25% of torso height horizontal spread
    
    // CHECK 2: X-coordinate difference between knees
    const kneeXDiff = Math.abs(leftKnee.x - rightKnee.x);
    const kneeXThreshold = torsoHeight * 0.20; // 20% of torso height
    
    // CHECK 3: Y-coordinate difference (one knee/ankle lower than other)
    const kneeYDiff = Math.abs(leftKnee.y - rightKnee.y);
    const ankleYDiff = Math.abs(leftAnkle.y - rightAnkle.y);
    const yThreshold = torsoHeight * 0.15;
    
    // Staggered if: significant X spread AND some Y difference
    // OR very large X spread alone (clear lunge position)
    const hasXSpread = ankleXDiff > ankleXThreshold && kneeXDiff > kneeXThreshold;
    const hasYDiff = kneeYDiff > yThreshold || ankleYDiff > yThreshold;
    const hasLargeXSpread = ankleXDiff > (torsoHeight * 0.40); // Very obvious spread
    
    const isStaggered = (hasXSpread && hasYDiff) || hasLargeXSpread;
    
    // Calculate severity
    let severity = 0;
    if (isStaggered) {
        // Higher spread = higher severity
        const xSeverity = clamp((ankleXDiff - ankleXThreshold) / (torsoHeight * 0.3), 0, 1);
        const ySeverity = clamp(Math.max(kneeYDiff, ankleYDiff) / (torsoHeight * 0.3), 0, 1);
        severity = clamp(Math.max(xSeverity, ySeverity) * 0.5 + 0.5, 0.5, 1);
    }
    
    return { staggered: isStaggered, severity: severity };
}

// Track staggered stance across frames for the current rep
let staggeredFrameCount = 0;
let staggeredMaxSeverity = 0;
let staggeredDetectedForRep = false;

function resetStaggeredTracking() {
    staggeredFrameCount = 0;
    staggeredMaxSeverity = 0;
    staggeredDetectedForRep = false;
}

function updateStaggeredTracking(lm) {
    const result = detectStaggeredStance(lm);
    if (result.staggered) {
        staggeredFrameCount++;
        staggeredMaxSeverity = Math.max(staggeredMaxSeverity, result.severity);
        // Confirm staggered stance after 3+ consecutive frames
        if (staggeredFrameCount >= 3) {
            staggeredDetectedForRep = true;
        }
    } else {
        staggeredFrameCount = Math.max(0, staggeredFrameCount - 1);
    }
    return { detected: staggeredDetectedForRep, severity: staggeredMaxSeverity };
}

// Calculate shoulder angle (angle between torso and upper arm)
// Returns the average of left and right shoulder angles
function calculateShoulderAngle(lm) {
    if (!lm || lm.length < 17) return null;
    
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftElbow = lm[13];
    const rightElbow = lm[14];
    const leftHip = lm[23];
    const rightHip = lm[24];
    
    const vis = (p) => (p && (p.visibility ?? 1));
    
    // Calculate angle between two vectors
    const angleBetween = (v1, v2) => {
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag1 < 0.001 || mag2 < 0.001) return null;
        const cosAngle = clamp(dot / (mag1 * mag2), -1, 1);
        return Math.acos(cosAngle) * (180 / Math.PI);
    };
    
    let angles = [];
    
    // Left shoulder angle
    if (leftShoulder && leftElbow && leftHip && vis(leftShoulder) > 0.4 && vis(leftElbow) > 0.4 && vis(leftHip) > 0.4) {
        const torsoVec = { x: leftHip.x - leftShoulder.x, y: leftHip.y - leftShoulder.y };
        const armVec = { x: leftElbow.x - leftShoulder.x, y: leftElbow.y - leftShoulder.y };
        const angle = angleBetween(torsoVec, armVec);
        if (angle !== null) angles.push(angle);
    }
    
    // Right shoulder angle
    if (rightShoulder && rightElbow && rightHip && vis(rightShoulder) > 0.4 && vis(rightElbow) > 0.4 && vis(rightHip) > 0.4) {
        const torsoVec = { x: rightHip.x - rightShoulder.x, y: rightHip.y - rightShoulder.y };
        const armVec = { x: rightElbow.x - rightShoulder.x, y: rightElbow.y - rightShoulder.y };
        const angle = angleBetween(torsoVec, armVec);
        if (angle !== null) angles.push(angle);
    }
    
    if (angles.length === 0) return null;
    return angles.reduce((a, b) => a + b, 0) / angles.length;
}

// Track minimum shoulder angle during the rep (lowest = arms most down)
let minShoulderAngle = 999;

function resetShoulderAngleTracking() {
    minShoulderAngle = 999;
}

function updateShoulderAngleTracking(lm) {
    const angle = calculateShoulderAngle(lm);
    if (angle !== null && angle < minShoulderAngle) {
        minShoulderAngle = angle;
    }
    return minShoulderAngle;
}

function formScore1mProgressive(r) {
    const knee = Number.isFinite(r.kneeMin) ? r.kneeMin : 999;
    const hip = Number.isFinite(r.hipDepth) ? r.hipDepth : 1;
    const sym = Number.isFinite(r.sym) ? r.sym : 1;

    const peakQ = (x, leftZero, peak, rightZero) => {
        if (!Number.isFinite(x)) return 0;
        if (x <= leftZero || x >= rightZero) return 0;
        if (x === peak) return 1;
        if (x < peak) return clamp((x - leftZero) / (peak - leftZero), 0, 1);
        return clamp((rightZero - x) / (rightZero - peak), 0, 1);
    };

    // Knee scoring: progressive - deeper is better
    // 130° (too shallow) = 0%
    // 90° (parallel) = ~47%
    // 70° (below parallel) = ~71%
    // 45° (deep/ATG) = 100%
    // Each degree deeper adds ~1.18%
    const kneeQ = knee >= 130 ? 0 : (knee <= 45 ? 1 : clamp((130 - knee) / (130 - 45), 0, 1));
    
    // Hip depth scoring: threshold-based
    // 0.00-0.09 = 100%
    // > 0.09 = 0%
    const hipQ = hip <= 0.09 ? 1 : 0;
    
    // Symmetry scoring: more forgiving threshold for lean detection
    // 0.00 = 100% (perfect alignment)
    // 0.25 or higher = 0% (significant lean)
    const symQ = 1 - lerp01(0.00, 0.25, sym);

    const heelSeverity = Number.isFinite(r.heelSeverity) ? clamp(r.heelSeverity, 0, 1) : (r.heel ? 1 : 0);
    const heelQ = 1 - heelSeverity;

    let formScore = clamp((kneeQ + hipQ + symQ + heelQ) / 4, 0, 1);
    
    // Additional penalty: if both knee and hip are too shallow, reduce score heavily
    const kneeTooShallow = knee >= 100;
    const hipTooShallow = hip > 0.09;
    if (kneeTooShallow && hipTooShallow) {
        formScore = formScore * 0.25;
    }
    
    // Staggered stance penalty: one leg forward, one backward - cap score to 20-30%
    if (r.staggeredStance && r.staggeredSeverity > 0) {
        // Reduce form score to 20-30% range based on severity
        // Higher severity = closer to 20%, lower severity = closer to 30%
        const maxAllowed = 0.30 - (r.staggeredSeverity * 0.10); // 0.30 to 0.20
        formScore = Math.min(formScore, maxAllowed);
    }
    
    return formScore;
}

export function startTest() {
    if (testStart) return;
    testStart = performance.now();
    repCount = 0;
    repData = [];
    repState = "UP";
    kneeMin = 999;
    hipMin = 999;
    heelLifted = false;
    heelSeverityMax = 0;
    resetKnee1mTracking();
    resetHeel1mTracking(false);
    resetStaggeredTracking();
    resetShoulderAngleTracking();

    currentRepBestFrame = null;
    lastDownCaptureAtMs = 0;
    lastCapturedKneeMin = 999;
    lastCapturedHipMin = 999;
}

export function updateReps(lm, onRepSpeak, onTestFinish, inCorrectPosition = true, exercise = 'squat', captureFrame = null) {
    if (!testStart) return;

    const now = performance.now();
    const repIndex = repCount + 1;

    if (!inCorrectPosition && exercise !== 'high-knee') {
        return;
    }
    
    if (now - testStart > TEST_WINDOW) {
        finishTest(onTestFinish);
        return;
    }

    const st = squatState1m(lm);
    if (!st.valid) {
        return;
    }

    const depth = hipDepth1m(lm);

    if (Number.isFinite(st.ang) && st.ang > 0 && st.ang < 999) {
        if (st.state === 'DOWN' || st.state === 'MID') {
            kneeAngles1m.push(st.ang);
        }
    }
    const kMin = robustKneeMin1m();
    if (kMin < kneeMin) kneeMin = kMin;
    if (depth < hipMin) hipMin = depth;

    if (st.state === "DOWN" || st.state === "MID") {
        const heelInfo = heelLift1m(lm, st);
        if (heelInfo && heelInfo.liftConfirmed) {
            heelLifted = true;
        }
        if (heelInfo && Number.isFinite(heelInfo.severityMax)) {
            heelSeverityMax = Math.max(heelSeverityMax, heelInfo.severityMax);
        }
        // Track staggered stance (one leg forward, one backward)
        updateStaggeredTracking(lm);
        // Track shoulder angle (arms position)
        updateShoulderAngleTracking(lm);
    }

    if (repState === "UP") {
        if (st.state === "DOWN") {
            repState = "DOWN";

            currentRepBestFrame = null;
            lastDownCaptureAtMs = 0;
            lastCapturedKneeMin = 999;
            lastCapturedHipMin = 999;

            resetHeel1mTracking(true);
            resetKnee1mTracking();
            heelSeverityMax = 0;
        }
    } else if (repState === "DOWN") {
        if ((st.state === 'DOWN' || st.state === 'MID') && typeof captureFrame === 'function') {
            const kneeImproved = kneeMin < (lastCapturedKneeMin - 1.0);
            const hipImproved = hipMin < (lastCapturedHipMin - 0.003);
            const throttledOk = (now - lastDownCaptureAtMs) > 150;

            if ((kneeImproved || hipImproved) && throttledOk) {
                try {
                    currentRepBestFrame = captureFrame({
                        exercise,
                        kind: 'rep-down',
                        index: repIndex,
                        stableName: true
                    });
                    lastDownCaptureAtMs = now;
                    lastCapturedKneeMin = kneeMin;
                    lastCapturedHipMin = hipMin;
                } catch (e) {
                    // Ignore capture failures
                }
            }
        }

        if (st.state === "UP") {
            repCount++;

            const sym = symmetry(lm);
            const repKneeMin = robustKneeMin1m();

            const rep = {
                kneeMin: repKneeMin,
                hipDepth: hipMin,
                sym: sym,
                heel: heelLifted,
                heelSeverity: heelSeverityMax,
                staggeredStance: staggeredDetectedForRep,
                staggeredSeverity: staggeredMaxSeverity,
                shoulderAngle: minShoulderAngle < 999 ? Math.round(minShoulderAngle * 10) / 10 : null,
                frame: currentRepBestFrame,
                distanceMode: '1m'
            };

            rep.form = formScore1mProgressive(rep);
            
            repData.push(rep);

            if (onRepSpeak) onRepSpeak("Rep " + repCount);

            kneeMin = 999;
            hipMin = 999;
            heelLifted = false;
            heelSeverityMax = 0;
            repState = "UP";

            resetHeel1mTracking(true);
            resetKnee1mTracking();
            heelSeverityMax = 0;
            resetStaggeredTracking();
            resetShoulderAngleTracking();

            currentRepBestFrame = null;
            lastDownCaptureAtMs = 0;
            lastCapturedKneeMin = 999;
            lastCapturedHipMin = 999;

            if (repCount >= 5) {
                finishTest(onTestFinish);
            }
        }
    }
}

export function finalScore() {
    if (repData.length === 0) return 0;
    
    // Count how many reps are too shallow (both knee >= 130 AND hip > 0.09)
    const shallowReps = repData.filter(r => {
        const knee = Number.isFinite(r.kneeMin) ? r.kneeMin : 999;
        const hip = Number.isFinite(r.hipDepth) ? r.hipDepth : 1;
        return knee >= 130 && hip > 0.09;
    }).length;
    
    // Reduce completion score proportionally based on shallow reps
    // Each shallow rep reduces completion by 50% of its share
    const baseComp = (repData.length / 5) * 30;
    const shallowPenalty = (shallowReps / 5) * 30 * 0.5;
    const comp = baseComp - shallowPenalty;
    
    let formSum = repData.reduce((a, b) => a + b.form, 0);
    const avgF = formSum / 5;
    const form = avgF * 70;
    
    const total = comp + form;
    return Math.round(total * 100) / 100;
}

export function finishTest(onFinish) {
    if (finishing) return;
    finishing = true;
    testStart = null;

    if (onFinish) {
        onFinish(finalScore(), repData);
    }
    finishing = false;
}

export function resetTestState() {
    testStart = null;
    repCount = 0;
    repData = [];
    repState = "UP";
    kneeMin = 999;
    hipMin = 999;
    finishing = false;
    resetKnee1mTracking();
    resetHeel1mTracking(false);
    resetStaggeredTracking();
    resetShoulderAngleTracking();
}

export function stopTest() {
    testStart = null;
    repCount = 0;
    repData = [];
    repState = "UP";
    kneeMin = 999;
    hipMin = 999;
    heelLifted = false;
    finishing = false;
    resetKnee1mTracking();
    resetHeel1mTracking(false);
    resetStaggeredTracking();
    resetShoulderAngleTracking();
}

export function getRepData() {
    return repData;
}

export function getTestState() {
    return { testStart, repCount, repData, repState };
}

export function getIsFinishing() {
    return finishing;
}

export function setFinishing(val) {
    finishing = val;
}
