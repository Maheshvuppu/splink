/* ============================================================
   VOICE INSTRUCTIONS MODULE - UNIFIED
   
   Contains:
   - speak()
   - Instruction flow
   - startAssistant()
   - Position checking logic
============================================================ */

import { angle } from './poseDetection.js';

// State
let voiceStarted = false;
let startInterval = null;
let startStep = 0;
let startInstruct = false;
let isCaptureActive = false;
let currentExercise = null;
let currentDistanceMode = '2m';
let getSmoothedLandmarksFunc = null;
let lowerBodyStableFrames = 0;
let speechCancelled = false;
let hasWarnedPosition = false;
let waitingForGoPosition = false;
let lastWarningTime = 0;
let hasReconfirmedInstruction = false;
let hasAskedToRaiseHands = false;
let needsHandsRecheck = false;
let onGoCallback = null;

const REQUIRED_LOWER_BODY_FRAMES = 1;

const baseInstructions = {
    'default': [
        "Show your full body to the camera and stand straight.",
        "Rotate left, showing your right shoulder.",
        "Raise your hands straight up."
    ],
    'forward-bend': [
        "Show your full body to the camera and stand straight.",
        "Rotate left, showing your right shoulder.",
        "Raise your hands straight up."
    ],
    't-pose': [
        "Show your full body to the camera and stand straight.",
        "Rotate left, showing your right shoulder."
    ],
    'high-knee': [
        "Show your full body to the camera and stand straight.",
        "Face the camera directly."
    ],
    'plank': [
        "Show your full body to the camera and stand straight.",
        "Rotate left, showing your right shoulder."
    ]
};

const exerciseInstructions = {
    'squat': "Perform 5 strict squats. You have 12 seconds.",
    'forward-bend': "Bend forward slowly and try to touch your toes. Keep your knees straight. You have 6 seconds.",
    'high-knee': "March in place with high knees. You have 10 seconds.",
    't-pose': "Lift one foot off the ground and hold your balance. Keep your standing leg straight. You have 10 seconds.",
    'plank': "Hold an elbow plank position. You have 30 seconds."
};

function getInstructions() {
    const baseSteps = baseInstructions[currentExercise] || baseInstructions['default'];
    const lastInstruction = exerciseInstructions[currentExercise] || exerciseInstructions['squat'];
    return [...baseSteps, lastInstruction];
}

/* ============================================================
   TEXT-TO-SPEECH
============================================================ */
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
        // Proceed anyway to avoid getting stuck
        if (cb && !speechCancelled) cb();
    };

    utterance.onstart = () => {
        if (speechCancelled) {
            window.speechSynthesis.cancel();
        }
    };
    
    window.speechSynthesis.speak(utterance);
}

/* ============================================================
   INSTRUCTION ASSISTANT FLOW
============================================================ */
export function startAssistant(getSmoothedLandmarks, exercise = 'squat', distanceMode = '2m', onGo = null) {
    if (voiceStarted) return;
    voiceStarted = true;
    currentExercise = exercise;
    currentDistanceMode = distanceMode;
    getSmoothedLandmarksFunc = getSmoothedLandmarks;
    onGoCallback = onGo;
    startStep = 0;
    lowerBodyStableFrames = 0;
    hasWarnedPosition = false;
    waitingForGoPosition = false;
    lastWarningTime = 0;
    hasReconfirmedInstruction = false;
    hasAskedToRaiseHands = false;
    needsHandsRecheck = false;
    
    // Start the instruction loop
    const instructions = getInstructions();
    speak(instructions[0], () => (startInstruct = true));
    startInterval = setInterval(() => checkStepCondition(), 1000);
}

