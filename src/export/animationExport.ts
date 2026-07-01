import { resolvePlaybackCameraId } from "../domain/animationTimeline";
import type {
  AnimationTimelineState,
  OutputFrame,
  SceneCamera,
  SceneObject,
} from "../domain/projectTypes";

export type AnimationExportUnit = "frames" | "seconds";

export type AnimationExportRange = {
  unit: AnimationExportUnit;
  start: number;
  end: number;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
  frameCount: number;
};

export type AnimationExportRequestDetail = {
  name: string;
  range: AnimationExportRange;
};

export type AnimationVideoFormat = {
  extension: "mp4" | "webm";
  formatLabel: "MP4" | "WebM";
  mimeType: string;
};

type BuildAnimationExportPayloadInput = {
  projectName: string;
  outputFrame: OutputFrame;
  objects: SceneObject[];
  cameras: SceneCamera[];
  animation: AnimationTimelineState;
  range: AnimationExportRange;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function safeFilenamePart(value: string) {
  return value.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "-").replace(/-+/g, "-") || "animation";
}

export function createAnimationExportName(projectName: string, date = new Date()) {
  return `${safeFilenamePart(projectName)}-video-${date.getFullYear()}${pad(
    date.getMonth() + 1,
  )}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}`;
}

export function buildAnimationExportPayload({
  projectName,
  outputFrame,
  objects,
  cameras,
  animation,
  range,
}: BuildAnimationExportPayloadInput) {
  const frames = Array.from({ length: range.frameCount }).map((_, index) => {
    const frame = range.startFrame + index;
    const time = frame / animation.fps;
    return {
      index,
      frame,
      time,
      cameraId: resolvePlaybackCameraId(
        animation.cameraCuts,
        time,
        cameras[0]?.id,
      ),
    };
  });

  return {
    schemaVersion: "animation-export/0.1",
    exportedAt: new Date().toISOString(),
    projectName,
    fps: animation.fps,
    duration: animation.duration,
    outputFrame,
    range,
    frames,
    cameras,
    objects,
    animation: {
      bindings: animation.bindings,
      cameraCuts: animation.cameraCuts,
    },
  };
}

export function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlobFile(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

export function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function getSupportedAnimationVideoFormat() {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  return [
    {
      mimeType: "video/mp4;codecs=h264",
      extension: "mp4",
      formatLabel: "MP4",
    },
    {
      mimeType: "video/mp4",
      extension: "mp4",
      formatLabel: "MP4",
    },
    {
      mimeType: "video/webm;codecs=vp9",
      extension: "webm",
      formatLabel: "WebM",
    },
    {
      mimeType: "video/webm;codecs=vp8",
      extension: "webm",
      formatLabel: "WebM",
    },
    {
      mimeType: "video/webm",
      extension: "webm",
      formatLabel: "WebM",
    },
  ].find((format) => MediaRecorder.isTypeSupported(format.mimeType)) as
    | AnimationVideoFormat
    | undefined;
}
