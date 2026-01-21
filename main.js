/* ============================================================
   MAIN APPLICATION MODULE
   
   Handles:
   - DOM elements
   - UI interactions (START/STOP button)
   - Importing other JS modules
   - Connecting the modules together
   - Displaying test results overlay
============================================================ */

import {
    initializePoseLandmarker,
    runPoseDetectionFrame,
    getSmoothedLandmarks,
    setSmoothedLandmarks,
    setLastLandmarks,
    smooth
} from './poseDetection.js';

// Import squat modules for both distances
import { updateSquatTest as updateSquat1m, getSquatResults as getSquatResults1m, resetSquat as resetSquat1m, startSquatTest as startSquat1m } from './squat-handlers-1meter.js';
import { updateSquatTest as updateSquat2m, getSquatResults as getSquatResults2m, resetSquat as resetSquat2m, startSquatTest as startSquat2m } from './squat-handlers-2meter.js';

// Import forward-bend modules for both distances
import { updateForwardBendTest as updateForwardBend1m, getForwardBendResults as getForwardBendResults1m, resetForwardBend as resetForwardBend1m, startForwardBendTest as startForwardBend1m, forwardBendFinalScore as forwardBendFinalScore1m } from './forward-bend-handlers-1meter.js';
import { updateForwardBendTest as updateForwardBend2m, getForwardBendResults as getForwardBendResults2m, resetForwardBend as resetForwardBend2m, startForwardBendTest as startForwardBend2m, forwardBendFinalScore as forwardBendFinalScore2m } from './forward-bend-handlers-2meter.js';

// Import high-knee modules for both distances
import { updateHighKneeTest as updateHighKnee1m, getHighKneeResults as getHighKneeResults1m, resetHighKnee as resetHighKnee1m, startHighKneeTest as startHighKnee1m, highKneeFinalScore as highKneeFinalScore1m } from './high-knee-handlers-1meter.js';
import { updateHighKneeTest as updateHighKnee2m, getHighKneeResults as getHighKneeResults2m, resetHighKnee as resetHighKnee2m, startHighKneeTest as startHighKnee2m, highKneeFinalScore as highKneeFinalScore2m } from './high-knee-handlers-2meter.js';

// Import t-pose modules for both distances
import { updateTPoseTest as updateTPose1m, getTPoseResults as getTPoseResults1m, resetTPose as resetTPose1m, startTPoseBalanceTest as startTPose1m, tPoseBalanceFinalScore as tPoseFinalScore1m } from './t-pose-handlers-1meter.js';
import { updateTPoseTest as updateTPose2m, getTPoseResults as getTPoseResults2m, resetTPose as resetTPose2m, startTPoseBalanceTest as startTPose2m, tPoseBalanceFinalScore as tPoseFinalScore2m } from './t-pose-handlers-2meter.js';

// Import plank modules for both distances
import { updatePlankTest as updatePlank1m, getPlankResults as getPlankResults1m, resetPlank as resetPlank1m, startPlankTest as startPlank1m, plankFinalScore as plankFinalScore1m } from './plank-handlers-1meter.js';
import { updatePlankTest as updatePlank2m, getPlankResults as getPlankResults2m, resetPlank as resetPlank2m, startPlankTest as startPlank2m, plankFinalScore as plankFinalScore2m } from './plank-handlers-2meter.js';

// Import unified voice module
/*
import {
    speak,
    startAssistant,
    stopVoiceAssistant,
    resetVoiceState,
    getVoiceStarted,
    setVoiceStarted,
    getStartInterval,
    setStartInterval,
    getIsCaptureActive,
    isInCorrectPosition,
    resetSpeechCancelled
} from './voice-module.js';
*/

// Import individual voice modules
import { 
    startSquatAssistant1m, stopSquatVoiceAssistant1m, resetSquatVoiceState1m, getSquatVoiceStarted1m, getSquatIsCaptureActive1m, speak as speakSquat1m 
} from './squat-voice-instructions-1meter.js';
import { 
    startSquatAssistant2m, stopSquatVoiceAssistant2m, resetSquatVoiceState2m, getSquatVoiceStarted2m, getSquatIsCaptureActive2m, speak as speakSquat2m 
} from './squat-voice-instructions-2meter.js';
import { 
    startForwardBendAssistant1m, stopForwardBendVoiceAssistant1m, resetForwardBendVoiceState1m, getForwardBendVoiceStarted1m, getForwardBendIsCaptureActive1m, speak as speakForwardBend1m 
} from './forward-bend-voice-instructions-1meter.js';
import { 
    startForwardBendAssistant2m, stopForwardBendVoiceAssistant2m, resetForwardBendVoiceState2m, getForwardBendVoiceStarted2m, getForwardBendIsCaptureActive2m, speak as speakForwardBend2m 
} from './forward-bend-voice-instructions-2meter.js';
import { 
    startHighKneeAssistant1m, stopHighKneeVoiceAssistant1m, resetHighKneeVoiceState1m, getHighKneeVoiceStarted1m, getHighKneeIsCaptureActive1m, speak as speakHighKnee1m 
} from './high-knee-voice-instructions-1meter.js';
import { 
    startHighKneeAssistant2m, stopHighKneeVoiceAssistant2m, resetHighKneeVoiceState2m, getHighKneeVoiceStarted2m, getHighKneeIsCaptureActive2m, speak as speakHighKnee2m 
} from './high-knee-voice-instructions-2meter.js';
import { 
    startTPoseAssistant1m, stopTPoseVoiceAssistant1m, resetTPoseVoiceState1m, getTPoseVoiceStarted1m, getTPoseIsCaptureActive1m, speak as speakTPose1m 
} from './t-pose-voice-instructions-1meter.js';
import { 
    startTPoseAssistant2m, stopTPoseVoiceAssistant2m, resetTPoseVoiceState2m, getTPoseVoiceStarted2m, getTPoseIsCaptureActive2m, speak as speakTPose2m 
} from './t-pose-voice-instructions-2meter.js';

// Helper to dispatch voice commands
function startAssistant(getSmoothedLandmarks, exercise, distanceMode, onGo) {
    if (exercise === 'squat') {
        if (distanceMode === '1m') {
            startSquatAssistant1m(getSmoothedLandmarks, returnToMenu);
        } else {
            startSquatAssistant2m(getSmoothedLandmarks, returnToMenu);
        }
    } else if (exercise === 'forward-bend') {
        if (distanceMode === '1m') {
            startForwardBendAssistant1m(getSmoothedLandmarks, returnToMenu);
        } else {
            startForwardBendAssistant2m(getSmoothedLandmarks, returnToMenu);
        }
    } else if (exercise === 'high-knee') {
        if (distanceMode === '1m') {
            startHighKneeAssistant1m(getSmoothedLandmarks, returnToMenu);
        } else {
            startHighKneeAssistant2m(getSmoothedLandmarks, returnToMenu);
        }
    } else if (exercise === 't-pose') {
        if (distanceMode === '1m') {
            startTPoseAssistant1m(getSmoothedLandmarks, returnToMenu);
        } else {
            startTPoseAssistant2m(getSmoothedLandmarks, returnToMenu);
        }
    }
    // TODO: Add plank exercise
}

