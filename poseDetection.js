/* ============================================================
   POSE DETECTION MODULE - CORE INFRASTRUCTURE ONLY
   
   Contains ONLY:
   - MediaPipe model initialization
   - Webcam capture loop  
   - Drawing of pose landmarks
   - Smoothing functions
   - Basic angle calculation
   
   Exercise-specific logic is in separate files:
   - squat-pose-detection-1meter.js / squat-pose-detection-2meter.js
   - forward-bend-pose-detection-1meter.js / forward-bend-pose-detection-2meter.js
   - high-knee-pose-detection-1meter.js / high-knee-pose-detection-2meter.js
   - t-pose-pose-detection-1meter.js / t-pose-pose-detection-2meter.js
   - plank-pose-detection-1meter.js / plank-pose-detection-2meter.js
============================================================ */

import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

// State
let poseLandmarker;
let drawingUtils;
let lastLm = null;
let smoothedLm = null;
let lowerBodyStableFrames = 0;
let lastPoseDetectedTime = 0;
let lowerBodyMissFrames = 0;
let poseOverlayReady = false;

const VIS_THR = 0.30;
const LOWER_BODY_FRAMES_REQUIRED = 1; // Immediate display for static poses at 2m distance
const LOWER_BODY_MISS_TOLERANCE = 45; // ≈1.5s tolerance so deep squats/high knees don't hide overlay

/* ============================================================
   MODEL INITIALIZATION
============================================================ */
export async function initializePoseLandmarker(canvas) {
    const ctx = canvas.getContext("2d");
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
    );

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
    });

    drawingUtils = new DrawingUtils(ctx);
    return { poseLandmarker, drawingUtils };
}

/* ============================================================
   SMOOTHING FUNCTIONS
============================================================ */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function smooth(lm, prev) {
    if (!prev) return lm.map(p => ({ ...p }));

    return lm.map((p, i) => {
        const q = prev[i];
        const v = p.visibility ?? 1;
        // Increased smoothing for better responsiveness at 2m distance
        let f = v < 0.4 ? 0.0 : v < 0.6 ? 0.2 : 0.7;

        return {
            x: lerp(q.x, p.x, f),
            y: lerp(q.y, p.y, f),
            z: lerp(q.z, p.z, f),
            visibility: lerp(q.visibility ?? 1, v, 0.3)
        };
    });
}

/* ============================================================
   ANGLE & DISTANCE CALCULATIONS
============================================================ */
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

/* ============================================================
   NOTE: Exercise-specific functions removed.
   They are now in separate files per exercise and distance mode.
============================================================ */

/* ============================================================
   WEBCAM LOOP & DRAWING
============================================================ */
export function getSmoothedLandmarks() {
    return smoothedLm;
}

export function setSmoothedLandmarks(lm) {
    smoothedLm = lm;
}

export function setLastLandmarks(lm) {
    lastLm = lm;
}

export function runPoseDetectionFrame(video, canvas, onLandmarksDetected) {
    if (!video.videoWidth || !video.videoHeight) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    const ts = performance.now();

    poseLandmarker.detectForVideo(video, ts, (result) => {
        // Always draw based on the most recent detection result so snapshots include the overlay.
        if (result.landmarks && result.landmarks.length > 0) {
            lastLm = result.landmarks[0];
            smoothedLm = smooth(lastLm, smoothedLm);
            lastPoseDetectedTime = Date.now();
            updateOverlayReadiness(smoothedLm);

            // Clear and redraw overlay for THIS frame.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (smoothedLm && poseOverlayReady) {
                ctx.save();
                ctx.scale(-1, 1);
                ctx.translate(-canvas.width, 0);
                drawingUtils.drawConnectors(smoothedLm, PoseLandmarker.POSE_CONNECTIONS, {
                    color: "#00FFFF",
                    lineWidth: 3,
                    visibilityMin: VIS_THR
                });
                drawingUtils.drawLandmarks(smoothedLm, {
                    color: "#FFB300",
                    lineWidth: 2,
                    visibilityMin: VIS_THR
                });
                ctx.restore();
            }

            if (onLandmarksDetected) {
                onLandmarksDetected(smoothedLm);
            }
        } else {
            // No pose detected - clear the smoothed landmarks so voice instructions know user is out of frame
            smoothedLm = null;
            updateOverlayReadiness(null);

            // Clear overlay when no landmarks are detected.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
}

export function getPoseLandmarker() {
    return poseLandmarker;
}

function updateOverlayReadiness(lm) {
    if (!lm) {
        lowerBodyStableFrames = 0;
        lowerBodyMissFrames = 0;
        poseOverlayReady = false;
        return;
    }

    if (hasVisibleLowerBody(lm)) {
        lowerBodyStableFrames++;
        lowerBodyMissFrames = 0;
        if (lowerBodyStableFrames >= LOWER_BODY_FRAMES_REQUIRED) {
            poseOverlayReady = true;
        }
    } else {
        lowerBodyStableFrames = 0;
        if (poseOverlayReady) {
            lowerBodyMissFrames++;
            if (lowerBodyMissFrames > LOWER_BODY_MISS_TOLERANCE) {
                poseOverlayReady = false;
                lowerBodyMissFrames = 0;
            }
        } else {
            lowerBodyMissFrames = 0;
        }
    }
}

function hasVisibleLowerBody(lm) {
    const leftAnkle = lm[27];
    const rightAnkle = lm[28];
    const leftKnee = lm[25];
    const rightKnee = lm[26];
    const leftHip = lm[23];
    const rightHip = lm[24];

    if (!leftAnkle || !rightAnkle || !leftKnee || !rightKnee || !leftHip || !rightHip) {
        return false;
    }

    // Lowered thresholds to 0.4 for better static detection at 2m distance
    const ankleVisible =
        (leftAnkle.visibility ?? 0) > 0.4 &&
        (rightAnkle.visibility ?? 0) > 0.4;
    const kneeVisible =
        (leftKnee.visibility ?? 0) > 0.4 &&
        (rightKnee.visibility ?? 0) > 0.4;

    const avgHipY = (leftHip.y + rightHip.y) / 2;
    const avgKneeY = (leftKnee.y + rightKnee.y) / 2;
    const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;

    const hipToKnee = avgKneeY - avgHipY;
    const kneeToAnkle = avgAnkleY - avgKneeY;
    // Relaxed to 0.02 for better static detection at 2m distance
    const proportionsValid = hipToKnee > 0.02 && kneeToAnkle > 0.02;

    const anklesInFrame =
        leftAnkle.y > 0.01 && rightAnkle.y > 0.01 &&
        leftAnkle.y < 0.99 && rightAnkle.y < 0.99;

    return ankleVisible && kneeVisible && proportionsValid && anklesInFrame;
}

 