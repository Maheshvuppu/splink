/* ============================================================
   FORWARD BEND VOICE INSTRUCTIONS - 1 METER DISTANCE
   
   Contains:
   - 1m-specific voice guidance
   - Position checking for forward bend at 1m
   - Instruction flow for forward bend
============================================================ */

import { angle } from './forward-bend-pose-detection-1meter.js';
import { startForwardBendTest } from './forward-bend-scoring-logic-1meter.js';
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

const forwardBendInstructions1m = [
    "Show your full body to the camera",
    "Rotate left, showing your right shoulder.",
    "Raise your hands straight up.",
    "Bend forward slowly and try to touch your toes. Keep your knees straight. You have 6 seconds."
];

export function getForwardBendInstructions1m() {
    return forwardBendInstructions1m;
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
let hasAskedToRaiseHands = false;
let needsHandsRecheck = false;
let lastHandsPromptTime = 0;
let lastFrameWarningTime = 0;
let hasEverBeenInFrame = false;
let handsRaisedTimeout = null;
let lastFormWarningTime = 0;
let hasWarnedEarlyBend = false;
let lastEarlyBendWarningTime = 0;

// Out-of-frame timeout tracking (10 seconds to return or go to home)
let outOfFrameStartTime = null;
let outOfFrameTimeoutId = null;
let returnToMenuCallback = null;
const OUT_OF_FRAME_TIMEOUT_MS = 10000; // 10 seconds

let orientationTracker = createSquatOrientationTracker();

const REQUIRED_LOWER_BODY_FRAMES = 1;

export function startForwardBendAssistant1m(getSmoothedLandmarks, onReturnToMenu = null) {
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
    hasAskedToRaiseHands = false;
    needsHandsRecheck = false;
    lastHandsPromptTime = 0;
    lastFrameWarningTime = 0;
    hasEverBeenInFrame = false;
    lastFormWarningTime = 0;
    hasWarnedEarlyBend = false;
    lastEarlyBendWarningTime = 0;
    outOfFrameStartTime = null;
    returnToMenuCallback = onReturnToMenu;
    if (outOfFrameTimeoutId) {
        clearTimeout(outOfFrameTimeoutId);
        outOfFrameTimeoutId = null;
    }
    if (handsRaisedTimeout) {
        clearTimeout(handsRaisedTimeout);
        handsRaisedTimeout = null;
    }
    orientationTracker.reset();

    speak(forwardBendInstructions1m[0], () => (startInstruct = true));
    startInterval = setInterval(() => checkForwardBendSteps1m(getSmoothedLandmarks), 1000);
}

function checkForwardBendSteps1m(getSmoothedLandmarks) {
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

    // Now check startInstruct for normal instruction flow
    if (!startInstruct) return;

    // Track over-rotation/back-facing cases (additive gate).
    orientationTracker.update(lm);

    const orientationOk = () => {
        const basicOk = isInCorrectForwardBendPosition1m(lm);
        const fallbackOk = estimateRightShoulderShown(lm).ok;
        return (basicOk || fallbackOk) && orientationTracker.isOk();
    };

    // Check form during active exercise
    if (isCaptureActive) {
        // Check if user is still in correct orientation
        const basicOk = isInCorrectForwardBendPosition1m(lm);
        const fallbackOk = estimateRightShoulderShown(lm).ok;
        const orientationOk = (basicOk || fallbackOk) && orientationTracker.isOk();
        
        // Check if user is still in frame
        const leftAnkleVis = lm[27] && lm[27].visibility !== undefined ? lm[27].visibility : 0;
        const rightAnkleVis = lm[28] && lm[28].visibility !== undefined ? lm[28].visibility : 0;
        const leftKneeVis = lm[25] && lm[25].visibility !== undefined ? lm[25].visibility : 0;
        const rightKneeVis = lm[26] && lm[26].visibility !== undefined ? lm[26].visibility : 0;
        const inFrame = leftAnkleVis > 0.4 && rightAnkleVis > 0.4 && leftKneeVis > 0.4 && rightKneeVis > 0.4;
        
        // Check if user is bending too early
        if (inFrame && lm[11] && lm[23] && lm[25]) {
            const leftHipAngle = angle(lm[11], lm[23], lm[25]);
            const rightHipAngle = angle(lm[12], lm[24], lm[26]);
            const minHipAngle = Math.min(leftHipAngle, rightHipAngle);
            
            // Hip angle below 140 indicates bending
            if (minHipAngle < 140) {
                const now = Date.now();
                if (!hasWarnedEarlyBend || (now - lastEarlyBendWarningTime > 3000)) {
                    hasWarnedEarlyBend = true;
                    lastEarlyBendWarningTime = now;
                    window.speechSynthesis.cancel();
                    speak("Follow voice instructions:- perform forward bend after go command");
                }
            }
        }
        
        // If user breaks form during exercise, stop and guide
        if (!orientationOk || !inFrame) {
            const now = Date.now();
            if (now - lastFormWarningTime > 2000) {
                lastFormWarningTime = now;
                window.speechSynthesis.cancel();
                speak("Follow instructions and face the camera");
            }
        }
        return;
    }

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

    // Handle waiting for Go position
    if (waitingForGoPosition) {
        // Check if user is bending before "Go!" command
        // Check hip angle to detect forward bend
        const leftHipAngle = lm[11] && lm[23] && lm[25] ? angle(lm[11], lm[23], lm[25]) : 180;
        const rightHipAngle = lm[12] && lm[24] && lm[26] ? angle(lm[12], lm[24], lm[26]) : 180;
        const minHipAngle = Math.min(leftHipAngle, rightHipAngle);
        
        // Check if user is bending too early during wait position
        if (minHipAngle < 140) {
            const now = Date.now();
            if (!hasWarnedEarlyBend || (now - lastEarlyBendWarningTime > 3000)) {
                hasWarnedEarlyBend = true;
                lastEarlyBendWarningTime = now;
                window.speechSynthesis.cancel();
                hasReconfirmedInstruction = false;
                hasAskedToRaiseHands = false;
                speak("Follow voice instructions:- perform forward bend after go command");
            }
            return;
        }
        
        const inCorrectPosition = orientationOk();
        if (inCorrectPosition) {
            const LS = angle(lm[23], lm[11], lm[13]);
            const RS = angle(lm[24], lm[12], lm[14]);
            const LE = angle(lm[11], lm[13], lm[15]);
            const RE = angle(lm[12], lm[14], lm[16]);
            const leftHandUp = (LS > 130 && LE > 140);
            const rightHandUp = (RS > 130 && RE > 140);
            const handsCurrentlyUp = leftHandUp && rightHandUp;
            
            if (needsHandsRecheck) {
                hasReconfirmedInstruction = false;
                if (!hasAskedToRaiseHands) {
                    hasAskedToRaiseHands = true;
                    speak("Raise your hands straight up");
                    if (handsRaisedTimeout) clearTimeout(handsRaisedTimeout);
                    handsRaisedTimeout = setTimeout(() => {
                        console.log('Hands not raised within 10 seconds - returning to home');
                        const callback = returnToMenuCallback;
                        window.speechSynthesis.cancel();
                        stopForwardBendVoiceAssistant1m();
                        if (callback) { callback(); }
                    }, 10000);
                    return;
                }
                if (!handsCurrentlyUp) {
                    const now = Date.now();
                    if (now - lastHandsPromptTime > 2500) {
                        lastHandsPromptTime = now;
                        if (leftHandUp && !rightHandUp) {
                            speak("Raise your other hand also");
                            if (!handsRaisedTimeout) {
                                handsRaisedTimeout = setTimeout(() => {
                                    console.log('Other hand not raised within 10 seconds - returning to home');
                                    const callback = returnToMenuCallback;
                                    window.speechSynthesis.cancel();
                                    stopForwardBendVoiceAssistant1m();
                                    if (callback) { callback(); }
                                }, 10000);
                            }
                        } else if (rightHandUp && !leftHandUp) {
                            speak("Raise your other hand also");
                            if (!handsRaisedTimeout) {
                                handsRaisedTimeout = setTimeout(() => {
                                    console.log('Other hand not raised within 10 seconds - returning to home');
                                    const callback = returnToMenuCallback;
                                    window.speechSynthesis.cancel();
                                    stopForwardBendVoiceAssistant1m();
                                    if (callback) { callback(); }
                                }, 10000);
                            }
                        }
                    }
                    return;
                }
                needsHandsRecheck = false;
                hasAskedToRaiseHands = false;
                if (handsRaisedTimeout) {
                    clearTimeout(handsRaisedTimeout);
                    handsRaisedTimeout = null;
                }
            }
            
            if (hasReconfirmedInstruction) {
                // Check if hands dropped after last instruction was given
                if (!handsCurrentlyUp) {
                    // Hands dropped - need to reset and prompt again
                    hasReconfirmedInstruction = false;
                    hasAskedToRaiseHands = false;
                    window.speechSynthesis.cancel();
                    speak("Raise your hands");
                    if (handsRaisedTimeout) clearTimeout(handsRaisedTimeout);
                    handsRaisedTimeout = setTimeout(() => {
                        console.log('Hands not raised within 10 seconds - returning to home');
                        const callback = returnToMenuCallback;
                        window.speechSynthesis.cancel();
                        stopForwardBendVoiceAssistant1m();
                        if (callback) { callback(); }
                    }, 10000);
                }
                return;
            }
            
            if (!handsCurrentlyUp) {
                const now = Date.now();
                if (!hasAskedToRaiseHands) {
                    hasAskedToRaiseHands = true;
                    speak("Raise your hands straight up");
                    if (handsRaisedTimeout) clearTimeout(handsRaisedTimeout);
                    handsRaisedTimeout = setTimeout(() => {
                        console.log('Hands not raised within 10 seconds - returning to home');
                        const callback = returnToMenuCallback;
                        window.speechSynthesis.cancel();
                        stopForwardBendVoiceAssistant1m();
                        if (callback) { callback(); }
                    }, 10000);
                } else if (now - lastHandsPromptTime > 2500) {
                    lastHandsPromptTime = now;
                    if (leftHandUp && !rightHandUp) {
                        speak("Raise your other hand also");
                        if (!handsRaisedTimeout) {
                            handsRaisedTimeout = setTimeout(() => {
                                console.log('Other hand not raised within 10 seconds - returning to home');
                                const callback = returnToMenuCallback;
                                window.speechSynthesis.cancel();
                                stopForwardBendVoiceAssistant1m();
                                if (callback) { callback(); }
                            }, 10000);
                        }
                    } else if (rightHandUp && !leftHandUp) {
                        speak("Raise your other hand also");
                        if (!handsRaisedTimeout) {
                            handsRaisedTimeout = setTimeout(() => {
                                console.log('Other hand not raised within 10 seconds - returning to home');
                                const callback = returnToMenuCallback;
                                window.speechSynthesis.cancel();
                                stopForwardBendVoiceAssistant1m();
                                if (callback) { callback(); }
                            }, 10000);
                        }
                    }
                }
                return;
            }
            
            hasAskedToRaiseHands = false;
            if (handsRaisedTimeout) {
                clearTimeout(handsRaisedTimeout);
                handsRaisedTimeout = null;
            }
            hasReconfirmedInstruction = true;
            speak(forwardBendInstructions1m[3], () => {
                if (speechCancelled || !hasReconfirmedInstruction) return;
                setTimeout(() => {
                    if (speechCancelled || !hasReconfirmedInstruction) return;
                    speak("Go!", () => {
                        if (speechCancelled || !hasReconfirmedInstruction) return;
                        waitingForGoPosition = false;
                        hasWarnedPosition = false;
                        hasReconfirmedInstruction = false;
                        hasAskedToRaiseHands = false;
                        isCaptureActive = true;
                        if (startInterval) {
                            clearInterval(startInterval);
                            startInterval = null;
                        }
                        startForwardBendTest();
                    });
                }, 1000);
            });
            return;
        } else {
            if (hasReconfirmedInstruction) {
                window.speechSynthesis.cancel();
            }
            hasReconfirmedInstruction = false;
            hasAskedToRaiseHands = false;
            needsHandsRecheck = true;
            if (handsRaisedTimeout) {
                clearTimeout(handsRaisedTimeout);
                handsRaisedTimeout = null;
            }
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
            const shoulderMidY = (lm[11].y + lm[12].y) / 2;
            const hipMidY = (lm[23].y + lm[24].y) / 2;
            const torsoHeight = Math.abs(shoulderMidY - hipMidY);
            
            if (torsoHeight > 0.1) {
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
    }

    switch (startStep) {
        case 0:
            if (k > 160) {
                lowerBodyStableFrames = 0;
                nextForwardBendInstruction1m();
            }
            break;

        case 1:
            if (orientationOk()) {
                const LS = angle(lm[23], lm[11], lm[13]);
                const RS = angle(lm[24], lm[12], lm[14]);
                const LE = angle(lm[11], lm[13], lm[15]);
                const RE = angle(lm[12], lm[14], lm[16]);
                const leftUp = (LS > 130 && LE > 140);
                const rightUp = (RS > 130 && RE > 140);
                const handsAlreadyUp = leftUp && rightUp;
                
                if (handsAlreadyUp) {
                    startInstruct = false;
                    setTimeout(() => {
                        if (speechCancelled) return;
                        startStep = 3;
                        speak(forwardBendInstructions1m[3], () => {
                            if (speechCancelled) return;
                            waitingForGoPosition = true;
                            hasWarnedPosition = false;
                            lastWarningTime = 0;
                            startInstruct = true;
                        });
                    }, 900);
                } else {
                    nextForwardBendInstruction1m();
                }
            }
            break;

        case 2:
            const LS = angle(lm[23], lm[11], lm[13]);
            const RS = angle(lm[24], lm[12], lm[14]);
            const LE = angle(lm[11], lm[13], lm[15]);
            const RE = angle(lm[12], lm[14], lm[16]);
            const leftHandUp2 = (LS > 130 && LE > 140);
            const rightHandUp2 = (RS > 130 && RE > 140);
            const bothHandsUp = leftHandUp2 && rightHandUp2;
            
            if (!bothHandsUp) {
                const now = Date.now();
                if (now - lastHandsPromptTime > 2500) {
                    lastHandsPromptTime = now;
                    if (leftHandUp2 && !rightHandUp2) {
                        speak("Raise your other hand also.");
                        if (!handsRaisedTimeout) {
                            handsRaisedTimeout = setTimeout(() => {
                                console.log('Other hand not raised within 10 seconds - returning to home');
                                const callback = returnToMenuCallback;
                                window.speechSynthesis.cancel();
                                stopForwardBendVoiceAssistant1m();
                                if (callback) { callback(); }
                            }, 10000);
                        }
                    } else if (rightHandUp2 && !leftHandUp2) {
                        speak("Raise your other hand also.");
                        if (!handsRaisedTimeout) {
                            handsRaisedTimeout = setTimeout(() => {
                                console.log('Other hand not raised within 10 seconds - returning to home');
                                const callback = returnToMenuCallback;
                                window.speechSynthesis.cancel();
                                stopForwardBendVoiceAssistant1m();
                                if (callback) { callback(); }
                            }, 10000);
                        }
                    } else {
                        speak("Raise your hands straight up.");
                        if (!handsRaisedTimeout) {
                            handsRaisedTimeout = setTimeout(() => {
                                console.log('Hands not raised within 10 seconds - returning to home');
                                const callback = returnToMenuCallback;
                                window.speechSynthesis.cancel();
                                stopForwardBendVoiceAssistant1m();
                                if (callback) { callback(); }
                            }, 10000);
                        }
                    }
                }
                break;
            }
            if (bothHandsUp) {
                if (handsRaisedTimeout) {
                    clearTimeout(handsRaisedTimeout);
                    handsRaisedTimeout = null;
                }
                nextForwardBendInstruction1m();
            }
            break;
    }
}

function nextForwardBendInstruction1m() {
    startInstruct = false;
    setTimeout(() => {
        if (speechCancelled) return;
        
        startStep++;
        if (startStep < forwardBendInstructions1m.length - 1) {
            speak(forwardBendInstructions1m[startStep], () => (startInstruct = true));
        } else {
            if (speechCancelled) return;
            waitingForGoPosition = true;
            hasWarnedPosition = false;
            lastWarningTime = 0;
            hasReconfirmedInstruction = false;
            startInstruct = true;
        }
    }, 900);
}

function isInCorrectForwardBendPosition1m(lm) {
    if (lm[11] && lm[12] && lm[0] && lm[7] && lm[23] && lm[24]) {
        const shoulderMidY = (lm[11].y + lm[12].y) / 2;
        const hipMidY = (lm[23].y + lm[24].y) / 2;
        const torsoHeight = Math.abs(shoulderMidY - hipMidY);
        if (torsoHeight > 0.1) {
            const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
            const sidewaysRatio = shoulderWidth / torsoHeight;
            const isSideways = sidewaysRatio < 0.4;
            const isLookingLeft = lm[7].x < lm[0].x;
            return isSideways && isLookingLeft;
        }
    }
    return false;
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
        stopForwardBendVoiceAssistant1m();
        
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

export function stopForwardBendVoiceAssistant1m() {
    voiceStarted = false;
    startInstruct = false;
    isCaptureActive = false;
    lowerBodyStableFrames = 0;
    speechCancelled = true;
    hasWarnedPosition = false;
    waitingForGoPosition = false;
    lastWarningTime = 0;
    hasReconfirmedInstruction = false;
    hasAskedToRaiseHands = false;
    needsHandsRecheck = false;
    hasWarnedEarlyBend = false;
    lastEarlyBendWarningTime = 0;
    outOfFrameStartTime = null;
    returnToMenuCallback = null;
    if (outOfFrameTimeoutId) {
        clearTimeout(outOfFrameTimeoutId);
        outOfFrameTimeoutId = null;
    }
    if (handsRaisedTimeout) {
        clearTimeout(handsRaisedTimeout);
        handsRaisedTimeout = null;
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

export function resetForwardBendVoiceState1m() {
    voiceStarted = false;
    startStep = 0;
    startInstruct = false;
    isCaptureActive = false;
    lowerBodyStableFrames = 0;
    speechCancelled = false;
    hasWarnedPosition = false;
    if (startInterval) {
        clearInterval(startInterval);
        startInterval = null;
    }
}

export function getForwardBendVoiceStarted1m() {
    return voiceStarted;
}

export function getForwardBendIsCaptureActive1m() {
    return isCaptureActive;
}

export { isInCorrectForwardBendPosition1m as isInCorrectForwardBendPosition };
