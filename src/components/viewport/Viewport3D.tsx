import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { resolveCameraTarget } from "../../domain/cameraTargets";
import {
  applyAnimationToProjectState,
  resolvePlaybackCameraId,
} from "../../domain/animationTimeline";
import { getOutputFrameRatio } from "../../domain/outputFrames";
import {
  buildAnimationExportPayload,
  downloadBlobFile,
  downloadJsonFile,
  getSupportedAnimationVideoFormat,
  type AnimationExportRequestDetail,
} from "../../export/animationExport";
import {
  createSnapshotName,
  downloadDataUrl,
  exportCanvasWithAspectRatio,
} from "../../export/snapshotExport";
import { useProjectStore } from "../../store/projectStore";
import {
  applyCameraStateToPerspectiveCamera,
  applyCameraStateToRig,
  createCameraRig,
  getLookAtRotation,
} from "../../three/cameraRig";
import {
  extractRigFromScene,
  loadGlbFromFile,
  normalizeImportedScene,
} from "../../three/glbLoader";
import {
  createPlaceholderCharacter,
  createPrimitiveObject,
  createStandinCharacter,
} from "../../three/sceneObjects";
import { disposeObject3D, sceneRegistry } from "../../three/sceneRegistry";
import { skeletonRegistry } from "../../three/skeletonRegistry";
import type { SceneCamera, SceneObject, Vec3 } from "../../domain/projectTypes";

type SceneInsertRequest =
  | { kind: "standin"; variant: "male" | "female" }
  | {
      kind: "crowd";
      variant: "male" | "female";
      rows: number;
      columns: number;
      spacing: number;
    }
  | {
      kind: "primitive";
      variant: "cube" | "sphere" | "cylinder" | "torus" | "cone" | "pyramid";
    };

type OrientationAxis = {
  id: "x" | "y" | "z";
  label: "X" | "Y" | "Z";
  x: number;
  y: number;
  length: number;
  angle: number;
  depth: number;
};

const defaultOrientationAxes: OrientationAxis[] = [
  { id: "x", label: "X", x: 18, y: 0, length: 18, angle: 0, depth: 0 },
  { id: "y", label: "Y", x: 0, y: -18, length: 18, angle: -90, depth: 0 },
  { id: "z", label: "Z", x: -13, y: 11, length: 17, angle: 140, depth: 0 },
];

const pivotPosition = new THREE.Vector3();
const pivotMatrixPrevious = new THREE.Matrix4();
const pivotMatrixNext = new THREE.Matrix4();
const pivotDeltaMatrix = new THREE.Matrix4();
const objectMatrix = new THREE.Matrix4();
const objectNextPosition = new THREE.Vector3();
const objectNextQuaternion = new THREE.Quaternion();
const objectNextScale = new THREE.Vector3();

function createRenderer(container: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 1);
  container.appendChild(renderer.domElement);
  return renderer;
}

