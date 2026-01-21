/* PLANK HANDLERS - 2M */
import { startPlankTest, updatePlank, finishPlankTest, plankFinalScore, resetPlankState } from './plank-scoring-logic-2meter.js';

export function updatePlankTest(lm, onRepSpeak, onTestFinish, inCorrectPosition = true) {
    updatePlank(lm, onRepSpeak, onTestFinish, inCorrectPosition, 'plank');
}

export function getPlankResults() {
    return finishPlankTest();
}

export function resetPlank() {
    resetPlankState();
}

export function stopPlank() {
    const results = getPlankResults();
    resetPlankState();
    return results;
}

export { startPlankTest, plankFinalScore };
