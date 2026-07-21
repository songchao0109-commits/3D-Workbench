import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  FolderInput,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
  UserRound,
} from "lucide-react";
import type { ChangeEvent, MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { emitAppFeedback } from "../../app/appFeedback";
import { useProjectStore } from "../../store/projectStore";

type AssetContextMenuTarget =
  | { kind: "object" }
  | { kind: "group"; groupId: string }
  | { kind: "camera"; cameraId: string };

type AssetContextMenu = AssetContextMenuTarget & { x: number; y: number };

export function LeftPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objects = useProjectStore((state) => state.objects);
  const groups = useProjectStore((state) => state.groups);
  const cameras = useProjectStore((state) => state.cameras);
  const activeObjectId = useProjectStore((state) => state.activeObjectId);
  const activeGroupId = useProjectStore((state) => state.activeGroupId);
  const selectedObjectIds = useProjectStore((state) => state.selectedObjectIds);
  const selectedCameraIds = useProjectStore((state) => state.selectedCameraIds);
  const selectObjectOrGroup = useProjectStore((state) => state.selectObjectOrGroup);
  const toggleSelectionUnit = useProjectStore((state) => state.toggleSelectionUnit);
  const setSelectedAssets = useProjectStore((state) => state.setSelectedAssets);
  const setActiveGroup = useProjectStore((state) => state.setActiveGroup);
  const selectCameraOrGroup = useProjectStore((state) => state.selectCameraOrGroup);
  const addCamera = useProjectStore((state) => state.addCamera);
  const toggleObjectVisible = useProjectStore((state) => state.toggleObjectVisible);
  const toggleObjectLocked = useProjectStore((state) => state.toggleObjectLocked);
  const updateObject = useProjectStore((state) => state.updateObject);
  const removeObject = useProjectStore((state) => state.removeObject);
  const toggleCameraVisible = useProjectStore((state) => state.toggleCameraVisible);
  const toggleCameraLocked = useProjectStore((state) => state.toggleCameraLocked);
  const removeCamera = useProjectStore((state) => state.removeCamera);
  const toggleGroupVisible = useProjectStore((state) => state.toggleGroupVisible);
  const toggleGroupLocked = useProjectStore((state) => state.toggleGroupLocked);
  const removeGroup = useProjectStore((state) => state.removeGroup);
  const toggleGroupCollapsed = useProjectStore((state) => state.toggleGroupCollapsed);
  const moveObjectToGroup = useProjectStore((state) => state.moveObjectToGroup);
  const moveCameraToGroup = useProjectStore((state) => state.moveCameraToGroup);
  const copySelection = useProjectStore((state) => state.copySelection);
  const pasteClipboard = useProjectStore((state) => state.pasteClipboard);
  const removeSelection = useProjectStore((state) => state.removeSelection);
  const setSelectionVisible = useProjectStore((state) => state.setSelectionVisible);
  const setSelectionLocked = useProjectStore((state) => state.setSelectionLocked);
  const groupSelection = useProjectStore((state) => state.groupSelection);
  const ungroupSelection = useProjectStore((state) => state.ungroupSelection);
  const moveSelectionToGroup = useProjectStore((state) => state.moveSelectionToGroup);
  const importError = useProjectStore((state) => state.importError);
  const [searchText, setSearchText] = useState("");
  const [assetContextMenu, setAssetContextMenu] = useState<AssetContextMenu>();
  const [contextGroupMoveOpen, setContextGroupMoveOpen] = useState(false);
  const selectionAnchorRef = useRef<string | undefined>(undefined);
  const assetContextMenuRef = useRef<HTMLDivElement>(null);

  const normalizedSearch = searchText.trim().toLowerCase();
  const groupedObjectIds = useMemo(
    () => new Set(groups.flatMap((group) => group.objectIds)),
    [groups],
  );
  const groupedCameraIds = useMemo(
    () => new Set(groups.flatMap((group) => group.cameraIds)),
    [groups],
  );
  const matches = (value: string) =>
    normalizedSearch ? value.toLowerCase().includes(normalizedSearch) : true;
  const visibleGroups = groups
    .map((group) => {
      const groupObjects = objects.filter((object) => group.objectIds.includes(object.id));
      const groupCameras = cameras.filter((camera) => group.cameraIds.includes(camera.id));
      const filteredObjects = normalizedSearch
        ? groupObjects.filter(
            (object) =>
              matches(object.name) ||
              matches(object.type === "character" ? "角色" : "模型"),
          )
        : groupObjects;
      const filteredCameras = normalizedSearch
        ? groupCameras.filter(
            (camera) => matches(camera.name) || matches("机位") || matches("相机"),
          )
        : groupCameras;
      const groupMatched = matches(group.name) || matches("组");
      return {
        group,
        objects: groupMatched && normalizedSearch ? groupObjects : filteredObjects,
        cameras: groupMatched && normalizedSearch ? groupCameras : filteredCameras,
        visible: groupMatched || filteredObjects.length > 0 || filteredCameras.length > 0,
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
    (camera) =>
      !groupedCameraIds.has(camera.id) &&
      (matches(camera.name) || matches("机位") || matches("相机")),
  );
  const selectedObjects = objects.filter((object) => selectedObjectIds.includes(object.id));
  const selectedCameras = cameras.filter((camera) => selectedCameraIds.includes(camera.id));
  const hasHiddenSelection =
    selectedObjects.some((object) => !object.visible) ||
    selectedCameras.some((camera) => !camera.visible);
  const hasUnlockedSelection =
    selectedObjects.some((object) => !object.locked) ||
    selectedCameras.some((camera) => !camera.locked);
  const selectedAssetCount = selectedObjects.length + selectedCameras.length;
  const canGroupSelection =
    selectedAssetCount > 1 &&
    selectedObjects.every(
      (object) => !groups.some((group) => group.objectIds.includes(object.id)),
    ) &&
    selectedCameras.every(
      (camera) => !groups.some((group) => group.cameraIds.includes(camera.id)),
    );
  const hasClipboard = useProjectStore((state) => Boolean(state.clipboard?.objects.length));
  const selectedObjectGroupId =
    selectedObjects.length === 1
      ? groups.find((group) => group.objectIds.includes(selectedObjects[0].id))?.id
      : undefined;
  const selectedCameraGroupId =
    selectedCameras.length === 1
      ? groups.find((group) => group.cameraIds.includes(selectedCameras[0].id))?.id
      : undefined;
  const canMoveContextSelection =
    selectedAssetCount > 0 &&
    (selectedAssetCount === 1 ||
      (selectedObjects.every(
        (object) => !groups.some((group) => group.objectIds.includes(object.id)),
      ) &&
        selectedCameras.every(
          (camera) => !groups.some((group) => group.cameraIds.includes(camera.id)),
        )));
  const isBatchContext = Boolean(activeGroupId) || selectedAssetCount > 1;
  const visibleSelectionUnits = useMemo(
    () => [
      ...visibleGroups.map(({ group }) => ({
        key: `group:${group.id}`,
        objectIds: group.objectIds,
        cameraIds: group.cameraIds,
      })),
      ...rootObjects.map((object) => ({
        key: `object:${object.id}`,
        objectIds: [object.id],
        cameraIds: [] as string[],
      })),
      ...visibleCameras.map((camera) => ({
        key: `camera:${camera.id}`,
        objectIds: [] as string[],
        cameraIds: [camera.id],
      })),
    ],
    [rootObjects, visibleCameras, visibleGroups],
  );

  const handleObjectSelect = (objectId: string, event: MouseEvent<HTMLDivElement>) => {
    const group = groups.find((item) => item.objectIds.includes(objectId));
    const unitKey = group ? `group:${group.id}` : `object:${objectId}`;
    if (event.shiftKey && selectionAnchorRef.current) {
      const anchorIndex = visibleSelectionUnits.findIndex(
        (unit) => unit.key === selectionAnchorRef.current,
      );
      const currentIndex = visibleSelectionUnits.findIndex((unit) => unit.key === unitKey);
      if (anchorIndex >= 0 && currentIndex >= 0) {
        const rangeStart = Math.min(anchorIndex, currentIndex);
        const rangeEnd = Math.max(anchorIndex, currentIndex);
        const units = visibleSelectionUnits.slice(rangeStart, rangeEnd + 1);
        setSelectedAssets(
          units.flatMap((unit) => unit.objectIds),
          units.flatMap((unit) => unit.cameraIds),
          { kind: "object", id: objectId },
        );
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      toggleSelectionUnit(objectId);
      selectionAnchorRef.current = unitKey;
      return;
    }
    selectObjectOrGroup(objectId);
    selectionAnchorRef.current = unitKey;
  };

  const handleCameraSelect = (cameraId: string, event: MouseEvent<HTMLDivElement>) => {
    const group = groups.find((item) => item.cameraIds.includes(cameraId));
    const unitKey = group ? `group:${group.id}` : `camera:${cameraId}`;
    if (event.shiftKey && selectionAnchorRef.current) {
      const anchorIndex = visibleSelectionUnits.findIndex(
        (unit) => unit.key === selectionAnchorRef.current,
      );
      const currentIndex = visibleSelectionUnits.findIndex((unit) => unit.key === unitKey);
      if (anchorIndex >= 0 && currentIndex >= 0) {
        const units = visibleSelectionUnits.slice(
          Math.min(anchorIndex, currentIndex),
          Math.max(anchorIndex, currentIndex) + 1,
        );
        setSelectedAssets(
          units.flatMap((unit) => unit.objectIds),
          units.flatMap((unit) => unit.cameraIds),
          { kind: "camera", id: cameraId },
        );
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      toggleSelectionUnit(cameraId, "camera");
      selectionAnchorRef.current = unitKey;
      return;
    }
    selectCameraOrGroup(cameraId);
    selectionAnchorRef.current = unitKey;
  };

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

  useEffect(() => {
    if (!assetContextMenu) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !assetContextMenuRef.current?.contains(event.target)) {
        setAssetContextMenu(undefined);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssetContextMenu(undefined);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [assetContextMenu]);

  const openAssetContextMenu = (
    menu: AssetContextMenuTarget,
    event: MouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    const x = Math.min(event.clientX, window.innerWidth - 188);
    const y = Math.min(event.clientY, window.innerHeight - 220);
    setContextGroupMoveOpen(false);
    setAssetContextMenu({ ...menu, x, y });
  };

  const handleObjectContextMenu = (objectId: string, event: MouseEvent<HTMLDivElement>) => {
    const current = useProjectStore.getState();
    if (!current.selectedObjectIds.includes(objectId)) {
      current.selectObjectOrGroup(objectId);
    }
    const next = useProjectStore.getState();
    if (next.activeGroupId) {
      openAssetContextMenu({ kind: "group", groupId: next.activeGroupId }, event);
      return;
    }
    openAssetContextMenu({ kind: "object" }, event);
  };

  const handleGroupContextMenu = (groupId: string, event: MouseEvent<HTMLDivElement>) => {
    setActiveGroup(groupId);
    openAssetContextMenu({ kind: "group", groupId }, event);
  };

  const handleCameraContextMenu = (cameraId: string, event: MouseEvent<HTMLDivElement>) => {
    const current = useProjectStore.getState();
    if (!current.selectedCameraIds.includes(cameraId)) {
      current.selectCameraOrGroup(cameraId);
    }
    const next = useProjectStore.getState();
    if (next.activeGroupId) {
      openAssetContextMenu({ kind: "group", groupId: next.activeGroupId }, event);
      return;
    }
    openAssetContextMenu({ kind: "camera", cameraId }, event);
  };

  const closeAssetContextMenu = () => {
    setContextGroupMoveOpen(false);
    setAssetContextMenu(undefined);
  };

  const GroupNodeIcon = ({ size = 17 }: { size?: number }) => (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 18 18"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="10"
        rx="1.8"
        stroke="currentColor"
        strokeDasharray="2 2"
        strokeWidth="1.5"
        width="10"
        x="3"
        y="3"
      />
      <rect
        height="7"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        width="7"
        x="8"
        y="8"
      />
    </svg>
  );

  const runCopy = () => {
    const result = copySelection();
    if (!result.ok) {
      emitAppFeedback(result.message);
    }
    closeAssetContextMenu();
  };
  const runPaste = () => {
    const result = pasteClipboard();
    if (!result.ok) {
      emitAppFeedback(result.message);
    }
    closeAssetContextMenu();
  };
  const runMoveToGroup = (groupId: string) => {
    if (selectedAssetCount > 1) {
      moveSelectionToGroup(groupId);
    } else if (selectedObjects[0]) {
      moveObjectToGroup(selectedObjects[0].id, groupId);
    } else if (selectedCameras[0]) {
      moveCameraToGroup(selectedCameras[0].id, groupId);
    }
    closeAssetContextMenu();
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

      <div className="asset-section asset-section-groups">
        <div className="section-label">组</div>
        <div className="asset-list">
          {visibleGroups.map(({ group, objects: groupObjects, cameras: groupCameras }) => (
            <div className="asset-group" key={group.id}>
              <div
                className={`asset-item group-item ${
                  activeGroupId === group.id ? "is-active" : ""
                }`}
                onClick={() => {
                  setActiveGroup(group.id);
                  selectionAnchorRef.current = `group:${group.id}`;
                }}
                onContextMenu={(event) => handleGroupContextMenu(group.id, event)}
              >
                <button
                  aria-label={group.collapsed ? "展开组" : "收起组"}
                  className="asset-row-control group-collapse-button"
                  title={group.collapsed ? "展开组" : "收起组"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleGroupCollapsed(group.id);
                  }}
                >
                  {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <span className="asset-row-icon group-folder-icon">
                  <GroupNodeIcon size={18} />
                </span>
                <span
                  className="asset-item-label group-item-label"
                  title={`${group.name} · ${group.objectIds.length} 个对象 · ${group.cameraIds.length} 个机位`}
                >
                  {group.name}
                  <small>{group.objectIds.length + group.cameraIds.length}</small>
                </span>
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
              {!group.collapsed || normalizedSearch ? (
                <div className="asset-group-children">
                  {groupObjects.map((object) => (
                    <ObjectRow
                      active={selectedObjectIds.includes(object.id)}
                      hideQuickActions={activeGroupId === group.id}
                      indented
                      key={object.id}
                      object={object}
                      onSelect={(event) => handleObjectSelect(object.id, event)}
                      onContextMenu={(event) => handleObjectContextMenu(object.id, event)}
                      onToggleLocked={toggleObjectLocked}
                      onToggleVisible={toggleObjectVisible}
                      onRemove={removeObject}
                      onRename={(objectId, name) => updateObject(objectId, { name })}
                      groups={groups}
                      currentGroupId={group.id}
                      onMoveToGroup={moveObjectToGroup}
                    />
                  ))}
                  {groupCameras.map((camera) => (
                    <CameraRow
                      active={selectedCameraIds.includes(camera.id)}
                      camera={camera}
                      currentGroupId={group.id}
                      groups={groups}
                      hideQuickActions={activeGroupId === group.id}
                      indented
                      key={camera.id}
                      onContextMenu={(event) => handleCameraContextMenu(camera.id, event)}
                      onMoveToGroup={moveCameraToGroup}
                      onRemove={removeCamera}
                      onSelect={(event) => handleCameraSelect(camera.id, event)}
                      onToggleLocked={toggleCameraLocked}
                      onToggleVisible={toggleCameraVisible}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {!visibleGroups.length ? <div className="asset-empty">没有匹配组</div> : null}
        </div>
      </div>

      <div className="asset-section">
        <div className="section-label">对象</div>
        <div className="asset-list">
          {rootObjects.map((object) => (
            <ObjectRow
              active={selectedObjectIds.includes(object.id) || activeObjectId === object.id}
              key={object.id}
              object={object}
              onSelect={(event) => handleObjectSelect(object.id, event)}
              onContextMenu={(event) => handleObjectContextMenu(object.id, event)}
              onToggleLocked={toggleObjectLocked}
              onToggleVisible={toggleObjectVisible}
              onRemove={removeObject}
              onRename={(objectId, name) => updateObject(objectId, { name })}
              groups={groups}
              onMoveToGroup={moveObjectToGroup}
            />
          ))}
          {!rootObjects.length ? <div className="asset-empty">没有匹配对象</div> : null}
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
            <CameraRow
              active={selectedCameraIds.includes(camera.id)}
              camera={camera}
              groups={groups}
              key={camera.id}
              onContextMenu={(event) => handleCameraContextMenu(camera.id, event)}
              onMoveToGroup={moveCameraToGroup}
              onRemove={removeCamera}
              onSelect={(event) => handleCameraSelect(camera.id, event)}
              onToggleLocked={toggleCameraLocked}
              onToggleVisible={toggleCameraVisible}
            />
          ))}
          {!visibleCameras.length ? <div className="asset-empty">没有匹配机位</div> : null}
        </div>
      </div>
      {assetContextMenu ? (
        <div
          className="asset-context-menu"
          ref={assetContextMenuRef}
          role="menu"
          style={{ left: assetContextMenu.x, top: assetContextMenu.y }}
        >
          {assetContextMenu.kind === "camera" ? (
            <>
              {(() => {
                const camera = cameras.find((item) => item.id === assetContextMenu.cameraId);
                if (!camera) {
                  return null;
                }
                return (
                  <>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        toggleCameraVisible(camera.id);
                        closeAssetContextMenu();
                      }}
                    >
                      {camera.visible ? "隐藏" : "显示"}
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        toggleCameraLocked(camera.id);
                        closeAssetContextMenu();
                      }}
                    >
                      {camera.locked ? "解锁" : "锁定"}
                    </button>
                    {canGroupSelection ? (
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          groupSelection();
                          closeAssetContextMenu();
                        }}
                      >
                        打组
                      </button>
                    ) : null}
                    {canMoveContextSelection &&
                    groups.some((group) => group.id !== selectedCameraGroupId) ? (
                      <div className="asset-context-group-actions">
                        <button
                          className="asset-context-menu-submenu-trigger"
                          aria-expanded={contextGroupMoveOpen}
                          role="menuitem"
                          type="button"
                          onClick={() => setContextGroupMoveOpen((current) => !current)}
                        >
                          <span>移至分组</span>
                          <ChevronRight size={15} />
                        </button>
                        {contextGroupMoveOpen ? (
                          <div className="asset-context-group-picker">
                            {groups
                              .filter((group) => group.id !== selectedCameraGroupId)
                              .map((group) => (
                                <button
                                  key={group.id}
                                  role="menuitem"
                                  type="button"
                                  onClick={() => runMoveToGroup(group.id)}
                                >
                                  {group.name}
                                </button>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="asset-context-menu-separator" />
                    <button
                      className="danger-action"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        removeCamera(camera.id);
                        closeAssetContextMenu();
                      }}
                    >
                      删除
                    </button>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setSelectionVisible(hasHiddenSelection);
                  closeAssetContextMenu();
                }}
              >
                {hasHiddenSelection
                  ? isBatchContext
                    ? "全部显示"
                    : "显示"
                  : isBatchContext
                    ? "全部隐藏"
                    : "隐藏"}
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setSelectionLocked(hasUnlockedSelection);
                  closeAssetContextMenu();
                }}
              >
                {hasUnlockedSelection
                  ? isBatchContext
                    ? "全部锁定"
                    : "锁定"
                  : isBatchContext
                    ? "全部解锁"
                    : "解锁"}
              </button>
              <div className="asset-context-menu-separator" />
              <button role="menuitem" type="button" onClick={runCopy}>
                复制
              </button>
              <button disabled={!hasClipboard} role="menuitem" type="button" onClick={runPaste}>
                粘贴
              </button>
              {assetContextMenu.kind === "object" && canGroupSelection ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    groupSelection();
                    closeAssetContextMenu();
                  }}
                >
                  打组
                </button>
              ) : null}
              {assetContextMenu.kind === "object" &&
              canMoveContextSelection &&
              groups.some((group) => group.id !== selectedObjectGroupId) ? (
                <div className="asset-context-group-actions">
                  <button
                    className="asset-context-menu-submenu-trigger"
                    aria-expanded={contextGroupMoveOpen}
                    role="menuitem"
                    type="button"
                    onClick={() => setContextGroupMoveOpen((current) => !current)}
                  >
                    <span>移至分组</span>
                    <ChevronRight size={15} />
                  </button>
                  {contextGroupMoveOpen ? (
                    <div className="asset-context-group-picker">
                      {groups
                        .filter((group) => group.id !== selectedObjectGroupId)
                        .map((group) => (
                          <button
                            key={group.id}
                            role="menuitem"
                            type="button"
                            onClick={() => runMoveToGroup(group.id)}
                          >
                            {group.name}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {assetContextMenu.kind === "object" && selectedObjectGroupId ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    const object = selectedObjects[0];
                    if (object) {
                      moveObjectToGroup(object.id);
                    }
                    closeAssetContextMenu();
                  }}
                >
                  移出当前分组
                </button>
              ) : null}
              {assetContextMenu.kind === "group" ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    ungroupSelection();
                    closeAssetContextMenu();
                  }}
                >
                  解组
                </button>
              ) : null}
              <div className="asset-context-menu-separator" />
              <button
                className="danger-action"
                role="menuitem"
                type="button"
                onClick={() => {
                  removeSelection();
                  closeAssetContextMenu();
                }}
              >
                {assetContextMenu.kind === "group" ? "删除整组" : "删除"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </aside>
  );
}

function ObjectRow({
  active,
  hideQuickActions = false,
  indented = false,
  object,
  onSelect,
  onContextMenu,
  onToggleLocked,
  onToggleVisible,
  onRemove,
  onRename,
  groups,
  currentGroupId,
  onMoveToGroup,
}: {
  active: boolean;
  hideQuickActions?: boolean;
  indented?: boolean;
  object: {
    id: string;
    name: string;
    type: "character" | "model" | "helper";
    visible: boolean;
    locked: boolean;
  };
  onSelect: (event: MouseEvent<HTMLDivElement>) => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onToggleLocked: (objectId: string) => void;
  onToggleVisible: (objectId: string) => void;
  onRemove: (objectId: string) => void;
  onRename: (objectId: string, name: string) => void;
  groups: Array<{ id: string; name: string; objectIds: string[] }>;
  currentGroupId?: string;
  onMoveToGroup: (objectId: string, targetGroupId?: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(object.name);
  const nameEditCommittedRef = useRef(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groupMenuPosition, setGroupMenuPosition] = useState({ x: 0, y: 0 });
  const groupMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupMenuOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !groupMenuRef.current?.contains(event.target)) {
        setGroupMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [groupMenuOpen]);

  const commitName = () => {
    if (nameEditCommittedRef.current) {
      return;
    }
    nameEditCommittedRef.current = true;
    const nextName = nameDraft.trim();
    if (nextName && nextName !== object.name) {
      onRename(object.id, nextName);
    }
    setNameDraft(object.name);
    setEditingName(false);
  };

  return (
    <div
      className={`asset-item ${active ? "is-active" : ""} ${
        indented ? "is-child" : ""
      } ${hideQuickActions ? "has-no-actions" : ""}`}
      onClick={(event) => {
        if (event.detail > 1) {
          return;
        }
        setGroupMenuOpen(false);
        onSelect(event);
      }}
      onContextMenu={onContextMenu}
    >
      <span className="asset-row-control object-tree-guide" aria-hidden="true" />
      <span className="asset-row-icon">
        {object.type === "character" ? <UserRound size={16} /> : <Box size={16} />}
      </span>
      {editingName ? (
        <input
          aria-label="对象名称"
          className="asset-item-label-input"
          value={nameDraft}
          autoFocus
          onBlur={commitName}
          onChange={(event) => setNameDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              nameEditCommittedRef.current = true;
              setNameDraft(object.name);
              setEditingName(false);
            }
          }}
        />
      ) : (
        <span
          className="asset-item-label"
          title={object.name}
          onDoubleClick={(event) => {
            event.stopPropagation();
            nameEditCommittedRef.current = false;
            setNameDraft(object.name);
            setEditingName(true);
          }}
        >
          {object.name}
        </span>
      )}
      {!hideQuickActions ? (
        <div className={`row-actions ${groupMenuOpen ? "is-menu-open" : ""}`}>
          <div className="row-action-menu" ref={groupMenuRef}>
            <button
              aria-expanded={groupMenuOpen}
              title="移至分组"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setGroupMenuPosition({
                  x: Math.min(rect.right + 8, window.innerWidth - 172),
                  y: Math.min(rect.top - 4, window.innerHeight - 220),
                });
                setGroupMenuOpen((current) => !current);
              }}
            >
              <FolderInput size={13} />
            </button>
            {groupMenuOpen ? (
              <div
                className="group-move-menu"
                role="menu"
                style={{
                  left: groupMenuPosition.x,
                  top: Math.max(8, groupMenuPosition.y),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="group-move-menu-title">移至分组</div>
                {groups.filter((group) => group.id !== currentGroupId).map((group) => (
                  <button
                    key={group.id}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      onMoveToGroup(object.id, group.id);
                      setGroupMenuOpen(false);
                    }}
                  >
                    {group.name}
                  </button>
                ))}
                {!groups.some((group) => group.id !== currentGroupId) ? (
                  <div className="group-move-menu-empty">暂无可选分组</div>
                ) : null}
                {currentGroupId ? (
                  <>
                    <div className="group-move-menu-separator" />
                    <button
                      className="group-move-menu-remove"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        onMoveToGroup(object.id);
                        setGroupMenuOpen(false);
                      }}
                    >
                      移出当前分组
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
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
      ) : null}
    </div>
  );
}

function CameraRow({
  active,
  camera,
  currentGroupId,
  groups,
  hideQuickActions = false,
  indented = false,
  onContextMenu,
  onMoveToGroup,
  onRemove,
  onSelect,
  onToggleLocked,
  onToggleVisible,
}: {
  active: boolean;
  camera: {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
  };
  currentGroupId?: string;
  groups: Array<{ id: string; name: string }>;
  hideQuickActions?: boolean;
  indented?: boolean;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onMoveToGroup: (cameraId: string, targetGroupId?: string) => void;
  onRemove: (cameraId: string) => void;
  onSelect: (event: MouseEvent<HTMLDivElement>) => void;
  onToggleLocked: (cameraId: string) => void;
  onToggleVisible: (cameraId: string) => void;
}) {
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groupMenuPosition, setGroupMenuPosition] = useState({ x: 0, y: 0 });
  const groupMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupMenuOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !groupMenuRef.current?.contains(event.target)) {
        setGroupMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [groupMenuOpen]);

  return (
    <div
      className={`asset-item ${active ? "is-active" : ""} ${
        indented ? "is-child" : ""
      } ${hideQuickActions ? "has-no-actions" : ""}`}
      onClick={(event) => {
        setGroupMenuOpen(false);
        onSelect(event);
      }}
      onContextMenu={onContextMenu}
    >
      <span className="asset-row-control object-tree-guide" aria-hidden="true" />
      <span className="asset-row-icon">
        <Camera size={16} />
      </span>
      <span className="asset-item-label" title={camera.name}>{camera.name}</span>
      {!hideQuickActions ? (
        <div className={`row-actions ${groupMenuOpen ? "is-menu-open" : ""}`}>
          <div className="row-action-menu" ref={groupMenuRef}>
            <button
              aria-expanded={groupMenuOpen}
              title="移至分组"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setGroupMenuPosition({
                  x: Math.min(rect.right + 8, window.innerWidth - 172),
                  y: Math.min(rect.top - 4, window.innerHeight - 220),
                });
                setGroupMenuOpen((current) => !current);
              }}
            >
              <FolderInput size={13} />
            </button>
            {groupMenuOpen ? (
              <div
                className="group-move-menu"
                role="menu"
                style={{
                  left: groupMenuPosition.x,
                  top: Math.max(8, groupMenuPosition.y),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="group-move-menu-title">移至分组</div>
                {groups.filter((group) => group.id !== currentGroupId).map((group) => (
                  <button
                    key={group.id}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      onMoveToGroup(camera.id, group.id);
                      setGroupMenuOpen(false);
                    }}
                  >
                    {group.name}
                  </button>
                ))}
                {!groups.some((group) => group.id !== currentGroupId) ? (
                  <div className="group-move-menu-empty">暂无可选分组</div>
                ) : null}
                {currentGroupId ? (
                  <>
                    <div className="group-move-menu-separator" />
                    <button
                      className="group-move-menu-remove"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        onMoveToGroup(camera.id);
                        setGroupMenuOpen(false);
                      }}
                    >
                      移出当前分组
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            title={camera.visible ? "隐藏" : "显示"}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleVisible(camera.id);
            }}
          >
            {camera.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            title={camera.locked ? "解锁" : "锁定"}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleLocked(camera.id);
            }}
          >
            {camera.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button
            title="删除"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(camera.id);
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
