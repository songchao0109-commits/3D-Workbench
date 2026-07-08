import {
  Camera,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  Search,
  Trash2,
  Unlock,
  Video,
  VideoOff,
} from "lucide-react";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveCameraTarget } from "../../domain/cameraTargets";
import { resolvePlaybackCameraId } from "../../domain/animationTimeline";
import type {
  CameraMode,
  CameraTargetMode,
  CameraTargetRefType,
  SceneCamera,
  TransformMode,
  Vec3,
} from "../../domain/projectTypes";
import { useProjectStore } from "../../store/projectStore";
import { getLookAtRotation } from "../../three/cameraRig";
import { TransformFields } from "./TransformFields";

const cameraModeLabels: Array<{ id: CameraMode; label: string }> = [
  { id: "lookAt", label: "注视目标" },
  { id: "free", label: "自由朝向" },
];

const minFocalLength = 18;
const maxFocalLength = 135;
const referenceFov = 45;
const referenceFocalLength = 35;
const virtualSensorSize =
  2 * referenceFocalLength * Math.tan((referenceFov * Math.PI) / 360);

function toDegreesVector(value: Vec3): Vec3 {
  return value.map((item) => (item * 180) / Math.PI) as Vec3;
}

function toRadiansVector(value: Vec3): Vec3 {
  return value.map((item) => (item * Math.PI) / 180) as Vec3;
}

function clampFov(value: number) {
  return Math.min(90, Math.max(18, Math.round(value)));
}

function clampFocalLength(value: number) {
  return Math.min(maxFocalLength, Math.max(minFocalLength, Math.round(value)));
}

function fovToFocalLength(fov: number) {
  return clampFocalLength(virtualSensorSize / (2 * Math.tan((fov * Math.PI) / 360)));
}

function focalLengthToFov(focalLength: number) {
  const nextFov =
    (Math.atan(virtualSensorSize / (2 * clampFocalLength(focalLength))) * 360) /
    Math.PI;
  return clampFov(nextFov);
}

function getCameraLookAtRotation(camera: SceneCamera, target = camera.target): Vec3 {
  const rotation = getLookAtRotation(
    new THREE.Vector3(...camera.position),
    new THREE.Vector3(...target),
  );
  return [rotation.x, rotation.y, rotation.z];
}

function CameraPreview({
  camera,
  imageDataUrl,
  aspectRatio,
  fitMode,
}: {
  camera: SceneCamera;
  imageDataUrl?: string;
  aspectRatio: number;
  fitMode?: "cover" | "contain";
}) {
  return (
    <div className="camera-preview" style={{ aspectRatio: String(aspectRatio) }}>
      {imageDataUrl ? (
        <img
          className={`camera-preview-image ${fitMode === "contain" ? "is-contain" : ""}`}
          src={imageDataUrl}
          alt={`${camera.name} 预览`}
        />
      ) : (
        <div className="mini-grid">
          <i className="mini-axis mini-axis-x" />
          <i className="mini-axis mini-axis-y" />
          <i className="mini-axis mini-axis-z" />
          <span />
        </div>
      )}
      <div className="camera-preview-meta">
        <Camera size={14} />
        <span>{camera.mode === "lookAt" ? "注视目标" : "自由朝向"}</span>
      </div>
    </div>
  );
}

