import {
  Box,
  Camera,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
  UserRound,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef } from "react";
import { useProjectStore } from "../../store/projectStore";

export function LeftPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objects = useProjectStore((state) => state.objects);
  const cameras = useProjectStore((state) => state.cameras);
  const activeObjectId = useProjectStore((state) => state.activeObjectId);
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const setActiveObject = useProjectStore((state) => state.setActiveObject);
  const setActiveCamera = useProjectStore((state) => state.setActiveCamera);
  const addCamera = useProjectStore((state) => state.addCamera);
  const toggleObjectVisible = useProjectStore((state) => state.toggleObjectVisible);
  const toggleObjectLocked = useProjectStore((state) => state.toggleObjectLocked);
  const removeObject = useProjectStore((state) => state.removeObject);
  const toggleCameraVisible = useProjectStore((state) => state.toggleCameraVisible);
  const toggleCameraLocked = useProjectStore((state) => state.toggleCameraLocked);
  const removeCamera = useProjectStore((state) => state.removeCamera);
  const importError = useProjectStore((state) => state.importError);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
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

  return (
    <aside className="left-panel">
      <div className="panel-title-row">
        <h2>资产列表</h2>
      </div>
      <button
        className="import-button"
        type="button"
        onClick={() => fileInputRef.current?.click()}
      >
        导入 GLB
      </button>
      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept=".glb,model/gltf-binary"
        data-glb-input
        onChange={handleFileChange}
      />
      {importError ? <div className="inline-error">{importError}</div> : null}
      <label className="search-box">
        <Search size={16} />
        <input placeholder="搜索" />
      </label>

      <div className="asset-section">
        <div className="section-label">对象</div>
        <div className="asset-list">
          {objects.map((object) => (
            <div
              className={`asset-item ${
                activeObjectId === object.id ? "is-active" : ""
              }`}
              key={object.id}
              onClick={() => setActiveObject(object.id)}
            >
              {object.type === "character" ? (
                <UserRound size={16} />
              ) : (
                <Box size={16} />
              )}
              <span className="asset-item-label">{object.name}</span>
              <div className="row-actions">
                <button
                  title={object.visible ? "隐藏" : "显示"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleObjectVisible(object.id);
                  }}
                >
                  {object.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  title={object.locked ? "解锁" : "锁定"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleObjectLocked(object.id);
                  }}
                >
                  {object.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button
                  title="删除"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeObject(object.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="asset-section">
        <div className="section-header">
          <div className="section-label">机位</div>
          <div className="section-actions">
            <button
              title="新增机位"
              type="button"
              onClick={() => addCamera()}
            >
              <Plus size={13} />
            </button>
            <button
              title="从当前视口创建机位"
              type="button"
              onClick={() =>
                window.dispatchEvent(new Event("camera-create-from-view-request"))
              }
            >
              <Crosshair size={13} />
            </button>
          </div>
        </div>
        <div className="asset-list">
          {cameras.map((camera) => (
            <div
              className={`asset-item ${
                selectedCameraId === camera.id && !activeObjectId
                  ? "is-active"
                  : ""
              }`}
              key={camera.id}
              onClick={() => setActiveCamera(camera.id)}
            >
              <Camera size={16} />
              <span className="asset-item-label">{camera.name}</span>
              <div className="row-actions">
                <button
                  title={camera.visible ? "隐藏" : "显示"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCameraVisible(camera.id);
                  }}
                >
                  {camera.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  title={camera.locked ? "解锁" : "锁定"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCameraLocked(camera.id);
                  }}
                >
                  {camera.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button
                  title="删除"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeCamera(camera.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
