/* ============================================================
   HIGH KNEE VOICE INSTRUCTIONS - 1 METER DISTANCE
   
   Contains:
   - 1m-specific voice guidance
   - Position checking for high knee at 1m
   - Instruction flow for high knee
============================================================ */

import { angle } from './high-knee-pose-detection-1meter.js';
import { startHighKneeMarchTest } from './high-knee-scoring-logic-1meter.js';

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

const highKneeInstructions1m = [
    "Show your full body to the camera",
    "Face the camera directly.",
    "March in place with high knees. You have 10 seconds."
];

export function getHighKneeInstructions1m() {
    return highKneeInstructions1m;
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
let hasEverBeenInFrame = false;

let hasWarnedEarlyHighKnee = false;
let lastEarlyHighKneeWarningTime = 0;
let earlyWarningInProgress = false;
let needsInstructionRepeatBeforeGo = false;

// Out-of-frame timeout tracking (10 seconds to return or go to home)
let outOfFrameStartTime = null;
let outOfFrameTimeoutId = null;
let returnToMenuCallback = null;
const OUT_OF_FRAME_TIMEOUT_MS = 10000; // 10 seconds

const REQUIRED_LOWER_BODY_FRAMES = 1;

// 1m early-march detection thresholds (aligned with scoring logic)
const EARLY_HIGHKNEE_UP_BEND = 15;
const EARLY_HIGHKNEE_DOWN_BEND = 8;
const EARLY_HIGHKNEE_ANKLE_DIFF_THRESHOLD = 0.03;

export function startHighKneeAssistant1m(getSmoothedLandmarks, onReturnToMenu = null) {
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
    hasEverBeenInFrame = false;
    hasWarnedEarlyHighKnee = false;
    lastEarlyHighKneeWarningTime = 0;
    earlyWarningInProgress = false;
    needsInstructionRepeatBeforeGo = false;
    outOfFrameStartTime = null;
    returnToMenuCallback = onReturnToMenu;
    if (outOfFrameTimeoutId) {
        clearTimeout(outOfFrameTimeoutId);
        outOfFrameTimeoutId = null;
    }
    if (pendingGoTimeout) {
        clearTimeout(pendingGoTimeout);
        pendingGoTimeout = null;
    }

    speak(highKneeInstructions1m[0], () => (startInstruct = true));
    startInterval = setInterval(() => checkHighKneeSteps1m(getSmoothedLandmarks), 1000);
}

function checkHighKneeSteps1m(getSmoothedLandmarks) {
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

    // Detect early marching even while instructions are being spoken.
    // (During speech, startInstruct is false, so we must check before that gate.)
    if (!isCaptureActive && startStep >= 2) {
        if (lm[23] && lm[24] && lm[25] && lm[26] && lm[27] && lm[28] &&
            lm[25].y !== undefined && lm[26].y !== undefined && lm[27].y !== undefined && lm[28].y !== undefined) {
            const leftKneeAngleVal = angle(lm[23], lm[25], lm[27]);
            const rightKneeAngleVal = angle(lm[24], lm[26], lm[28]);
            const leftKneeBend = Math.max(0, 180 - leftKneeAngleVal);
            const rightKneeBend = Math.max(0, 180 - rightKneeAngleVal);
            const ankleDiff = Math.abs(lm[27].y - lm[28].y);

            const isMarchingEarly =
                leftKneeBend > EARLY_HIGHKNEE_UP_BEND ||
                rightKneeBend > EARLY_HIGHKNEE_UP_BEND ||
                (ankleDiff > EARLY_HIGHKNEE_ANKLE_DIFF_THRESHOLD &&
                    (leftKneeBend > EARLY_HIGHKNEE_DOWN_BEND || rightKneeBend > EARLY_HIGHKNEE_DOWN_BEND));

            if (isMarchingEarly) {
                if (earlyWarningInProgress) {
                    return;
                }

                const now = Date.now();
                if (!hasWarnedEarlyHighKnee || (now - lastEarlyHighKneeWarningTime > 3000)) {
                    hasWarnedEarlyHighKnee = true;
                    lastEarlyHighKneeWarningTime = now;

                    if (pendingGoTimeout) {
                        clearTimeout(pendingGoTimeout);
                        pendingGoTimeout = null;
                    }
                    hasReconfirmedInstruction = false;
                    waitingForGoPosition = true;
                    needsInstructionRepeatBeforeGo = true;

                    window.speechSynthesis.cancel();
                    startInstruct = false;
                    earlyWarningInProgress = true;
                    speak("Follow voice instructions", () => {
                        if (speechCancelled) return;
                        earlyWarningInProgress = false;
                        startInstruct = true;
                    });
                } else {
                    // Throttled: don't cancel current speech (it might be the warning).
                    startInstruct = true;
                }
                return;
            }
        }
    }

    // Now check startInstruct for normal instruction flow
    if (!startInstruct) return;

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
        const inCorrectPosition = isInCorrectHighKneePosition1m(lm);
        if (inCorrectPosition) {
            if (hasReconfirmedInstruction) {
                return;
            }
            
            hasReconfirmedInstruction = true;
            if (pendingGoTimeout) {
                clearTimeout(pendingGoTimeout);
                pendingGoTimeout = null;
            }
            // If we had warned before, or we interrupted due to early marching,
            // re-speak the instruction before Go.
            if (hasWarnedPosition || needsInstructionRepeatBeforeGo) {
                speak(highKneeInstructions1m[2], () => {
                    if (speechCancelled || !hasReconfirmedInstruction) return;
                    pendingGoTimeout = setTimeout(() => {
                        if (speechCancelled || !hasReconfirmedInstruction) return;
                        speak("Go!", () => {
                            if (speechCancelled || !hasReconfirmedInstruction) return;
                            waitingForGoPosition = false;
                            hasWarnedPosition = false;
                            needsInstructionRepeatBeforeGo = false;
                            hasReconfirmedInstruction = false;
                            if (pendingGoTimeout) {
                                clearTimeout(pendingGoTimeout);
                                pendingGoTimeout = null;
                            }
                            isCaptureActive = true;
                            if (startInterval) {
                                clearInterval(startInterval);
                                startInterval = null;
                            }
                            startHighKneeMarchTest();
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
                        needsInstructionRepeatBeforeGo = false;
                        hasReconfirmedInstruction = false;
                        if (pendingGoTimeout) {
                            clearTimeout(pendingGoTimeout);
                            pendingGoTimeout = null;
                        }
                        isCaptureActive = true;
                        if (startInterval) {
                            clearInterval(startInterval);
                            startInterval = null;
                        }
                        startHighKneeMarchTest();
                    });
                }, 1000);
            }
            return;
        } else {
            if (pendingGoTimeout) {
                clearTimeout(pendingGoTimeout);
                pendingGoTimeout = null;
            }
            if (hasReconfirmedInstruction) {
                window.speechSynthesis.cancel();
            }
            hasReconfirmedInstruction = false;
            hasWarnedPosition = true;
            const message = "Face the camera directly";
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
            const isInCorrectOrientation = isInCorrectHighKneePosition1m(lm);
            
            if (!isInCorrectOrientation) {
                const now = Date.now();
                if (!hasWarnedPosition || (now - lastWarningTime > 2000)) {
                    hasWarnedPosition = true;
                    lastWarningTime = now;
                    speak("Face the camera directly.");
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
                nextHighKneeInstruction1m();
            }
            break;

        case 1:
            if (isInCorrectHighKneePosition1m(lm)) {
                // User is facing camera, speak final instruction then wait for Go position
                startInstruct = false;
                setTimeout(() => {
                    if (speechCancelled) return;
                    startStep = 2;
                    speak(highKneeInstructions1m[2], () => {
                        if (speechCancelled) return;
                        waitingForGoPosition = true;
                        hasWarnedPosition = false;
                        lastWarningTime = 0;
                        hasReconfirmedInstruction = false;
                        startInstruct = true;
                    });
                }, 900);
            }
            break;
    }
}

function nextHighKneeInstruction1m() {
    startInstruct = false;
    setTimeout(() => {
        if (speechCancelled) return;
        
        startStep++;
        if (startStep < highKneeInstructions1m.length - 1) {
            speak(highKneeInstructions1m[startStep], () => (startInstruct = true));
        } else {
            if (speechCancelled) return;
            startInstruct = true;
        }
    }, 900);
}

// High knee requires facing camera directly (not sideways, not face turned)
function isInCorrectHighKneePosition1m(lm) {
    if (!(lm[11] && lm[12] && lm[0])) return false;

    // 1) Body facing camera: both shoulders should be reasonably visible
    const leftShoulderVis = lm[11].visibility ?? 0;
    const rightShoulderVis = lm[12].visibility ?? 0;
    const bothShouldersVisible = leftShoulderVis > 0.4 && rightShoulderVis > 0.4;
    if (!bothShouldersVisible) return false;

    // 2) Face not rotated: nose should be near the middle between shoulders
    const leftShoulderX = lm[11].x;
    const rightShoulderX = lm[12].x;
    const noseX = lm[0].x;

    const shoulderLeft = Math.min(leftShoulderX, rightShoulderX);
    const shoulderRight = Math.max(leftShoulderX, rightShoulderX);
    const shoulderWidth = shoulderRight - shoulderLeft;
    if (shoulderWidth < 0.05) return false;

    const noseT = (noseX - shoulderLeft) / shoulderWidth;
    const noseCentered = noseT > 0.28 && noseT < 0.72;

    // 3) Optional: if ears exist, they shouldn't be extremely imbalanced
    let earsOk = true;
    if (lm[7] && lm[8]) {
        const leftEarVis = lm[7].visibility ?? 0;
        const rightEarVis = lm[8].visibility ?? 0;
        earsOk = Math.abs(leftEarVis - rightEarVis) < 0.65;
    }

    return noseCentered && earsOk;
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
        stopHighKneeVoiceAssistant1m();
        
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

export function stopHighKneeVoiceAssistant1m() {
    voiceStarted = false;
    startInstruct = false;
    isCaptureActive = false;
    lowerBodyStableFrames = 0;
    speechCancelled = true;
    hasWarnedPosition = false;
    waitingForGoPosition = false;
    lastWarningTime = 0;
    hasReconfirmedInstruction = false;
    hasWarnedEarlyHighKnee = false;
    lastEarlyHighKneeWarningTime = 0;
    earlyWarningInProgress = false;
    needsInstructionRepeatBeforeGo = false;
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

export function resetHighKneeVoiceState1m() {
    voiceStarted = false;
    startStep = 0;
    startInstruct = false;
    isCaptureActive = false;
    lowerBodyStableFrames = 0;
    speechCancelled = false;
    hasWarnedPosition = false;
    hasWarnedEarlyHighKnee = false;
    lastEarlyHighKneeWarningTime = 0;
    earlyWarningInProgress = false;
    needsInstructionRepeatBeforeGo = false;
    if (pendingGoTimeout) {
        clearTimeout(pendingGoTimeout);
        pendingGoTimeout = null;
    }
    if (startInterval) {
        clearInterval(startInterval);
        startInterval = null;
    }
}

export function getHighKneeVoiceStarted1m() {
    return voiceStarted;
}

export function getHighKneeIsCaptureActive1m() {
    return isCaptureActive;
}

export { isInCorrectHighKneePosition1m as isInCorrectHighKneePosition };
