import { ArrayBufferTarget, Muxer } from "mp4-muxer";

type EncodeCanvasFramesToMp4Input = {
  canvas: HTMLCanvasElement;
  fps: number;
  frameCount: number;
  renderFrame: (frameIndex: number) => void | Promise<void>;
  onProgress?: (current: number, total: number) => void;
};

const h264CodecCandidates = [
  "avc1.640028",
  "avc1.4D4028",
  "avc1.42E028",
  "avc1.42001F",
];

function getDefaultVideoBitrate(width: number, height: number, fps: number) {
  const pixelsPerSecond = width * height * fps;
  return Math.round(Math.min(20_000_000, Math.max(2_500_000, pixelsPerSecond * 0.12)));
}

function getTimestamp(index: number, fps: number) {
  return Math.round((index * 1_000_000) / fps);
}

function waitForEncoderQueue(encoder: VideoEncoder, maxQueueSize: number) {
  if (encoder.encodeQueueSize <= maxQueueSize) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const checkQueue = () => {
      if (encoder.encodeQueueSize <= maxQueueSize) {
        resolve();
        return;
      }
      window.setTimeout(checkQueue, 0);
    };
    checkQueue();
  });
}

async function resolveSupportedH264Config(
  width: number,
  height: number,
  fps: number,
): Promise<VideoEncoderConfig | undefined> {
  if (!isOfflineMp4ExportSupported()) {
    return undefined;
  }

  for (const codec of h264CodecCandidates) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      displayWidth: width,
      displayHeight: height,
      framerate: fps,
      bitrate: getDefaultVideoBitrate(width, height, fps),
      bitrateMode: "variable",
      latencyMode: "quality",
      avc: { format: "avc" },
    };

    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        return support.config ?? config;
      }
    } catch {
      // Try the next profile/level candidate.
    }
  }

  return undefined;
}

export function isOfflineMp4ExportSupported() {
  return typeof VideoEncoder === "function" && typeof VideoFrame === "function";
}

export async function encodeCanvasFramesToMp4({
  canvas,
  fps,
  frameCount,
  renderFrame,
  onProgress,
}: EncodeCanvasFramesToMp4Input) {
  const config = await resolveSupportedH264Config(canvas.width, canvas.height, fps);
  if (!config) {
    throw new Error("当前浏览器不支持 WebCodecs H.264 MP4 离线编码");
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: canvas.width,
      height: canvas.height,
      frameRate: fps,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "strict",
  });

  let encoderError: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      try {
        muxer.addVideoChunk(chunk, metadata);
      } catch (error) {
        encoderError = error instanceof Error ? error : new Error("MP4 封装失败");
      }
    },
    error: (error) => {
      encoderError = error instanceof Error ? error : new Error("视频编码失败");
    },
  });

  try {
    encoder.configure(config);
    const keyFrameInterval = Math.max(1, Math.round(fps * 2));

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (encoderError) {
        throw encoderError;
      }

      await renderFrame(frameIndex);
      const timestamp = getTimestamp(frameIndex, fps);
      const nextTimestamp = getTimestamp(frameIndex + 1, fps);
      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: nextTimestamp - timestamp,
      });

      encoder.encode(frame, { keyFrame: frameIndex % keyFrameInterval === 0 });
      frame.close();
      onProgress?.(frameIndex + 1, frameCount);

      if (encoder.encodeQueueSize > 12) {
        await waitForEncoderQueue(encoder, 6);
      } else if (frameIndex % 8 === 7) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }

    await encoder.flush();
    if (encoderError) {
      throw encoderError;
    }
    muxer.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    if (encoder.state !== "closed") {
      encoder.close();
    }
  }
}
