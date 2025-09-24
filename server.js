import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import multer from 'multer';

const API_MAIN = "https://vertiapp.xyz";
const API_PREDICT_ENDPOINT = "/predict";
const API_MODEL_LIST_ENDPOINT = "/list-models";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let cameras = [];
let currentModels = [];
let currentModelIndex = 0;
let predictions = [];
let ffmpegProcesses = [];

async function detectCameras() {
    const detectedCameras = [];

    try {
        const videoDevices = await readdir('/dev');
        const cameraDevices = videoDevices
            .filter(device => device.startsWith('video'))
            .map(device => `/dev/${device}`)
            .filter(device => existsSync(device));

        for (let i = 0; i < cameraDevices.length; i++) {
            detectedCameras.push({
                id: i,
                device: cameraDevices[i],
                streamPort: 8081 + i,
                streamUrl: `http://localhost:${8081 + i}/stream`
            });
        }

        console.log(`Detected ${detectedCameras.length} cameras:`, detectedCameras);
    } catch (error) {
        console.error('Error detecting cameras:', error);
    }

    return detectedCameras;
}

async function getModelList() {
    try {
        const response = await axios.get(`${API_MAIN}${API_MODEL_LIST_ENDPOINT}`);
        console.log('Available models:', response.data);
        return response.data || ["bacterial-disease", "early-blight"];
    } catch (error) {
        console.error('Error fetching models:', error);
        return ["bacterial-disease", "early-blight"];
    }
}

function startCameraStream(camera) {
    const ffmpeg = spawn('ffmpeg', [
        '-f', 'v4l2',
        '-i', camera.device,
        '-vf', 'scale=640:480',
        '-r', '15',
        '-f', 'mjpeg',
        '-listen', '1',
        '-http_server_port', camera.streamPort.toString(),
        '-'
    ], { stdio: 'pipe' });

    ffmpegProcesses.push(ffmpeg);

    ffmpeg.stdout.on('data', (data) => {
        console.log(`Camera ${camera.id} streaming on port ${camera.streamPort}`);
    });

    ffmpeg.stderr.on('data', (data) => {
        console.log(`FFmpeg ${camera.id}: ${data}`);
    });

    ffmpeg.on('close', (code) => {
        console.log(`FFmpeg process for camera ${camera.id} exited with code ${code}`);
    });

    return ffmpeg;
}

async function captureFrame(camera) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-f', 'v4l2',
            '-i', camera.device,
            '-vframes', '1',
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-'
        ], { stdio: 'pipe' });

        let imageBuffer = Buffer.alloc(0);

        ffmpeg.stdout.on('data', (data) => {
            imageBuffer = Buffer.concat([imageBuffer, data]);
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(imageBuffer);
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });

        ffmpeg.stderr.on('data', (data) => {
            console.log(`Capture FFmpeg ${camera.id}: ${data}`);
        });
    });
}

async function sendPrediction(camera, imageBuffer, model) {
    try {
        const formData = new FormData();
        formData.append('image', new Blob([imageBuffer]), 'image.jpg');
        formData.append('model', model);
        formData.append('threshold', '0.5');

        const response = await axios.post(`${API_MAIN}${API_PREDICT_ENDPOINT}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        const prediction = {
            cameraId: camera.id,
            model: model,
            timestamp: new Date().toISOString(),
            result: response.data
        };

        predictions.unshift(prediction);
        if (predictions.length > 100) {
            predictions = predictions.slice(0, 100);
        }

        console.log(`Prediction for camera ${camera.id} with model ${model}:`, response.data);
        return prediction;
    } catch (error) {
        console.error(`Error sending prediction for camera ${camera.id}:`, error);
        return null;
    }
}

async function predictionLoop() {
    if (cameras.length === 0 || currentModels.length === 0) return;

    const currentModel = currentModels[currentModelIndex];
    console.log(`Running predictions with model: ${currentModel}`);

    const predictionPromises = cameras.map(async (camera) => {
        try {
            const imageBuffer = await captureFrame(camera);
            return await sendPrediction(camera, imageBuffer, currentModel);
        } catch (error) {
            console.error(`Error processing camera ${camera.id}:`, error);
            return null;
        }
    });

    await Promise.all(predictionPromises);

    currentModelIndex = (currentModelIndex + 1) % currentModels.length;
}

app.get('/api/cameras', (req, res) => {
    res.json(cameras);
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

async function initialize() {
    console.log('Initializing camera detection system...');

    cameras = await detectCameras();
    currentModels = await getModelList();

    if (cameras.length === 0) {
        console.warn('No cameras detected!');
        return;
    }

    console.log('Starting camera streams...');
    cameras.forEach(camera => {
        startCameraStream(camera);
    });

    console.log('Starting prediction loop...');
    setInterval(predictionLoop, 2000);
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initialize();
});

process.on('SIGINT', () => {
    console.log('Shutting down...');
    ffmpegProcesses.forEach(process => {
        process.kill('SIGTERM');
    });
    process.exit(0);
});