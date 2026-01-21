/* PLANK VOICE INSTRUCTIONS - 1M */
import { startPlankTest } from './plank-scoring-logic-1meter.js';

export const plankInstructions = [
    "Get into plank position",
    "Hold the plank"
];

export function isInCorrectPlankPosition(lm) {
    const shoulderWidth = Math.abs(lm[11].x - lm[12].x);
    const hipWidth = Math.abs(lm[23].x - lm[24].x);
    const sidewaysRatio = hipWidth / shoulderWidth;
    const leftShoulderVis = lm[11].visibility || 0;
    const rightShoulderVis = lm[12].visibility || 0;
    const isLookingLeft = leftShoulderVis > rightShoulderVis;
    return sidewaysRatio < 0.4 && (isLookingLeft ? leftShoulderVis > 0.6 : rightShoulderVis > 0.6);
}

export { startPlankTest };
