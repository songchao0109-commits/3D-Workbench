import {
  Camera,
  ChevronDown,
  Focus,
  ImagePlus,
  Move3D,
  Rotate3D,
  ScanSearch,
  Scale3D,
  Shapes,
  Square,
  Upload,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { OUTPUT_FRAME_PRESETS } from "../../domain/outputFrames";
import type { ToolMode, TransformMode } from "../../domain/projectTypes";
import { useProjectStore } from "../../store/projectStore";

type OpenMenu = "move" | "object" | "aspect" | undefined;

const moveOptions: Array<{
  id: TransformMode;
  label: string;
  shortcut: string;
  icon: typeof Move3D;
}> = [
  { id: "translate", label: "移动", shortcut: "V", icon: Move3D },
  { id: "rotate", label: "旋转", shortcut: "R", icon: Rotate3D },
  { id: "scale", label: "缩放", shortcut: "S", icon: Scale3D },
];

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function BottomToolbar() {
  const toolbarRef = useRef<HTMLElement>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);
  const panoramaInputRef = useRef<HTMLInputElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>();
  const [crowdRows, setCrowdRows] = useState(3);
  const [crowdColumns, setCrowdColumns] = useState(3);
  const [crowdSpacing, setCrowdSpacing] = useState(1.8);

  const activeTool = useProjectStore((state) => state.activeTool);
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const outputFrame = useProjectStore((state) => state.outputFrame);
  const transformMode = useProjectStore((state) => state.transformMode);
  const setActiveTool = useProjectStore((state) => state.setActiveTool);
  const setTransformMode = useProjectStore((state) => state.setTransformMode);
  const setOutputFrame = useProjectStore((state) => state.setOutputFrame);

  const currentMoveLabel = useMemo(
    () => moveOptions.find((item) => item.id === transformMode) ?? moveOptions[0],
    [transformMode],
  );
  const CurrentMoveIcon = currentMoveLabel.icon;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(undefined);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const nextMode =
        key === "v" ? "translate" : key === "r" ? "rotate" : key === "s" ? "scale" : undefined;
      if (!nextMode) {
        return;
      }
      event.preventDefault();
      setTransformMode(nextMode);
      setActiveTool("move");
      setOpenMenu(undefined);
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [setActiveTool, setTransformMode]);

  const triggerGlbImport = () => {
    setActiveTool("object");
    glbInputRef.current?.click();
    setOpenMenu(undefined);
  };

  const triggerPanoramaImport = () => {
    setActiveTool("panorama");
    panoramaInputRef.current?.click();
    setOpenMenu(undefined);
  };

  const handleGlbFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("glb-import-request", {
        detail: file,
      }),
    );
    event.target.value = "";
  };

  const handlePanoramaFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("panorama-import-request", {
        detail: file,
      }),
    );
    event.target.value = "";
  };

  const handleInsertObject = (
    detail:
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
        },
  ) => {
    setActiveTool("object");
    window.dispatchEvent(
      new CustomEvent("scene-object-create-request", {
        detail,
      }),
    );
    setOpenMenu(undefined);
  };

  const handleSnapshot = () => {
    if (!selectedCameraId) {
      return;
    }
    setActiveTool("snapshot");
    window.dispatchEvent(new CustomEvent("snapshot-export-request"));
  };

  const handleCreateCamera = () => {
    setActiveTool("camera");
    setOpenMenu(undefined);
    window.dispatchEvent(new Event("camera-create-from-view-request"));
  };

  return (
    <nav className="bottom-toolbar" aria-label="工作台工具" ref={toolbarRef}>
      <input
        ref={glbInputRef}
        className="file-input"
        type="file"
        accept=".glb,model/gltf-binary"
        onChange={handleGlbFileChange}
      />
      <input
        ref={panoramaInputRef}
        className="file-input"
        type="file"
        accept="image/*"
        onChange={handlePanoramaFileChange}
      />

      <div className="toolbar-menu-group">
        <button
          className={`toolbar-pill ${activeTool === "move" ? "is-active" : ""}`}
          type="button"
          onClick={() => {
            setActiveTool("move");
            setOpenMenu(openMenu === "move" ? undefined : "move");
          }}
        >
          <CurrentMoveIcon size={16} />
          <span>{currentMoveLabel.label}</span>
          <ChevronDown size={14} />
        </button>
        {openMenu === "move" ? (
          <div className="toolbar-menu">
            {moveOptions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`toolbar-menu-item ${transformMode === item.id ? "is-active" : ""}`}
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTransformMode(item.id);
                    setActiveTool("move");
                    setOpenMenu(undefined);
                  }}
                >
                  <span className="toolbar-menu-main">
                    <Icon size={14} />
                    <span>{item.label}</span>
                  </span>
                  <span className="toolbar-shortcut">{item.shortcut}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="toolbar-menu-group">
        <button
          className={`toolbar-pill ${activeTool === "object" ? "is-active" : ""}`}
          type="button"
          onClick={() => {
            setActiveTool("object");
            setOpenMenu(openMenu === "object" ? undefined : "object");
          }}
        >
          <Shapes size={16} />
          <span>对象</span>
          <ChevronDown size={14} />
        </button>
        {openMenu === "object" ? (
          <div className="toolbar-menu wide-menu">
            <button className="toolbar-menu-item" type="button" onClick={triggerGlbImport}>
              <span className="toolbar-menu-main">
                <Upload size={14} />
                <span>本地上传</span>
              </span>
            </button>
            <button
              className="toolbar-menu-item"
              type="button"
              onClick={() => handleInsertObject({ kind: "standin", variant: "male" })}
            >
              <span className="toolbar-menu-main">
                <UserRound size={14} />
                <span>男性素体</span>
              </span>
            </button>
            <button
              className="toolbar-menu-item"
              type="button"
              onClick={() => handleInsertObject({ kind: "standin", variant: "female" })}
            >
              <span className="toolbar-menu-main">
                <UserRound size={14} />
                <span>女性素体</span>
              </span>
            </button>
            <div className="toolbar-menu-section">
              <div className="toolbar-menu-title">
                <Users size={14} />
                <span>群众</span>
              </div>
              <div className="toolbar-inline-fields">
                <label>
                  <span>行数</span>
                  <input
                    className="toolbar-mini-input"
                    max={24}
                    min={1}
                    type="number"
                    value={crowdRows}
                    onChange={(event) =>
                      setCrowdRows(Math.max(1, Number(event.currentTarget.value || 1)))
                    }
                  />
                </label>
                <label>
                  <span>列数</span>
                  <input
                    className="toolbar-mini-input"
                    max={24}
                    min={1}
                    type="number"
                    value={crowdColumns}
                    onChange={(event) =>
                      setCrowdColumns(Math.max(1, Number(event.currentTarget.value || 1)))
                    }
                  />
                </label>
                <label>
                  <span>间距</span>
                  <input
                    className="toolbar-mini-input"
                    max={20}
                    min={0.5}
                    step={0.1}
                    type="number"
                    value={crowdSpacing}
                    onChange={(event) =>
                      setCrowdSpacing(Math.max(0.5, Number(event.currentTarget.value || 0.5)))
                    }
                  />
                </label>
              </div>
              <button
                className="toolbar-inline-action"
                type="button"
                onClick={() =>
                    handleInsertObject({
                      kind: "crowd",
                      variant: "male",
                      rows: crowdRows,
                      columns: crowdColumns,
                      spacing: crowdSpacing,
                    })
                  }
                >
                  插入群众
                </button>
            </div>
            <div className="toolbar-menu-section">
              <div className="toolbar-menu-title">
                <Square size={14} />
                <span>几何模型</span>
              </div>
              <div className="toolbar-chip-row">
                <button
                  className="toolbar-chip"
                  type="button"
                  onClick={() => handleInsertObject({ kind: "primitive", variant: "cube" })}
                >
                  立方体
                </button>
                <button
                  className="toolbar-chip"
                  type="button"
                  onClick={() => handleInsertObject({ kind: "primitive", variant: "sphere" })}
                >
                  球体
                </button>
                <button
                  className="toolbar-chip"
                  type="button"
                  onClick={() => handleInsertObject({ kind: "primitive", variant: "cylinder" })}
                >
                  圆柱
                </button>
                <button
                  className="toolbar-chip"
                  type="button"
                  onClick={() => handleInsertObject({ kind: "primitive", variant: "torus" })}
                >
                  环状体
                </button>
                <button
                  className="toolbar-chip"
                  type="button"
                  onClick={() => handleInsertObject({ kind: "primitive", variant: "cone" })}
                >
                  圆锥
                </button>
                <button
                  className="toolbar-chip"
                  type="button"
                  onClick={() => handleInsertObject({ kind: "primitive", variant: "pyramid" })}
                >
                  棱锥
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <button
        className={`toolbar-pill ${activeTool === "panorama" ? "is-active" : ""}`}
        type="button"
        onClick={triggerPanoramaImport}
      >
        <ImagePlus size={16} />
        <span>全景图</span>
      </button>

      <button
        className={`toolbar-pill ${activeTool === "camera" ? "is-active" : ""}`}
        type="button"
        onClick={handleCreateCamera}
      >
        <Video size={16} />
        <span>添加机位</span>
      </button>

      <div className="toolbar-menu-group">
        <button
          className={`toolbar-pill ${activeTool === "aspect" ? "is-active" : ""}`}
          type="button"
          onClick={() => {
            setActiveTool("aspect");
            setOpenMenu(openMenu === "aspect" ? undefined : "aspect");
          }}
        >
          <ScanSearch size={16} />
          <span>{outputFrame.label}</span>
          <ChevronDown size={14} />
        </button>
        {openMenu === "aspect" ? (
          <div className="toolbar-menu aspect-menu-grid">
            {OUTPUT_FRAME_PRESETS.map((item) => (
              <button
                className={`toolbar-menu-item ${
                  outputFrame.presetId === item.presetId ? "is-active" : ""
                }`}
                key={item.presetId}
                type="button"
                onClick={() => {
                  setOutputFrame(item);
                  setOpenMenu(undefined);
                }}
              >
                <span className="aspect-tile">
                  <Camera size={14} />
                  <span>{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        className={`toolbar-pill ${activeTool === "snapshot" ? "is-active" : ""}`}
        disabled={!selectedCameraId}
        title={selectedCameraId ? "按当前选中机位截图" : "请先选中机位"}
        type="button"
        onClick={handleSnapshot}
      >
        <Focus size={16} />
        <span>截图</span>
      </button>
    </nav>
  );
}
