import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { spawn } from 'child_process';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';

const API_MAIN = "https://vertiapp.xyz";
const API_PREDICT_ENDPOINT = "/predict";
const API_MODEL_LIST_ENDPOINT = "/list-models";

const STORE_IMAGES_TO_TMP = false;

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

const app = express();
const PORT = 9003;

app.use(cors());
app.use(express.json());

let cameras = [];
let currentModels = [];
let currentModelIndex = 0;
let predictions = [];
let systemErrors = [];

function addSystemError(cameraId, error) {
    const errorEntry = {
        cameraId,
        error: error.toString(),
        timestamp: new Date().toISOString()
    };
    systemErrors.unshift(errorEntry);
    if (systemErrors.length > 50) {
        systemErrors = systemErrors.slice(0, 50);
    }
}

async function detectCameras() {
    const detectedCameras = [];

    try {
        if (isLinux) {
            const videoDevices = await readdir('/dev');
            const cameraDevices = videoDevices
                .filter(device => device.startsWith('video'))
                .map(device => `/dev/${device}`)
                .filter(device => existsSync(device));

            for (let i = 0; i < cameraDevices.length; i++) {
                detectedCameras.push({
                    id: i,
                    device: cameraDevices[i],
                    streamPort: 20000 + i,
                    streamUrl: `http://localhost:${20000 + i}/stream`
                });
            }
        } else if (isWindows) {
            console.log('Windows detected - detecting cameras using dshow');

            const ffmpeg = spawn('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { stdio: 'pipe' });

            return new Promise((resolve) => {
                let output = '';
                let cameraIndex = 0;

                ffmpeg.stderr.on('data', (data) => {
                    output += data.toString();
                });

                ffmpeg.on('close', () => {
                    const lines = output.split('\n');
                    const detectedDeviceNames = [];

                    for (const line of lines) {
                        if (line.includes('] "') && line.includes('" (video)')) {
                            const match = line.match(/\] "([^"]+)" \(video\)/);
                            if (match) {
                                const deviceName = match[1];
                                detectedDeviceNames.push(deviceName);
                                detectedCameras.push({
                                    id: cameraIndex,
                                    device: deviceName,
                                    streamPort: 20000 + cameraIndex,
                                    streamUrl: `http://localhost:${20000 + cameraIndex}/stream`
                                });
                                cameraIndex++;
                            }
                        }
                    }

                    console.log('Detected Windows cameras:', detectedDeviceNames);
                    console.log(`Detected ${detectedCameras.length} cameras:`, detectedCameras);
                    resolve(detectedCameras);
                });
            });
        }
    } catch (error) {
        console.error('Error detecting cameras:', error);
    }

    return detectedCameras;
}

async function getModelList() {
    try {
        const response = await axios.get(`${API_MAIN}${API_MODEL_LIST_ENDPOINT}`);

        return response.data || [];
    } catch (error) {
        console.error('Error fetching model list:', error);
        return ["bacterial-disease", "early-blight"];
    }
}

