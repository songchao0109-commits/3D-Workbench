import type { BoneRecord } from "./projectTypes";

const boneNameMap: Record<string, string> = {
  arm: "手臂",
  ball: "脚掌",
  calf: "小腿",
  chest: "胸部",
  clavicle: "锁骨",
  collar: "锁骨",
  elbow: "肘部",
  eye: "眼睛",
  finger: "手指",
  foot: "脚",
  forearm: "前臂",
  hand: "手",
  head: "头部",
  hip: "髋部",
  hips: "骨盆",
  ik: "IK",
  index: "食指",
  knee: "膝部",
  leaf: "末端",
  leg: "腿",
  middle: "中指",
  neck: "颈部",
  pelvis: "骨盆",
  pinky: "小指",
  ring: "无名指",
  root: "根骨骼",
  shoulder: "肩部",
  spine: "脊柱",
  thigh: "大腿",
  thumb: "拇指",
  toe: "脚趾",
  toes: "脚趾",
  twist: "扭转",
  upper: "上",
  wrist: "手腕",
};

export function isIkControlBoneName(name: string) {
  return name.toLowerCase().includes("ik");
}

export function getIkControlBones<T extends Pick<BoneRecord, "name">>(bones: T[]) {
  return bones.filter((bone) => isIkControlBoneName(bone.name));
}

export function formatBoneDisplayName(name: string) {
  const normalized = name
    .replace(/mixamorig/gi, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[.\-\s]+/g, "_");
  const rawTokens = normalized.split("_").filter(Boolean);
  const lowerTokens = rawTokens.map((token) => token.toLowerCase());
  const sideToken = lowerTokens.find((token) =>
    ["l", "left", "r", "right"].includes(token),
  );
  const side =
    sideToken === "l" || sideToken === "left"
      ? "左"
      : sideToken === "r" || sideToken === "right"
        ? "右"
        : "";
  const content = lowerTokens
    .filter((token) => !["l", "left", "r", "right"].includes(token))
    .map((token) => boneNameMap[token] ?? (/^\d+$/.test(token) ? token : ""))
    .filter(Boolean);

  if (!content.length) {
    return name || "未命名骨骼";
  }

  return `${side}${content.join("")}`;
}
