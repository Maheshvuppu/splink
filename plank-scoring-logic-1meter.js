/* PLANK SCORING LOGIC - 1M */
let plankState = {
    testStart: null, metricsHistory: [], currentHoldMs: 0, bestHoldMs: 0,
    isInPlank: false, pendingMs: 0, lastTimestamp: null, feedbackCooldownMs: 0, positionWarned: false
};
const PLANK_TEST_WINDOW = 30000;
const PLANK_CONFIRM_MS = 500;
const PLANK_LOSS_MS = 600;
const MIN_VALID_HOLD_SECONDS = 10;

function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

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

export function startPlankTest() {
    plankState = {
        testStart: performance.now(), metricsHistory: [], currentHoldMs: 0, bestHoldMs: 0,
        isInPlank: false, pendingMs: 0, lastTimestamp: performance.now(), feedbackCooldownMs: 0, positionWarned: false
    };
}

export function updatePlank(lm, onRepSpeak, onTestFinish, inCorrectPosition = true, exercise = 'plank') {
    if (!plankState.testStart) return;
    if (!inCorrectPosition) return;

    const now = performance.now();
    const elapsed = now - plankState.testStart;
    const delta = plankState.lastTimestamp ? now - plankState.lastTimestamp : 0;
    plankState.lastTimestamp = now;

    if (elapsed > PLANK_TEST_WINDOW) {
        if (onTestFinish) onTestFinish();
        return;
    }

    const shoulderMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
    const hipMid = { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 };
    const ankleMid = { x: (lm[27].x + lm[28].x) / 2, y: (lm[27].y + lm[28].y) / 2 };
    
    const bodyAngle = angle(ankleMid, hipMid, shoulderMid);
    const hipHeight = hipMid.y;
    const shoulderHeight = shoulderMid.y;
    const verticalAlignment = Math.abs(hipHeight - shoulderHeight);
    
    const isPlankPosition = bodyAngle > 160 && bodyAngle < 200 && verticalAlignment < 0.15;

    if (!plankState.isInPlank) {
        if (!isPlankPosition) {
            plankState.pendingMs = 0;
            return;
        }
        plankState.pendingMs += delta;
        if (plankState.pendingMs >= PLANK_CONFIRM_MS) {
            plankState.isInPlank = true;
            plankState.pendingMs = 0;
            plankState.currentHoldMs = 0;
        }
        return;
    }

    if (!isPlankPosition) {
        plankState.pendingMs += delta;
        if (plankState.pendingMs >= PLANK_LOSS_MS) {
            plankState.pendingMs = 0;
            plankState.isInPlank = false;
            plankState.currentHoldMs = 0;
        }
        return;
    }

    plankState.pendingMs = 0;
    plankState.currentHoldMs += delta;
    if (plankState.currentHoldMs > plankState.bestHoldMs) {
        plankState.bestHoldMs = plankState.currentHoldMs;
    }

    const leftKnee = angle(lm[23], lm[25], lm[27]);
    const rightKnee = angle(lm[24], lm[26], lm[28]);
    const leftElbow = angle(lm[11], lm[13], lm[15]);
    const rightElbow = angle(lm[12], lm[14], lm[16]);

    plankState.metricsHistory.push({
        bodyAngle, leftKnee, rightKnee, leftElbow, rightElbow, verticalAlignment,
        timestamp: elapsed
    });
}

export function finishPlankTest() {
    if (plankState.metricsHistory.length === 0) {
        return { bodyAngle: 0, kneeAngle: 0, elbowAngle: 0, verticalAlignment: 0,
            holdTime: 0, formScore: 0, finalScore: 0 };
    }
    
    const totalCount = plankState.metricsHistory.length;
    const avgMetrics = plankState.metricsHistory.reduce((acc, m) => ({
        bodyAngle: acc.bodyAngle + m.bodyAngle,
        leftKnee: acc.leftKnee + m.leftKnee,
        rightKnee: acc.rightKnee + m.rightKnee,
        leftElbow: acc.leftElbow + m.leftElbow,
        rightElbow: acc.rightElbow + m.rightElbow,
        verticalAlignment: acc.verticalAlignment + m.verticalAlignment
    }), { bodyAngle: 0, leftKnee: 0, rightKnee: 0, leftElbow: 0, rightElbow: 0, verticalAlignment: 0 });
    
    avgMetrics.bodyAngle /= totalCount;
    avgMetrics.leftKnee /= totalCount;
    avgMetrics.rightKnee /= totalCount;
    avgMetrics.leftElbow /= totalCount;
    avgMetrics.rightElbow /= totalCount;
    avgMetrics.verticalAlignment /= totalCount;
    
    const holdTimeSeconds = plankState.bestHoldMs / 1000;
    const holdTime = Math.round(holdTimeSeconds * 10) / 10;
    const isValid = holdTimeSeconds >= MIN_VALID_HOLD_SECONDS;
    
    const bodyAngleQuality = clamp((200 - Math.abs(180 - avgMetrics.bodyAngle)) / 20, 0, 1);
    const kneeQuality = clamp((Math.min(avgMetrics.leftKnee, avgMetrics.rightKnee) - 160) / 20, 0, 1);
    const elbowQuality = clamp((Math.min(avgMetrics.leftElbow, avgMetrics.rightElbow) - 70) / 30, 0, 1);
    const alignmentQuality = clamp((0.15 - avgMetrics.verticalAlignment) / 0.15, 0, 1);

    const formScore = Math.round(clamp(
        bodyAngleQuality * 0.40 + kneeQuality * 0.30 + elbowQuality * 0.15 + alignmentQuality * 0.15, 0, 1) * 100);
    
    let finalScore = Math.round(Math.min(1, (holdTimeSeconds || 0) / 30) * 100 * 0.3 + formScore * 0.7);
    
    return {
        bodyAngle: Math.round(avgMetrics.bodyAngle),
        kneeAngle: Math.round((avgMetrics.leftKnee + avgMetrics.rightKnee) / 2),
        elbowAngle: Math.round((avgMetrics.leftElbow + avgMetrics.rightElbow) / 2),
        verticalAlignment: Math.round(avgMetrics.verticalAlignment * 1000) / 1000,
        holdTime, formScore: Math.round(formScore), finalScore, isValid
    };
}

export function plankFinalScore(result) {
    return result?.finalScore || 0;
}

export function resetPlankState() {
    plankState = {
        testStart: null, metricsHistory: [], currentHoldMs: 0, bestHoldMs: 0,
        isInPlank: false, pendingMs: 0, lastTimestamp: null, feedbackCooldownMs: 0
    };
}
