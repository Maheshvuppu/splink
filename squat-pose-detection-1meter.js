/* ============================================================
   SQUAT POSE DETECTION - 1 METER DISTANCE
   
   Contains:
   - 1m-specific angle calculations
   - 1m-specific squat state detection
   - 1m-specific hip depth measurement
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

// 1m squat state: choose the most reliable side (by landmark visibility) and
// use a 2D angle to reduce close-range perspective distortion.
export function squatState1m(lm) {
    const leftAngle = angle(lm[23], lm[25], lm[27]);
    const rightAngle = angle(lm[24], lm[26], lm[28]);

    const leftValid = leftAngle > 0 && leftAngle < 999;
    const rightValid = rightAngle > 0 && rightAngle < 999;

    if (!leftValid && !rightValid) {
        return { state: "UNKNOWN", ang: 0, valid: false };
    }

    const conf = (hip, knee, ankle) => {
        const hv = hip?.visibility ?? 1;
        const kv = knee?.visibility ?? 1;
        const av = ankle?.visibility ?? 1;
        return Math.min(hv, kv, av);
    };

    const leftConf = leftValid ? conf(lm[23], lm[25], lm[27]) : -1;
    const rightConf = rightValid ? conf(lm[24], lm[26], lm[28]) : -1;

    let A;
    if (leftConf >= 0 && rightConf >= 0) {
        const confSum = leftConf + rightConf;
        if (confSum > 0 && Math.abs(leftConf - rightConf) < 0.10) {
            A = (leftAngle * leftConf + rightAngle * rightConf) / confSum;
        } else {
            A = leftConf > rightConf ? leftAngle : rightAngle;
        }
    } else {
        A = leftValid ? leftAngle : rightAngle;
    }

    if (A < 150) return { state: "DOWN", ang: A, valid: true };
    if (A > 160) return { state: "UP", ang: A, valid: true };
    return { state: "MID", ang: A, valid: true };
}

// 1m hip depth: use averaged hips/ankles to reduce single-side drift at close range
export function hipDepth1m(lm) {
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
    // This function is included for compatibility but not used in 1m mode
    // The 1m heel lift detection is in the scoring logic file
    return false;
}
