import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

const HLS_OUTPUT_DIR = "/tmp/hls-stream";
const STREAM_SEGMENT_TIME = 2;
const STREAM_LIST_SIZE = 3;

let ffmpegProcess: ChildProcess | null = null;
let currentRtspUrl: string | null = null;
let streamStartTime: number | null = null;

export function ensureHlsDirectory(): void {
  if (!fs.existsSync(HLS_OUTPUT_DIR)) {
    fs.mkdirSync(HLS_OUTPUT_DIR, { recursive: true });
  }
}

export function getHlsDirectory(): string {
  return HLS_OUTPUT_DIR;
}

export function isStreamRunning(): boolean {
  return ffmpegProcess !== null && !ffmpegProcess.killed;
}

export function getStreamInfo(): { running: boolean; url: string | null; uptime: number | null } {
  return {
    running: isStreamRunning(),
    url: currentRtspUrl,
    uptime: streamStartTime ? Math.floor((Date.now() - streamStartTime) / 1000) : null,
  };
}

export async function startStream(rtspUrl: string): Promise<{ success: boolean; error?: string }> {
  // If already streaming from same URL, return success
  if (isStreamRunning() && currentRtspUrl === rtspUrl) {
    console.log("[Stream] Already streaming from this URL");
    return { success: true };
  }
  
  // Wait for any existing stream to fully stop
  if (isStreamRunning()) {
    console.log("[Stream] Waiting for previous stream to stop...");
    await stopStream();
  }
  
  ensureHlsDirectory();
  
  return new Promise((resolve) => {
    
    const playlistPath = path.join(HLS_OUTPUT_DIR, "stream.m3u8");
    const segmentPath = path.join(HLS_OUTPUT_DIR, "segment%03d.ts");

    const maskedUrl = rtspUrl.replace(/:[^:@]+@/, ':***@');
    console.log(`[Stream] Starting ffmpeg for RTSP: ${maskedUrl}`);

    // Try copy codec first (passthrough, much faster especially on Raspberry Pi)
    // Falls back to transcoding if copy doesn't work with HLS
    const args = [
      "-rtsp_transport", "tcp",
      "-stimeout", "5000000",  // 5 second RTSP connection timeout (microseconds)
      "-i", rtspUrl,
      "-c:v", "copy",   // Passthrough - much less CPU than re-encoding
      "-an",             // Skip audio for lower latency
      "-f", "hls",
      "-hls_time", String(STREAM_SEGMENT_TIME),
      "-hls_list_size", String(STREAM_LIST_SIZE),
      "-hls_flags", "delete_segments+append_list",
      "-hls_segment_filename", segmentPath,
      playlistPath,
    ];

    ffmpegProcess = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let hasResolved = false;
    let startupTimeout: NodeJS.Timeout;
    let stderrBuffer = "";

    const resolveOnce = (result: { success: boolean; error?: string }) => {
      if (!hasResolved) {
        hasResolved = true;
        clearTimeout(startupTimeout);
        resolve(result);
      }
    };

    startupTimeout = setTimeout(() => {
      if (fs.existsSync(playlistPath)) {
        currentRtspUrl = rtspUrl;
        streamStartTime = Date.now();
        resolveOnce({ success: true });
      } else {
        console.error(`[Stream] Timeout - no playlist created. ffmpeg output: ${stderrBuffer.slice(-500)}`);
        resolveOnce({ success: false, error: "Stream failed to start within 15 seconds. Check camera URL and credentials." });
        stopStream();
      }
    }, 15000);

    ffmpegProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      stderrBuffer += msg;
      // Keep buffer from growing too large
      if (stderrBuffer.length > 5000) {
        stderrBuffer = stderrBuffer.slice(-3000);
      }
      
      if (msg.includes("Output #0")) {
        currentRtspUrl = rtspUrl;
        streamStartTime = Date.now();
        console.log("[Stream] ffmpeg started successfully (output detected)");
        resolveOnce({ success: true });
      }
      // Log important error messages
      if (msg.includes("Connection refused") || msg.includes("Connection timed out") || 
          msg.includes("401") || msg.includes("403") || msg.includes("error")) {
        console.error(`[Stream] ffmpeg: ${msg.trim()}`);
      }
    });

    ffmpegProcess.on("error", (err) => {
      console.error("[Stream] ffmpeg process error:", err.message);
      resolveOnce({ success: false, error: `ffmpeg error: ${err.message}` });
      cleanup();
    });

    ffmpegProcess.on("exit", (code, signal) => {
      console.log(`[Stream] ffmpeg exited with code ${code}, signal ${signal}`);
      if (stderrBuffer.includes("Connection refused")) {
        resolveOnce({ success: false, error: "Camera refused connection. Check IP address and RTSP port (usually 554)." });
      } else if (stderrBuffer.includes("401") || stderrBuffer.includes("Unauthorized")) {
        resolveOnce({ success: false, error: "Camera rejected credentials. Check username and password." });
      } else if (stderrBuffer.includes("timed out")) {
        resolveOnce({ success: false, error: "Connection timed out. Camera may be offline or IP address is wrong." });
      } else {
        resolveOnce({ success: false, error: `Stream failed (code ${code}). Check camera settings.` });
      }
      cleanup();
    });
  });
}

export function stopStream(): Promise<void> {
  return new Promise((resolve) => {
    if (!ffmpegProcess) {
      resolve();
      return;
    }
    
    console.log("[Stream] Stopping ffmpeg process");
    const proc = ffmpegProcess;
    
    // Set up exit handler before killing
    const exitHandler = () => {
      cleanup();
      resolve();
    };
    
    proc.once("exit", exitHandler);
    
    // Set a timeout in case process doesn't exit gracefully
    const timeout = setTimeout(() => {
      proc.removeListener("exit", exitHandler);
      try {
        proc.kill("SIGKILL");
      } catch {}
      cleanup();
      resolve();
    }, 5000);
    
    proc.once("exit", () => clearTimeout(timeout));
    
    proc.kill("SIGTERM");
  });
}

function cleanup(): void {
  ffmpegProcess = null;
  currentRtspUrl = null;
  streamStartTime = null;
  
  try {
    const files = fs.readdirSync(HLS_OUTPUT_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(HLS_OUTPUT_DIR, file));
    }
  } catch {
  }
}

export function getPlaylistPath(): string {
  return path.join(HLS_OUTPUT_DIR, "stream.m3u8");
}

export function playlistExists(): boolean {
  return fs.existsSync(getPlaylistPath());
}
