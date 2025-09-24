import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import http from 'http';

const isWindows = os.platform() === 'win32';

async function detectCameraResolution(device) {
    return new Promise((resolve) => {
        console.log(`🔍 Detecting resolution for: ${device}`);

        let ffmpegArgs;
        if (isWindows) {
            ffmpegArgs = ['-list_options', 'true', '-f', 'dshow', '-i', `video=${device}`];
        } else {
            ffmpegArgs = ['-f', 'v4l2', '-list_formats', 'all', '-i', device];
        }

        const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
        let output = '';

        ffmpeg.stderr.on('data', (data) => {
            output += data.toString();
        });

        ffmpeg.on('close', () => {
            const resolutions = [];
            const lines = output.split('\n');

            if (isWindows) {
                // Parse Windows dshow format options
                for (const line of lines) {
                    // Look for resolution patterns like "1920x1080" or "1280x720"
                    const resMatch = line.match(/(\d{3,4}x\d{3,4})/g);
                    if (resMatch) {
                        resMatch.forEach(res => {
                            if (!resolutions.includes(res)) {
                                resolutions.push(res);
                            }
                        });
                    }
                }
            } else {
                // Parse Linux v4l2 format options
                for (const line of lines) {
                    // Look for Size: Discrete patterns
                    const sizeMatch = line.match(/Size: Discrete (\d{3,4}x\d{3,4})/);
                    if (sizeMatch) {
                        const res = sizeMatch[1];
                        if (!resolutions.includes(res)) {
                            resolutions.push(res);
                        }
                    }
                }
            }

            // Sort resolutions by pixel count and find best one <= 1080p
            const sortedResolutions = resolutions
                .map(res => {
                    const [width, height] = res.split('x').map(Number);
                    return { res, width, height, pixels: width * height };
                })
                .sort((a, b) => b.pixels - a.pixels);

            // Find highest resolution that's <= 1920x1080
            const maxRes = sortedResolutions.find(r => r.width <= 1920 && r.height <= 1080);
            const selectedRes = maxRes ? maxRes.res : '1280x720'; // fallback

            console.log(`📐 Camera ${device} - Available: [${resolutions.join(', ')}], Selected: ${selectedRes}`);
            resolve(selectedRes);
        });

        ffmpeg.on('error', () => {
            console.log(`⚠️  Could not detect resolution for ${device}, using default 1280x720`);
            resolve('1280x720');
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            ffmpeg.kill('SIGTERM');
            console.log(`⏱️  Resolution detection timeout for ${device}, using default 1280x720`);
            resolve('1280x720');
        }, 5000);
    });
}

async function detectCameras() {
    const detectedCameras = [];

    try {
        if (!isWindows) {
            // Linux/Raspberry Pi camera detection
            const videoDevices = await readdir('/dev');
            const cameraDevices = videoDevices
                .filter(device => device.startsWith('video'))
                .map(device => `/dev/${device}`)
                .filter(device => existsSync(device));

            for (let i = 0; i < cameraDevices.length; i++) {
                const resolution = await detectCameraResolution(cameraDevices[i]);
                detectedCameras.push({
                    id: i,
                    device: cameraDevices[i],
                    port: 20000 + i,
                    resolution: resolution,
                    fps: 5
                });
            }
        } else {
            // Windows camera detection using ffmpeg dshow
            console.log('Windows detected - detecting cameras using dshow');

            const ffmpeg = spawn('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { stdio: 'pipe' });

            return new Promise(async (resolve) => {
                let output = '';
                const deviceNames = [];

                ffmpeg.stderr.on('data', (data) => {
                    output += data.toString();
                });

                ffmpeg.on('close', async () => {
                    const lines = output.split('\n');
                    for (const line of lines) {
                        if (line.includes('] "') && line.includes('" (video)')) {
                            const match = line.match(/\] "([^"]+)" \(video\)/);
                            if (match) {
                                deviceNames.push(match[1]);
                            }
                        }
                    }

                    // Now detect resolution for each camera
                    for (let i = 0; i < deviceNames.length; i++) {
                        const deviceName = deviceNames[i];
                        const resolution = await detectCameraResolution(deviceName);
                        detectedCameras.push({
                            id: i,
                            device: deviceName,
                            port: 20000 + i,
                            resolution: resolution,
                            fps: 5
                        });
                    }

                    resolve(detectedCameras);
                });
            });
        }
    } catch (error) {
        console.error('Error detecting cameras:', error);
    }

    return detectedCameras;
}

