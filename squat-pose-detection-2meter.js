/* ============================================================
   SQUAT POSE DETECTION - 2 METER DISTANCE
   
   Contains:
   - 2m-specific angle calculations
   - 2m-specific squat state detection
   - 2m-specific hip depth measurement
   - 2m-specific heel lift detection
   - Symmetry calculations
============================================================ */

const VIS_THR = 0.30;

export function angle(A, B, C) {
    if (!A || !B || !C) return 0;
    const av = (A.visibility ?? 1);
    const bv = (B.visibility ?? 1);
    const cv = (C.visibility ?? 1);
    if (av < VIS_THR || bv < VIS_THR || cv < VIS_THR) return 0;

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

export function squatState(lm) {
    const leftAngle = angle(lm[23], lm[25], lm[27]);
    const rightAngle = angle(lm[24], lm[26], lm[28]);

    const leftValid = leftAngle > 0 && leftAngle < 999;
    const rightValid = rightAngle > 0 && rightAngle < 999;

    if (!leftValid && !rightValid) {
        return { state: "UNKNOWN", ang: 0, valid: false };
    }

    const candidates = [];
    if (leftValid) candidates.push(leftAngle);
    if (rightValid) candidates.push(rightAngle);
    const A = Math.min(...candidates);

    if (A < 150) return { state: "DOWN", ang: A, valid: true };
    if (A > 160) return { state: "UP", ang: A, valid: true };
    return { state: "MID", ang: A, valid: true };
}

export function hipDepth(lm) {
    const lh = lm[23];
    const rh = lm[24];
    const la = lm[27];
    const ra = lm[28];
    if (!lh || !rh || !la || !ra) return 1;
    const hipY = (lh.y + rh.y) / 2;
    const ankleY = (la.y + ra.y) / 2;
    return ankleY - hipY;
}

export function symmetry(lm) {
    // Original Y-axis shoulder/hip symmetry
    const s = Math.abs(lm[11].y - lm[12].y);
    const h = Math.abs(lm[23].y - lm[24].y);
    const ySymmetry = (s + h) / 2;
    
    // Additional check: Torso lean detection for side view
    // Check if the visible shoulder is not aligned with the visible hip (X-axis lean)
    // When leaning left/right from side view, the shoulder X position shifts relative to hip
    const shoulderMidX = (lm[11].x + lm[12].x) / 2;
    const hipMidX = (lm[23].x + lm[24].x) / 2;
    const xLean = Math.abs(shoulderMidX - hipMidX);
    
    // Check torso vertical angle - should be relatively straight
    const shoulderMidY = (lm[11].y + lm[12].y) / 2;
    const hipMidY = (lm[23].y + lm[24].y) / 2;
    const torsoHeight = Math.abs(hipMidY - shoulderMidY);
    
    // Normalize X lean by torso height to get lean ratio
    const leanRatio = torsoHeight > 0.05 ? xLean / torsoHeight : 0;
    
    // Combine both metrics - take the worse of the two
    return Math.max(ySymmetry, leanRatio * 0.5);
}

export function heelLift(lm) {
    // Increased thresholds to reduce false positives
    const rightThr = 0.045;
    const leftThr = 0.055;

    if (!lm[27] || !lm[31] || !lm[28] || !lm[32]) return false;

    const leftAnkleVis = lm[27].visibility ?? 0;
    const leftToeVis = lm[31].visibility ?? 0;
    const rightAnkleVis = lm[28].visibility ?? 0;
    const rightToeVis = lm[32].visibility ?? 0;
    
    // Require higher visibility to trust the detection
    const rightVisible = rightAnkleVis > 0.65 && rightToeVis > 0.65;
    const leftVisible = leftAnkleVis > 0.5 && leftToeVis > 0.5;

    const rightLift = rightVisible && (lm[32].y - lm[28].y) > rightThr;
    const leftLift = leftVisible && (lm[31].y - lm[27].y) > leftThr;

    return leftLift || rightLift;
}
