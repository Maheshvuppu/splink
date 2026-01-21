/* ============================================================
   HIGH KNEE MARCH SCORING LOGIC - 1 METER DISTANCE
   
   Contains:
   - 1m-specific high knee rep counting
   - Hysteresis-based detection
   - Progressive scoring
============================================================ */

let highKneeMarchState = {
    testStart: null,
    repCount: 0,
    lastLiftedLeg: null,
    lastCountAtMs: 0,
    leftUp: false,
    rightUp: false,
    metricsHistory: [],
    leftKneeMin: 999,
    rightKneeMin: 999,
    positionWarned: false
};

const HIGH_KNEE_TEST_WINDOW = 10000;

function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

const scale01 = (value, min, max) => {
    if (max === min) return 0;
    return clamp((value - min) / (max - min), 0, 1);
};

function angle(A, B, C) {
    if (!A || !B || !C) return 0;
    const v1 = { x: A.x - B.x, y: A.y - B.y };
    const v2 = { x: C.x - B.x, y: C.y - B.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
    const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
    if (m1 === 0 || m2 === 0) return 999;
    let c = dot / (m1 * m2);
    c = Math.min(1, Math.max(-1, c));
    return Math.acos(c) * 180 / Math.PI;
}

export function startHighKneeMarchTest() {
    highKneeMarchState = {
        testStart: performance.now(),
        repCount: 0,
        lastLiftedLeg: null,
        lastCountAtMs: 0,
        leftUp: false,
        rightUp: false,
        metricsHistory: [],
        leftKneeMin: 999,
        rightKneeMin: 999,
        positionWarned: false
    };
}

export function updateHighKneeMarch(lm, onRepSpeak, onTestFinish, inCorrectPosition = true, exercise = 'high-knee', captureFrame = null) {
    if (!highKneeMarchState.testStart) return;

    if (!inCorrectPosition) {
        if (!highKneeMarchState.positionWarned) {
            highKneeMarchState.positionWarned = true;
        }
        highKneeMarchState.testStart = null;
        highKneeMarchState.repCount = 0;
        highKneeMarchState.lastLiftedLeg = null;
        highKneeMarchState.metricsHistory = [];
        highKneeMarchState.leftKneeMin = 999;
        highKneeMarchState.rightKneeMin = 999;
        return;
    } else {
        highKneeMarchState.positionWarned = false;
    }

    const now = performance.now();
    const elapsed = now - highKneeMarchState.testStart;

    if (elapsed > HIGH_KNEE_TEST_WINDOW) {
        if (onTestFinish) {
            onTestFinish();
        }
        return;
    }

    const leftKneeY = lm[25].y;
    const rightKneeY = lm[26].y;
    const leftHipY = lm[23].y;
    const rightHipY = lm[24].y;
    const leftAnkleY = lm[27].y;
    const rightAnkleY = lm[28].y;

    const leftLiftHeight = leftHipY - leftKneeY;
    const rightLiftHeight = rightHipY - rightKneeY;

    const leftLegLength = Math.max(0.001, Math.abs(leftAnkleY - leftHipY));
    const rightLegLength = Math.max(0.001, Math.abs(rightAnkleY - rightHipY));
    const leftLiftNorm = leftLiftHeight / leftLegLength;
    const rightLiftNorm = rightLiftHeight / rightLegLength;

    const leftKneeAngleVal = angle(lm[23], lm[25], lm[27]);
    const rightKneeAngleVal = angle(lm[24], lm[26], lm[28]);
    const leftKneeBend = Math.max(0, 180 - leftKneeAngleVal);
    const rightKneeBend = Math.max(0, 180 - rightKneeAngleVal);

    // 1m thresholds - lowered for close range
    const UP_NORM = 0.06;
    const DOWN_NORM = 0.03;
    const UP_BEND = 15;
    const DOWN_BEND = 8;
    const COUNT_COOLDOWN_MS = 180;

    const leftUpNow = highKneeMarchState.leftUp
        ? (leftLiftNorm > DOWN_NORM) || (leftKneeBend > DOWN_BEND)
        : (leftLiftNorm > UP_NORM) || (leftKneeBend > UP_BEND);
    const rightUpNow = highKneeMarchState.rightUp
        ? (rightLiftNorm > DOWN_NORM) || (rightKneeBend > DOWN_BEND)
        : (rightLiftNorm > UP_NORM) || (rightKneeBend > UP_BEND);

    highKneeMarchState.leftUp = leftUpNow;
    highKneeMarchState.rightUp = rightUpNow;

    let currentLiftedLeg = null;
    if (leftUpNow && !rightUpNow) {
        currentLiftedLeg = 'left';
    } else if (rightUpNow && !leftUpNow) {
        currentLiftedLeg = 'right';
    } else if (leftUpNow && rightUpNow) {
        const gap = leftLiftNorm - rightLiftNorm;
        if (gap > 0.03) currentLiftedLeg = 'left';
        else if (gap < -0.03) currentLiftedLeg = 'right';
        else currentLiftedLeg = highKneeMarchState.lastLiftedLeg;
    }

    if (
        currentLiftedLeg &&
        currentLiftedLeg !== highKneeMarchState.lastLiftedLeg &&
        (now - (highKneeMarchState.lastCountAtMs || 0)) >= COUNT_COOLDOWN_MS
    ) {
        highKneeMarchState.repCount++;
        highKneeMarchState.lastCountAtMs = now;

        const liftedKnee = currentLiftedLeg === 'left' ? leftKneeAngleVal : rightKneeAngleVal;
        const standingKnee = currentLiftedLeg === 'left' ? rightKneeAngleVal : leftKneeAngleVal;

        if (currentLiftedLeg === 'left' && liftedKnee < highKneeMarchState.leftKneeMin) {
            highKneeMarchState.leftKneeMin = liftedKnee;
        }
        if (currentLiftedLeg === 'right' && liftedKnee < highKneeMarchState.rightKneeMin) {
            highKneeMarchState.rightKneeMin = liftedKnee;
        }

        const shoulderMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
        const hipMid = { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 };
        const ankleMid = { x: (lm[27].x + lm[28].x) / 2, y: (lm[27].y + lm[28].y) / 2 };
        const torsoAngle = angle(ankleMid, hipMid, shoulderMid);
        const torsoDeviation = Math.abs(180 - torsoAngle);

        const metrics = {
            leg: currentLiftedLeg,
            liftHeight: currentLiftedLeg === 'left' ? leftLiftHeight : rightLiftHeight,
            liftNorm: currentLiftedLeg === 'left' ? leftLiftNorm : rightLiftNorm,
            liftedKnee,
            standingKnee,
            torsoDeviation,
            timestamp: elapsed
        };

        if (typeof captureFrame === 'function') {
            try {
                metrics.frame = captureFrame({ exercise, kind: 'rep', index: highKneeMarchState.repCount });
            } catch (e) {}
        }

        highKneeMarchState.metricsHistory.push(metrics);
        if (onRepSpeak && highKneeMarchState.repCount % 5 === 0) {
            onRepSpeak(highKneeMarchState.repCount + " reps");
        }
        highKneeMarchState.lastLiftedLeg = currentLiftedLeg;
    }
}

export function finishHighKneeMarchTest() {
    if (highKneeMarchState.metricsHistory.length === 0) {
        return {
            repCount: 0,
            avgLiftHeight: 0,
            avgLiftNorm: 0,
            minKneeAngle: 0,
            avgTorsoDeviation: 0,
            avgStandingKnee: 0,
            formScore: 0,
            repScore: 0,
            rhythmScore: 0,
            finalScore: 0
        };
    }
    
    const totalReps = highKneeMarchState.repCount;
    const metrics = highKneeMarchState.metricsHistory;
    
    const avgLiftHeight = metrics.reduce((sum, m) => sum + m.liftHeight, 0) / metrics.length;
    const avgLiftNorm = metrics.reduce((sum, m) => sum + (Number.isFinite(m.liftNorm) ? m.liftNorm : 0), 0) / metrics.length;
    const minKneeAngle = Math.min(highKneeMarchState.leftKneeMin, highKneeMarchState.rightKneeMin);
    const avgTorsoDeviation = metrics.reduce((sum, m) => sum + m.torsoDeviation, 0) / metrics.length;
    const avgStandingKnee = metrics.reduce((sum, m) => sum + m.standingKnee, 0) / metrics.length;

    let rhythmScore = 100;
    const intervals = [];
    for (let i = 1; i < metrics.length; i++) {
        const dt = metrics[i].timestamp - metrics[i - 1].timestamp;
        if (Number.isFinite(dt) && dt > 0) intervals.push(dt);
    }
    if (intervals.length >= 4) {
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        if (mean > 0) {
            const variance = intervals.reduce((acc, x) => acc + (x - mean) ** 2, 0) / intervals.length;
            const std = Math.sqrt(Math.max(0, variance));
            const cv = std / mean;
            rhythmScore = Math.round(clamp((0.40 - cv) / (0.40 - 0.10), 0, 1) * 100);
        }
    }

    const repQ = clamp(totalReps / 18, 0, 1);
    const repScore = Math.round(Math.pow(repQ, 1.4) * 100);

    const liftQ = scale01(avgLiftNorm, 0.10, 0.25);
    const liftedKneeQ = clamp((140 - minKneeAngle) / (140 - 105), 0, 1);
    const standingKneeQ = scale01(avgStandingKnee, 160, 175);
    const torsoQ = clamp((25 - avgTorsoDeviation) / (25 - 8), 0, 1);
    const formScore = Math.round(clamp((liftQ + liftedKneeQ + standingKneeQ + torsoQ) / 4, 0, 1) * 100);

    const finalScore = Math.round(repScore * 0.7 + formScore * 0.3);
    
    return {
        repCount: totalReps,
        avgLiftHeight: Math.round(avgLiftHeight * 1000) / 1000,
        avgLiftNorm: Math.round(avgLiftNorm * 1000) / 1000,
        minKneeAngle: Math.round(minKneeAngle),
        avgTorsoDeviation: Math.round(avgTorsoDeviation),
        avgStandingKnee: Math.round(avgStandingKnee),
        formScore,
        repScore,
        rhythmScore,
        finalScore
    };
}

export function highKneeMarchFinalScore(result) {
    return result?.finalScore || 0;
}

export function resetHighKneeMarchState() {
    highKneeMarchState = {
        testStart: null,
        repCount: 0,
        lastLiftedLeg: null,
        lastCountAtMs: 0,
        leftUp: false,
        rightUp: false,
        metricsHistory: [],
        leftKneeMin: 999,
        rightKneeMin: 999,
        positionWarned: false
    };
}