function checkStepCondition() {
    const lm = getSmoothedLandmarksFunc();
    if (!lm || !startInstruct) return;

    // If capture is active, we are done with setup
    if (isCaptureActive) return;

    // Step 0: Full body check (common for all)
    if (startStep === 0) {
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
        
        const lowerBodyVisible = anklesHighlyVisible && kneesHighlyVisible && realisticProportions && anklesInBounds;
        
        if (!lowerBodyVisible) {
            lowerBodyStableFrames = 0;
            return;
        }

        lowerBodyStableFrames++;
        if (lowerBodyStableFrames < REQUIRED_LOWER_BODY_FRAMES) {
            return;
        }
        
        // Condition met, advance
        nextStartInstruction();
        return;
    }

    // Step 1: Orientation check
    if (startStep === 1) {
        if (currentExercise === 'high-knee') {
            // Face camera
            const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
            const torsoHeight = Math.abs(lm[11].y - lm[23].y);
            if (shoulderWidth / torsoHeight > 0.3) {
                nextStartInstruction();
            }
        } else {
            // Rotate left
            const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
            const hipWidth = Math.abs(lm[23].x - lm[24].x);
            const sidewaysRatio = hipWidth / shoulderWidth;
            const leftShoulderVis = lm[11].visibility || 0;
            const rightShoulderVis = lm[12].visibility || 0;
            const isLookingLeft = leftShoulderVis > rightShoulderVis;
            
            if (sidewaysRatio < 0.4 && isLookingLeft) {
                nextStartInstruction();
            }
        }
        return;
    }

    // Step 2: Hands up check (Squat / Forward Bend)
    if (startStep === 2) {
        const baseSteps = baseInstructions[currentExercise] || baseInstructions['default'];
        if (baseSteps.length > 2) {
            const LS = angle(lm[23], lm[11], lm[13]);
            const RS = angle(lm[24], lm[12], lm[14]);
            const LE = angle(lm[11], lm[13], lm[15]);
            const RE = angle(lm[12], lm[14], lm[16]);
            if ((LS > 130 && LE > 140) || (RS > 130 && RE > 140)) {
                nextStartInstruction();
            }
        } else {
            // No hands up required for this exercise, just advance
            nextStartInstruction();
        }
        return;
    }
}

function nextStartInstruction() {
    startInstruct = false;
    
    // Small delay to prevent rapid-fire instructions
    setTimeout(() => {
        if (speechCancelled) return;
        
        startStep++;
        const instructions = getInstructions();
        const baseSteps = baseInstructions[currentExercise] || baseInstructions['default'];
        
        if (startStep < baseSteps.length) {
            speak(instructions[startStep], () => (startInstruct = true));
        } else {
            // Ready for final instruction and Go
            waitingForGoPosition = true;
            hasWarnedPosition = false;
            
            // Switch to faster interval for final check
            if (startInterval) clearInterval(startInterval);
            startInterval = setInterval(finalPositionCheck, 100);
        }
    }, 500);
}

function finalPositionCheck() {
    const lm = getSmoothedLandmarksFunc();
    if (!lm || lm.length === 0) return;

    const instructions = getInstructions();
    const finalInstruction = instructions[instructions.length - 1];
    
    // Check position based on exercise
    const isCorrect = checkPosition(lm, currentExercise);
    
    if (isCorrect) {
        if (waitingForGoPosition) {
            waitingForGoPosition = false;
            hasWarnedPosition = false;
            speak(finalInstruction, () => {
                speak("Go!", () => {
                    clearInterval(startInterval);
                    startInterval = null;
                    isCaptureActive = true;
                    if (onGoCallback) onGoCallback();
                });
            });
        }
    } else {
        if (!hasWarnedPosition) {
            const now = performance.now();
            if (now - lastWarningTime > 3000) {
                hasWarnedPosition = true;
                lastWarningTime = now;
                speak(getPositionWarning(currentExercise), () => {
                    hasWarnedPosition = false;
                });
            }
        }
    }
}