async function captureFrame(camera) {
    let filepath = null;

    if (STORE_IMAGES_TO_TMP) {
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const filename = `camera-${camera.id}-${timestamp}.jpg`;
        filepath = path.join('./tmp', filename);

        try {
            await mkdir('./tmp', { recursive: true });
        } catch (error) {
            // Directory already exists or other error
        }
    }

    // Use FFmpeg to capture a single frame from MJPEG stream
    const streamUrl = `http://localhost:${camera.streamPort}/stream`;

    return new Promise((resolve, reject) => {
        console.log(`📸 Capturing frame from MJPEG stream: ${streamUrl}`);

        const ffmpegArgs = [
            '-i', streamUrl,
            '-vframes', '1',
            '-f', 'image2',
            '-q:v', '2',
            'pipe:1'
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let imageBuffer = Buffer.alloc(0);
        let hasData = false;

        ffmpeg.stdout.on('data', (data) => {
            imageBuffer = Buffer.concat([imageBuffer, data]);
            hasData = true;
        });

        let stderrOutput = '';
        ffmpeg.stderr.on('data', (data) => {
            stderrOutput += data.toString();
        });

        ffmpeg.on('close', async (code) => {
            if (code === 0 && hasData && imageBuffer.length > 0) {
                try {
                    if (STORE_IMAGES_TO_TMP && filepath) {
                        await writeFile(filepath, imageBuffer);
                        console.log(`Frame captured and saved: ${filepath} (${imageBuffer.length} bytes)`);
                    } else {
                        console.log(`Frame captured for camera ${camera.id} (${imageBuffer.length} bytes)`);
                    }
                    resolve(imageBuffer);
                } catch (error) {
                    console.error(`Error saving image for camera ${camera.id}: ${error}`);
                    reject(new Error(`Failed to save captured frame: ${error.message}`));
                }
            } else {
                const errorMsg = `Failed to capture frame from MJPEG stream for camera ${camera.id}. Exit code: ${code}. Stderr: ${stderrOutput.trim()}`;
                console.error(errorMsg);
                addSystemError(camera.id, errorMsg);
                reject(new Error(errorMsg));
            }
        });

        ffmpeg.on('error', (err) => {
            const errorMsg = `FFmpeg error for camera ${camera.id}: ${err.message}`;
            console.error(errorMsg);
            addSystemError(camera.id, errorMsg);
            reject(new Error(errorMsg));
        });

        // Handle timeout
        setTimeout(() => {
            if (!hasData) {
                ffmpeg.kill('SIGTERM');
                const errorMsg = `Timeout capturing frame from camera ${camera.id}`;
                console.error(errorMsg);
                addSystemError(camera.id, errorMsg);
                reject(new Error(errorMsg));
            }
        }, 10000);
    });
}

async function sendPrediction(camera, imageBuffer, model) {
    try {
        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
        formData.append('image', blob, 'image.jpg');
        formData.append('model', model);

        const response = await fetch(`${API_MAIN}${API_PREDICT_ENDPOINT}`, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        console.log(`Prediction for camera ${camera.id} with model ${model}:`, result);

        const prediction = {
            cameraId: camera.id,
            model: model,
            timestamp: new Date().toISOString(),
            result: result
        };

        predictions.unshift(prediction);
        if (predictions.length > 100) {
            predictions = predictions.slice(0, 100);
        }

        return prediction;
    } catch (error) {
        console.error(`Error making prediction for camera ${camera.id}:`, error);
        return null;
    }
}

async function predictionLoop() {
    if (cameras.length === 0 || currentModels.length === 0) {
        return;
    }

    const currentModel = currentModels[currentModelIndex];
    console.log(`Running predictions with model: ${currentModel}`);

    const predictionPromises = cameras.map(async (camera) => {
        try {
            const imageBuffer = await captureFrame(camera);
            return await sendPrediction(camera, imageBuffer, currentModel);
        } catch (error) {
            const errorMsg = `Camera ${camera.id} capture failed: ${error.message}`;
            console.error(errorMsg);
            addSystemError(camera.id, errorMsg);
            return null;
        }
    });

    await Promise.all(predictionPromises);

    currentModelIndex = (currentModelIndex + 1) % currentModels.length;
}

app.get('/api/cameras', (req, res) => {
    const camerasWithUrls = cameras.map(camera => ({
        ...camera,
        streamUrl: camera.streamUrl || `http://localhost:${camera.streamPort}/stream`
    }));
    res.json(camerasWithUrls);
});

app.get('/api/predictions', (req, res) => {
    res.json(predictions);
});

app.get('/api/models', (req, res) => {
    res.json(currentModels);
});

app.get('/api/status', (req, res) => {
    res.json({
        cameras: cameras.length,
        models: currentModels,
        currentModel: currentModels[currentModelIndex] || null,
        totalPredictions: predictions.length,
        uptime: process.uptime()
    });
});

app.get('/api/errors', (req, res) => {
    res.json(systemErrors);
});

async function initialize() {
    console.log('Initializing API server (FFmpeg streams handled separately)...');

    cameras = await detectCameras();
    currentModels = await getModelList();

    if (cameras.length === 0) {
        console.warn('No cameras detected!');
        return;
    }

    console.log('📋 Detected cameras (streams on ports 20000+):');
    cameras.forEach((camera) => {
        console.log(`  Camera ${camera.id}: ${camera.device} -> Port ${camera.streamPort}`);
    });
    console.log(`Available models: ${currentModels.join(', ')}`);

    console.log('Starting prediction loop...');
    setInterval(predictionLoop, 2000);
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initialize();
});

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit(0);
});