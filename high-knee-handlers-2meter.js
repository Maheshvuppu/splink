/* HIGH KNEE HANDLERS - 2M */
import { updateHighKneeMarch, finishHighKneeMarchTest, highKneeMarchFinalScore as calcScore, resetHighKneeMarchState, startHighKneeMarchTest as startTest } from './high-knee-scoring-logic-2meter.js';

export function startHighKneeTest() {
    startTest();
}

export function updateHighKneeTest(smoothedLm, onRepSpeak, onTestFinish, inCorrectPosition = true) {
    updateHighKneeMarch(smoothedLm, onRepSpeak, onTestFinish, inCorrectPosition, 'high-knee', null);
}

export function getHighKneeResults() {
    return finishHighKneeMarchTest();
}

export function highKneeFinalScore(result) {
    return calcScore(result);
}

export function resetHighKnee() {
    resetHighKneeMarchState();
}

