/* ============================================================
   T-POSE VOICE INSTRUCTIONS - 2 METER DISTANCE
   
   Contains:
   - 2m-specific voice guidance
   - Position checking for t-pose at 2m
   - Instruction flow for t-pose balance test
============================================================ */

import { angle } from './t-pose-pose-detection-2meter.js';
import { startTPoseBalanceTest } from './t-pose-scoring-logic-2meter.js';
import { createSquatOrientationTracker, estimateRightShoulderShown } from './squat-orientation-tracker.js';

let currentUtterance = null;

export function speak(text, cb = null) {
    if (speechCancelled) {
        if (cb) cb();
        return;
    }
    
    // Cancel any ongoing speech before starting new one
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    currentUtterance = utterance; // Prevent garbage collection
    
    utterance.lang = "en-US";
    utterance.pitch = 1;
    utterance.rate = 1;
    
    utterance.onend = () => {
        currentUtterance = null;
        if (cb && !speechCancelled) cb();
    };
    
    utterance.onerror = (e) => {
        console.error("Speech error:", e);
        currentUtterance = null;
        if (cb && !speechCancelled) cb();
    };
    
    window.speechSynthesis.speak(utterance);
}

const tPoseInstructions2m = [
    "Show your full body to the camera",
    "Rotate left, showing your right shoulder.",
    "Lift one leg and hold your balance. You have 10 seconds."
];

export function getTPoseInstructions2m() {
    return tPoseInstructions2m;
}

// State
let voiceStarted = false;
let startInterval = null;
let startStep = 0;
let startInstruct = false;
let isCaptureActive = false;
let lowerBodyStableFrames = 0;
let speechCancelled = false;
let hasWarnedPosition = false;
let waitingForGoPosition = false;
let lastWarningTime = 0;
let hasReconfirmedInstruction = false;
let lastFrameWarningTime = 0;
let pendingGoTimeout = null;
let positionConfirmCount = 0;
let hasEverBeenInFrame = false;
let hasWarnedEarlyTPose = false;
let lastEarlyTPoseWarningTime = 0;
let needsInstructionRepeatBeforeGo = false;
let earlyWarningInProgress = false;

// Out-of-frame timeout tracking (10 seconds to return or go to home)
let outOfFrameStartTime = null;
let outOfFrameTimeoutId = null;
let returnToMenuCallback = null;
const OUT_OF_FRAME_TIMEOUT_MS = 10000; // 10 seconds

let orientationTracker = createSquatOrientationTracker();

const REQUIRED_LOWER_BODY_FRAMES = 1;
const REQUIRED_POSITION_CONFIRMS = 3; // Require 3 consecutive checks to confirm position
// Early-perform detection should be stricter than scoring (reduce false positives from landmark jitter).
const EARLY_TPOSE_LIFT_THRESHOLD = 0.03;
const EARLY_TPOSE_HIP_ANGLE_THRESHOLD = 160;

export function startTPoseAssistant2m(getSmoothedLandmarks, onReturnToMenu = null) {
    if (voiceStarted) return;
    voiceStarted = true;
    startStep = 0;
    startInstruct = false;
    isCaptureActive = false;
    lowerBodyStableFrames = 0;
    speechCancelled = false;
    hasWarnedPosition = false;
    waitingForGoPosition = false;
    lastWarningTime = 0;
    hasReconfirmedInstruction = false;
    lastFrameWarningTime = 0;
    positionConfirmCount = 0;
    hasEverBeenInFrame = false;
    hasWarnedEarlyTPose = false;
    lastEarlyTPoseWarningTime = 0;
    needsInstructionRepeatBeforeGo = false;
    earlyWarningInProgress = false;
    outOfFrameStartTime = null;
    returnToMenuCallback = onReturnToMenu;
    orientationTracker.reset();
    if (outOfFrameTimeoutId) {
        clearTimeout(outOfFrameTimeoutId);
        outOfFrameTimeoutId = null;
    }
    if (pendingGoTimeout) {
        clearTimeout(pendingGoTimeout);
        pendingGoTimeout = null;
    }

    speak(tPoseInstructions2m[0], () => (startInstruct = true));
    startInterval = setInterval(() => checkTPoseSteps2m(getSmoothedLandmarks), 1000);
}