const ffmpegProcesses = [];
const httpServers = [];

function startCameraStream(camera) {
    console.log(`🎥 Starting optimized MJPEG stream for camera ${camera.id} (${camera.device}) at ${camera.fps}fps`);

    let ffmpegArgs;
    if (isWindows) {
        ffmpegArgs = [
            '-f', 'dshow',
            '-i', `video=${camera.device}`,
            '-s', camera.resolution,
            '-r', camera.fps.toString(),
            '-f', 'mjpeg',
            '-q:v', '8', // Slightly lower quality for less bandwidth
            '-huffman', 'optimal',
            '-'
        ];
    } else {
        ffmpegArgs = [
            '-f', 'v4l2',
            '-i', camera.device,
            '-s', camera.resolution,
            '-r', camera.fps.toString(),
            '-f', 'mjpeg',
            '-q:v', '8', // Slightly lower quality for less bandwidth
            '-huffman', 'optimal',
            '-'
        ];
    }

    console.log(`🎬 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
    ffmpegProcesses.push(ffmpeg);

    // Create HTTP server for MJPEG streaming
    const server = http.createServer((req, res) => {
        if (req.url === '/stream') {
            res.writeHead(200, {
                'Content-Type': 'multipart/x-mixed-replace; boundary=--mjpegboundary',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Connection': 'close',
                'Access-Control-Allow-Origin': '*'
            });

            // Stream FFmpeg output to HTTP response
            ffmpeg.stdout.on('data', (data) => {
                try {
                    res.write(`\r\n--mjpegboundary\r\n`);
                    res.write('Content-Type: image/jpeg\r\n');
                    res.write(`Content-Length: ${data.length}\r\n\r\n`);
                    res.write(data);
                } catch (err) {
                    console.error(`Error writing stream data for camera ${camera.id}:`, err);
                }
            });

            req.on('close', () => {
                res.end();
            });

            req.on('error', () => {
                res.end();
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(camera.port, () => {
        console.log(`🌐 Camera ${camera.id} MJPEG server started on port ${camera.port}`);
        console.log(`📺 Stream available at: http://localhost:${camera.port}/stream`);
    });

    httpServers.push(server);

    // Handle FFmpeg process events
    ffmpeg.stderr.on('data', (data) => {
        const stderrOutput = data.toString();

        // Only log errors and important info
        if (stderrOutput.includes('error') ||
            stderrOutput.includes('failed') ||
            stderrOutput.includes('Could not') ||
            stderrOutput.includes('Stream #0:0')) {
            console.log(`🔍 FFmpeg camera ${camera.id}: ${stderrOutput.trim()}`);
        }
    });

    ffmpeg.on('close', (code) => {
        console.log(`⚠️  Camera ${camera.id} FFmpeg process ended with code ${code}`);
        const processIndex = ffmpegProcesses.indexOf(ffmpeg);
        if (processIndex > -1) {
            ffmpegProcesses.splice(processIndex, 1);
        }
    });

    ffmpeg.on('error', (err) => {
        console.error(`💥 FFmpeg error for camera ${camera.id}:`, err);
    });

    return ffmpeg;
}

// Main execution
async function main() {
    console.log('🚀 Starting optimized MJPEG streams at 5fps...');
    console.log(`Platform: ${isWindows ? 'Windows' : 'Linux'}`);

    const cameras = await detectCameras();
    console.log(`Detected ${cameras.length} cameras`);

    cameras.forEach(camera => {
        console.log(`  Camera ${camera.id}: ${camera.device} -> Port ${camera.port} (${camera.resolution} @ ${camera.fps}fps)`);
        startCameraStream(camera);
    });
}

main().catch(console.error);

// Cleanup on exit
function cleanup() {
    console.log('🛑 Shutting down MJPEG streams...');

    ffmpegProcesses.forEach(process => {
        try {
            process.kill('SIGTERM');
        } catch (err) {
            console.error('Error killing FFmpeg process:', err);
        }
    });

    httpServers.forEach(server => {
        try {
            server.close();
        } catch (err) {
            console.error('Error closing HTTP server:', err);
        }
    });

    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log('✅ Optimized MJPEG streams started at 5fps. Press Ctrl+C to stop.');