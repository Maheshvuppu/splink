/* ============================================================
   FORWARD BEND SCORING LOGIC - 1 METER DISTANCE
   
   Contains:
   - 1m-specific forward bend scoring
   - Hip-thoracic ratio calculation
   - Form quality assessment for 1m
============================================================ */

// Forward Bend State
let forwardBendState = {
    testStart: null,
    bestAttempt: {
        wristY: -1,
        holdMs: 0,
        metrics: null
    },
    bestFrameIndex: 0,
    currentHoldMs: 0,
    lastSampleTime: null,
    isValid: false,
    graceMsRemaining: 0,
    positionWarned: false,
    needsGoCommand: false,
    instructionSpoken: false
};

const FORWARD_BEND_WINDOW = 9000;
const HOLD_REQUIRED_MS = 1000;
const HOLD_GRACE_MS = 500; // More lenient for 1m

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

const scale01 = (value, min, max) => {
    if (max === min) return 0;
    return clamp((value - min) / (max - min), 0, 1);
};

export function startForwardBendTest() {
    forwardBendState.testStart = performance.now();
    forwardBendState.bestAttempt = { wristY: -1, holdMs: 0, metrics: null, frame: null };
    forwardBendState.bestFrameIndex = 0;
    forwardBendState.currentHoldMs = 0;
    forwardBendState.lastSampleTime = forwardBendState.testStart;
    forwardBendState.isValid = false;
    forwardBendState.graceMsRemaining = 0;
    forwardBendState.positionWarned = false;
    forwardBendState.needsGoCommand = false;
    forwardBendState.instructionSpoken = false;
}

export function updateForwardBend(lm, onRepSpeak, onTestFinish, inCorrectPosition = true, exercise = 'forward-bend', captureFrame = null) {
    if (!forwardBendState.testStart) return;

    if (!inCorrectPosition) {
        return;
    }

    const now = performance.now();
    const elapsed = now - forwardBendState.testStart;
    const delta = forwardBendState.lastSampleTime ? now - forwardBendState.lastSampleTime : 0;
    forwardBendState.lastSampleTime = now;

    if (elapsed > FORWARD_BEND_WINDOW) {
        if (onTestFinish) {
            onTestFinish();
        }
        return;
    }

    const metrics = calculateForwardBendMetrics(lm);
    const wristY = (lm[15].y + lm[16].y) / 2;
    const ankleY = (lm[27].y + lm[28].y) / 2;
    const standingHeight = Math.abs(ankleY - lm[0].y);
    const depthTolerance = Math.max(0.02, (standingHeight || 1) * 0.06);
    const settleTolerance = depthTolerance * 1.5; // More lenient settle tolerance

    // Check if user is in a bent position (hip angle < 160 means they're bending)
    const isBending = metrics.hipAngle < 160;
    
    if (isBending) {
        // Always count hold time while user is in a bent position
        forwardBendState.currentHoldMs += delta;
        forwardBendState.graceMsRemaining = HOLD_GRACE_MS;
        
        // Update best attempt if this is deeper or first bend
        if (wristY > forwardBendState.bestAttempt.wristY + 0.01 || forwardBendState.bestAttempt.wristY === -1) {
            forwardBendState.bestAttempt.wristY = wristY;
            forwardBendState.bestAttempt.metrics = metrics;
            if (typeof captureFrame === 'function') {
                try {
                    forwardBendState.bestFrameIndex += 1;
                    forwardBendState.bestAttempt.frame = captureFrame({ exercise, kind: 'best', index: forwardBendState.bestFrameIndex });
                } catch (e) {}
            }
        }
        
        // Update hold time in best attempt
        if (forwardBendState.currentHoldMs > forwardBendState.bestAttempt.holdMs) {
            forwardBendState.bestAttempt.holdMs = forwardBendState.currentHoldMs;
            // Keep the best metrics (deepest bend)
        }

        if (forwardBendState.currentHoldMs >= HOLD_REQUIRED_MS) {
            forwardBendState.isValid = true;
        }
    } else {
        // User is not bending - use grace period
        forwardBendState.graceMsRemaining = Math.max(0, forwardBendState.graceMsRemaining - delta);
        if (forwardBendState.graceMsRemaining === 0) {
            forwardBendState.currentHoldMs = 0;
        }
    }
}

function calculateForwardBendMetrics(lm) {
    const shoulderMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
    const hipMid = { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 };
    const kneeMid = { x: (lm[25].x + lm[26].x) / 2, y: (lm[25].y + lm[26].y) / 2 };
    const ankleMid = { x: (lm[27].x + lm[28].x) / 2, y: (lm[27].y + lm[28].y) / 2 };

    // Hip Angle: angle at hip between torso and thigh (shoulder-hip-knee)
    // Standing = ~180°, Full bend = ~45-90°
    const hipAngleL = angleBetweenPoints(lm[11], lm[23], lm[25]);
    const hipAngleR = angleBetweenPoints(lm[12], lm[24], lm[26]);
    const hipAngle = (hipAngleL + hipAngleR) / 2;

    const hipFlexion = angleBetweenPoints(shoulderMid, hipMid, kneeMid);
    const thoracicFlexion = angleBetweenPoints(shoulderMid, hipMid, ankleMid);
    const htRatio = thoracicFlexion > 0 ? hipFlexion / thoracicFlexion : 0;

    const kneeAngleL = angleBetweenPoints(lm[23], lm[25], lm[27]);
    const kneeAngleR = angleBetweenPoints(lm[24], lm[26], lm[28]);
    const kneeAngle = Math.min(kneeAngleL, kneeAngleR);
    const kneeBend = 180 - kneeAngle;

    const wristY = (lm[15].y + lm[16].y) / 2;
    const ankleY = (lm[27].y + lm[28].y) / 2;
    const noseY = lm[0].y;
    const standingHeight = Math.abs(ankleY - noseY);
    const reachDistance = standingHeight > 0 ? Math.abs(wristY - ankleY) / standingHeight : 1;

    const hipX = (lm[23].x + lm[24].x) / 2;
    const ankleX = (lm[27].x + lm[28].x) / 2;
    const legLength = Math.abs(hipMid.y - ankleMid.y);
    const swayNorm = legLength > 0 ? Math.abs(hipX - ankleX) / legLength : 0;

    return {
        hipAngle,
        htRatio,
        kneeBend,
        reachDistance,
        sway: swayNorm,
        hipFlexion,
        thoracicFlexion
    };
}

