import type { ProjectState } from "./projectTypes";

export const defaultProject: ProjectState = {
  schemaVersion: "0.1",
  projectName: "3D 导演台",
  activeShotId: "shot_001",
  activeCameraId: "camera_001",
  activeTool: "move",
  transformMode: "translate",
  outputFrame: {
    presetId: "default",
    label: "默认",
  },
  worldSettings: {
    rootTransform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    labelsVisible: false,
    snap: {
      enabled: false,
      translate: 0.5,
      rotateDeg: 15,
      scale: 0.1,
    },
    ground: {
      visible: true,
      y: 0,
      opacity: 0.2,
    },
    panoramaSphere: {
      visible: false,
      radius: 60,
      horizontalRotationDeg: 0,
    },
  },
  assets: [],
  objects: [
    {
      id: "object_character_a",
      name: "角色A",
      type: "character",
      visible: true,
      locked: false,
      boundsVisible: false,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ],
  cameras: [
    {
      id: "camera_001",
      name: "相机1",
      position: [10.68, 7, 3.74],
      rotation: [-0.73, 1.09, 0.65],
      target: [0, 0, 0],
      targetMode: "manual",
      fov: 45,
      mode: "lookAt",
      visible: true,
      locked: false,
    },
  ],
  cameraPreviewActive: false,
  snapshots: [],
};
