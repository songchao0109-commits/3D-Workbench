import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Copy,
  Eye,
  EyeOff,
  Group,
  Lock,
  MoveDown,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import type { SceneGroup } from "../../domain/projectTypes";
import { useProjectStore } from "../../store/projectStore";

export function SelectionInspector() {
  const objects = useProjectStore((state) => state.objects);
  const selectedObjectIds = useProjectStore((state) => state.selectedObjectIds);
  const copySelection = useProjectStore((state) => state.copySelection);
  const pasteClipboard = useProjectStore((state) => state.pasteClipboard);
  const removeSelection = useProjectStore((state) => state.removeSelection);
  const setSelectionVisible = useProjectStore((state) => state.setSelectionVisible);
  const setSelectionLocked = useProjectStore((state) => state.setSelectionLocked);
  const groupSelection = useProjectStore((state) => state.groupSelection);
  const snapSelectionToGround = useProjectStore((state) => state.snapSelectionToGround);
  const alignSelection = useProjectStore((state) => state.alignSelection);
  const distributeSelection = useProjectStore((state) => state.distributeSelection);

  const selectedObjects = objects.filter((object) =>
    selectedObjectIds.includes(object.id),
  );
  const hasHidden = selectedObjects.some((object) => !object.visible);
  const hasUnlocked = selectedObjects.some((object) => !object.locked);

  return (
    <section className="panel-block object-panel">
      <div className="panel-heading object-heading">
        <div>
          <h2>多选属性</h2>
          <p>已选择 {selectedObjects.length} 个对象</p>
        </div>
      </div>

      <div className="selection-action-grid">
        <button type="button" onClick={() => setSelectionVisible(hasHidden)}>
          {hasHidden ? <Eye size={15} /> : <EyeOff size={15} />}
          <span>{hasHidden ? "全部显示" : "全部隐藏"}</span>
        </button>
        <button type="button" onClick={() => setSelectionLocked(hasUnlocked)}>
          {hasUnlocked ? <Lock size={15} /> : <Unlock size={15} />}
          <span>{hasUnlocked ? "全部锁定" : "全部解锁"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            copySelection();
            pasteClipboard();
          }}
        >
          <Copy size={15} />
          <span>复制一份</span>
        </button>
        <button type="button" onClick={groupSelection}>
          <Group size={15} />
          <span>成组</span>
        </button>
        <button type="button" onClick={snapSelectionToGround}>
          <MoveDown size={15} />
          <span>落地</span>
        </button>
        <button type="button" onClick={() => alignSelection("x")}>
          <AlignVerticalSpaceAround size={15} />
          <span>X 对齐</span>
        </button>
        <button type="button" onClick={() => alignSelection("z")}>
          <AlignHorizontalSpaceAround size={15} />
          <span>Z 对齐</span>
        </button>
        <button type="button" onClick={() => distributeSelection("x")}>
          <AlignHorizontalSpaceAround size={15} />
          <span>X 等距</span>
        </button>
        <button className="danger-action" type="button" onClick={removeSelection}>
          <Trash2 size={15} />
          <span>删除所选</span>
        </button>
      </div>
    </section>
  );
}

export function GroupInspector({ group }: { group: SceneGroup }) {
  const updateGroup = useProjectStore((state) => state.updateGroup);
  const toggleGroupVisible = useProjectStore((state) => state.toggleGroupVisible);
  const toggleGroupLocked = useProjectStore((state) => state.toggleGroupLocked);
  const removeGroup = useProjectStore((state) => state.removeGroup);
  const ungroupSelection = useProjectStore((state) => state.ungroupSelection);

  return (
    <section className="panel-block object-panel">
      <div className="panel-heading object-heading">
        <div>
          <h2>组属性</h2>
          <p>{group.objectIds.length} 个对象</p>
        </div>
        <div className="object-actions">
          <button
            title={group.visible ? "隐藏组" : "显示组"}
            type="button"
            onClick={() => toggleGroupVisible(group.id)}
          >
            {group.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            title={group.locked ? "解锁组" : "锁定组"}
            type="button"
            onClick={() => toggleGroupLocked(group.id)}
          >
            {group.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button title="删除组" type="button" onClick={() => removeGroup(group.id)}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="field-group">
        <label>名称</label>
        <input
          className="text-field"
          value={group.name}
          onChange={(event) => updateGroup(group.id, { name: event.target.value })}
        />
      </div>

      <div className="selection-action-grid">
        <button type="button" onClick={ungroupSelection}>
          <Ungroup size={15} />
          <span>解组</span>
        </button>
      </div>
    </section>
  );
}