function checkTPoseSteps2m(getSmoothedLandmarks) {
    const smoothedLm = getSmoothedLandmarks();
    
    // If no landmarks detected at all, user is likely out of frame
    if (!smoothedLm) {
        handleOutOfFrame();
        return;
    }

    const lm = smoothedLm;

    // Check if user is in frame FIRST (before any other checks)
    const leftAnkleVis = lm[27] && lm[27].visibility !== undefined ? lm[27].visibility : 0;
    const rightAnkleVis = lm[28] && lm[28].visibility !== undefined ? lm[28].visibility : 0;
    const leftKneeVis = lm[25] && lm[25].visibility !== undefined ? lm[25].visibility : 0;
    const rightKneeVis = lm[26] && lm[26].visibility !== undefined ? lm[26].visibility : 0;
    
    const anklesHighlyVisible = leftAnkleVis > 0.4 && rightAnkleVis > 0.4;
    const kneesHighlyVisible = leftKneeVis > 0.4 && rightKneeVis > 0.4;
    
    const leftHipY = lm[23] && lm[23].y !== undefined ? lm[23].y : 0.5;
    const rightHipY = lm[24] && lm[24].y !== undefined ? lm[24].y : 0.5;
    const leftAnkleY = lm[27] && lm[27].y !== undefined ? lm[27].y : 0;
    const rightAnkleY = lm[28] && lm[28].y !== undefined ? lm[28].y : 0;
    const leftKneeY = lm[25] && lm[25].y !== undefined ? lm[25].y : 0;
    const rightKneeY = lm[26] && lm[26].y !== undefined ? lm[26].y : 0;
    
    const avgHipY = (leftHipY + rightHipY) / 2;
    const avgAnkleY = (leftAnkleY + rightAnkleY) / 2;
    const avgKneeY = (leftKneeY + rightKneeY) / 2;
    
    const hipToKnee = avgKneeY - avgHipY;
    const kneeToAnkle = avgAnkleY - avgKneeY;
    const realisticProportions = hipToKnee > 0.02 && kneeToAnkle > 0.02;

    const anklesInBounds = leftAnkleY < 0.99 && rightAnkleY < 0.99 && 
                           leftAnkleY > 0.01 && rightAnkleY > 0.01;
    
    // Check horizontal position (X-axis) to detect left/right movement out of frame
    const leftHipX = lm[23] && lm[23].x !== undefined ? lm[23].x : 0.5;
    const rightHipX = lm[24] && lm[24].x !== undefined ? lm[24].x : 0.5;
    const leftShoulderX = lm[11] && lm[11].x !== undefined ? lm[11].x : 0.5;
    const rightShoulderX = lm[12] && lm[12].x !== undefined ? lm[12].x : 0.5;
    const noseX = lm[0] && lm[0].x !== undefined ? lm[0].x : 0.5;
    const leftAnkleX = lm[27] && lm[27].x !== undefined ? lm[27].x : 0.5;
    const rightAnkleX = lm[28] && lm[28].x !== undefined ? lm[28].x : 0.5;
    
    // Find the leftmost and rightmost points of the body
    const minX = Math.min(leftHipX, rightHipX, leftShoulderX, rightShoulderX, noseX, leftAnkleX, rightAnkleX);
    const maxX = Math.max(leftHipX, rightHipX, leftShoulderX, rightShoulderX, noseX, leftAnkleX, rightAnkleX);
    
    // Check if body is within horizontal bounds (not too far left or right)
    const horizontallyInFrame = minX > 0.05 && maxX < 0.95;
    
    const lowerBodyVisible = anklesHighlyVisible && kneesHighlyVisible && realisticProportions && anklesInBounds && horizontallyInFrame;
    
    if (!lowerBodyVisible) {
        handleOutOfFrame();
        lowerBodyStableFrames = 0;
        return;
    }

    // User is back in frame - reset out-of-frame timer
    resetOutOfFrameTimer();
    hasEverBeenInFrame = true;

    // Detect early leg lift even while instructions are being spoken.
    // (During speech, startInstruct is false, so we must check before that gate.)
    if (!isCaptureActive && startStep >= 2) {
        if (lm[27] && lm[28] && lm[27].y !== undefined && lm[28].y !== undefined) {
            const ankleDiff = lm[27].y - lm[28].y;
            const absDiff = Math.abs(ankleDiff);
            if (absDiff > EARLY_TPOSE_LIFT_THRESHOLD) {
                const candidateStance = ankleDiff > 0 ? 'left' : 'right';
                const liftedIndices = candidateStance === 'left'
                    ? { hip: 24, knee: 26, ankle: 28 } : { hip: 23, knee: 25, ankle: 27 };
                const liftedShoulder = candidateStance === 'left' ? lm[12] : lm[11];
                const liftedHipAngle = (liftedShoulder && lm[liftedIndices.hip] && lm[liftedIndices.knee])
                    ? angle(liftedShoulder, lm[liftedIndices.hip], lm[liftedIndices.knee])
                    : 999;

                const isLegActuallyLifted = liftedHipAngle < EARLY_TPOSE_HIP_ANGLE_THRESHOLD;
                if (isLegActuallyLifted) {
                    if (earlyWarningInProgress) {
                        return;
                    }
                    const now = Date.now();
                    if (!hasWarnedEarlyTPose || (now - lastEarlyTPoseWarningTime > 3000)) {
                        hasWarnedEarlyTPose = true;
                        lastEarlyTPoseWarningTime = now;
                        window.speechSynthesis.cancel();
                        startInstruct = false;
                        earlyWarningInProgress = true;
                        speak("Follow instructions and perform after GO command", () => {
                            if (speechCancelled) return;
                            earlyWarningInProgress = false;
                            startInstruct = true;
                        });
                    } else {
                        // Throttled: don't cancel current speech (it might be the warning).
                        startInstruct = true;
                    }

                    needsInstructionRepeatBeforeGo = true;
                    waitingForGoPosition = true;
                    hasWarnedPosition = false;
                    lastWarningTime = 0;
                    positionConfirmCount = 0;
                    hasReconfirmedInstruction = false;
                    if (pendingGoTimeout) {
                        clearTimeout(pendingGoTimeout);
                        pendingGoTimeout = null;
                    }
                    return;
                }
            }
        }
    }

    // Now check startInstruct for normal instruction flow
    if (!startInstruct) return;

    // Track over-rotation/back-facing cases (additive gate).
    orientationTracker.update(lm);

    const orientationOk = () => {
        const basicOk = isInCorrectTPosePosition2m(lm);
        const fallbackOk = estimateRightShoulderShown(lm).ok;
        return (basicOk || fallbackOk) && orientationTracker.isOk();
    };

    if (isCaptureActive) return;

    // Check lower body visibility stability for step 0
    if (startStep === 0) {
        lowerBodyStableFrames++;
        if (lowerBodyStableFrames < REQUIRED_LOWER_BODY_FRAMES) {
            return;
        }
    }

    const leftKneeAngle = angle(lm[23], lm[25], lm[27]);
    const rightKneeAngle = angle(lm[24], lm[26], lm[28]);
    const k = Math.min(leftKneeAngle, rightKneeAngle);

    // Handle waiting for Go position - check position, warn if wrong, then speak instruction + Go
    if (waitingForGoPosition) {
        // If user tries to perform (lift leg) before "Go!", warn and wait.
        if (lm[27] && lm[28] && lm[27].y !== undefined && lm[28].y !== undefined) {
            const ankleDiff = lm[27].y - lm[28].y;
            const absDiff = Math.abs(ankleDiff);
            if (absDiff > EARLY_TPOSE_LIFT_THRESHOLD) {
                const candidateStance = ankleDiff > 0 ? 'left' : 'right';
                const stanceIndices = candidateStance === 'left'
                    ? { hip: 23, knee: 25, ankle: 27 } : { hip: 24, knee: 26, ankle: 28 };
                const liftedIndices = candidateStance === 'left'
                    ? { hip: 24, knee: 26, ankle: 28 } : { hip: 23, knee: 25, ankle: 27 };
                const liftedShoulder = candidateStance === 'left' ? lm[12] : lm[11];
                const liftedHipAngle = (liftedShoulder && lm[liftedIndices.hip] && lm[liftedIndices.knee])
                    ? angle(liftedShoulder, lm[liftedIndices.hip], lm[liftedIndices.knee])
                    : 999;

                const isLegActuallyLifted = liftedHipAngle < EARLY_TPOSE_HIP_ANGLE_THRESHOLD;
                if (!isLegActuallyLifted) {
                    // Likely jitter/stance asymmetry; don't warn.
                } else {
                    if (earlyWarningInProgress) {
                        return;
                    }
                const now = Date.now();
                if (!hasWarnedEarlyTPose || (now - lastEarlyTPoseWarningTime > 3000)) {
                    hasWarnedEarlyTPose = true;
                    lastEarlyTPoseWarningTime = now;
                    window.speechSynthesis.cancel();
                    startInstruct = false;
                        earlyWarningInProgress = true;
                    speak("Follow instructions and perform after GO command", () => {
                        if (speechCancelled) return;
                            earlyWarningInProgress = false;
                        startInstruct = true;
                    });
                }
                needsInstructionRepeatBeforeGo = true;
                positionConfirmCount = 0;
                if (pendingGoTimeout) {
                    clearTimeout(pendingGoTimeout);
                    pendingGoTimeout = null;
                }
                hasReconfirmedInstruction = false;
                return;
                }
            }
        }

        const inCorrectPosition = orientationOk();
        if (inCorrectPosition) {
            positionConfirmCount++;
            
            // Require position to be held for multiple checks before proceeding
            if (positionConfirmCount < REQUIRED_POSITION_CONFIRMS) {
                return;
            }
            
            if (hasReconfirmedInstruction) {
                return;
            }
            
            hasReconfirmedInstruction = true;
            if (pendingGoTimeout) {
                clearTimeout(pendingGoTimeout);
                pendingGoTimeout = null;
            }
            // If we had warned before (rotate-left) or user tried early, re-speak the instruction before Go
            if (hasWarnedPosition || needsInstructionRepeatBeforeGo) {
                speak(tPoseInstructions2m[2], () => {
                    if (speechCancelled || !hasReconfirmedInstruction) return;
                    pendingGoTimeout = setTimeout(() => {
                        if (speechCancelled || !hasReconfirmedInstruction) return;
                        speak("Go!", () => {
                            if (speechCancelled || !hasReconfirmedInstruction) return;
                            waitingForGoPosition = false;
                            hasWarnedPosition = false;
                            hasReconfirmedInstruction = false;
                            needsInstructionRepeatBeforeGo = false;
                            if (pendingGoTimeout) {
                                clearTimeout(pendingGoTimeout);
                                pendingGoTimeout = null;
                            }
                            isCaptureActive = true;
                            if (startInterval) {
                                clearInterval(startInterval);
                                startInterval = null;
                            }
                            startTPoseBalanceTest();
                        });
                    }, 1000);
                });
            } else {
                // No warning was given, just say Go after delay
                pendingGoTimeout = setTimeout(() => {
                    if (speechCancelled || !hasReconfirmedInstruction) return;
                    speak("Go!", () => {
                        if (speechCancelled || !hasReconfirmedInstruction) return;
                        waitingForGoPosition = false;
                        hasWarnedPosition = false;
                        hasReconfirmedInstruction = false;
                        needsInstructionRepeatBeforeGo = false;
                        if (pendingGoTimeout) {
                            clearTimeout(pendingGoTimeout);
                            pendingGoTimeout = null;
                        }
                        isCaptureActive = true;
                        if (startInterval) {
                            clearInterval(startInterval);
                            startInterval = null;
                        }
                        startTPoseBalanceTest();
                    });
                }, 1000);
            }
            return;
        } else {
            positionConfirmCount = 0;
            if (pendingGoTimeout) {
                clearTimeout(pendingGoTimeout);
                pendingGoTimeout = null;
            }
            if (hasReconfirmedInstruction) {
                window.speechSynthesis.cancel();
            }
            hasReconfirmedInstruction = false;
            hasWarnedPosition = true;
            const message = "Rotate left, showing your right shoulder";
            const now = Date.now();
            if (now - lastWarningTime > 2000) {
                lastWarningTime = now;
                speak(message);
            }
        }
        return;
    }

    // Position check during setup
    if (startStep > 0) {
        if (lm[11] && lm[12] && lm[23] && lm[24]) {
            const isInCorrectOrientation = orientationOk();
            
            if (!isInCorrectOrientation) {
                const now = Date.now();
                if (!hasWarnedPosition || (now - lastWarningTime > 2000)) {
                    hasWarnedPosition = true;
                    lastWarningTime = now;
                    speak("Rotate left, showing your right shoulder.");
                }
                return;
            } else {
                if (hasWarnedPosition) {
                    hasWarnedPosition = false;
                }
            }
        }
    }

    switch (startStep) {
        case 0:
            if (k > 160) {
                lowerBodyStableFrames = 0;
                nextTPoseInstruction2m();
            }
            break;

        case 1:
            if (orientationOk()) {
                // User is in correct position, speak final instruction then wait for Go position
                startInstruct = false;
                setTimeout(() => {
                    if (speechCancelled) return;
                    startStep = 2;
                    speak(tPoseInstructions2m[2], () => {
                        if (speechCancelled) return;
                        waitingForGoPosition = true;
                        hasWarnedPosition = false;
                        lastWarningTime = 0;
                        hasReconfirmedInstruction = false;
                        positionConfirmCount = 0; // Reset to force re-check of position
                        startInstruct = true;
                    });
                }, 900);
            }
            break;
    }
}

