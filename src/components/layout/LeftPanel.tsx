import {
  Box,
  Camera,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
  UserRound,
} from "lucide-react";
import type { ChangeEvent, MouseEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { useProjectStore } from "../../store/projectStore";

export function LeftPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objects = useProjectStore((state) => state.objects);
  const groups = useProjectStore((state) => state.groups);
  const cameras = useProjectStore((state) => state.cameras);
  const activeObjectId = useProjectStore((state) => state.activeObjectId);
  const activeGroupId = useProjectStore((state) => state.activeGroupId);
  const selectedObjectIds = useProjectStore((state) => state.selectedObjectIds);
  const selectedCameraId = useProjectStore((state) => state.selectedCameraId);
  const setActiveObject = useProjectStore((state) => state.setActiveObject);
  const toggleObjectSelection = useProjectStore((state) => state.toggleObjectSelection);
  const setActiveGroup = useProjectStore((state) => state.setActiveGroup);
  const setActiveCamera = useProjectStore((state) => state.setActiveCamera);
  const addCamera = useProjectStore((state) => state.addCamera);
  const toggleObjectVisible = useProjectStore((state) => state.toggleObjectVisible);
  const toggleObjectLocked = useProjectStore((state) => state.toggleObjectLocked);
  const removeObject = useProjectStore((state) => state.removeObject);
  const toggleCameraVisible = useProjectStore((state) => state.toggleCameraVisible);
  const toggleCameraLocked = useProjectStore((state) => state.toggleCameraLocked);
  const removeCamera = useProjectStore((state) => state.removeCamera);
  const toggleGroupVisible = useProjectStore((state) => state.toggleGroupVisible);
  const toggleGroupLocked = useProjectStore((state) => state.toggleGroupLocked);
  const removeGroup = useProjectStore((state) => state.removeGroup);
  const importError = useProjectStore((state) => state.importError);
  const [searchText, setSearchText] = useState("");

  const normalizedSearch = searchText.trim().toLowerCase();
  const groupedObjectIds = useMemo(
    () => new Set(groups.flatMap((group) => group.objectIds)),
    [groups],
  );
  const matches = (value: string) =>
    normalizedSearch ? value.toLowerCase().includes(normalizedSearch) : true;
  const visibleGroups = groups
    .map((group) => {
      const groupObjects = objects.filter((object) => group.objectIds.includes(object.id));
      const filteredObjects = normalizedSearch
        ? groupObjects.filter(
            (object) =>
              matches(object.name) ||
              matches(object.type === "character" ? "角色" : "模型"),
          )
        : groupObjects;
      const groupMatched = matches(group.name) || matches("组");
      return {
        group,
        objects: groupMatched && normalizedSearch ? groupObjects : filteredObjects,
        visible: groupMatched || filteredObjects.length > 0,
      };
    })
    .filter((item) => item.visible);
  const rootObjects = objects.filter((object) => {
    if (groupedObjectIds.has(object.id)) {
      return false;
    }
    return (
      matches(object.name) ||
      matches(object.type === "character" ? "角色" : "模型")
    );
  });
  const visibleCameras = cameras.filter(
    (camera) => matches(camera.name) || matches("机位") || matches("相机"),
  );

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
        <input
          placeholder="搜索"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </label>

      <div className="asset-section">
        <div className="section-label">对象</div>
        <div className="asset-list">
          {visibleGroups.map(({ group, objects: groupObjects }) => (
            <div className="asset-group" key={group.id}>
              <div
                className={`asset-item group-item ${
                  activeGroupId === group.id ? "is-active" : ""
                }`}
                onClick={() => setActiveGroup(group.id)}
              >
                {group.collapsed ? <Folder size={16} /> : <FolderOpen size={16} />}
                <span className="asset-item-label">{group.name}</span>
                <div className="row-actions">
                  <button
                    title={group.visible ? "隐藏组" : "显示组"}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleGroupVisible(group.id);
                    }}
                  >
                    {group.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    title={group.locked ? "解锁组" : "锁定组"}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleGroupLocked(group.id);
                    }}
                  >
                    {group.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                  <button
                    title="删除组"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeGroup(group.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {groupObjects.map((object) => (
                <ObjectRow
                  active={selectedObjectIds.includes(object.id)}
                  indented
                  key={object.id}
                  object={object}
                  onSelect={(event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) {
                      toggleObjectSelection(object.id);
                    } else {
                      setActiveObject(object.id);
                    }
                  }}
                  onToggleLocked={toggleObjectLocked}
                  onToggleVisible={toggleObjectVisible}
                  onRemove={removeObject}
                />
              ))}
            </div>
          ))}
          {rootObjects.map((object) => (
            <ObjectRow
              active={selectedObjectIds.includes(object.id) || activeObjectId === object.id}
              key={object.id}
              object={object}
              onSelect={(event) => {
                if (event.shiftKey || event.metaKey || event.ctrlKey) {
                  toggleObjectSelection(object.id);
                } else {
                  setActiveObject(object.id);
                }
              }}
              onToggleLocked={toggleObjectLocked}
              onToggleVisible={toggleObjectVisible}
              onRemove={removeObject}
            />
          ))}
          {!visibleGroups.length && !rootObjects.length ? (
            <div className="asset-empty">没有匹配对象</div>
          ) : null}
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
          {visibleCameras.map((camera) => (
            <div
              className={`asset-item ${
                selectedCameraId === camera.id && !activeObjectId && !selectedObjectIds.length
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
          {!visibleCameras.length ? <div className="asset-empty">没有匹配机位</div> : null}
        </div>
      </div>
    </aside>
  );
}

function ObjectRow({
  active,
  indented = false,
  object,
  onSelect,
  onToggleLocked,
  onToggleVisible,
  onRemove,
}: {
  active: boolean;
  indented?: boolean;
  object: {
    id: string;
    name: string;
    type: "character" | "model" | "helper";
    visible: boolean;
    locked: boolean;
  };
  onSelect: (event: MouseEvent<HTMLDivElement>) => void;
  onToggleLocked: (objectId: string) => void;
  onToggleVisible: (objectId: string) => void;
  onRemove: (objectId: string) => void;
}) {
  return (
    <div
      className={`asset-item ${active ? "is-active" : ""} ${indented ? "is-child" : ""}`}
      onClick={onSelect}
    >
      {object.type === "character" ? <UserRound size={16} /> : <Box size={16} />}
      <span className="asset-item-label">{object.name}</span>
      <div className="row-actions">
        <button
          title={object.visible ? "隐藏" : "显示"}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisible(object.id);
          }}
        >
          {object.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          title={object.locked ? "解锁" : "锁定"}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleLocked(object.id);
          }}
        >
          {object.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <button
          title="删除"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(object.id);
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