function stopVoiceAssistant() {
    // Cancel all speech immediately before stopping anything else
    window.speechSynthesis.cancel();
    stopSquatVoiceAssistant1m();
    stopSquatVoiceAssistant2m();
    stopForwardBendVoiceAssistant1m();
    stopForwardBendVoiceAssistant2m();
    stopHighKneeVoiceAssistant1m();
    stopHighKneeVoiceAssistant2m();
    stopTPoseVoiceAssistant1m();
    stopTPoseVoiceAssistant2m();
    // Cancel again to catch any speech that might have been queued during stop
    window.speechSynthesis.cancel();
    // TODO: Add plank exercise
}

function resetVoiceState() {
    resetSquatVoiceState1m();
    resetSquatVoiceState2m();
    resetForwardBendVoiceState1m();
    resetForwardBendVoiceState2m();
    resetHighKneeVoiceState1m();
    resetHighKneeVoiceState2m();
    resetTPoseVoiceState1m();
    resetTPoseVoiceState2m();
    // TODO: Add plank exercise
}

function getVoiceStarted() {
    // Check all
    return getSquatVoiceStarted1m() || getSquatVoiceStarted2m() || 
           getForwardBendVoiceStarted1m() || getForwardBendVoiceStarted2m() ||
           getHighKneeVoiceStarted1m() || getHighKneeVoiceStarted2m() ||
           getTPoseVoiceStarted1m() || getTPoseVoiceStarted2m();
}

function setVoiceStarted(val) {
    // No-op, state is managed internally by modules
}

function getIsCaptureActive() {
    return getSquatIsCaptureActive1m() || getSquatIsCaptureActive2m() ||
           getForwardBendIsCaptureActive1m() || getForwardBendIsCaptureActive2m() ||
           getHighKneeIsCaptureActive1m() || getHighKneeIsCaptureActive2m() ||
           getTPoseIsCaptureActive1m() || getTPoseIsCaptureActive2m();
}

function speak(text, cb) {
    // Default speak function if needed, or route to active one
    // For now, just use one of them as they are identical
    speakSquat2m(text, cb);
}

function getStartInterval() { return null; } // Not used externally anymore
function setStartInterval() {} // Not used externally anymore
function isInCorrectPosition() { return true; } // Handled internally by voice modules now
function resetSpeechCancelled() {} // Handled internally


// ============================================================
// DOM ELEMENTS
// ============================================================
const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const loading = document.getElementById("loading");
const startBtn = document.getElementById("startBtn");
const backBtn = document.getElementById("backBtn");
const exerciseMenu = document.getElementById("exerciseMenu");
const testArea = document.getElementById("testArea");
const resultPanel = document.getElementById('resultPanel');
const resultContent = document.getElementById('resultContent');
const acceptResults = document.getElementById('acceptResults');
const retryExercise = document.getElementById('retryExercise');
const distanceModeSelect = document.getElementById('distanceMode');
const cameraSelectWrapper = document.getElementById('cameraSelectWrapper');
const cameraSelect = document.getElementById('cameraSelect');
const cameraModal = document.getElementById('cameraModal');
const selectFrontCamera = document.getElementById('selectFrontCamera');
const selectBackCamera = document.getElementById('selectBackCamera');
const cancelCameraSelect = document.getElementById('cancelCameraSelect');

let running = false;
let animationFrameId = null;
let currentExercise = null;
let shouldCancelSpeech = false;

let outputDirHandle = null;
let serverSaveAvailable = false;

// Camera distance mode
const DISTANCE_MODE_KEY = 'cameraDistanceMode';
let currentDistanceMode = '2m';

// Mobile detection and camera facing mode
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       (window.innerWidth <= 768 && 'ontouchstart' in window);
let selectedCameraFacing = 'user'; // 'user' for front, 'environment' for back
const CAMERA_FACING_KEY = 'selectedCameraFacing';
function normalizeDistanceMode(value) {
    return value === '1m' ? '1m' : '2m';
}

function applyDistanceMode(mode) {
    const normalized = normalizeDistanceMode(mode);
    currentDistanceMode = normalized;
    try {
        if (distanceModeSelect) distanceModeSelect.value = normalized;
    } catch (e) { }
    try {
        localStorage.setItem(DISTANCE_MODE_KEY, normalized);
    } catch (e) { }
}

function getDistanceMode() {
    return currentDistanceMode;
}

// Initialize dropdown + scoring mode (default: 2m)
try {
    const stored = normalizeDistanceMode(localStorage.getItem(DISTANCE_MODE_KEY));
    applyDistanceMode(stored);
} catch (e) {
    applyDistanceMode('2m');
}

if (distanceModeSelect) {
    distanceModeSelect.addEventListener('change', (e) => {
        applyDistanceMode(e && e.target ? e.target.value : '2m');
    });
}

const ALL_EXERCISE_KEYS = ['squat', 'forward-bend', 'high-knee', 't-pose', 'plank'];

const OUTPUT_DIR_DB = 'pose-output-dir-db';
const OUTPUT_DIR_STORE = 'handles';
const OUTPUT_DIR_KEY = 'outputDirHandle';

async function detectServerSave() {
    try {
        const res = await fetch('/api/ping', { cache: 'no-store' });
        serverSaveAvailable = !!res.ok;
    } catch (e) {
        serverSaveAvailable = false;
    }
}

function openOutputDirDb() {
    return new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open(OUTPUT_DIR_DB, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(OUTPUT_DIR_STORE)) {
                    db.createObjectStore(OUTPUT_DIR_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) {
            reject(e);
        }
    });
}

