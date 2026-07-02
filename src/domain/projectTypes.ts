export type Vec3 = [number, number, number];

export type ToolMode =
  | "move"
  | "object"
  | "panorama"
  | "camera"
  | "aspect"
  | "snapshot";
export type TransformMode = "translate" | "rotate" | "scale";
export type CameraMode = "free" | "lookAt";
export type RigMode = "fk" | "ik";
export type CameraTargetMode = "manual" | "asset";
export type CameraTargetRefType = "object" | "camera";
export type AnimationInterpolation = "linear" | "step";
export type AnimationBindingTargetType = "object" | "camera";
export type AnimationAutoKeyMode = "add_replace" | "replace";
export type AnimationChannelPath =
  | "position"
  | "rotation"
  | "scale"
  | "target"
  | "fov"
  | "boneRotation"
  | "ikTargetPosition";
export type AnimationChannelValue = number | Vec3;
export type OutputFramePresetId =
  | "default"
  | "cinema_21_9"
  | "tv_16_9"
  | "classic_4_3"
  | "short_9_16"
  | "portrait_3_4"
  | "social_1_1"
  | "portrait_2_3"
  | "photo_3_2";

export type OutputFrame = {
  presetId: OutputFramePresetId;
  label: string;
  width?: number;
  height?: number;
};

export type WorldSettings = {
  rootTransform: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
  };
  labelsVisible: boolean;
  snap: {
    enabled: boolean;
    translate: number;
    rotateDeg: number;
    scale: number;
  };
  ground: {
    visible: boolean;
    y: number;
    opacity: number;
  };
  panoramaSphere: {
    assetId?: string;
    visible: boolean;
    radius: number;
    horizontalRotationDeg: number;
  };
};

export type AssetRecord = {
  id: string;
  name: string;
  type: "glb" | "texture" | "panorama";
  objectUrl: string;
  mimeType?: string;
  size: number;
  createdAt: string;
};

export type MaterialOverride = {
  materialId: string;
  materialName: string;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  textureAssetId?: string;
};

export type BoneRecord = {
  id: string;
  name: string;
  parentId?: string;
  position: Vec3;
  rotation: Vec3;
};

export type IkChainRecord = {
  id: string;
  name: string;
  rootBoneId: string;
  effectorBoneId: string;
  linkBoneIds: string[];
  targetPosition: Vec3;
  enabled: boolean;
};

export type ObjectRig = {
  hasSkeleton: boolean;
  mode: RigMode;
  showSkeleton: boolean;
  activeBoneId?: string;
  boneControlActive?: boolean;
  activeIkChainId?: string;
  bones: BoneRecord[];
  ikChains: IkChainRecord[];
};

export type SceneObject = {
  id: string;
  assetId?: string;
  name: string;
  type: "character" | "model" | "helper";
  visible: boolean;
  locked: boolean;
  boundsVisible: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  actualDimensions?: Vec3;
  materialOverrides?: MaterialOverride[];
  rig?: ObjectRig;
};

export type SceneCamera = {
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  target: Vec3;
  targetMode: CameraTargetMode;
  targetRefId?: string;
  targetRefType?: CameraTargetRefType;
  fov: number;
  mode: CameraMode;
  visible: boolean;
  locked: boolean;
};

export type SnapshotRecord = {
  id: string;
  name: string;
  cameraId?: string;
  createdAt: string;
  imageDataUrl: string;
};

export type AnimationKeyframe = {
  id: string;
  time: number;
  value: AnimationChannelValue;
  interpolation: AnimationInterpolation;
};

export type AnimationCameraCut = {
  id: string;
  startTime: number;
  endTime: number;
  cameraId: string;
  time?: number;
};

export type AnimationChannelKeyframeRef = {
  kind: "channel";
  bindingId: string;
  channelId: string;
  keyframeId: string;
};

export type AnimationCameraCutRef = {
  kind: "cameraCut";
  cutId: string;
};

export type TimelineKeyframeRef = AnimationChannelKeyframeRef | AnimationCameraCutRef;

export type AnimationChannel = {
  id: string;
  label: string;
  path: AnimationChannelPath;
  valueType: "number" | "vec3";
  boneId?: string;
  ikChainId?: string;
  keyframes: AnimationKeyframe[];
};

export type AnimationBinding = {
  id: string;
  targetType: AnimationBindingTargetType;
  targetId: string;
  label: string;
  channels: AnimationChannel[];
};

export type AnimationTimelineState = {
  fps: number;
  duration: number;
  currentTime: number;
  inPointTime?: number;
  outPointTime?: number;
  isPlaying: boolean;
  loop: boolean;
  autoKeyEnabled: boolean;
  autoKeyMode: AnimationAutoKeyMode;
  bindings: AnimationBinding[];
  cameraCuts: AnimationCameraCut[];
};

export type ProjectState = {
  schemaVersion: "0.1";
  projectName: string;
  activeShotId: string;
  activeObjectId?: string;
  selectedCameraId?: string;
  activeCameraId?: string;
  activeTool: ToolMode;
  transformMode: TransformMode;
  cameraPreviewActive: boolean;
  outputFrame: OutputFrame;
  worldSettings: WorldSettings;
  assets: AssetRecord[];
  objects: SceneObject[];
  cameras: SceneCamera[];
  snapshots: SnapshotRecord[];
  animation: AnimationTimelineState;
  importError?: string;
};