function nextTPoseInstruction2m() {
    startInstruct = false;
    setTimeout(() => {
        if (speechCancelled) return;
        
        startStep++;
        if (startStep < tPoseInstructions2m.length - 1) {
            speak(tPoseInstructions2m[startStep], () => (startInstruct = true));
        } else {
            if (speechCancelled) return;
            startInstruct = true;
        }
    }, 900);
}

// T-pose requires sideways position (like squat, showing right shoulder)
function isInCorrectTPosePosition2m(lm) {
    if (!(lm[11] && lm[12] && lm[0] && lm[7] && lm[23] && lm[24])) return false;
    
    const shoulderMidY = (lm[11].y + lm[12].y) / 2;
    const hipMidY = (lm[23].y + lm[24].y) / 2;
    const torsoHeight = Math.abs(shoulderMidY - hipMidY);
    
    if (torsoHeight < 0.1) return false;
    
    const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
    const sidewaysRatio = shoulderWidth / torsoHeight;
    const isSideways = sidewaysRatio < 0.4; // Stricter threshold like squat
    
    // Check if user is looking left (face profile visible, left ear to left of nose)
    const isLookingLeft = lm[7].x < lm[0].x;
    
    return isSideways && isLookingLeft;
}

// Handle out-of-frame detection with 10-second timeout
function handleOutOfFrame() {
    const now = Date.now();
    
    // Start tracking out-of-frame time if not already tracking
    if (outOfFrameStartTime === null) {
        outOfFrameStartTime = now;
    }
    
    // Check if 10 seconds have passed
    const timeOutOfFrame = now - outOfFrameStartTime;
    if (timeOutOfFrame >= OUT_OF_FRAME_TIMEOUT_MS) {
        // User has been out of frame for 10 seconds - return to menu immediately
        const callback = returnToMenuCallback;
        
        // Stop all speech immediately
        window.speechSynthesis.cancel();
        
        // Stop the assistant
        stopTPoseVoiceAssistant2m();
        
        // Navigate to home
        if (callback) {
            callback();
        }
        return;
    }
    
    // Warn user every 3 seconds while out of frame
    if (now - lastFrameWarningTime > 3000) {
        lastFrameWarningTime = now;
        window.speechSynthesis.cancel();
        speak("Please come into camera frame");
    }
}

