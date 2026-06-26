import type { OutputFrame, OutputFramePresetId } from "./projectTypes";

export const OUTPUT_FRAME_PRESETS: OutputFrame[] = [
  { presetId: "default", label: "默认" },
  { presetId: "cinema_21_9", label: "21:9", width: 21, height: 9 },
  { presetId: "tv_16_9", label: "16:9", width: 16, height: 9 },
  { presetId: "classic_4_3", label: "4:3", width: 4, height: 3 },
  { presetId: "social_1_1", label: "1:1", width: 1, height: 1 },
  { presetId: "portrait_3_4", label: "3:4", width: 3, height: 4 },
  { presetId: "short_9_16", label: "9:16", width: 9, height: 16 },
  { presetId: "portrait_2_3", label: "2:3", width: 2, height: 3 },
  { presetId: "photo_3_2", label: "3:2", width: 3, height: 2 },
];

export function getOutputFramePreset(
  presetId: OutputFramePresetId,
): OutputFrame | undefined {
  return OUTPUT_FRAME_PRESETS.find((item) => item.presetId === presetId);
}

export function getOutputFrameRatio(frame: OutputFrame, fallbackRatio: number) {
  if (!frame.width || !frame.height) {
    return fallbackRatio;
  }
  return frame.width / frame.height;
}
