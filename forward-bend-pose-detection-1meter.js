/* ============================================================
   FORWARD BEND POSE DETECTION - 1 METER DISTANCE
   
   Contains:
   - 1m-specific angle calculations for forward bend
   - Flexibility metrics
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

export function forwardBendMetrics(lm) {
    const hipFlexLeft = angle(lm[23], lm[25], lm[27]);
    const hipFlexRight = angle(lm[24], lm[26], lm[28]);
    const hipFlexion = Math.min(hipFlexLeft, hipFlexRight);
    
    const thoracicLeft = angle(lm[11], lm[23], lm[25]);
    const thoracicRight = angle(lm[12], lm[24], lm[26]);
    const thoracicFlexion = Math.min(thoracicLeft, thoracicRight);
    
    const kneeBendLeft = 180 - angle(lm[23], lm[25], lm[27]);
    const kneeBendRight = 180 - angle(lm[24], lm[26], lm[28]);
    const kneeBend = Math.max(kneeBendLeft, kneeBendRight);
    
    const wristY = (lm[15].y + lm[16].y) / 2;
    const ankleY = (lm[27].y + lm[28].y) / 2;
    const noseY = lm[0].y;
    const standingHeight = Math.abs(ankleY - noseY);
    const reachDistance = standingHeight > 0 ? (wristY - ankleY) / standingHeight : 1;
    
    return {
        hipFlexion,
        thoracicFlexion,
        kneeBend,
        reachDistance
    };
}