// Reset out-of-frame timer when user returns to frame
function resetOutOfFrameTimer() {
    outOfFrameStartTime = null;
    if (outOfFrameTimeoutId) {
        clearTimeout(outOfFrameTimeoutId);
        outOfFrameTimeoutId = null;
    }
}

export function stopTPoseVoiceAssistant2m() {
    voiceStarted = false;
    startInstruct = false;
    isCaptureActive = false;
    lowerBodyStableFrames = 0;
    speechCancelled = true;
    hasWarnedPosition = false;
    waitingForGoPosition = false;
    lastWarningTime = 0;
    hasReconfirmedInstruction = false;
    hasWarnedEarlyTPose = false;
    lastEarlyTPoseWarningTime = 0;
    needsInstructionRepeatBeforeGo = false;
    earlyWarningInProgress = false;
    outOfFrameStartTime = null;
    returnToMenuCallback = null;
    if (outOfFrameTimeoutId) {
        clearTimeout(outOfFrameTimeoutId);
        outOfFrameTimeoutId = null;
    }
    if (pendingGoTimeout) {
        clearTimeout(pendingGoTimeout);
        pendingGoTimeout = null;
    }
    if (startInterval) {
        clearInterval(startInterval);
        startInterval = null;
    }
    try {
        window.speechSynthesis.cancel();
    } catch (e) {}
    startStep = 0;
}

export function resetTPoseVoiceState2m() {
    voiceStarted = false;
    startStep = 0;
    startInstruct = false;
    isCaptureActive = false;
    lowerBodyStableFrames = 0;
    speechCancelled = false;
    hasWarnedPosition = false;
    hasWarnedEarlyTPose = false;
    lastEarlyTPoseWarningTime = 0;
    needsInstructionRepeatBeforeGo = false;
    earlyWarningInProgress = false;
    if (pendingGoTimeout) {
        clearTimeout(pendingGoTimeout);
        pendingGoTimeout = null;
    }
    if (startInterval) {
        clearInterval(startInterval);
        startInterval = null;
    }
}

export function getTPoseVoiceStarted2m() {
    return voiceStarted;
}

export function getTPoseIsCaptureActive2m() {
    return isCaptureActive;
}

export { isInCorrectTPosePosition2m as isInCorrectTPosePosition, startTPoseBalanceTest };
