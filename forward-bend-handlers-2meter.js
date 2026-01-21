/* ============================================================
   FORWARD BEND HANDLERS - 2 METER DISTANCE
============================================================ */

import { updateForwardBend, finishForwardBendTest, forwardBendFinalScore as calcScore, resetForwardBendState, startForwardBendTest as startTest } from './forward-bend-scoring-logic-2meter.js';

export function startForwardBendTest() {
    startTest();
}

export function updateForwardBendTest(smoothedLm, onRepSpeak, onTestFinish, inCorrectPosition = true) {
    updateForwardBend(smoothedLm, onRepSpeak, onTestFinish, inCorrectPosition, 'forward-bend', null);
}

export function getForwardBendResults() {
    return finishForwardBendTest();
}

export function forwardBendFinalScore(result) {
    return calcScore(result);
}

export function resetForwardBend() {
    resetForwardBendState();
}