async function loadStoredOutputDirHandle() {
    try {
        const db = await openOutputDirDb();
        return await new Promise((resolve) => {
            const tx = db.transaction(OUTPUT_DIR_STORE, 'readonly');
            const store = tx.objectStore(OUTPUT_DIR_STORE);
            const getReq = store.get(OUTPUT_DIR_KEY);
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

async function saveStoredOutputDirHandle(handle) {
    try {
        const db = await openOutputDirDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(OUTPUT_DIR_STORE, 'readwrite');
            const store = tx.objectStore(OUTPUT_DIR_STORE);
            const putReq = store.put(handle, OUTPUT_DIR_KEY);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        });
    } catch (e) {
        console.warn('Failed to persist output directory handle:', e);
    }
}

async function ensureExerciseFoldersExist(dirHandle) {
    if (!dirHandle) return;
    try {
        for (const ex of ALL_EXERCISE_KEYS) {
            const safe = getSafeExerciseFolderName(ex);
            await dirHandle.getDirectoryHandle(safe, { create: true });
        }
    } catch (e) {
        console.warn('Could not pre-create exercise folders:', e);
    }
}

function getSafeExerciseFolderName(exercise) {
    return (exercise || 'unknown').replace(/[^a-z0-9\-]/gi, '_');
}

async function ensureOutputDirectoryPicked() {
    if (outputDirHandle) return outputDirHandle;
    if (!window.showDirectoryPicker) {
        console.warn('File System Access API not supported; images will not be saved to folders.');
        return null;
    }

    // Try to reuse a previously granted handle so the user isn't prompted again.
    try {
        const stored = await loadStoredOutputDirHandle();
        if (stored) {
            // Some browsers expose showDirectoryPicker but not queryPermission/requestPermission.
            // In that case, try to use the handle first before forcing the picker.
            if (typeof stored.queryPermission === 'function') {
                const perm = await stored.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    outputDirHandle = stored;
                    await ensureExerciseFoldersExist(outputDirHandle);
                    return outputDirHandle;
                }
            }

            if (typeof stored.requestPermission === 'function') {
                // This may show a permission prompt, but should not require re-picking a folder.
                const reqPerm = await stored.requestPermission({ mode: 'readwrite' });
                if (reqPerm === 'granted') {
                    outputDirHandle = stored;
                    await ensureExerciseFoldersExist(outputDirHandle);
                    return outputDirHandle;
                }
            } else {
                // No permission API: best-effort attempt.
                try {
                    await ensureExerciseFoldersExist(stored);
                    outputDirHandle = stored;
                    return outputDirHandle;
                } catch (e) {
                    // Fall back to picker below.
                }
            }
        }
    } catch (e) {
        // Ignore and fall back to picker.
    }

    try {
        outputDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

        await saveStoredOutputDirHandle(outputDirHandle);
        await ensureExerciseFoldersExist(outputDirHandle);

        return outputDirHandle;
    } catch (e) {
        console.warn('User did not pick an output directory:', e);
        outputDirHandle = null;
        return null;
    }
}

function canvasToJpegDataUrl() {
    try {
        // Compose a snapshot that includes the mirrored video + the current overlay canvas.
        const w = canvas.width || video.videoWidth;
        const h = canvas.height || video.videoHeight;
        if (!w || !h) return null;

        const snap = document.createElement('canvas');
        snap.width = w;
        snap.height = h;
        const ctx = snap.getContext('2d');
        if (!ctx) return null;

        // Mirror video to match the on-screen view.
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -w, 0, w, h);
        ctx.restore();

        // Overlay landmarks (poseDetection draws mirrored landmarks on `canvas`).
        ctx.drawImage(canvas, 0, 0, w, h);

        return snap.toDataURL('image/jpeg', 0.75);
    } catch (e) {
        return null;
    }
}

async function writeDataUrlToFile(dirHandle, fileName, dataUrl) {
    if (!dirHandle || !dataUrl) return;
    try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    } catch (e) {
        console.warn('Failed to write image file:', e);
    }
}

function captureFrameToExerciseFolder(meta = {}) {
    const exercise = meta.exercise || currentExercise || 'unknown';
    const kind = meta.kind || 'frame';
    const index = meta.index ?? '';
    const safeExercise = getSafeExerciseFolderName(exercise);
    const safeKind = String(kind).replace(/[^a-z0-9\-]/gi, '_');
    const safeIndex = String(index).replace(/[^a-z0-9\-]/gi, '_');
    const stableName = !!meta.stableName;
    const ts = Date.now();
    const fileName = stableName
        ? (safeIndex ? `${safeKind}_${safeIndex}.jpg` : `${safeKind}.jpg`)
        : (safeIndex ? `${ts}_${safeKind}_${safeIndex}.jpg` : `${ts}_${safeKind}.jpg`);
    const relPath = `${safeExercise}/${fileName}`;

    const dataUrl = canvasToJpegDataUrl();

    if (!dataUrl) return null;

    // Preferred: local Node server saves directly into this project's exercise folders.
    if (serverSaveAvailable) {
        (async () => {
            try {
                await fetch('/api/save-frame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ exercise: safeExercise, fileName, dataUrl })
                });
            } catch (e) {
                console.warn('Server save failed:', e);
            }
        })();
        return relPath;
    }

    // Fallback: File System Access API (requires user folder access).
    if (!outputDirHandle) return null;

    (async () => {
        try {
            const exDir = await outputDirHandle.getDirectoryHandle(safeExercise, { create: true });
            await writeDataUrlToFile(exDir, fileName, dataUrl);
        } catch (e) {
            console.warn('Failed to save image file:', e);
        }
    })();

    return relPath;
}

function captureCurrentFrame() {
    try {
        // Canvas already contains the current video frame + overlay.
        return canvas.toDataURL('image/jpeg', 0.75);
    } catch (e) {
        return null;
    }
}

// ============================================================
// EXERCISE SELECTION
// ============================================================
document.querySelectorAll('.exercise-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentExercise = btn.dataset.exercise;
        
        // Hide result panel from previous test
        try {
            resultPanel.style.display = 'none';
        } catch (e) { }
        
        exerciseMenu.classList.add('hidden');
        testArea.classList.remove('hidden');
        startBtn.innerText = `START ${getExerciseName(currentExercise).toUpperCase()}`;
    });
});

// Helper function to return to menu (used by voice assistants when user is out of frame for too long)
function returnToMenu() {
    // Stop all speech immediately - cancel first before anything else
    window.speechSynthesis.cancel();
    shouldCancelSpeech = true;
    stopVoiceAssistant();
    
    // Cancel speech again after stopping voice assistant to catch any queued speech
    window.speechSynthesis.cancel();
    
    stopCamera();
    
    // Hide result panel if showing
    try {
        resultPanel.style.display = 'none';
    } catch (e) { }
    
    testArea.classList.add('hidden');
    exerciseMenu.classList.remove('hidden');
    currentExercise = null;
    startBtn.innerText = 'START TEST';
}

backBtn.addEventListener('click', () => {
    returnToMenu();
});

function getExerciseName(exercise) {
    const names = {
        'forward-bend': 'Forward Bend',
        'squat': 'Squat',
        'high-knee': 'High Knee March',
        't-pose': 'Single Leg Stance',
        'plank': 'Elbow Plank'
    };
    return names[exercise] || 'Test';
}

