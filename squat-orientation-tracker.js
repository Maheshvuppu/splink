/* ============================================================
   SQUAT ORIENTATION TRACKER

   Purpose:
   - Detect cases where the user is rotated too far (back-facing / over-rotated)
     while still accidentally passing the existing sideways/head checks.

   Notes:
   - This module is intentionally additive. It does not change existing
     squat scoring or pose logic; it provides an extra gating signal.
============================================================ */

function vis(lm) {
    const v = lm && lm.visibility !== undefined ? lm.visibility : 1;
    return Number.isFinite(v) ? v : 0;
}

function safeNum(n, fallback = 0) {
    return Number.isFinite(n) ? n : fallback;
}

function measureBackFacingLike(lm) {
    const ls = lm?.[11];
    const rs = lm?.[12];
    const lh = lm?.[23];
    const rh = lm?.[24];

    if (!ls || !rs || !lh || !rh) {
        return { valid: false, backSuspect: false, reason: 'missing-body' };
    }

    const shoulderMidY = (safeNum(ls.y, 0.5) + safeNum(rs.y, 0.5)) / 2;
    const hipMidY = (safeNum(lh.y, 0.5) + safeNum(rh.y, 0.5)) / 2;
    const torsoHeight = Math.abs(shoulderMidY - hipMidY);

    if (!Number.isFinite(torsoHeight) || torsoHeight < 0.08) {
        return { valid: false, backSuspect: false, reason: 'tiny-torso' };
    }

    const shoulderWidth = Math.abs(safeNum(ls.x, 0) - safeNum(rs.x, 0));
    const sidewaysRatio = shoulderWidth / torsoHeight;

    // Only evaluate back-facing when the user is roughly sideways.
    // This avoids penalizing normal front-facing frames.
    const sidewaysLike = sidewaysRatio < 0.55;

    // KEY CHECK: Shoulder X-position tells us front vs back facing.
    // For correct left-turn (showing right shoulder from FRONT):
    //   Right shoulder (lm[12]) should have LOWER x than left shoulder (lm[11])
    // For back-facing cheat:
    //   Right shoulder has HIGHER x than left shoulder (positions are flipped)
    const rightShoulderX = safeNum(rs.x, 0.5);
    const leftShoulderX = safeNum(ls.x, 0.5);
    const shouldersFlipped = rightShoulderX > leftShoulderX + 0.02; // right is more to the right = back-facing

    const nose = lm?.[0];
    const leye = lm?.[2];
    const reye = lm?.[5];

    const noseVis = vis(nose);
    const faceVis = Math.max(noseVis, vis(leye), vis(reye));

    const bodyVis = Math.min(vis(ls), vis(rs), vis(lh), vis(rh));

    // Depth cue (z): MediaPipe pose uses negative z for closer points; therefore:
    // (left.z - right.z) > 0 => anatomical right is closer.
    // z is noisy on some cameras; we use it only as a weak cue.
    const shoulderZDelta = safeNum(ls.z, 0) - safeNum(rs.z, 0);
    const hipZDelta = safeNum(lh.z, 0) - safeNum(rh.z, 0);
    const zAbs = Math.max(Math.abs(shoulderZDelta), Math.abs(hipZDelta));

    // Visibility symmetry cue: back-facing often makes both sides look similar.
    const shoulderVisDelta = Math.abs(vis(rs) - vis(ls));
    const hipVisDelta = Math.abs(vis(rh) - vis(lh));
    const visAbs = Math.max(shoulderVisDelta, hipVisDelta);

    // Back-facing / over-rotated heuristic:
    // PRIMARY CHECK: If shoulders are flipped (right.x > left.x), user is back-facing.
    // This is the most reliable indicator from your image.
    const hardBackSuspect = Boolean(sidewaysLike && bodyVis > 0.35 && shouldersFlipped);

    // Secondary check: low face visibility when sideways
    const faceLow = faceVis < 0.35;
    const dominanceWeak = zAbs < 0.08 && visAbs < 0.25;

    const backSuspect = Boolean(hardBackSuspect || (sidewaysLike && bodyVis > 0.35 && faceLow && dominanceWeak && shouldersFlipped));

    return {
        valid: true,
        backSuspect,
        hardBackSuspect,
        reason: backSuspect ? (hardBackSuspect ? 'hard-back-suspect' : 'sideways-but-face-missing') : 'ok',
        torsoHeight,
        sidewaysRatio,
        noseVis,
        faceVis,
        bodyVis,
        shoulderZDelta,
        hipZDelta
    };
}