function angleBetweenPoints(A, B, C) {
    const v1 = { x: A.x - B.x, y: A.y - B.y };
    const v2 = { x: C.x - B.x, y: C.y - B.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
    const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
    if (m1 === 0 || m2 === 0) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (m1 * m2)));
    return Math.acos(cosAngle) * 180 / Math.PI;
}

export function forwardBendFormScore(metrics) {
    if (!metrics) return 0;

    const hipAngle = metrics.hipAngle ?? 180;
    const kneeBend = metrics.kneeBend ?? 0;
    const sway = metrics.sway ?? 0;
    
    // Hip angle is the PRIMARY metric for forward bend
    // Standing upright = ~180°, Good bend = ~90°, Excellent bend = ~45-70°
    
    // If hip angle > 160°, user is barely bending - reject
    if (hipAngle > 160) {
        return 0;
    }

    let score = 10;

    // Hip Angle Scoring - STRICT penalties for minimal bending
    // Lower angle = deeper bend = better score
    if (hipAngle <= 70) {
        // Excellent - deep forward bend (touching toes or below)
        score -= 0;
    } else if (hipAngle <= 90) {
        // Very good - torso nearly parallel to ground
        score -= scale01(hipAngle - 70, 0, 20) * 1.0;
    } else if (hipAngle <= 110) {
        // Good - significant bend
        score -= 1.0 + scale01(hipAngle - 90, 0, 20) * 1.5;
    } else if (hipAngle <= 130) {
        // Fair - moderate bend
        score -= 2.5 + scale01(hipAngle - 110, 0, 20) * 2.5;
    } else if (hipAngle <= 150) {
        // Poor - minimal bend
        score -= 5.0 + scale01(hipAngle - 130, 0, 20) * 3.0;
    } else {
        // Very poor - barely bending (150-160°)
        score -= 8.0 + scale01(hipAngle - 150, 0, 10) * 1.5;
    }

    // Knee bend penalty (0-2 points deduction)
    // Keep knees relatively straight for proper forward bend
    if (kneeBend <= 15) {
        // Great - knees straight
        score -= 0;
    } else if (kneeBend <= 30) {
        // Acceptable knee bend
        score -= scale01(kneeBend, 15, 30) * 1.0;
    } else {
        // Too much knee bend
        score -= 1.0 + scale01(kneeBend - 30, 0, 30) * 1.0;
    }

    // Sway penalty (0-0.5 points deduction)
    score -= scale01(sway, 0.08, 0.35) * 0.5;

    // Bonus for excellent form
    if (hipAngle < 60) score += 0.5;
    if (kneeBend < 10) score += 0.5;

    return clamp(score, 0, 10);
}

export function forwardBendFinalScore(result) {
    if (!result || !result.isValid) {
        return 0;
    }

    const hipAngle = result.hipAngle ?? 180;
    
    // MINIMUM BEND REQUIREMENT using hip angle
    // Hip angle > 160° means user is standing almost straight - not a valid bend
    if (hipAngle > 160) {
        return 0;
    }

    const holdMs = result.holdMs ?? ((result.holdFrames ?? 0) / 30) * 1000;
    const holdQuality = Math.min(1, holdMs / HOLD_REQUIRED_MS);
    const completion = holdQuality * 15;
    const form = clamp(result.form ?? 0, 0, 1) * 85;

    return Math.round(completion + form);
}

export function finishForwardBendTest() {
    const metrics = forwardBendState.bestAttempt.metrics;
    
    if (!metrics) {
        return null;
    }
    
    const formScore = forwardBendFormScore(metrics);
    
    const result = { 
        ...metrics, 
        isValid: forwardBendState.isValid,
        holdFrames: Math.round((forwardBendState.bestAttempt.holdMs / 1000) * 30),
        holdMs: forwardBendState.bestAttempt.holdMs,
        form: formScore / 10,
        frame: forwardBendState.bestAttempt.frame || null
    };
    
    return result;
}

export function getForwardBendState() {
    return forwardBendState;
}

export function resetForwardBendState() {
    forwardBendState = {
        testStart: null,
        bestAttempt: { wristY: -1, holdMs: 0, metrics: null, frame: null },
        currentHoldMs: 0,
        lastSampleTime: null,
        isValid: false,
        graceMsRemaining: 0
    };
}