// ============================================================
// RESULTS OVERLAY
// ============================================================
function showResultsOverlay(score, reps) {
    const isOneMeter = (currentExercise === 'squat') && Array.isArray(reps) && reps.length > 0 && reps[0] && reps[0].distanceMode === '1m';
    const fmtScore = (v) => {
        if (!Number.isFinite(v)) return String(v ?? '-');
        return isOneMeter ? (Math.round(v * 100) / 100).toFixed(2) : String(v);
    };
    const fmtKnee = (v) => {
        if (!Number.isFinite(v)) return '-';
        return isOneMeter ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v));
    };
    const fmtHip = (v) => {
        if (!Number.isFinite(v)) return '-';
        // Keep existing 2-decimal display; do not integer-round in 1m.
        return (Math.round(v * 100) / 100).toFixed(2);
    };
    const fmtFormPct = (v) => {
        if (!Number.isFinite(v)) return '-';
        const pct = v * 100;
        return isOneMeter ? (Math.round(pct * 10) / 10).toFixed(1) : String(Math.round(pct));
    };

    let html = `<h2 class="text-2xl font-bold mb-2">${getExerciseName(currentExercise)} - Test Summary</h2>`;
    html += `<p class="mb-4">Final Score: <strong>${fmtScore(score)} / 100</strong></p>`;

    if (currentExercise === 'squat' && reps && reps.length > 0) {
        html += `<div class="text-left mx-auto max-w-xl">`;
        for (let i = 0; i < reps.length; i++) {
            const r = reps[i];
            const knee = fmtKnee(r.kneeMin);
            const formPct = fmtFormPct(r.form);
            const hip = (r.hipDepth !== undefined) ? fmtHip(r.hipDepth) : '-';
            const sym = (r.sym !== undefined) ? r.sym.toFixed(3) : '-';
            const heelTxt = r.heel ? "<span class='text-red-400'>Heel Lifted</span>" : "OK";
            const shoulderAng = (r.shoulderAngle !== undefined && r.shoulderAngle !== null) ? `${r.shoulderAngle}°` : '-';
            const staggeredTxt = r.staggeredStance ? "<span class='text-red-400'>Yes</span>" : "No";

            html += `<div class="mb-2">
            Rep ${i+1}: 
            Knee min <strong>${knee}°</strong>; 
            Hip depth <strong>${hip}</strong>; 
            Symmetry <strong>${sym}</strong>; 
            Form <strong>${formPct}%</strong>; 
            Heel: ${heelTxt}; 
            Shoulder: <strong>${shoulderAng}</strong>; 
            Staggered: ${staggeredTxt}
            </div>`;
        }
        html += `</div>`;
    } else if (currentExercise === 'forward-bend' && reps) {
        // Display Forward Bend metrics
        html += `<div class="text-left mx-auto max-w-xl">`;
        const hipAngle = reps.hipAngle !== undefined ? Math.round(reps.hipAngle) : '-';
        const kneeBend = reps.kneeBend !== undefined ? Math.round(reps.kneeBend) : '-';
        const reachDist = reps.reachDistance !== undefined ? (Math.round(reps.reachDistance * 100) / 100) : '-';
        const sway = reps.sway !== undefined ? (Math.round(reps.sway * 1000) / 1000) : '-';
        const formPct = reps.form !== undefined ? Math.round(reps.form * 100) : '-';
        const validHold = reps.isValid ? "<span class='text-green-400'>Yes</span>" : "<span class='text-red-400'>No</span>";
        
        html += `<div class="mb-2">Hip Angle: <strong>${hipAngle}°</strong></div>`;
        html += `<div class="mb-2">Knee Bend: <strong>${kneeBend}°</strong></div>`;
        html += `<div class="mb-2">Reach Distance (normalized): <strong>${reachDist}</strong></div>`;
        html += `<div class="mb-2">Sway: <strong>${sway}</strong></div>`;
        html += `<div class="mb-2">Form Score: <strong>${formPct}%</strong></div>`;
        html += `<div class="mb-2">Valid 1-second Hold: ${validHold}</div>`;
        html += `</div>`;
    } else if (currentExercise === 't-pose' && reps) {
        // Display Single Leg Stance metrics
        html += `<div class="text-left mx-auto max-w-xl">`;
        const stanceKnee = reps.stanceKnee !== undefined ? reps.stanceKnee : '-';
        const liftedKnee = reps.liftedKnee !== undefined ? reps.liftedKnee : '-';
        const liftedHip = reps.liftedHipAngle !== undefined ? reps.liftedHipAngle : '-';
        const torsoDev = reps.torsoDeviation !== undefined ? reps.torsoDeviation : '-';
        const sway = reps.sway !== undefined ? reps.sway : '-';
        const holdTime = reps.holdTime !== undefined ? reps.holdTime : '-';
        const formScore = reps.formScore !== undefined ? reps.formScore : '-';
        const stanceLeg = reps.stanceLeg ? (reps.stanceLeg === 'left' ? 'Left (camera view)' : 'Right (camera view)') : 'Auto-detected';
        
        html += `<div class="mb-2">Detected Stance Leg: <strong>${stanceLeg}</strong></div>`;
        html += `<div class="mb-2">Stance Knee Angle: <strong>${stanceKnee}°</strong></div>`;
        html += `<div class="mb-2">Lifted Knee Angle: <strong>${liftedKnee}°</strong></div>`;
        html += `<div class="mb-2">Lifted Hip Angle: <strong>${liftedHip}°</strong></div>`;
        html += `<div class="mb-2">Torso Uprightness: <strong>${torsoDev}° deviation</strong></div>`;
        html += `<div class="mb-2">Sway: <strong>${sway}</strong></div>`;
        html += `<div class="mb-2">Hold Time: <strong>${holdTime}s</strong></div>`;
        html += `<div class="mb-2">Form Score: <strong>${formScore}%</strong></div>`;
        html += `</div>`; 
    } else if (currentExercise === 'high-knee' && reps) {
        // Display High Knee March metrics
        html += `<div class="text-left mx-auto max-w-xl">`;
        // Cap displayed reps at 18
        const actualReps = reps.repCount !== undefined ? reps.repCount : 0;
        const repCount = actualReps > 18 ? 18 : (actualReps || '-');
        const avgLiftHeight = reps.avgLiftHeight !== undefined ? reps.avgLiftHeight : '-';
        const avgLiftNorm = reps.avgLiftNorm !== undefined ? reps.avgLiftNorm : '-';
        const minKneeAngle = reps.minKneeAngle !== undefined ? reps.minKneeAngle : '-';
        const avgTorso = reps.avgTorsoDeviation !== undefined ? reps.avgTorsoDeviation : '-';
        const avgStanding = reps.avgStandingKnee !== undefined ? reps.avgStandingKnee : '-';
        const formScore = reps.formScore !== undefined ? reps.formScore : '-';
        const repScore = reps.repScore !== undefined ? reps.repScore : '-';
        const rhythmScore = reps.rhythmScore !== undefined ? reps.rhythmScore : '-';
        
        html += `<div class="mb-2">Total Reps (10s): <strong>${repCount}</strong></div>`;
        html += `<div class="mb-2">Avg Lift Height: <strong>${avgLiftHeight}</strong></div>`;
        html += `<div class="mb-2">Avg Lift (normalized): <strong>${avgLiftNorm}</strong></div>`;
        html += `<div class="mb-2">Min Knee Angle (lifted): <strong>${minKneeAngle}°</strong></div>`;
        html += `<div class="mb-2">Avg Standing Knee: <strong>${avgStanding}°</strong></div>`;
        html += `<div class="mb-2">Avg Torso Deviation: <strong>${avgTorso}°</strong></div>`;
        html += `<div class="mb-2">Form Score: <strong>${formScore}%</strong></div>`;
        html += `<div class="mb-2">Rep Score: <strong>${repScore}%</strong></div>`;
        html += `<div class="mb-2">Rhythm Score: <strong>${rhythmScore}%</strong></div>`;
        html += `</div>`;
    } else if (currentExercise === 'plank' && reps) {
        // Display Plank metrics
        html += `<div class="text-left mx-auto max-w-xl">`;
        const bodyAngle = reps.bodyAngle !== undefined ? reps.bodyAngle : '-';
        const kneeAngle = reps.kneeAngle !== undefined ? reps.kneeAngle : '-';
        const elbowAngle = reps.elbowAngle !== undefined ? reps.elbowAngle : '-';
        const vertAlign = reps.verticalAlignment !== undefined ? reps.verticalAlignment : '-';
        const holdTime = reps.holdTime !== undefined ? reps.holdTime : '-';
        const formScore = reps.formScore !== undefined ? reps.formScore : '-';
        const validHold = reps.isValid ? "<span class='text-green-400'>Yes</span>" : "<span class='text-red-400'>No</span>";
        
        html += `<div class="mb-2">Body Alignment Angle: <strong>${bodyAngle}°</strong></div>`;
        html += `<div class="mb-2">Knee Angle: <strong>${kneeAngle}°</strong></div>`;
        html += `<div class="mb-2">Elbow Angle: <strong>${elbowAngle}°</strong></div>`;
        html += `<div class="mb-2">Vertical Alignment: <strong>${vertAlign}</strong></div>`;
        html += `<div class="mb-2">Hold Time: <strong>${holdTime}s</strong></div>`;
        html += `<div class="mb-2">Form Score: <strong>${formScore}%</strong></div>`;
        html += `<div class="mb-2">Valid 10-second Hold: ${validHold}</div>`;
        html += `</div>`;
    } else if (reps && reps.length > 0) {
        html += `<p class="text-sm text-gray-400">Detailed metrics coming soon for this exercise.</p>`;
    } else {
        html += `<p>No data recorded.</p>`;
    }

    resultContent.innerHTML = html;
    resultPanel.style.display = 'block';
}

