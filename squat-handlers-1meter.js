/* SQUAT HANDLERS - 1M */
import { updateReps, finalScore, resetTestState as resetSquatState, getRepData, startTest } from './squat-scoring-logic-1meter.js';

export function startSquatTest() {
    startTest();
}

export function updateSquatTest(lm, onRepSpeak, onTestFinish, inCorrectPosition = true, captureFrame = null) {
    updateReps(lm, onRepSpeak, onTestFinish, inCorrectPosition, 'squat', captureFrame);
}

export function getSquatResults() {
    const score = finalScore();
    const reps = getRepData();
    return { score, reps };
}

export function resetSquat() {
    resetSquatState();
}

export function stopSquat() {
    const results = getSquatResults();
    resetSquatState();
    return results;
}
