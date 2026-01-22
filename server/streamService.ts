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

export function startStream(rtspUrl: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (isStreamRunning()) {
      if (currentRtspUrl === rtspUrl) {
        console.log("[Stream] Already streaming from this URL");
        resolve({ success: true });
        return;
      }
      stopStream();
    }

    ensureHlsDirectory();
    
    const playlistPath = path.join(HLS_OUTPUT_DIR, "stream.m3u8");
    const segmentPath = path.join(HLS_OUTPUT_DIR, "segment%03d.ts");

    console.log(`[Stream] Starting ffmpeg for RTSP: ${rtspUrl.replace(/:[^:@]+@/, ':***@')}`);

    const args = [
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-g", "30",
      "-sc_threshold", "0",
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
        resolveOnce({ success: false, error: "Stream failed to start - no playlist created" });
        stopStream();
      }
    }, 10000);

    ffmpegProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("Output #0")) {
        currentRtspUrl = rtspUrl;
        streamStartTime = Date.now();
        resolveOnce({ success: true });
      }
      if (process.env.DEBUG_STREAM) {
        console.log(`[ffmpeg] ${msg}`);
      }
    });

    ffmpegProcess.on("error", (err) => {
      console.error("[Stream] ffmpeg error:", err.message);
      resolveOnce({ success: false, error: `ffmpeg error: ${err.message}` });
      cleanup();
    });

    ffmpegProcess.on("exit", (code, signal) => {
      console.log(`[Stream] ffmpeg exited with code ${code}, signal ${signal}`);
      resolveOnce({ success: false, error: `ffmpeg exited unexpectedly (code ${code})` });
      cleanup();
    });
  });
}

export function stopStream(): void {
  if (ffmpegProcess) {
    console.log("[Stream] Stopping ffmpeg process");
    ffmpegProcess.kill("SIGTERM");
    cleanup();
  }
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