// Accept results - go back to home page
acceptResults?.addEventListener('click', () => {
    // Stop any ongoing speech
    shouldCancelSpeech = true;
    try {
        window.speechSynthesis.cancel();
    } catch (e) { }
    
    try {
        resultPanel.style.display = 'none';
    } catch (e) { }
    try {
        testArea.classList.add('hidden');
        exerciseMenu.classList.remove('hidden');
        currentExercise = null;
        startBtn.innerText = 'START TEST';
    } catch (e) { }
});

// Retry exercise - stay on same page and restart
retryExercise?.addEventListener('click', () => {
    // Stop any ongoing speech
    shouldCancelSpeech = true;
    try {
        window.speechSynthesis.cancel();
    } catch (e) { }
    
    try {
        resultPanel.style.display = 'none';
    } catch (e) { }
    
    // Restart the same exercise
    if (currentExercise) {
        // Stop voice assistant and reset all voice states
        stopVoiceAssistant();
        resetVoiceState();
        
        // Ensure camera is fully stopped first
        running = false;
        try {
            video.srcObject?.getTracks().forEach(t => t.stop());
        } catch (e) { }
        video.srcObject = null;
        
        // Reset exercise-specific state for all exercises
        const is1m = getDistanceMode() === '1m';
        if (currentExercise === 'squat') {
            is1m ? resetSquat1m() : resetSquat2m();
        } else if (currentExercise === 'forward-bend') {
            is1m ? resetForwardBend1m() : resetForwardBend2m();
        } else if (currentExercise === 't-pose') {
            is1m ? resetTPose1m() : resetTPose2m();
        } else if (currentExercise === 'high-knee') {
            is1m ? resetHighKnee1m() : resetHighKnee2m();
        } else if (currentExercise === 'plank') {
            is1m ? resetPlank1m() : resetPlank2m();
        }
        
        // Reset button state
        startBtn.innerText = 'START TEST';
        startBtn.disabled = false;
        
        // Small delay to ensure everything is reset, then start camera directly
        setTimeout(() => {
            startCamera();
        }, 500);
    }
});

// ============================================================
// INITIALIZATION
// ============================================================
async function initialize() {
    try {
        await initializePoseLandmarker(canvas);
        loading.style.display = "none";

        await detectServerSave();

        // Best-effort: reuse previously chosen output dir (no picker).
        outputDirHandle = await loadStoredOutputDirHandle();
        if (outputDirHandle) {
            try {
                if (typeof outputDirHandle.queryPermission === 'function') {
                    const perm = await outputDirHandle.queryPermission({ mode: 'readwrite' });
                    if (perm === 'granted') {
                        await ensureExerciseFoldersExist(outputDirHandle);
                    }
                } else {
                    // No queryPermission: try using the handle.
                    await ensureExerciseFoldersExist(outputDirHandle);
                }
            } catch (e) {
                // Ignore.
            }
        }
        
        // Mobile-specific initialization
        if (isMobileDevice) {
            // Show camera select dropdown on mobile
            if (cameraSelectWrapper) {
                cameraSelectWrapper.classList.remove('hidden');
            }
            
            // Restore saved camera preference
            const savedFacing = localStorage.getItem(CAMERA_FACING_KEY);
            if (savedFacing) {
                selectedCameraFacing = savedFacing;
                if (cameraSelect) cameraSelect.value = savedFacing;
            }
            
            // Adjust video container for portrait on mobile
            const videoContainer = document.querySelector('.mobile-video-container');
            if (videoContainer && window.innerWidth <= 640) {
                videoContainer.style.aspectRatio = '3/4';
            }
            
            console.log('Mobile device detected. Camera selection enabled.');
        }
    } catch (error) {
        console.error("Failed to initialize model:", error);
    }
}

// ============================================================
// CAMERA CONTROL
// ============================================================
startBtn.onclick = async () => {
    if (running) {
        // Stop camera and assistant
        stopCamera();
        return;
    }

    // Start camera
    // If the local server is running, it will save images into the project folders without any picker.
    if (!serverSaveAvailable) {
        await ensureOutputDirectoryPicked();
    }
    
    // On mobile, show camera selection modal if not already selected
    if (isMobileDevice && !sessionStorage.getItem('cameraSelected')) {
        showCameraModal();
    } else {
        startCamera();
    }
};

function showCameraModal() {
    cameraModal.classList.remove('hidden');
}

function hideCameraModal() {
    cameraModal.classList.add('hidden');
}

// Camera modal event listeners
selectFrontCamera?.addEventListener('click', () => {
    selectedCameraFacing = 'user';
    localStorage.setItem(CAMERA_FACING_KEY, 'user');
    sessionStorage.setItem('cameraSelected', 'true');
    if (cameraSelect) cameraSelect.value = 'user';
    hideCameraModal();
    startCamera();
});