export function estimateRightShoulderShown(lm) {
    const ls = lm?.[11];
    const rs = lm?.[12];
    const lh = lm?.[23];
    const rh = lm?.[24];
    const nose = lm?.[0];
    const lear = lm?.[7];

    if (!ls || !rs || !lh || !rh) return { ok: false, valid: false, reason: 'missing-body' };

    const shoulderMidY = (safeNum(ls.y, 0.5) + safeNum(rs.y, 0.5)) / 2;
    const hipMidY = (safeNum(lh.y, 0.5) + safeNum(rh.y, 0.5)) / 2;
    const torsoHeight = Math.abs(shoulderMidY - hipMidY);
    if (!Number.isFinite(torsoHeight) || torsoHeight < 0.08) return { ok: false, valid: false, reason: 'tiny-torso' };

    const shoulderWidth = Math.abs(safeNum(ls.x, 0) - safeNum(rs.x, 0));
    const sidewaysRatio = shoulderWidth / torsoHeight;
    const sidewaysLike = sidewaysRatio < 0.55;
    if (!sidewaysLike) return { ok: false, valid: true, reason: 'not-sideways', sidewaysRatio };

    // PRIMARY CHECK: Shoulder X-positions tell us if user is front or back facing.
    // For correct left-turn: right shoulder (lm[12]) has LOWER x than left shoulder (lm[11])
    // For back-facing cheat: right shoulder has HIGHER x (flipped)
    const rightShoulderX = safeNum(rs.x, 0.5);
    const leftShoulderX = safeNum(ls.x, 0.5);
    const shouldersCorrect = rightShoulderX < leftShoulderX - 0.02; // right must be clearly to the left
    
    // If shoulders are flipped (back-facing), reject immediately
    if (!shouldersCorrect) {
        return { ok: false, valid: true, reason: 'shoulders-flipped-backfacing', sidewaysRatio, rightShoulderX, leftShoulderX };
    }

    // Preferred cue if face landmarks are stable.
    // Require STRONG face visibility to trust the face-based cue.
    const faceCueValid = nose && lear && (vis(nose) > 0.35) && (vis(lear) > 0.30);
    const isLookingLeft = faceCueValid ? (safeNum(lear.x, 0) < safeNum(nose.x, 0)) : null;

    // Fallback cue: depth ordering and relative visibility.
    // (left.z - right.z) > 0 => anatomical right closer.
    const shoulderZDelta = safeNum(ls.z, 0) - safeNum(rs.z, 0);
    const hipZDelta = safeNum(lh.z, 0) - safeNum(rh.z, 0);

    const zStrong = (shoulderZDelta > 0.10) || (hipZDelta > 0.10);
    const zModerate = (shoulderZDelta > 0.06) || (hipZDelta > 0.06);

    const shoulderVisDelta = (vis(rs) - vis(ls));
    const hipVisDelta = (vis(rh) - vis(lh));
    const visStrong = (shoulderVisDelta > 0.32) || (hipVisDelta > 0.32);
    const visModerate = (shoulderVisDelta > 0.20) || (hipVisDelta > 0.20);

    // If the face is not clearly visible, do not accept orientation as correct.
    // This blocks the "from behind" cheat even when right-side landmarks look strong.
    // For a proper left turn showing right shoulder, the face profile MUST be visible.
    const leye = lm?.[2];
    const reye = lm?.[5];
    const faceVis = Math.max(vis(nose), vis(leye), vis(reye));
    const faceMissing = (vis(nose) < 0.30) || (faceVis < 0.35);

    // STRICT: We REQUIRE face to be visible for valid left-turn orientation.
    // Without face, we cannot distinguish front-facing vs back-facing right shoulder.
    const ok = !faceMissing && Boolean((isLookingLeft === true) || (faceCueValid && (zStrong || visStrong || (zModerate && visModerate))));
    return {
        ok,
        valid: true,
        reason: ok ? 'ok' : 'uncertain',
        sidewaysRatio,
        isLookingLeft,
        shoulderZDelta,
        hipZDelta,
        rightMoreVisible: Boolean(visModerate || visStrong)
    };
}

export function createSquatOrientationTracker(options = {}) {
    const confirmFrames = Number.isFinite(options.confirmFrames) ? options.confirmFrames : 3;
    const maxScore = Number.isFinite(options.maxScore) ? options.maxScore : 6;

    const state = {
        backScore: 0,
        last: null
    };

    const reset = () => {
        state.backScore = 0;
        state.last = null;
    };

    const update = (lm) => {
        const m = measureBackFacingLike(lm);
        state.last = m;

        if (!m.valid) {
            // Decay slowly when measurement isn't reliable.
            state.backScore = Math.max(0, state.backScore - 1);
            return { ok: state.backScore < confirmFrames, backConfirmed: state.backScore >= confirmFrames, measurement: m };
        }

        if (m.backSuspect) {
            if (m.hardBackSuspect) {
                state.backScore = maxScore;
            } else {
                state.backScore = Math.min(maxScore, state.backScore + 1);
            }
        } else {
            state.backScore = Math.max(0, state.backScore - 1);
        }

        const backConfirmed = state.backScore >= confirmFrames;
        return { ok: !backConfirmed, backConfirmed, measurement: m };
    };

    const isOk = () => state.backScore < confirmFrames;
    const isBackConfirmed = () => state.backScore >= confirmFrames;
    const getDebug = () => ({ backScore: state.backScore, last: state.last });

    return { reset, update, isOk, isBackConfirmed, getDebug };
}
