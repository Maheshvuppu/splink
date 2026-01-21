/* HIGH KNEE HANDLERS - 1M */
import { updateHighKneeMarch, finishHighKneeMarchTest, highKneeMarchFinalScore as calcScore, resetHighKneeMarchState, startHighKneeMarchTest as startTest } from './high-knee-scoring-logic-1meter.js';

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