export function CameraInspector() {
  const targetInputRef = useRef<HTMLInputElement>(null);
  const animation = useProjectStore((state) => state.animation);
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const activeCameraId = useProjectStore((state) => state.activeCameraId);
  const cameras = useProjectStore((state) => state.cameras);
  const objects = useProjectStore((state) => state.objects);
  const outputFrame = useProjectStore((state) => state.outputFrame);
  const transformMode = useProjectStore((state) => state.transformMode);
  const cameraPreviewActive = useProjectStore((state) => state.cameraPreviewActive);
  const setTransformMode = useProjectStore((state) => state.setTransformMode);
  const updateCamera = useProjectStore((state) => state.updateCamera);
  const toggleCameraVisible = useProjectStore((state) => state.toggleCameraVisible);
  const toggleCameraLocked = useProjectStore((state) => state.toggleCameraLocked);
  const removeCamera = useProjectStore((state) => state.removeCamera);
  const setCameraPreviewActive = useProjectStore(
    (state) => state.setCameraPreviewActive,
  );
  const [targetSearch, setTargetSearch] = useState("");
  const [targetSuggestOpen, setTargetSuggestOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>();
  const inspectedCameraId = useMemo(() => {
    if (animation.isPlaying) {
      return resolvePlaybackCameraId(
        animation.cameraCuts,
        animation.currentTime,
        activeCameraId,
      );
    }
    return selectedCameraId ?? activeCameraId;
  }, [
    activeCameraId,
    animation.cameraCuts,
    animation.currentTime,
    animation.isPlaying,
    selectedCameraId,
  ]);
  const camera =
    cameras.find((item) => item.id === inspectedCameraId) ??
    cameras[0];
  const resolvedTarget = camera
    ? resolveCameraTarget(camera, objects, cameras)
    : ([0, 0, 0] as Vec3);

  const effectiveTransformMode: Extract<TransformMode, "translate" | "rotate"> =
    !camera || camera.mode === "lookAt" || transformMode === "scale"
      ? "translate"
      : (transformMode as Extract<TransformMode, "translate" | "rotate">);

  useEffect(() => {
    if (
      transformMode !== effectiveTransformMode &&
      (transformMode === "rotate" || transformMode === "scale")
    ) {
      setTransformMode(effectiveTransformMode);
    }
  }, [effectiveTransformMode, setTransformMode, transformMode]);

  useEffect(() => {
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<{ cameraId: string; imageDataUrl: string }>)
        .detail;
      if (detail.cameraId === camera?.id) {
        setPreviewImage(detail.imageDataUrl);
      }
    };
    window.addEventListener("camera-preview-frame", handlePreview);
    return () => window.removeEventListener("camera-preview-frame", handlePreview);
  }, [camera?.id]);

  useEffect(() => {
    setPreviewImage(undefined);
  }, [camera?.id]);

  const targetCandidates = useMemo(() => {
    const query = targetSearch.trim().toLowerCase();
    const items = [
      ...objects.map((object) => ({
        id: object.id,
        label: object.name,
        subtitle: "对象",
        type: "object" as CameraTargetRefType,
      })),
      ...cameras
        .filter((item) => item.id !== camera?.id)
        .map((item) => ({
          id: item.id,
          label: item.name,
          subtitle: "机位",
          type: "camera" as CameraTargetRefType,
        })),
    ];

    return items.filter((item) =>
      query ? `${item.label} ${item.subtitle}`.toLowerCase().includes(query) : true,
    );
  }, [camera?.id, cameras, objects, targetSearch]);

  const selectedTargetCandidate = useMemo(
    () =>
      targetCandidates.find(
        (item) =>
          item.id === camera?.targetRefId && item.type === camera?.targetRefType,
      ) ??
      [
        ...objects.map((object) => ({
          id: object.id,
          label: object.name,
          subtitle: "对象",
          type: "object" as CameraTargetRefType,
        })),
        ...cameras
          .filter((item) => item.id !== camera?.id)
          .map((item) => ({
            id: item.id,
            label: item.name,
            subtitle: "机位",
            type: "camera" as CameraTargetRefType,
          })),
      ].find(
        (item) =>
          item.id === camera?.targetRefId && item.type === camera?.targetRefType,
      ),
    [camera?.id, camera?.targetRefId, camera?.targetRefType, cameras, objects, targetCandidates],
  );

  useEffect(() => {
    if (camera?.mode === "lookAt" && camera.targetMode === "asset") {
      setTargetSearch(selectedTargetCandidate?.label ?? "");
    } else {
      setTargetSearch("");
    }
  }, [camera?.id, camera?.mode, camera?.targetMode, selectedTargetCandidate?.label]);

  if (!camera) {
    return null;
  }

  const disabled = camera.locked;
  const targetOffsetEditable = Boolean(selectedTargetCandidate);
  const targetOffsetValue = targetOffsetEditable
    ? camera.targetOffset ?? ([0, 0, 0] as Vec3)
    : ([0, 0, 0] as Vec3);

  const handleTargetModeChange = (mode: CameraTargetMode) => {
    updateCamera(camera.id, {
      targetMode: mode,
      target: resolvedTarget,
      targetRefId: mode === "manual" ? undefined : camera.targetRefId,
      targetRefType: mode === "manual" ? undefined : camera.targetRefType,
    });
  };

  const handleFocalLengthChange = (value: number) => {
    updateCamera(camera.id, { fov: focalLengthToFov(value) });
  };

  const handleCameraModeChange = (mode: CameraMode) => {
    updateCamera(camera.id, {
      mode,
      rotation:
        mode === "free" ? getCameraLookAtRotation(camera, resolvedTarget) : camera.rotation,
    });
    setTransformMode(mode === "free" ? "rotate" : "translate");
  };

  const focalLength = fovToFocalLength(camera.fov);

  return (
    <section className="panel-block camera-panel">
      <div className="panel-heading object-heading">
        <div>
          <h2>相机属性</h2>
          <p>
            {animation.isPlaying
              ? "播放中，属性区跟随当前时间线机位"
              : cameraPreviewActive
                ? "摄影机视角预览中"
                : "机位资产"}
          </p>
        </div>
        <div className="object-actions">
          <button
            title={camera.visible ? "隐藏" : "显示"}
            type="button"
            onClick={() => toggleCameraVisible(camera.id)}
          >
            {camera.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            title={camera.locked ? "解锁" : "锁定"}
            type="button"
            onClick={() => toggleCameraLocked(camera.id)}
          >
            {camera.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button title="删除" type="button" onClick={() => removeCamera(camera.id)}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <CameraPreview
        camera={camera}
        imageDataUrl={previewImage}
        aspectRatio={
          outputFrame.width && outputFrame.height
            ? outputFrame.width / outputFrame.height
            : 16 / 9
        }
        fitMode={outputFrame.presetId === "default" ? "contain" : "cover"}
      />

      <div className="camera-quick-actions">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new Event("camera-create-from-view-request"))
          }
        >
          <Crosshair size={15} />
          <span>从当前视口创建</span>
        </button>
        <button
          className={cameraPreviewActive ? "is-active" : ""}
          type="button"
          onClick={() => setCameraPreviewActive(!cameraPreviewActive)}
        >
          {cameraPreviewActive ? <VideoOff size={15} /> : <Video size={15} />}
          <span>{cameraPreviewActive ? "退出相机视角" : "进入相机视角"}</span>
        </button>
      </div>

      <div className="field-group">
        <label>名称</label>
        <input
          className="text-field"
          disabled={disabled}
          value={camera.name}
          onChange={(event) => updateCamera(camera.id, { name: event.target.value })}
        />
      </div>

      <TransformFields
        disabled={disabled}
        label="位置"
        value={camera.position}
        onChange={(position) => updateCamera(camera.id, { position })}
      />

      <div className="field-group">
        <label>机位焦段</label>
        <div className="fov-row camera-lens-row">
          <input
            aria-label="机位焦段"
            disabled={disabled}
            min={minFocalLength}
            max={maxFocalLength}
            step="1"
            type="range"
            value={focalLength}
            onChange={(event) => handleFocalLengthChange(event.currentTarget.valueAsNumber)}
            onInput={(event) => handleFocalLengthChange(event.currentTarget.valueAsNumber)}
          />
          <output>{focalLength}mm</output>
        </div>
      </div>

      <div className="field-group">
        <label>镜头朝向</label>
        <div className="segmented-control two-columns camera-mode-toggle">
          {cameraModeLabels.map((mode) => (
            <button
              className={camera.mode === mode.id ? "is-active" : ""}
              disabled={disabled}
              key={mode.id}
              type="button"
              onClick={() => handleCameraModeChange(mode.id)}
            >
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {camera.mode === "free" ? (
        <TransformFields
          disabled={disabled}
          label="旋转"
          step={1}
          value={toDegreesVector(camera.rotation)}
          onChange={(rotation) =>
            updateCamera(camera.id, { rotation: toRadiansVector(rotation) })
          }
        />
      ) : null}

      {camera.mode === "lookAt" ? (
        <div className="field-group">
          <label>注视目标来源</label>
          <div className="segmented-control two-columns">
            <button
              className={camera.targetMode === "asset" ? "is-active" : ""}
              disabled={disabled}
              type="button"
              onClick={() => handleTargetModeChange("asset")}
            >
              <span>资产列表</span>
            </button>
            <button
              className={camera.targetMode === "manual" ? "is-active" : ""}
              disabled={disabled}
              type="button"
              onClick={() => handleTargetModeChange("manual")}
            >
              <span>手动坐标</span>
            </button>
          </div>
        </div>
      ) : null}

      {camera.mode === "lookAt" && camera.targetMode === "asset" ? (
        <>
          <div className="suggest-field">
            <label className="search-box compact-search suggest-input">
              <Search size={15} />
              <input
                ref={targetInputRef}
                placeholder="搜索对象"
                value={targetSearch}
                onBlur={() => {
                  window.setTimeout(() => {
                    setTargetSuggestOpen(false);
                    setTargetSearch(selectedTargetCandidate?.label ?? "");
                  }, 120);
                }}
                onChange={(event) => {
                  setTargetSearch(event.target.value);
                  setTargetSuggestOpen(true);
                }}
                onFocus={() => setTargetSuggestOpen(true)}
              />
            </label>
            {targetSuggestOpen ? (
              <div className="camera-target-list suggest-dropdown">
                {targetCandidates.length ? (
                  targetCandidates.map((item) => (
                    <button
                      className={`camera-target-item ${
                        camera.targetRefId === item.id && camera.targetRefType === item.type
                          ? "is-active"
                          : ""
                      }`}
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        updateCamera(camera.id, {
                          targetMode: "asset",
                          targetRefId: item.id,
                          targetRefType: item.type,
                        });
                        setTargetSearch(item.label);
                        setTargetSuggestOpen(false);
                        targetInputRef.current?.blur();
                      }}
                    >
                      <span>{item.label}</span>
                      <span>{item.subtitle}</span>
                    </button>
                  ))
                ) : (
                  <div className="suggest-empty">未找到匹配对象</div>
                )}
              </div>
            ) : null}
            <div className="small-meta">
              支持搜索项目内对象与机位，单选后即作为当前注视目标
            </div>
          </div>
          <TransformFields
            disabled={disabled || !targetOffsetEditable}
            label="注视偏移"
            value={targetOffsetValue}
            onChange={(targetOffset) => updateCamera(camera.id, { targetOffset })}
          />
        </>
      ) : null}

      {camera.mode === "lookAt" && camera.targetMode === "manual" ? (
        <TransformFields
          disabled={disabled}
          label="注视坐标"
          value={resolvedTarget}
          onChange={(target) =>
            updateCamera(camera.id, {
              target,
              targetMode: "manual",
              targetRefId: undefined,
              targetRefType: undefined,
              rotation: getCameraLookAtRotation(camera, target),
            })
          }
        />
      ) : null}
    </section>
  );
}