selectBackCamera?.addEventListener('click', () => {
    selectedCameraFacing = 'environment';
    localStorage.setItem(CAMERA_FACING_KEY, 'environment');
    sessionStorage.setItem('cameraSelected', 'true');
    if (cameraSelect) cameraSelect.value = 'environment';
    // For back camera, don't mirror the video
    video.style.transform = 'scaleX(1)';
    hideCameraModal();
    startCamera();
});

cancelCameraSelect?.addEventListener('click', () => {
    hideCameraModal();
});

// Camera select dropdown change (for quick switching)
cameraSelect?.addEventListener('change', (e) => {
    selectedCameraFacing = e.target.value;
    localStorage.setItem(CAMERA_FACING_KEY, e.target.value);
    // Update video mirror based on camera
    if (e.target.value === 'environment') {
        video.style.transform = 'scaleX(1)';
    } else {
        video.style.transform = 'scaleX(-1)';
    }
    // If camera is running, restart with new camera
    if (running) {
        stopCamera();
        setTimeout(() => startCamera(), 300);
    }
});

function startCamera() {
    if (!currentExercise) {
        alert('Please select an exercise first');
        return;
    }
    
    // Show loading indicator
    loading.style.display = "flex";
    
    startBtn.innerText = "INITIALIZING...";
    startBtn.disabled = true;
    
    // Build camera constraints based on device type
    let videoConstraints;
    if (isMobileDevice) {
        // Mobile: use simple constraints to avoid zoom/crop issues
        // Let the camera use its native resolution
        videoConstraints = {
            facingMode: { ideal: selectedCameraFacing },
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 960 }
        };
        // Set video mirror based on camera facing
        video.style.transform = selectedCameraFacing === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        // Use contain to show full video without cropping
        video.style.objectFit = 'contain';
    } else {
        // Desktop: standard landscape
        videoConstraints = {
            width: { ideal: 1280 },
            height: { ideal: 720 }
        };
        video.style.transform = 'scaleX(-1)';
        video.style.objectFit = 'cover';
    }
    
    navigator.mediaDevices.getUserMedia({ video: videoConstraints }).then(stream => {
        video.srcObject = stream;
        video.onloadeddata = () => {
            // Hide loading indicator once camera is ready
            loading.style.display = "none";
            
            // Show canvas overlay for pose visualization
            canvas.style.display = 'block';
            
            running = true;
            shouldCancelSpeech = false;
            startBtn.innerText = "STOP";
            startBtn.disabled = false;
            resetVoiceState();
            setVoiceStarted(false);
            
            // Initialize pose detection
            initializePoseLandmarker();
            
            // Initialize exercise-specific state based on distance mode
            const is1m = getDistanceMode() === '1m';
            if (currentExercise === 'squat') {
                is1m ? resetSquat1m() : resetSquat2m();
            } else if (currentExercise === 'forward-bend') {
                is1m ? resetForwardBend1m() : resetForwardBend2m();
            } else if (currentExercise === 't-pose') {
                is1m ? resetTPose1m() : resetTPose2m();
            } else if (currentExercise === 'high-knee') {
                is1m ? resetHighKnee1m() : resetHighKnee2m();
            } else if (currentExercise === 'plank') {
                is1m ? resetPlank1m() : resetPlank2m();
            }
            
            loop();
        };
    }).catch(err => {
        console.error(err);
        loading.style.display = "none";
        startBtn.innerText = "START TEST";
        startBtn.disabled = false;
        
        // If specific camera failed, try with basic constraints
        if (isMobileDevice) {
            console.log('Retrying with basic video constraints...');
            navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
                video.srcObject = stream;
                video.onloadeddata = () => {
                    loading.style.display = "none";
                    canvas.style.display = 'block';
                    running = true;
                    shouldCancelSpeech = false;
                    startBtn.innerText = "STOP";
                    startBtn.disabled = false;
                    resetVoiceState();
                    setVoiceStarted(false);
                    initializePoseLandmarker();
                    const is1m = getDistanceMode() === '1m';
                    if (currentExercise === 'squat') is1m ? resetSquat1m() : resetSquat2m();
                    else if (currentExercise === 'forward-bend') is1m ? resetForwardBend1m() : resetForwardBend2m();
                    else if (currentExercise === 't-pose') is1m ? resetTPose1m() : resetTPose2m();
                    else if (currentExercise === 'high-knee') is1m ? resetHighKnee1m() : resetHighKnee2m();
                    else if (currentExercise === 'plank') is1m ? resetPlank1m() : resetPlank2m();
                    loop();
                };
            }).catch(e => {
                console.error('Camera access failed:', e);
                alert('Unable to access camera. Please check permissions.');
            });
        }
    });
}