// Removed old startCheckSteps and nextStartInstruction functions
/*
function startCheckSteps() {
    if (!startInstruct) {
        startInstruct = true;
        const instructions = getInstructions();
        speak(instructions[startStep], () => {
            startStep++;
            if (startStep < instructions.length - 1) {
                startInstruct = false;
                startCheckSteps();
            } else {
                // Last instruction before "Go!"
                startInstruct = false;
                waitingForGoPosition = true;
                nextStartInstruction();
            }
        });
    }
}

function nextStartInstruction() {
    if (startInterval) return;
    if (startStep >= getInstructions().length - 1) {
        startInterval = setInterval(() => {
            const lm = getSmoothedLandmarksFunc();
            if (!lm || lm.length === 0) return;

            const instructions = getInstructions();
            const finalInstruction = instructions[instructions.length - 1];
            
            // Check position based on exercise
            const isCorrect = checkPosition(lm, currentExercise);
            
            if (isCorrect) {
                if (waitingForGoPosition) {
                    waitingForGoPosition = false;
                    hasWarnedPosition = false;
                    speak(finalInstruction, () => {
                        speak("Go!", () => {
                            clearInterval(startInterval);
                            startInterval = null;
                            isCaptureActive = true;
                        });
                    });
                }
            } else {
                if (!hasWarnedPosition) {
                    const now = performance.now();
                    if (now - lastWarningTime > 3000) {
                        hasWarnedPosition = true;
                        lastWarningTime = now;
                        speak(getPositionWarning(currentExercise), () => {
                            hasWarnedPosition = false;
                        });
                    }
                }
            }
        }, 100);
    }
}
*/


function checkPosition(lm, exercise) {
    if (!lm || lm.length === 0) return false;
    
    const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
    const hipWidth = Math.abs(lm[23].x - lm[24].x);
    const sidewaysRatio = hipWidth / shoulderWidth;
    const leftShoulderVis = lm[11].visibility || 0;
    const rightShoulderVis = lm[12].visibility || 0;
    const isLookingLeft = leftShoulderVis > rightShoulderVis;
    
    if (exercise === 'high-knee') {
        const torsoHeight = Math.abs(lm[11].y - lm[23].y);
        const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
        return shoulderWidth / torsoHeight > 0.3;
    } 
    
    // Side view check for other exercises
    const isSideways = sidewaysRatio < 0.4 && (isLookingLeft ? leftShoulderVis > 0.6 : rightShoulderVis > 0.6);
    
    if (!isSideways) return false;

    if (exercise === 'squat' || exercise === 'forward-bend') {
        const LS = angle(lm[23], lm[11], lm[13]);
        const RS = angle(lm[24], lm[12], lm[14]);
        const LE = angle(lm[11], lm[13], lm[15]);
        const RE = angle(lm[12], lm[14], lm[16]);
        // Check if hands are up (shoulders open, elbows straight)
        return (LS > 130 && LE > 140) || (RS > 130 && RE > 140);
    }

    return true;
}

function getPositionWarning(exercise) {
    if (exercise === 'high-knee') {
        return "Please face the camera directly.";
    } else if (exercise === 'squat' || exercise === 'forward-bend') {
        const lm = getSmoothedLandmarksFunc ? getSmoothedLandmarksFunc() : null;
        if (lm) {
             const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
             const hipWidth = Math.abs(lm[23].x - lm[24].x);
             const sidewaysRatio = hipWidth / shoulderWidth;
             if (sidewaysRatio >= 0.4) {
                 return "Please rotate left, showing your right shoulder.";
             }
        }
        return "Please raise your hands straight up.";
    } else {
        return "Please rotate left, showing your right shoulder.";
    }
}

export function isInCorrectPosition(lm, exercise) {
    return checkPosition(lm, exercise);
}

export function stopVoiceAssistant() {
    speechCancelled = true;
    try {
        window.speechSynthesis.cancel();
    } catch (e) { }
    if (startInterval) {
        clearInterval(startInterval);
        startInterval = null;
    }
}

export function resetVoiceState() {
    voiceStarted = false;
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
}

export function getVoiceStarted() {
    return voiceStarted;
}

export function setVoiceStarted(value) {
    voiceStarted = value;
}

export function getStartInterval() {
    return startInterval;
}

export function setStartInterval(value) {
    startInterval = value;
}

export function getIsCaptureActive() {
    return isCaptureActive;
}

export function resetSpeechCancelled() {
    speechCancelled = false;
}
