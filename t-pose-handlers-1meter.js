/* T-POSE HANDLERS - 1M */
import { startTPoseBalanceTest, updateTPoseBalance, finishTPoseBalanceTest, tPoseBalanceFinalScore, resetTPoseBalanceState } from './t-pose-scoring-logic-1meter.js';

export function updateTPoseTest(lm, onRepSpeak, onTestFinish, inCorrectPosition = true) {
    updateTPoseBalance(lm, onRepSpeak, onTestFinish, inCorrectPosition, 't-pose');
}

export function getTPoseResults() {
    return finishTPoseBalanceTest();
}

export function resetTPose() {
    resetTPoseBalanceState();
}

export function stopTPose() {
    const results = getTPoseResults();
    resetTPoseBalanceState();
    return results;
}

export { startTPoseBalanceTest, tPoseBalanceFinalScore };
