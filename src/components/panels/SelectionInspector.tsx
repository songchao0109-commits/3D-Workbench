import {
  AlignCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  Group,
  Lock,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import { useProjectStore } from "../../store/projectStore";

export function SelectionInspector() {
  const objects = useProjectStore((state) => state.objects);
  const cameras = useProjectStore((state) => state.cameras);
  const groups = useProjectStore((state) => state.groups);
  const selectedObjectIds = useProjectStore((state) => state.selectedObjectIds);
  const selectedCameraIds = useProjectStore((state) => state.selectedCameraIds);
  const removeSelection = useProjectStore((state) => state.removeSelection);
  const setSelectionVisible = useProjectStore((state) => state.setSelectionVisible);
  const setSelectionLocked = useProjectStore((state) => state.setSelectionLocked);
  const groupSelection = useProjectStore((state) => state.groupSelection);
  const ungroupSelection = useProjectStore((state) => state.ungroupSelection);
  const updateGroup = useProjectStore((state) => state.updateGroup);
  const alignSelection = useProjectStore((state) => state.alignSelection);
  const activeGroupId = useProjectStore((state) => state.activeGroupId);

  const selectedObjects = objects.filter((object) =>
    selectedObjectIds.includes(object.id),
  );
  const selectedCameras = cameras.filter((camera) =>
    selectedCameraIds.includes(camera.id),
  );
  const selectedCount = selectedObjects.length + selectedCameras.length;
  const hasHidden =
    selectedObjects.some((object) => !object.visible) ||
    selectedCameras.some((camera) => !camera.visible);
  const hasUnlocked =
    selectedObjects.some((object) => !object.locked) ||
    selectedCameras.some((camera) => !camera.locked);
  const unlockedCount = selectedObjects.filter((object) => !object.locked).length;
  const canGroup =
    selectedCount > 1 &&
    selectedObjects.every(
      (object) => !groups.some((group) => group.objectIds.includes(object.id)),
    ) &&
    selectedCameras.every(
      (camera) => !groups.some((group) => group.cameraIds.includes(camera.id)),
    );
  const canAlign = unlockedCount > 1;
  const activeGroup = activeGroupId
    ? groups.find((group) => group.id === activeGroupId)
    : undefined;

  return (
    <section className="panel-block object-panel">
      <div className="panel-heading object-heading">
        <div>
          <h2>{activeGroup ? "组属性" : "多选属性"}</h2>
          {!activeGroup ? (
            <p>
              已选择 {selectedCount} 项
              {selectedObjects.length && selectedCameras.length
                ? ` · ${selectedObjects.length} 个对象 / ${selectedCameras.length} 个机位`
                : selectedCameras.length
                  ? ` · ${selectedCameras.length} 个机位`
                  : ` · ${selectedObjects.length} 个对象`}
            </p>
          ) : null}
        </div>
      </div>

      {activeGroup ? (
        <div className="group-selection-sections">
          <section className="group-selection-section">
            <h3>组信息</h3>
            <div className="field-group">
              <label>组名称</label>
              <input
                className="text-field"
                maxLength={10}
                value={activeGroup.name}
                onChange={(event) => updateGroup(activeGroup.id, { name: event.target.value })}
              />
            </div>
            <div className="group-selection-count">
              组内对象 {selectedObjects.length} · 机位 {selectedCameras.length}
            </div>
          </section>

          <section className="group-selection-section">
            <h3>组操作</h3>
            <div className="selection-action-grid">
              <button type="button" onClick={() => setSelectionVisible(hasHidden)}>
                {hasHidden ? <Eye size={15} /> : <EyeOff size={15} />}
                <span>{hasHidden ? "全部显示" : "全部隐藏"}</span>
              </button>
              <button type="button" onClick={() => setSelectionLocked(hasUnlocked)}>
                {hasUnlocked ? <Lock size={15} /> : <Unlock size={15} />}
                <span>{hasUnlocked ? "全部锁定" : "全部解锁"}</span>
              </button>
            </div>
          </section>

          <section className="group-selection-section">
            <h3>组内对齐</h3>
            <div className="selection-action-grid">
              <button disabled={!canAlign} type="button" onClick={() => alignSelection("center")}>
                <AlignCenter size={15} />
                <span>中心点</span>
              </button>
              <button disabled={!canAlign} type="button" onClick={() => alignSelection("top")}>
                <ArrowUpToLine size={15} />
                <span>顶对齐</span>
              </button>
              <button disabled={!canAlign} type="button" onClick={() => alignSelection("bottom")}>
                <ArrowDownToLine size={15} />
                <span>底对齐</span>
              </button>
            </div>
          </section>

          <div className="group-selection-footer">
            <button type="button" onClick={ungroupSelection}>
              <Ungroup size={15} />
              <span>解组</span>
            </button>
            <button className="danger-action" type="button" onClick={removeSelection}>
              <Trash2 size={15} />
              <span>删除整组</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="selection-action-grid">
          <button type="button" onClick={() => setSelectionVisible(hasHidden)}>
            {hasHidden ? <Eye size={15} /> : <EyeOff size={15} />}
            <span>{hasHidden ? "全部显示" : "全部隐藏"}</span>
          </button>
          <button type="button" onClick={() => setSelectionLocked(hasUnlocked)}>
            {hasUnlocked ? <Lock size={15} /> : <Unlock size={15} />}
            <span>{hasUnlocked ? "全部锁定" : "全部解锁"}</span>
          </button>
          <button disabled={!canGroup} type="button" onClick={groupSelection}>
            <Group size={15} />
            <span>打组</span>
          </button>
          <button disabled={!canAlign} type="button" onClick={() => alignSelection("center")}>
            <AlignCenter size={15} />
            <span>中心点</span>
          </button>
          <button disabled={!canAlign} type="button" onClick={() => alignSelection("top")}>
            <ArrowUpToLine size={15} />
            <span>顶对齐</span>
          </button>
          <button disabled={!canAlign} type="button" onClick={() => alignSelection("bottom")}>
            <ArrowDownToLine size={15} />
            <span>底对齐</span>
          </button>
          <button className="danger-action" type="button" onClick={removeSelection}>
            <Trash2 size={15} />
            <span>删除所选</span>
          </button>
        </div>
      )}
    </section>
  );
}