function stopCamera() {
    running = false;
    shouldCancelSpeech = true;
    const label = currentExercise ? `START ${getExerciseName(currentExercise).toUpperCase()}` : 'START TEST';
    startBtn.innerText = label;
    startBtn.disabled = false;
    
    // Immediately stop all voice instructions
    try {
        window.speechSynthesis.cancel();
    } catch (e) { }
    stopVoiceAssistant();
    
    // Reset pose detection state
    setSmoothedLandmarks(null);
    setLastLandmarks(null);
    
    try {
        video.srcObject?.getTracks().forEach(t => t.stop());
    } catch (e) { }
    video.srcObject = null;
    canvas.style.display = 'block';
    const interval = getStartInterval();
    if (interval) {
        clearInterval(interval);
        setStartInterval(null);
    }
    setVoiceStarted(false);
    resetVoiceState();
    
    // Reset exercise-specific state based on distance mode
    const is1m = getDistanceMode() === '1m';
    if (currentExercise === 'squat') {
        is1m ? resetSquat1m() : resetSquat2m();
    } else if (currentExercise === 'forward-bend') {
        is1m ? resetForwardBend1m() : resetForwardBend2m();
    } else if (currentExercise === 't-pose') {
        is1m ? resetTPose1m() : resetTPose2m();
    } else if (currentExercise === 'high-knee') {
        is1m ? resetHighKnee1m() : resetHighKnee2m();
    } else if (currentExercise === 'plank') {
        is1m ? resetPlank1m() : resetPlank2m();
    }
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

// ============================================================
// MAIN LOOP
// ============================================================
function loop() {
    if (!running) return;

    // Run pose detection
    runPoseDetectionFrame(video, canvas, (smoothedLm) => {
        // Start assistant only when landmarks are actually detected and visible
        if (!getVoiceStarted() && smoothedLm && smoothedLm.length > 0) {
            startAssistant(getSmoothedLandmarks, currentExercise, getDistanceMode(), () => {
                const is1m = getDistanceMode() === '1m';
                if (currentExercise === 'squat') {
                    is1m ? startSquat1m() : startSquat2m();
                } else if (currentExercise === 'forward-bend') {
                    is1m ? startForwardBend1m() : startForwardBend2m();
                } else if (currentExercise === 't-pose') {
                    is1m ? startTPose1m() : startTPose2m();
                } else if (currentExercise === 'high-knee') {
                    is1m ? startHighKnee1m() : startHighKnee2m();
                } else if (currentExercise === 'plank') {
                    is1m ? startPlank1m() : startPlank2m();
                }
            });
        }

        // Update exercise-specific logic
        if (getVoiceStarted() && getIsCaptureActive()) {
            const is1m = getDistanceMode() === '1m';
            // Check if user is in correct position (skip for forward-bend as bending changes orientation)
            // Note: isInCorrectPosition is now handled internally by voice modules, so we pass true or rely on the module
            const inCorrectPosition = true; 
            
            if (currentExercise === 'squat') {
                if (is1m) {
                    updateSquat1m(smoothedLm, onRepSpeak, onSquatFinish, inCorrectPosition, captureFrameToExerciseFolder);
                } else {
                    updateSquat2m(smoothedLm, onRepSpeak, onSquatFinish, inCorrectPosition, captureFrameToExerciseFolder);
                }
            } else if (currentExercise === 'forward-bend') {
                if (is1m) {
                    updateForwardBend1m(smoothedLm, onRepSpeak, onForwardBendFinish, inCorrectPosition);
                } else {
                    updateForwardBend2m(smoothedLm, onRepSpeak, onForwardBendFinish, inCorrectPosition);
                }
            } else if (currentExercise === 't-pose') {
                if (is1m) {
                    updateTPose1m(smoothedLm, onRepSpeak, onTPoseBalanceFinish, inCorrectPosition);
                } else {
                    updateTPose2m(smoothedLm, onRepSpeak, onTPoseBalanceFinish, inCorrectPosition);
                }
            } else if (currentExercise === 'high-knee') {
                if (is1m) {
                    updateHighKnee1m(smoothedLm, onRepSpeak, onHighKneeMarchFinish, inCorrectPosition);
                } else {
                    updateHighKnee2m(smoothedLm, onRepSpeak, onHighKneeMarchFinish, inCorrectPosition);
                }
            } else if (currentExercise === 'plank') {
                if (is1m) {
                    updatePlank1m(smoothedLm, onRepSpeak, onPlankFinish, inCorrectPosition);
                } else {
                    updatePlank2m(smoothedLm, onRepSpeak, onPlankFinish, inCorrectPosition);
                }
            }
        }
    });

    animationFrameId = requestAnimationFrame(loop);
}

// ============================================================
// REP TRACKING CALLBACKS
// ============================================================
function onRepSpeak(text) {
    speak(text);
}

function onForwardBendFinish() {
    const is1m = getDistanceMode() === '1m';
    const scoreFrame = captureFrameToExerciseFolder({ exercise: currentExercise, kind: 'score', index: 'final' });
    const result = is1m ? getForwardBendResults1m() : getForwardBendResults2m();
    const score = is1m ? forwardBendFinalScore1m(result) : forwardBendFinalScore2m(result);

    if (result && scoreFrame) {
        result.scoreFrame = scoreFrame;
    }
    
    // Reset state after getting results
    is1m ? resetForwardBend1m() : resetForwardBend2m();
    
    showResultsOverlay(score, result);
    
    // Async speech and cleanup
    (async function () {
        const speakAsync = (text) => new Promise(resolve => {
            if (shouldCancelSpeech) { resolve(); return; }
            speak(text, resolve);
        });
        
        if (!shouldCancelSpeech) await speakAsync("Test complete.");
        if (!shouldCancelSpeech) await speakAsync("Your final score is " + score + " out of one hundred.");
        
        if (!shouldCancelSpeech && result && result.isValid) {
            const hipAngle = Math.round(result.hipAngle);
            const kneeBend = Math.round(result.kneeBend);
            await speakAsync(`Hip angle: ${hipAngle} degrees. Knee bend: ${kneeBend} degrees.`);
        } else if (!shouldCancelSpeech) {
            await speakAsync("Valid hold was not achieved.");
        }
        
        if (!shouldCancelSpeech) await speakAsync("Turning off camera and stopping pose detection.");
        
        // Clear state
        running = false;
        setVoiceStarted(false);
        resetVoiceState();
        is1m ? resetForwardBend1m() : resetForwardBend2m();
        try {
            startBtn.innerText = `START ${getExerciseName(currentExercise).toUpperCase()}`;
        } catch (e) { }
        try {
            video.srcObject?.getTracks().forEach(t => t.stop());
        } catch (e) { }
        try {
            video.pause();
        } catch (e) { }
        try {
            video.srcObject = null;
        } catch (e) { }
        try {
            canvas.style.display = 'none';
        } catch (e) { }
    })();
}

function onTPoseBalanceFinish() {
    const is1m = getDistanceMode() === '1m';
    const scoreFrame = captureFrameToExerciseFolder({ exercise: currentExercise, kind: 'score', index: 'final' });
    const result = is1m ? getTPoseResults1m() : getTPoseResults2m();
    const score = is1m ? tPoseFinalScore1m(result) : tPoseFinalScore2m(result);

    if (result && scoreFrame) {
        result.scoreFrame = scoreFrame;
    }
    
    // Reset state after getting results
    is1m ? resetTPose1m() : resetTPose2m();
    
    showResultsOverlay(score, result);
    
    // Async speech and cleanup
    (async function () {
        const speakAsync = (text) => new Promise(resolve => {
            if (shouldCancelSpeech) { resolve(); return; }
            speak(text, resolve);
        });
        
        if (!shouldCancelSpeech) await speakAsync("Test complete.");
        if (!shouldCancelSpeech) await speakAsync("Your final score is " + score + " out of one hundred.");
        
        if (!shouldCancelSpeech && result && result.isValid) {
            const holdTime = (result.holdTime ?? 0).toFixed(1);
            const legUsed = result.stanceLeg === 'right' ? 'right' : 'left';
            await speakAsync(`You held the T-pose for ${holdTime} seconds on your ${legUsed} leg.`);
        } else if (!shouldCancelSpeech) {
            await speakAsync("Valid hold was not achieved. Try holding for at least 5 seconds.");
        }
        
        if (!shouldCancelSpeech) await speakAsync("Turning off camera and stopping pose detection.");
        
        // Clear state
        running = false;
        setVoiceStarted(false);
        resetVoiceState();
        is1m ? resetTPose1m() : resetTPose2m();
        try {
            startBtn.innerText = `START ${getExerciseName(currentExercise).toUpperCase()}`;
        } catch (e) { }
        try {
            video.srcObject?.getTracks().forEach(t => t.stop());
        } catch (e) { }
        try {
            video.pause();
        } catch (e) { }
        try {
            video.srcObject = null;
        } catch (e) { }
        try {
            canvas.style.display = 'none';
        } catch (e) { }
    })();
}

function onHighKneeMarchFinish() {
    const is1m = getDistanceMode() === '1m';
    const scoreFrame = captureFrameToExerciseFolder({ exercise: currentExercise, kind: 'score', index: 'final' });
    const result = is1m ? getHighKneeResults1m() : getHighKneeResults2m();
    const score = is1m ? highKneeFinalScore1m(result) : highKneeFinalScore2m(result);

    if (result && scoreFrame) {
        result.scoreFrame = scoreFrame;
    }
    
    // Stop running FIRST to prevent detection loop from restarting assistant
    running = false;
    
    // Stop voice assistant and clear interval immediately to prevent overlapping speech
    stopVoiceAssistant();
    
    // Reset speechCancelled so we can announce the score
    resetSpeechCancelled();
    
    // Reset state after getting results
    is1m ? resetHighKnee1m() : resetHighKnee2m();
    
    showResultsOverlay(score, result);
    
    // Async speech and cleanup
    (async function () {
        const speakAsync = (text) => new Promise(resolve => {
            if (shouldCancelSpeech) { resolve(); return; }
            speak(text, resolve);
        });
        
        if (!shouldCancelSpeech) await speakAsync("Test complete.");
        if (!shouldCancelSpeech) await speakAsync("Your final score is " + score + " out of one hundred.");
        
        if (!shouldCancelSpeech && result && result.repCount > 0) {
            await speakAsync(`You completed ${result.repCount} high knee marches.`);
        } else if (!shouldCancelSpeech) {
            await speakAsync("No valid reps were recorded.");
        }
        
        if (!shouldCancelSpeech) await speakAsync("Turning off camera and stopping pose detection.");
        
        // Clear state (running already set to false at start of finish handler)
        setVoiceStarted(false);
        resetVoiceState();
        is1m ? resetHighKnee1m() : resetHighKnee2m();
        try {
            startBtn.innerText = `START ${getExerciseName(currentExercise).toUpperCase()}`;
        } catch (e) { }
        try {
            video.srcObject?.getTracks().forEach(t => t.stop());
        } catch (e) { }
        try {
            video.pause();
        } catch (e) { }
        try {
            video.srcObject = null;
        } catch (e) { }
        try {
            canvas.style.display = 'none';
        } catch (e) { }
    })();
}

function onPlankFinish() {
    const is1m = getDistanceMode() === '1m';
    const scoreFrame = captureFrameToExerciseFolder({ exercise: currentExercise, kind: 'score', index: 'final' });
    const result = is1m ? getPlankResults1m() : getPlankResults2m();
    const score = is1m ? plankFinalScore1m(result) : plankFinalScore2m(result);

    if (result && scoreFrame) {
        result.scoreFrame = scoreFrame;
    }
    
    // Reset state after getting results
    is1m ? resetPlank1m() : resetPlank2m();
    
    showResultsOverlay(score, result);
    
    // Async speech and cleanup
    (async function () {
        const speakAsync = (text) => new Promise(resolve => {
            if (shouldCancelSpeech) { resolve(); return; }
            speak(text, resolve);
        });
        
        if (!shouldCancelSpeech) await speakAsync("Test complete.");
        if (!shouldCancelSpeech) await speakAsync("Your final score is " + score + " out of one hundred.");
        
        if (!shouldCancelSpeech && result && result.isValid) {
            const holdTime = (result.holdTime ?? 0).toFixed(1);
            await speakAsync(`You held the plank for ${holdTime} seconds.`);
        } else if (!shouldCancelSpeech) {
            await speakAsync("Valid hold was not achieved. Try holding for at least 10 seconds.");
        }
        
        if (!shouldCancelSpeech) await speakAsync("Turning off camera and stopping pose detection.");
        
        // Clear state
        running = false;
        setVoiceStarted(false);
        resetVoiceState();
        is1m ? resetPlank1m() : resetPlank2m();
        try {
            startBtn.innerText = `START ${getExerciseName(currentExercise).toUpperCase()}`;
        } catch (e) { }
        try {
            video.srcObject?.getTracks().forEach(t => t.stop());
        } catch (e) { }
        try {
            video.pause();
        } catch (e) { }
        try {
            video.srcObject = null;
        } catch (e) { }
        try {
            canvas.style.display = 'none';
        } catch (e) { }
    })();
}

function onSquatFinish() {
    const is1m = getDistanceMode() === '1m';
    const scoreFrame = captureFrameToExerciseFolder({ exercise: currentExercise, kind: 'score', index: 'final' });
    const result = is1m ? getSquatResults1m() : getSquatResults2m();
    const score = result && result.score !== undefined ? result.score : 0;
    const repData = result && result.reps ? result.reps : [];
    
    if (repData && scoreFrame) {
        // Attach as metadata for later inspection (not shown in UI by default)
        repData.scoreFrame = scoreFrame;
    }
    
    // Reset state after getting results
    is1m ? resetSquat1m() : resetSquat2m();
    
    // Show overlay first
    showResultsOverlay(score, repData);

    // Stop camera and hide canvas
    try {
        video.srcObject?.getTracks().forEach(t => t.stop());
    } catch (e) { }
    try {
        video.pause();
    } catch (e) { }
    try {
        video.srcObject = null;
    } catch (e) { }
    try {
        canvas.style.display = 'none';
    } catch (e) { }

    // Async speech summary
    (async function () {
        const speakAsync = (text) => new Promise(resolve => {
            if (shouldCancelSpeech) { resolve(); return; }
            speak(text, resolve);
        });

        const isOneMeter = Array.isArray(repData) && repData.length > 0 && repData[0] && repData[0].distanceMode === '1m';
        const scoreSpoken = (Number.isFinite(score) && isOneMeter) ? (Math.round(score * 100) / 100).toFixed(2) : score;

        if (!shouldCancelSpeech) await speakAsync("Test complete.");
        if (!shouldCancelSpeech) await speakAsync("Your final score is " + scoreSpoken + " out of one hundred.");

        if (!shouldCancelSpeech && repData && repData.length > 0) {
            for (let i = 0; i < repData.length; i++) {
                if (shouldCancelSpeech) break;
                const r = repData[i];
                const knee = Number.isFinite(r.kneeMin)
                    ? (isOneMeter ? (Math.round(r.kneeMin * 10) / 10).toFixed(1) : Math.round(r.kneeMin))
                    : 0;
                const formPct = Number.isFinite(r.form)
                    ? (isOneMeter ? (Math.round(r.form * 1000) / 10).toFixed(1) : Math.round(r.form * 100))
                    : 0;
                await speakAsync(`Rep ${i + 1}: knee minimum angle ${knee} degrees. Form score ${formPct} percent.`);
            }
        } else if (!shouldCancelSpeech) {
            await speakAsync("No valid reps were recorded.");
        }

        if (!shouldCancelSpeech) await speakAsync("Turning off camera and stopping pose detection.");

        // Clear state
        running = false;
        setVoiceStarted(false);
        resetVoiceState();
        is1m ? resetSquat1m() : resetSquat2m();
        try {
            startBtn.innerText = `START ${getExerciseName(currentExercise).toUpperCase()}`;
        } catch (e) { }
        try {
            video.srcObject?.getTracks().forEach(t => t.stop());
        } catch (e) { }
    })();
}

// ============================================================
// STARTUP
// ============================================================
initialize();