export function Viewport3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef(useProjectStore.getState());
  const draggingRef = useRef(false);
  const [viewportLabels, setViewportLabels] = useState<
    Array<{ id: string; label: string; x: number; y: number; active: boolean }>
  >([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [orientationAxes, setOrientationAxes] = useState(defaultOrientationAxes);
  const orientationAxesRef = useRef(defaultOrientationAxes);
  const cameraPreviewActive = useProjectStore((state) => state.cameraPreviewActive);
  const outputFrame = useProjectStore((state) => state.outputFrame);

  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => {
      storeRef.current = state;
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const worldRoot = new THREE.Group();
    worldRoot.name = "world-root";
    scene.add(worldRoot);

    const camera = new THREE.PerspectiveCamera(
      storeRef.current.cameras[0]?.fov ?? 45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(8, 5.2, 7.4);

    const renderer = createRenderer(container);
    const previewRenderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    previewRenderer.setSize(320, 180, false);
    const previewCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.8, 0);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const projectedSelectionPoint = new THREE.Vector3();
    const orientationCameraSpace = new THREE.Vector3();
    const orientationCameraQuaternion = new THREE.Quaternion();
    const orientationAxisRadius = 19;
    const orientationAxisDefinitions: Array<{
      id: OrientationAxis["id"];
      label: OrientationAxis["label"];
      direction: THREE.Vector3;
    }> = [
      { id: "x", label: "X", direction: new THREE.Vector3(1, 0, 0) },
      { id: "y", label: "Y", direction: new THREE.Vector3(0, 1, 0) },
      { id: "z", label: "Z", direction: new THREE.Vector3(0, 0, 1) },
    ];
    const cameraRigs = new Map<string, THREE.Object3D>();
    const objectBoundsHelpers = new Map<string, THREE.BoxHelper>();
    let activeCameraAimId: string | undefined;
    let panoramaTexture: THREE.Texture | undefined;
    let loadedPanoramaAssetId: string | undefined;
    let lastPreviewEmitAt = 0;
    let lastLabelEmitAt = 0;
    let previousPreviewActive = false;
    let previousPlaybackActive = false;
    let exportInProgress = false;
    let pointerDownPosition = { x: 0, y: 0 };
    let editorPose:
      | {
          fov: number;
          position: THREE.Vector3;
          rotation: THREE.Euler;
          target: THREE.Vector3;
        }
      | undefined;

    const getOutputAspectRatio = () =>
      getOutputFrameRatio(
        storeRef.current.outputFrame,
        container.clientWidth / container.clientHeight,
      );

    const resizePreviewRenderer = () => {
      const ratio = getOutputAspectRatio();
      previewCamera.aspect = ratio;
      previewCamera.updateProjectionMatrix();
      const width = 320;
      previewRenderer.setSize(width, Math.max(120, Math.round(width / ratio)), false);
    };

    const updateOrientationWidget = () => {
      orientationCameraQuaternion.copy(camera.quaternion).invert();
      const nextAxes = orientationAxisDefinitions.map(({ id, label, direction }) => {
        orientationCameraSpace.copy(direction).applyQuaternion(orientationCameraQuaternion);
        const x = orientationCameraSpace.x * orientationAxisRadius;
        const y = -orientationCameraSpace.y * orientationAxisRadius;
        return {
          id,
          label,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          length: Math.round(Math.hypot(x, y) * 10) / 10,
          angle: Math.round((Math.atan2(y, x) * 180) / Math.PI),
          depth: Math.round(orientationCameraSpace.z * 1000) / 1000,
        };
      });
      const previousAxes = orientationAxesRef.current;
      const changed = nextAxes.some((axis, index) => {
        const previous = previousAxes[index];
        return (
          !previous ||
          Math.abs(axis.x - previous.x) > 0.2 ||
          Math.abs(axis.y - previous.y) > 0.2 ||
          Math.abs(axis.length - previous.length) > 0.2 ||
          Math.abs(axis.angle - previous.angle) > 0.5 ||
          Math.abs(axis.depth - previous.depth) > 0.01
        );
      });
      if (changed) {
        orientationAxesRef.current = nextAxes;
        setOrientationAxes(nextAxes);
      }
    };

    const transformControls = new TransformControls(camera, renderer.domElement);
    const transformHelper = transformControls.getHelper();
    const selectionPivot = new THREE.Group();
    selectionPivot.name = "selection-pivot";
    selectionPivot.visible = false;
    scene.add(transformHelper);
    scene.add(selectionPivot);
    transformControls.addEventListener("dragging-changed", (event) => {
      draggingRef.current = Boolean(event.value);
      controls.enabled = !event.value;
      if (!event.value) {
        const state = useProjectStore.getState();
        state.objects.forEach(applyObjectState);
        syncObjectBounds();
        syncCameraRigs(state.cameras);
        syncWorldSettings();
        resizePreviewRenderer();
        void syncPanoramaBackground();
        syncTransformControls();
      }
    });
    transformControls.addEventListener("objectChange", () => {
      const object = transformControls.object;
      const objectId = object?.userData.workbenchObjectId;
      const cameraId = object?.userData.workbenchCameraId;
      const cameraAimId = object?.userData.workbenchCameraAimId;
      const boneId = object?.userData.workbenchBoneId;
      const ikChainId = object?.userData.workbenchIkChainId;
      if (!object) {
        return;
      }
      if (object === selectionPivot) {
        const state = useProjectStore.getState();
        const activeGroup = state.activeGroupId
          ? state.groups.find((group) => group.id === state.activeGroupId)
          : undefined;
        const selectedIds = activeGroup?.objectIds ?? state.selectedObjectIds;
        pivotMatrixNext.copy(selectionPivot.matrixWorld);
        pivotDeltaMatrix.copy(pivotMatrixNext).multiply(pivotMatrixPrevious.clone().invert());
        selectedIds.forEach((selectedId) => {
          const selectedState = state.objects.find((item) => item.id === selectedId);
          const selectedObject = sceneRegistry.getObject(selectedId);
          if (!selectedState || !selectedObject || selectedState.locked) {
            return;
          }
          objectMatrix.compose(
            selectedObject.position,
            selectedObject.quaternion,
            selectedObject.scale,
          );
          objectMatrix.premultiply(pivotDeltaMatrix);
          objectMatrix.decompose(objectNextPosition, objectNextQuaternion, objectNextScale);
          const rotation = new THREE.Euler().setFromQuaternion(objectNextQuaternion);
          useProjectStore.getState().updateObjectTransform(selectedId, {
            position: [objectNextPosition.x, objectNextPosition.y, objectNextPosition.z],
            rotation: [rotation.x, rotation.y, rotation.z],
            scale: [objectNextScale.x, objectNextScale.y, objectNextScale.z],
          });
        });
        pivotMatrixPrevious.copy(pivotMatrixNext);
        return;
      }
      if (typeof cameraAimId === "string") {
        const activeCamera = useProjectStore
          .getState()
          .cameras.find((item) => item.id === cameraAimId);
        if (!activeCamera) {
          return;
        }
        const worldTarget = object.getWorldPosition(new THREE.Vector3());
        const target: Vec3 = [worldTarget.x, worldTarget.y, worldTarget.z];
        const rotation = getLookAtRotation(
          new THREE.Vector3(...activeCamera.position),
          worldTarget,
        );
        useProjectStore.getState().updateCamera(cameraAimId, {
          target,
          targetMode: "manual",
          targetRefId: undefined,
          targetRefType: undefined,
          rotation: [rotation.x, rotation.y, rotation.z],
        });
        return;
      }
      if (
        typeof objectId === "string" &&
        typeof boneId !== "string" &&
        typeof ikChainId !== "string"
      ) {
        const store = useProjectStore.getState();
        store.updateObjectTransform(objectId, {
          position: [object.position.x, object.position.y, object.position.z],
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z],
        });
        const nextObject = useProjectStore
          .getState()
          .objects.find((item) => item.id === objectId);
        if (nextObject) {
          applyObjectState(nextObject);
        }
      }
      if (typeof cameraId === "string") {
        const activeCamera = useProjectStore
          .getState()
          .cameras.find((item) => item.id === cameraId);
        if (!activeCamera) {
          return;
        }
        const position: Vec3 = [object.position.x, object.position.y, object.position.z];
        const lookAtRotation = getLookAtRotation(
          object.position,
          new THREE.Vector3(...activeCamera.target),
        );
        const rotation: Vec3 =
          activeCamera.mode === "lookAt"
            ? [lookAtRotation.x, lookAtRotation.y, lookAtRotation.z]
            : [object.rotation.x, object.rotation.y, object.rotation.z];
        useProjectStore.getState().updateCamera(cameraId, {
          position,
          rotation,
        });
      }
      if (typeof boneId === "string" && typeof objectId === "string") {
        const activeObject = useProjectStore
          .getState()
          .objects.find((item) => item.id === objectId);
        if (activeObject?.rig?.mode === "ik") {
          const worldPosition: Vec3 = [
            object.position.x,
            object.position.y,
            object.position.z,
          ];
          const localPosition = skeletonRegistry.setBoneWorldPosition(
            objectId,
            boneId,
            worldPosition,
          );
          if (localPosition) {
            useProjectStore.getState().updateBonePosition(objectId, boneId, localPosition);
          }
        } else {
          const rotation: Vec3 = [
            object.rotation.x,
            object.rotation.y,
            object.rotation.z,
          ];
          skeletonRegistry.setBoneRotation(objectId, boneId, rotation);
          useProjectStore.getState().updateBoneRotation(objectId, boneId, rotation);
        }
      }
      if (typeof ikChainId === "string" && typeof objectId === "string") {
        const targetPosition: Vec3 = [
          object.position.x,
          object.position.y,
          object.position.z,
        ];
        useProjectStore.getState().updateIkChain(objectId, ikChainId, {
          targetPosition,
        });
        const activeObject = useProjectStore
          .getState()
          .objects.find((item) => item.id === objectId);
        if (activeObject?.rig) {
          skeletonRegistry.solveChain(objectId, ikChainId, {
            ...activeObject.rig,
            ikChains: activeObject.rig.ikChains.map((chain) =>
              chain.id === ikChainId ? { ...chain, targetPosition } : chain,
            ),
          });
        }
      }
    });

    const grid = new THREE.GridHelper(80, 80, 0x575757, 0x242424);
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.7;
    });
    worldRoot.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshBasicMaterial({
        color: 0x2a2a2a,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    worldRoot.add(ground);

    const panoramaSphere = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.BackSide,
        transparent: true,
      }),
    );
    panoramaSphere.visible = false;
    worldRoot.add(panoramaSphere);

    const axes = new THREE.AxesHelper(12);
    scene.add(axes);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(6, 10, 5);
    scene.add(ambient, keyLight);

    const placeholder = createPlaceholderCharacter();
    placeholder.position.set(0, 0, 0);
    placeholder.userData.workbenchObjectId = "object_character_a";
    worldRoot.add(placeholder);
    sceneRegistry.registerObject("object_character_a", placeholder);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resolveRuntimeCamera = (
      cameraState: SceneCamera,
      objects: SceneObject[] = storeRef.current.objects,
      cameras: SceneCamera[] = storeRef.current.cameras,
    ) => ({
      ...cameraState,
      target: resolveCameraTarget(
        cameraState,
        objects,
        cameras,
      ),
    });

    const syncPanoramaBackground = async () => {
      const panoramaAsset = storeRef.current.assets.find(
        (item) => item.id === storeRef.current.worldSettings.panoramaSphere.assetId,
      );
      const panoramaSettings = storeRef.current.worldSettings.panoramaSphere;

      panoramaSphere.visible =
        Boolean(panoramaAsset) && panoramaSettings.visible && panoramaAsset?.type === "panorama";
      panoramaSphere.scale.setScalar(panoramaSettings.radius / 60);
      panoramaSphere.rotation.y = (panoramaSettings.horizontalRotationDeg * Math.PI) / 180;

      if (!panoramaAsset || panoramaAsset.type !== "panorama") {
        if (panoramaTexture) {
          panoramaTexture.dispose();
          panoramaTexture = undefined;
        }
        loadedPanoramaAssetId = undefined;
        scene.background = new THREE.Color(0x000000);
        (panoramaSphere.material as THREE.MeshBasicMaterial).map = null;
        (panoramaSphere.material as THREE.MeshBasicMaterial).needsUpdate = true;
        return;
      }

      if (loadedPanoramaAssetId === panoramaAsset.id && panoramaTexture) {
        return;
      }

      const loader = new THREE.TextureLoader();
      const nextTexture = await loader.loadAsync(panoramaAsset.objectUrl);
      nextTexture.colorSpace = THREE.SRGBColorSpace;

      if (panoramaTexture) {
        panoramaTexture.dispose();
      }
      panoramaTexture = nextTexture;
      loadedPanoramaAssetId = panoramaAsset.id;
      (panoramaSphere.material as THREE.MeshBasicMaterial).map = nextTexture;
      (panoramaSphere.material as THREE.MeshBasicMaterial).needsUpdate = true;
    };

    const applyObjectState = (objectState: SceneObject) => {
      const object = sceneRegistry.getObject(objectState.id);
      if (!object) {
        return;
      }
      object.position.set(...objectState.position);
      object.rotation.set(...objectState.rotation);
      object.scale.set(...objectState.scale);
      object.visible = objectState.visible;
      skeletonRegistry.sync(objectState.id, objectState.rig);
    };

    const markRuntimeObject = (object: THREE.Object3D, objectId: string) => {
      object.userData.workbenchObjectId = objectId;
      object.traverse((child) => {
        if (typeof child.userData.workbenchObjectId === "string") {
          child.userData.workbenchObjectId = objectId;
        }
      });
    };

    const cloneRuntimeObject = (objectState: SceneObject) => {
      if (sceneRegistry.getObject(objectState.id)) {
        return;
      }
      const source = objectState.sourceObjectId
        ? sceneRegistry.getObject(objectState.sourceObjectId)
        : undefined;
      const object = source ? source.clone(true) : createPlaceholderCharacter();
      markRuntimeObject(object, objectState.id);
      worldRoot.add(object);
      sceneRegistry.registerObject(objectState.id, object);
      applyObjectState(objectState);
    };

    const roundDimensionValue = (value: number) =>
      Math.round(Math.max(0, value) * 1000) / 1000;

    const syncObjectBounds = () => {
      const box = new THREE.Box3();
      const size = new THREE.Vector3();

      storeRef.current.objects.forEach((objectState) => {
        const object = sceneRegistry.getObject(objectState.id);
        if (!object) {
          const helper = objectBoundsHelpers.get(objectState.id);
          if (helper) {
            helper.parent?.remove(helper);
            helper.geometry.dispose();
            (helper.material as THREE.Material).dispose();
            objectBoundsHelpers.delete(objectState.id);
          }
          return;
        }

        let helper = objectBoundsHelpers.get(objectState.id);
        if (!helper) {
          helper = new THREE.BoxHelper(object, 0x84d8ff);
          const material = helper.material as THREE.LineBasicMaterial;
          material.transparent = true;
          material.opacity = 0.78;
          material.depthTest = false;
          scene.add(helper);
          objectBoundsHelpers.set(objectState.id, helper);
        }

        helper.update();
        helper.visible =
          objectState.visible &&
          (objectState.boundsVisible ||
            storeRef.current.selectedObjectIds.includes(objectState.id));

        box.setFromObject(object);
        box.getSize(size);
        const nextDimensions: Vec3 = [
          roundDimensionValue(size.x),
          roundDimensionValue(size.y),
          roundDimensionValue(size.z),
        ];
        const currentDimensions = objectState.actualDimensions;
        if (
          !currentDimensions ||
          currentDimensions.some(
            (value, index) => Math.abs(value - nextDimensions[index]) > 0.0005,
          )
        ) {
          useProjectStore
            .getState()
            .updateObjectMetrics(objectState.id, { actualDimensions: nextDimensions });
        }
      });
    };

    const syncWorldSettings = () => {
      const { rootTransform, ground: groundSettings } = storeRef.current.worldSettings;
      worldRoot.position.set(...rootTransform.position);
      worldRoot.rotation.set(...rootTransform.rotation);
      worldRoot.scale.set(...rootTransform.scale);

      ground.visible = groundSettings.visible;
      ground.position.y = groundSettings.y;
      grid.visible = groundSettings.visible;
      grid.position.y = groundSettings.y + 0.001;
      (ground.material as THREE.MeshBasicMaterial).opacity = groundSettings.opacity;
    };

    const updateViewportLabels = () => {
      if (!storeRef.current.worldSettings.labelsVisible) {
        setViewportLabels((current) => (current.length ? [] : current));
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      const nextLabels: Array<{
        id: string;
        label: string;
        x: number;
        y: number;
        active: boolean;
      }> = [];
      const projected = new THREE.Vector3();

      storeRef.current.objects.forEach((item) => {
        const object = sceneRegistry.getObject(item.id);
        if (!object || !item.visible) {
          return;
        }
        object.getWorldPosition(projected);
        projected.project(camera);
        if (projected.z < -1 || projected.z > 1) {
          return;
        }
        nextLabels.push({
          id: item.id,
          label: item.name,
          x: ((projected.x + 1) * 0.5) * width,
          y: ((1 - projected.y) * 0.5) * height,
          active: storeRef.current.activeObjectId === item.id,
        });
      });

      storeRef.current.cameras.forEach((item) => {
        const rig = cameraRigs.get(item.id);
        if (!rig || !item.visible) {
          return;
        }
        rig.getWorldPosition(projected);
        projected.project(camera);
        if (projected.z < -1 || projected.z > 1) {
          return;
        }
        nextLabels.push({
          id: item.id,
          label: item.name,
          x: ((projected.x + 1) * 0.5) * width,
          y: ((1 - projected.y) * 0.5) * height,
          active: storeRef.current.selectedCameraId === item.id,
        });
      });

      setViewportLabels(nextLabels);
    };

    const disposeCameraRig = (rig: THREE.Object3D) => {
      rig.parent?.remove(rig);
      disposeObject3D(rig);
    };

    const syncCameraRigs = (cameras: SceneCamera[]) => {
      const nextIds = new Set(cameras.map((item) => item.id));
      Array.from(cameraRigs.entries()).forEach(([cameraId, rig]) => {
        if (!nextIds.has(cameraId)) {
          if (transformControls.object === rig) {
            transformControls.detach();
          }
          disposeCameraRig(rig);
          cameraRigs.delete(cameraId);
        }
      });

      cameras.forEach((cameraState) => {
        let rig = cameraRigs.get(cameraState.id);
        if (!rig) {
          rig = createCameraRig(cameraState);
          scene.add(rig);
          cameraRigs.set(cameraState.id, rig);
        }
        const resolvedCamera = resolveRuntimeCamera(cameraState);
        if (!draggingRef.current || transformControls.object !== rig) {
          applyCameraStateToRig(rig, resolvedCamera);
        }
      });
    };

    const resolveSelectableTarget = (object: THREE.Object3D | null) => {
      let current: THREE.Object3D | null = object;
      while (current) {
        if (current === transformHelper) {
          return { type: "transform-helper" as const };
        }
        if (typeof current.userData.workbenchBoneId === "string") {
          return {
            type: "bone" as const,
            boneId: current.userData.workbenchBoneId as string,
            objectId: current.userData.workbenchObjectId as string,
          };
        }
        if (typeof current.userData.workbenchIkChainId === "string") {
          return {
            type: "ik-target" as const,
            chainId: current.userData.workbenchIkChainId as string,
            objectId: current.userData.workbenchObjectId as string,
          };
        }
        if (typeof current.userData.workbenchCameraAimId === "string") {
          return {
            type: "camera-aim" as const,
            id: current.userData.workbenchCameraAimId as string,
          };
        }
        if (typeof current.userData.workbenchObjectId === "string") {
          return {
            type: "object" as const,
            id: current.userData.workbenchObjectId as string,
          };
        }
        if (typeof current.userData.workbenchCameraId === "string") {
          return {
            type: "camera" as const,
            id: current.userData.workbenchCameraId as string,
          };
        }
        current = current.parent;
      }
      return undefined;
    };

    const handleViewportSelection = (event: PointerEvent) => {
      if (storeRef.current.cameraPreviewActive) {
        return;
      }
      const deltaX = event.clientX - pointerDownPosition.x;
      const deltaY = event.clientY - pointerDownPosition.y;
      if (Math.hypot(deltaX, deltaY) > 4 || draggingRef.current) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const isRigTargetHitIntentional = (target: THREE.Object3D) => {
        target.getWorldPosition(projectedSelectionPoint);
        projectedSelectionPoint.project(camera);
        const screenX = ((projectedSelectionPoint.x + 1) * 0.5) * rect.width;
        const screenY = ((1 - projectedSelectionPoint.y) * 0.5) * rect.height;
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const selection = resolveSelectableTarget(target);
        const threshold =
          selection?.type === "ik-target"
            ? 22
            : selection?.type === "bone"
              ? 16
              : 12;
        return Math.hypot(pointerX - screenX, pointerY - screenY) <= threshold;
      };

      const objectPickTargets = storeRef.current.objects
        .map((item) => sceneRegistry.getObject(item.id))
        .filter((item): item is THREE.Object3D => Boolean(item));
      const priorityRigPickTargets = storeRef.current.objects.flatMap((item) =>
        item.rig?.hasSkeleton && item.rig.mode === "fk"
          ? skeletonRegistry.getBonePickTargets(item.id).filter((target) => target.visible)
          : item.rig?.hasSkeleton && item.rig.mode === "ik"
            ? skeletonRegistry
                .getIkTargetPickTargets(item.id)
                .filter((target) => target.visible)
            : [],
      );
      const nearestObjectIntersection = raycaster
        .intersectObjects(objectPickTargets, true)
        .find((intersection) => resolveSelectableTarget(intersection.object)?.type === "object");
      const nearestRigIntersection = raycaster
        .intersectObjects(priorityRigPickTargets, true)
        .find((intersection) => {
          const target = resolveSelectableTarget(intersection.object);
          return target?.type === "bone" || target?.type === "ik-target";
        });
      const priorityRigMatch =
        nearestRigIntersection && isRigTargetHitIntentional(nearestRigIntersection.object)
          ? resolveSelectableTarget(nearestRigIntersection.object)
          : undefined;

      if (priorityRigMatch?.type === "bone") {
        useProjectStore
          .getState()
          .setActiveBone(priorityRigMatch.objectId, priorityRigMatch.boneId);
        return;
      }

      if (priorityRigMatch?.type === "ik-target") {
        useProjectStore.getState().setActiveObject(priorityRigMatch.objectId);
        useProjectStore
          .getState()
          .setActiveIkChain(priorityRigMatch.objectId, priorityRigMatch.chainId);
        return;
      }

      const pickTargets = [
        ...objectPickTargets,
        ...Array.from(cameraRigs.values()),
        ...skeletonRegistry.getAdditionalPickTargets(),
      ];
      const intersections = raycaster.intersectObjects(pickTargets, true);
      const matched = intersections
        .map((intersection) => resolveSelectableTarget(intersection.object))
        .find(Boolean);

      if (!matched) {
        activeCameraAimId = undefined;
        useProjectStore.getState().clearSelection();
        return;
      }
      if (matched.type === "transform-helper") {
        return;
      }
      if (matched.type === "object") {
        activeCameraAimId = undefined;
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          useProjectStore.getState().toggleObjectSelection(matched.id);
        } else {
          useProjectStore.getState().setActiveObject(matched.id);
        }
        return;
      }
      if (matched.type === "bone") {
        activeCameraAimId = undefined;
        useProjectStore.getState().setActiveObject(matched.objectId);
        useProjectStore.getState().setActiveBone(matched.objectId, matched.boneId);
        return;
      }
      if (matched.type === "ik-target") {
        activeCameraAimId = undefined;
        useProjectStore.getState().setActiveObject(matched.objectId);
        useProjectStore.getState().setActiveIkChain(matched.objectId, matched.chainId);
        return;
      }
      if (matched.type === "camera-aim") {
        activeCameraAimId = matched.id;
        useProjectStore.getState().setActiveCamera(matched.id);
        return;
      }
      activeCameraAimId = undefined;
      useProjectStore.getState().setActiveCamera(matched.id);
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownPosition = { x: event.clientX, y: event.clientY };
      setContextMenu(null);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (storeRef.current.cameraPreviewActive) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const objectPickTargets = storeRef.current.objects
        .map((item) => sceneRegistry.getObject(item.id))
        .filter((item): item is THREE.Object3D => Boolean(item));
      const matched = raycaster
        .intersectObjects(objectPickTargets, true)
        .map((intersection) => resolveSelectableTarget(intersection.object))
        .find((target) => target?.type === "object");
      if (matched?.type === "object") {
        const current = useProjectStore.getState();
        if (!current.selectedObjectIds.includes(matched.id)) {
          current.setActiveObject(matched.id);
        }
      }
      setContextMenu({ x: event.clientX, y: event.clientY });
    };

    const syncTransformControls = () => {
      const state = storeRef.current;
      if (state.worldSettings.snap.enabled) {
        transformControls.translationSnap = state.worldSettings.snap.translate;
        transformControls.rotationSnap =
          (state.worldSettings.snap.rotateDeg * Math.PI) / 180;
        transformControls.scaleSnap = state.worldSettings.snap.scale;
      } else {
        transformControls.translationSnap = null;
        transformControls.rotationSnap = null;
        transformControls.scaleSnap = null;
      }
      if (state.cameraPreviewActive) {
        transformControls.detach();
        return;
      }
      const activeGroup = state.activeGroupId
        ? state.groups.find((group) => group.id === state.activeGroupId)
        : undefined;
      const transformSelectionIds =
        activeGroup?.objectIds ??
        (state.selectedObjectIds.length > 1 ? state.selectedObjectIds : []);
      if (transformSelectionIds.length > 1) {
        const selectableObjects = transformSelectionIds
          .map((id) => ({
            objectState: state.objects.find((object) => object.id === id),
            runtime: sceneRegistry.getObject(id),
          }))
          .filter(
            (item): item is { objectState: SceneObject; runtime: THREE.Object3D } => {
              if (!item.objectState || !item.runtime) {
                return false;
              }
              return item.objectState.visible && !item.objectState.locked;
            },
          );
        if (
          !selectableObjects.length ||
          (activeGroup && (activeGroup.locked || !activeGroup.visible))
        ) {
          transformControls.detach();
          return;
        }
        pivotPosition.set(0, 0, 0);
        selectableObjects.forEach(({ runtime }) => {
          pivotPosition.add(runtime.position);
        });
        pivotPosition.multiplyScalar(1 / selectableObjects.length);
        if (transformControls.object !== selectionPivot || !draggingRef.current) {
          selectionPivot.position.copy(pivotPosition);
          selectionPivot.rotation.set(0, 0, 0);
          selectionPivot.scale.set(1, 1, 1);
          selectionPivot.updateMatrixWorld(true);
          pivotMatrixPrevious.copy(selectionPivot.matrixWorld);
          transformControls.attach(selectionPivot);
        }
        transformControls.setMode(state.transformMode);
        transformControls.space = "world";
        return;
      }
      const activeObjectId = state.activeObjectId;
      const activeObject = activeObjectId
        ? state.objects.find((object) => object.id === activeObjectId)
        : undefined;
      const targetObject = activeObjectId
        ? sceneRegistry.getObject(activeObjectId)
        : undefined;

      if (activeObjectId) {
        if (!targetObject || !activeObject || activeObject.locked || !activeObject.visible) {
          transformControls.detach();
          return;
        }
        const rig = activeObject.rig;
        if (rig?.hasSkeleton) {
          if (rig.mode === "fk" && rig.boneControlActive && rig.activeBoneId) {
            const bone = skeletonRegistry.getBone(activeObject.id, rig.activeBoneId);
            if (!bone) {
              transformControls.detach();
              return;
            }
            if (transformControls.object !== bone) {
              transformControls.attach(bone);
            }
            transformControls.setMode("rotate");
            transformControls.space = "local";
            return;
          }
          if (rig.mode === "ik" && rig.boneControlActive && rig.activeIkChainId) {
            const target = skeletonRegistry.getIkTarget(
              activeObject.id,
              rig.activeIkChainId,
            );
            if (!target) {
              transformControls.detach();
              return;
            }
            if (transformControls.object !== target) {
              transformControls.attach(target);
            }
            transformControls.setMode("translate");
            transformControls.space = "world";
            return;
          }
        }
        if (transformControls.object !== targetObject) {
          transformControls.attach(targetObject);
        }
        transformControls.setMode(state.transformMode);
        transformControls.space = "world";
        return;
      }

      const selectedCamera = state.cameras.find(
        (item) => item.id === state.selectedCameraId,
      );
      const cameraRig = selectedCamera ? cameraRigs.get(selectedCamera.id) : undefined;
      const cameraAimTarget =
        selectedCamera && activeCameraAimId === selectedCamera.id
          ? cameraRig?.getObjectByName("camera-look-at-target")
          : undefined;
      if (
        selectedCamera &&
        cameraAimTarget &&
        selectedCamera.mode === "lookAt" &&
        !selectedCamera.locked &&
        selectedCamera.visible
      ) {
        if (transformControls.object !== cameraAimTarget) {
          transformControls.attach(cameraAimTarget);
        }
        transformControls.setMode("translate");
        transformControls.space = "world";
        return;
      }
      if (
        !cameraRig ||
        !selectedCamera ||
        selectedCamera.locked ||
        !selectedCamera.visible
      ) {
        activeCameraAimId = undefined;
        transformControls.detach();
        return;
      }
      if (transformControls.object !== cameraRig) {
        transformControls.attach(cameraRig);
      }
      transformControls.setMode(
        selectedCamera.mode === "lookAt" && state.transformMode === "rotate"
          ? "translate"
          : state.transformMode === "scale"
            ? "translate"
            : state.transformMode,
      );
      transformControls.space =
        selectedCamera.mode === "free" && state.transformMode === "rotate"
          ? "local"
          : "world";
    };

    const renderCleanScene = (
      targetRenderer: THREE.WebGLRenderer,
      targetCamera: THREE.Camera,
    ) => {
      const helperObjects = [
        transformHelper,
        axes,
        ...Array.from(cameraRigs.values()),
        ...Array.from(objectBoundsHelpers.values()),
        ...skeletonRegistry.getHelperObjects(),
      ];
      const visibility = helperObjects.map((object) => ({
        object,
        visible: object.visible,
      }));
      helperObjects.forEach((object) => {
        object.visible = false;
      });
      targetRenderer.render(scene, targetCamera);
      visibility.forEach(({ object, visible }) => {
        object.visible = visible;
      });
    };

    const wait = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, milliseconds);
      });

    const createRecordingCanvas = () => {
      const source = renderer.domElement;
      const aspectRatio =
        storeRef.current.outputFrame.presetId === "default"
          ? undefined
          : getOutputAspectRatio();
      const sourceWidth = source.width;
      const sourceHeight = source.height;
      const sourceRatio = sourceWidth / sourceHeight;
      let cropWidth = sourceWidth;
      let cropHeight = sourceHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
        if (sourceRatio > aspectRatio) {
          cropWidth = Math.round(sourceHeight * aspectRatio);
          offsetX = Math.round((sourceWidth - cropWidth) / 2);
        } else if (sourceRatio < aspectRatio) {
          cropHeight = Math.round(sourceWidth / aspectRatio);
          offsetY = Math.round((sourceHeight - cropHeight) / 2);
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("无法创建动画导出画布");
      }

      return {
        canvas,
        draw: () => {
          context.drawImage(
            source,
            offsetX,
            offsetY,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight,
          );
        },
      };
    };

    const renderSampledAnimationFrame = (
      time: number,
      state: ReturnType<typeof useProjectStore.getState>,
    ) => {
      const sampled = applyAnimationToProjectState(state, time);
      sampled.objects.forEach(applyObjectState);
      syncCameraRigs(sampled.cameras);
      syncObjectBounds();
      const cameraId = resolvePlaybackCameraId(
        state.animation.cameraCuts,
        time,
        state.activeCameraId,
      );
      const shotCamera =
        sampled.cameras.find((item) => item.id === cameraId) ?? sampled.cameras[0];
      if (shotCamera) {
        applyCameraStateToPerspectiveCamera(
          camera,
          resolveRuntimeCamera(shotCamera, sampled.objects, sampled.cameras),
        );
      }
      renderCleanScene(renderer, camera);
    };

    const restoreSceneFromStore = () => {
      const state = storeRef.current;
      state.objects.forEach(applyObjectState);
      syncCameraRigs(state.cameras);
      syncObjectBounds();
      syncTransformControls();
    };

    const unsubscribeSceneSync = useProjectStore.subscribe((state) => {
      state.objects.forEach(applyObjectState);
      syncObjectBounds();
      syncCameraRigs(state.cameras);
      syncWorldSettings();
      resizePreviewRenderer();
      void syncPanoramaBackground();
      syncTransformControls();
    });
    syncCameraRigs(storeRef.current.cameras);
    syncObjectBounds();
    syncWorldSettings();
    resizePreviewRenderer();
    void syncPanoramaBackground();

    const handleGlbImport = async (event: Event) => {
      const file = (event as CustomEvent<File>).detail;
      if (!file.name.toLowerCase().endsWith(".glb")) {
        useProjectStore.getState().setImportError("只支持导入 .glb 文件");
        return;
      }

      try {
        const { objectUrl, scene: importedScene } = await loadGlbFromFile(file);
        normalizeImportedScene(importedScene);
        const id = crypto.randomUUID();
        const objectId = `object_${id}`;
        const assetId = `asset_${id}`;
        importedScene.userData.workbenchObjectId = objectId;
        importedScene.traverse((child) => {
          child.userData.workbenchObjectId = objectId;
        });
        worldRoot.add(importedScene);
        sceneRegistry.registerObject(objectId, importedScene);
        skeletonRegistry.register(objectId, importedScene);
        const rig = extractRigFromScene(importedScene);
        const resolvedRig = rig
          ? {
              ...rig,
              ikChains: rig.ikChains.map((chain) => ({
                ...chain,
                targetPosition:
                  skeletonRegistry.getBoneWorldPosition(objectId, chain.effectorBoneId) ??
                  chain.targetPosition,
              })),
            }
          : undefined;

        useProjectStore.getState().addImportedModel(
          {
            id: assetId,
            name: file.name,
            type: "glb",
            objectUrl,
            size: file.size,
            createdAt: new Date().toISOString(),
          },
          {
            id: objectId,
            assetId,
            name: file.name.replace(/\.glb$/i, ""),
            type: "model",
            visible: true,
            locked: false,
            boundsVisible: false,
            position: [
              importedScene.position.x,
              importedScene.position.y,
              importedScene.position.z,
            ],
            rotation: [
              importedScene.rotation.x,
              importedScene.rotation.y,
              importedScene.rotation.z,
            ],
            scale: [
              importedScene.scale.x,
              importedScene.scale.y,
              importedScene.scale.z,
            ],
            rig: resolvedRig,
          },
        );
      } catch {
        useProjectStore.getState().setImportError("GLB 解析失败，请检查文件");
      }
    };

    const registerSceneObject = (
      object: THREE.Object3D,
      config: { name: string; type: SceneObject["type"]; position?: Vec3 },
    ) => {
      const objectId = `object_${crypto.randomUUID()}`;
      object.userData.workbenchObjectId = objectId;
      object.traverse((child) => {
        child.userData.workbenchObjectId = objectId;
      });
      if (config.position) {
        object.position.set(...config.position);
      }
      worldRoot.add(object);
      sceneRegistry.registerObject(objectId, object);
      skeletonRegistry.register(objectId, object);
      useProjectStore.getState().addSceneObject({
        id: objectId,
        name: config.name,
        type: config.type,
        visible: true,
        locked: false,
        boundsVisible: false,
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        scale: [object.scale.x, object.scale.y, object.scale.z],
      });
    };

    const handleSceneInsert = (event: Event) => {
      const detail = (event as CustomEvent<SceneInsertRequest>).detail;
      if (detail.kind === "standin") {
        registerSceneObject(createStandinCharacter(detail.variant), {
          name: detail.variant === "female" ? "女性素体" : "男性素体",
          type: "character",
        });
        return;
      }

      if (detail.kind === "primitive") {
        const nameMap = {
          cube: "立方体",
          sphere: "球体",
          cylinder: "圆柱",
          torus: "环状体",
          cone: "圆锥",
          pyramid: "棱锥",
        } as const;
        registerSceneObject(createPrimitiveObject(detail.variant), {
          name: nameMap[detail.variant],
          type: "model",
        });
        return;
      }

      const rows = Math.min(24, Math.max(1, Math.round(detail.rows)));
      const columns = Math.min(24, Math.max(1, Math.round(detail.columns)));
      const spacing = Math.min(20, Math.max(0.5, detail.spacing));
      const total = rows * columns;
      for (let index = 0; index < total; index += 1) {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const offsetX = (column - (columns - 1) / 2) * spacing;
        const offsetZ = (row - (rows - 1) / 2) * spacing;
        registerSceneObject(createStandinCharacter(detail.variant), {
          name: `${detail.variant === "female" ? "女性群众" : "男性群众"}${index + 1}`,
          type: "character",
          position: [offsetX, 0, offsetZ],
        });
      }
    };

    const handleObjectRemove = (event: Event) => {
      const objectId = (event as CustomEvent<string>).detail;
      if (transformControls.object === sceneRegistry.getObject(objectId)) {
        transformControls.detach();
      }
      skeletonRegistry.remove(objectId);
      sceneRegistry.removeObject(objectId);
    };

    const handleObjectsClone = (event: Event) => {
      const detail = (event as CustomEvent<Array<{ objectId: string }>>).detail;
      detail.forEach(({ objectId }) => {
        const objectState = storeRef.current.objects.find((object) => object.id === objectId);
        if (objectState) {
          cloneRuntimeObject(objectState);
        }
      });
      syncObjectBounds();
      syncTransformControls();
    };

    const handleProjectRuntimeSync = () => {
      const objectIds = new Set(storeRef.current.objects.map((object) => object.id));
      sceneRegistry.getObjectIds().forEach((objectId) => {
        if (!objectIds.has(objectId)) {
          if (transformControls.object === sceneRegistry.getObject(objectId)) {
            transformControls.detach();
          }
          skeletonRegistry.remove(objectId);
          sceneRegistry.removeObject(objectId);
        }
      });
      storeRef.current.objects.forEach(cloneRuntimeObject);
      storeRef.current.objects.forEach(applyObjectState);
      syncObjectBounds();
      syncTransformControls();
    };

    const handleCameraRemove = (event: Event) => {
      const cameraId = (event as CustomEvent<string>).detail;
      const rig = cameraRigs.get(cameraId);
      if (!rig) {
        return;
      }
      if (activeCameraAimId === cameraId) {
        activeCameraAimId = undefined;
      }
      if (transformControls.object === rig) {
        transformControls.detach();
      }
      disposeCameraRig(rig);
      cameraRigs.delete(cameraId);
    };

    const handleCameraCreateFromView = () => {
      const id = `camera_${crypto.randomUUID()}`;
      useProjectStore.getState().addCamera({
        id,
        name: `相机${storeRef.current.cameras.length + 1}`,
        position: [camera.position.x, camera.position.y, camera.position.z],
        rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        targetMode: "manual",
        fov: Math.round(camera.fov),
        mode: "free",
        visible: true,
        locked: false,
      });
    };

    const handlePanoramaImport = async (event: Event) => {
      const file = (event as CustomEvent<File>).detail;
      if (!file.type.startsWith("image/")) {
        return;
      }

      useProjectStore.getState().setWorldPanoramaAsset({
        id: `asset_${crypto.randomUUID()}`,
        name: file.name,
        type: "panorama",
        objectUrl: URL.createObjectURL(file),
        mimeType: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      });
      await syncPanoramaBackground();
    };

    const handleViewReset = () => {
      if (storeRef.current.cameraPreviewActive) {
        return;
      }
      camera.position.set(8, 5.2, 7.4);
      camera.fov = 45;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0.8, 0);
      controls.update();
    };

    const handleSnapshotExport = () => {
      const activeCamera = storeRef.current.cameras.find(
        (item) => item.id === storeRef.current.activeCameraId,
      );
      const shouldRestoreEditorCamera = activeCamera && !storeRef.current.cameraPreviewActive;
      const snapshotPose = shouldRestoreEditorCamera
        ? {
            fov: camera.fov,
            position: camera.position.clone(),
            rotation: camera.rotation.clone(),
          }
        : undefined;
      if (activeCamera) {
        applyCameraStateToPerspectiveCamera(camera, resolveRuntimeCamera(activeCamera));
      }
      renderCleanScene(renderer, camera);
      const imageDataUrl = exportCanvasWithAspectRatio(
        renderer.domElement,
        storeRef.current.outputFrame.presetId === "default"
          ? undefined
          : getOutputAspectRatio(),
      );
      const name = createSnapshotName();
      useProjectStore.getState().addSnapshot({
        id: `snapshot_${crypto.randomUUID()}`,
        name,
        cameraId: storeRef.current.activeCameraId,
        createdAt: new Date().toISOString(),
        imageDataUrl,
      });
      downloadDataUrl(imageDataUrl, `${name}.png`);
      if (snapshotPose) {
        camera.position.copy(snapshotPose.position);
        camera.rotation.copy(snapshotPose.rotation);
        camera.fov = snapshotPose.fov;
        camera.updateProjectionMatrix();
      }
    };

    const handleAnimationExport = async (event: Event) => {
      if (exportInProgress) {
        window.dispatchEvent(
          new CustomEvent("animation-export-error", {
            detail: { message: "已有动画正在导出，请稍后再试" },
          }),
        );
        return;
      }

      const { name, range } = (event as CustomEvent<AnimationExportRequestDetail>).detail;
      const store = useProjectStore.getState();
      const wasPlaying = store.animation.isPlaying;
      const originalTime = store.animation.currentTime;
      const originalPose = {
        fov: camera.fov,
        position: camera.position.clone(),
        rotation: camera.rotation.clone(),
        target: controls.target.clone(),
        controlsEnabled: controls.enabled,
      };
      exportInProgress = true;
      store.setAnimationPlaying(false);
      const exportState = useProjectStore.getState();
      let recordingStream: MediaStream | undefined;

      const fallbackToJson = () => {
        const payload = buildAnimationExportPayload({
          projectName: exportState.projectName,
          outputFrame: exportState.outputFrame,
          objects: exportState.objects,
          cameras: exportState.cameras,
          animation: exportState.animation,
          range,
        });
        downloadJsonFile(payload, `${name}.json`);
        window.dispatchEvent(
          new CustomEvent("animation-export-complete", {
            detail: { filename: `${name}.json`, format: "JSON" },
          }),
        );
      };

      try {
        const videoFormat = getSupportedAnimationVideoFormat();
        if (!videoFormat || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
          fallbackToJson();
          return;
        }

        const recording = createRecordingCanvas();
        recordingStream = recording.canvas.captureStream(0);
        const track = recordingStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack & {
          requestFrame?: () => void;
        };
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(recordingStream, { mimeType: videoFormat.mimeType });
        const stopped = new Promise<void>((resolve, reject) => {
          recorder.onstop = () => resolve();
          recorder.onerror = () => reject(new Error("动画录制中断"));
        });
        recorder.ondataavailable = (dataEvent) => {
          if (dataEvent.data.size > 0) {
            chunks.push(dataEvent.data);
          }
        };

        recorder.start();
        for (let frame = range.startFrame; frame <= range.endFrame; frame += 1) {
          const frameIndex = frame - range.startFrame + 1;
          renderSampledAnimationFrame(frame / exportState.animation.fps, exportState);
          recording.draw();
          track.requestFrame?.();
          window.dispatchEvent(
            new CustomEvent("animation-export-progress", {
              detail: { current: frameIndex, total: range.frameCount },
            }),
          );
          await wait(1000 / exportState.animation.fps);
        }

        recorder.stop();
        await stopped;
        if (!chunks.length) {
          throw new Error("未生成视频数据");
        }
        const blob = new Blob(chunks, { type: videoFormat.mimeType });
        downloadBlobFile(blob, `${name}.${videoFormat.extension}`);
        window.dispatchEvent(
          new CustomEvent("animation-export-complete", {
            detail: {
              filename: `${name}.${videoFormat.extension}`,
              format: videoFormat.formatLabel,
            },
          }),
        );
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent("animation-export-error", {
            detail: {
              message:
                error instanceof Error
                  ? `动画导出失败：${error.message}`
                  : "动画导出失败",
            },
          }),
        );
      } finally {
        recordingStream?.getTracks().forEach((item) => item.stop());
        exportInProgress = false;
        useProjectStore.getState().setAnimationTime(originalTime);
        useProjectStore.getState().setAnimationPlaying(wasPlaying);
        restoreSceneFromStore();
        camera.position.copy(originalPose.position);
        camera.rotation.copy(originalPose.rotation);
        camera.fov = originalPose.fov;
        camera.updateProjectionMatrix();
        controls.target.copy(originalPose.target);
        controls.enabled = originalPose.controlsEnabled;
        controls.update();
      }
    };

    const handleBeforeUnload = () => {
      skeletonRegistry.disposeAll();
      sceneRegistry.disposeAll();
      useProjectStore.getState().releaseRuntimeAssets();
    };

    let animationFrame = 0;
    const animate = () => {
      const now = performance.now();
      if (exportInProgress) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      const playbackActive = storeRef.current.animation.isPlaying;
      const sampled = playbackActive
        ? applyAnimationToProjectState(
            storeRef.current,
            storeRef.current.animation.currentTime,
          )
        : undefined;
      const sceneObjects = sampled?.objects ?? storeRef.current.objects;
      const sceneCameras = sampled?.cameras ?? storeRef.current.cameras;

      if (sampled) {
        sampled.objects.forEach(applyObjectState);
        syncCameraRigs(sampled.cameras);
      }

      const activeCamera = sceneCameras.find(
        (item) => item.id === storeRef.current.activeCameraId,
      );
      const playbackCameraId = playbackActive
        ? resolvePlaybackCameraId(
            storeRef.current.animation.cameraCuts,
            storeRef.current.animation.currentTime,
            storeRef.current.activeCameraId,
          )
        : storeRef.current.activeCameraId;
      const playbackCamera = sceneCameras.find(
        (item) => item.id === playbackCameraId,
      );
      const previewActive = storeRef.current.cameraPreviewActive;
      const playingShotActive = playbackActive && Boolean(playbackCamera);
      const shotCamera = playingShotActive ? playbackCamera : previewActive ? activeCamera : undefined;
      const shotCameraActive = previewActive || playingShotActive;
      const wasShotCameraActive = previousPreviewActive || previousPlaybackActive;

      if (shotCameraActive && !wasShotCameraActive) {
        editorPose = {
          fov: camera.fov,
          position: camera.position.clone(),
          rotation: camera.rotation.clone(),
          target: controls.target.clone(),
        };
      }
      if (!shotCameraActive && wasShotCameraActive && editorPose) {
        camera.position.copy(editorPose.position);
        camera.rotation.copy(editorPose.rotation);
        camera.fov = editorPose.fov;
        controls.target.copy(editorPose.target);
        camera.updateProjectionMatrix();
        controls.update();
        editorPose = undefined;
      }
      previousPreviewActive = previewActive;
      previousPlaybackActive = playbackActive;

      if (shotCameraActive && shotCamera) {
        const runtimeShotCamera = resolveRuntimeCamera(
          shotCamera,
          sceneObjects,
          sceneCameras,
        );
        applyCameraStateToPerspectiveCamera(camera, runtimeShotCamera);
        controls.enabled = false;
      } else {
        controls.enabled = !draggingRef.current;
        controls.update();
      }
      if (shotCameraActive) {
        renderCleanScene(renderer, camera);
      } else {
        renderer.render(scene, camera);
      }
      updateOrientationWidget();

      const inspectedCamera =
        storeRef.current.animation.isPlaying
          ? playbackCamera
          : sceneCameras.find(
              (item) => item.id === storeRef.current.selectedCameraId,
            ) ?? activeCamera;
      if (inspectedCamera) {
        applyCameraStateToPerspectiveCamera(
          previewCamera,
          resolveRuntimeCamera(inspectedCamera, sceneObjects, sceneCameras),
        );
        renderCleanScene(previewRenderer, previewCamera);
        if (now - lastPreviewEmitAt > 140) {
          lastPreviewEmitAt = now;
          window.dispatchEvent(
            new CustomEvent("camera-preview-frame", {
              detail: {
                cameraId: inspectedCamera.id,
                imageDataUrl: previewRenderer.domElement.toDataURL("image/png"),
              },
            }),
          );
        }
      }

      const labelNow = performance.now();
      if (labelNow - lastLabelEmitAt > 120) {
        lastLabelEmitAt = labelNow;
        updateViewportLabels();
      }
      syncObjectBounds();

      animationFrame = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("glb-import-request", handleGlbImport);
    window.addEventListener("scene-object-create-request", handleSceneInsert);
    window.addEventListener("scene-object-remove-request", handleObjectRemove);
    window.addEventListener("scene-objects-clone-request", handleObjectsClone);
    window.addEventListener("project-runtime-sync-request", handleProjectRuntimeSync);
    window.addEventListener("scene-camera-remove-request", handleCameraRemove);
    window.addEventListener("camera-create-from-view-request", handleCameraCreateFromView);
    window.addEventListener("panorama-import-request", handlePanoramaImport);
    window.addEventListener("viewport-reset-view-request", handleViewReset);
    window.addEventListener("snapshot-export-request", handleSnapshotExport);
    window.addEventListener("animation-export-request", handleAnimationExport);
    window.addEventListener("beforeunload", handleBeforeUnload);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handleViewportSelection);
    renderer.domElement.addEventListener("contextmenu", handleContextMenu);
    syncTransformControls();
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      unsubscribeSceneSync();
      window.removeEventListener("resize", resize);
      window.removeEventListener("glb-import-request", handleGlbImport);
      window.removeEventListener("scene-object-create-request", handleSceneInsert);
      window.removeEventListener("scene-object-remove-request", handleObjectRemove);
      window.removeEventListener("scene-objects-clone-request", handleObjectsClone);
      window.removeEventListener("project-runtime-sync-request", handleProjectRuntimeSync);
      window.removeEventListener("scene-camera-remove-request", handleCameraRemove);
      window.removeEventListener(
        "camera-create-from-view-request",
        handleCameraCreateFromView,
      );
      window.removeEventListener("panorama-import-request", handlePanoramaImport);
      window.removeEventListener("viewport-reset-view-request", handleViewReset);
      window.removeEventListener("snapshot-export-request", handleSnapshotExport);
      window.removeEventListener("animation-export-request", handleAnimationExport);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handleViewportSelection);
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      transformControls.detach();
      transformControls.dispose();
      Array.from(objectBoundsHelpers.values()).forEach((helper) => {
        helper.parent?.remove(helper);
        helper.geometry.dispose();
        (helper.material as THREE.Material).dispose();
      });
      objectBoundsHelpers.clear();
      Array.from(cameraRigs.values()).forEach(disposeCameraRig);
      cameraRigs.clear();
      skeletonRegistry.disposeAll();
      sceneRegistry.disposeAll();
      controls.dispose();
      previewRenderer.dispose();
      panoramaTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="viewport-stage" ref={containerRef}>
      {contextMenu ? (
        <div
          className="viewport-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => {
              useProjectStore.getState().copySelection();
              setContextMenu(null);
            }}
          >
            复制
          </button>
          <button
            type="button"
            onClick={() => {
              useProjectStore.getState().pasteClipboard();
              setContextMenu(null);
            }}
          >
            粘贴
          </button>
          <button
            type="button"
            onClick={() => {
              useProjectStore.getState().groupSelection();
              setContextMenu(null);
            }}
          >
            成组
          </button>
          <button
            type="button"
            onClick={() => {
              useProjectStore.getState().ungroupSelection();
              setContextMenu(null);
            }}
          >
            解组
          </button>
          <button
            type="button"
            onClick={() => {
              useProjectStore.getState().snapSelectionToGround();
              setContextMenu(null);
            }}
          >
            吸附到地面
          </button>
          <button
            type="button"
            onClick={() => {
              useProjectStore.getState().alignSelection("x");
              setContextMenu(null);
            }}
          >
            X 对齐
          </button>
          <button
            className="danger-action"
            type="button"
            onClick={() => {
              useProjectStore.getState().removeSelection();
              setContextMenu(null);
            }}
          >
            删除
          </button>
        </div>
      ) : null}
      <div className="viewport-hud">
        <div className="orientation-widget">
          <span className="orientation-origin" />
          {orientationAxes.map((axis) => (
            <span
              className={`orientation-axis orientation-axis-${axis.id}`}
              key={axis.id}
              style={
                {
                  "--axis-x": `${axis.x}px`,
                  "--axis-y": `${axis.y}px`,
                  "--axis-length": `${axis.length}px`,
                  "--axis-angle": `${axis.angle}deg`,
                  "--axis-opacity": `${0.62 + (1 - axis.depth) * 0.16}`,
                  zIndex: Math.round((1 - axis.depth) * 10),
                } as CSSProperties
              }
            >
              <span className="orientation-axis-line" />
              <span className="orientation-axis-tip">{axis.label}</span>
            </span>
          ))}
        </div>
        {cameraPreviewActive ? (
          <span className="camera-view-badge">摄影机视角</span>
        ) : null}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("viewport-reset-view-request"))}
        >
          重置视角
        </button>
      </div>
      <div className="viewport-label-layer">
        {viewportLabels.map((item) => (
          <div
            className={`viewport-label ${item.active ? "is-active" : ""}`}
            key={item.id}
            style={{
              transform: `translate(${item.x}px, ${item.y}px) translate(-50%, -100%)`,
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
      {outputFrame.presetId !== "default" ? (
        <div className="viewport-frame-guide-layer" aria-hidden="true">
          <div
            className="viewport-frame-guide"
            style={{ aspectRatio: `${outputFrame.width} / ${outputFrame.height}` }}
          >
            <span>{outputFrame.label}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
