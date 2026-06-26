import { Eye, EyeOff, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SceneObject, Vec3 } from "../../domain/projectTypes";
import {
  formatBoneDisplayName,
  getIkControlBones,
  isIkControlBoneName,
} from "../../domain/rigUtils";
import { useProjectStore } from "../../store/projectStore";
import { TransformFields } from "./TransformFields";

function buildBoneTreeRows(bones: NonNullable<SceneObject["rig"]>["bones"]) {
  const childrenMap = new Map<string | undefined, typeof bones>();
  bones.forEach((bone) => {
    const key = bone.parentId;
    const list = childrenMap.get(key) ?? [];
    list.push(bone);
    childrenMap.set(key, list);
  });

  const rows: Array<(typeof bones)[number] & { depth: number }> = [];
  const walk = (parentId: string | undefined, depth: number) => {
    (childrenMap.get(parentId) ?? []).forEach((bone) => {
      rows.push({ ...bone, depth });
      walk(bone.id, depth + 1);
    });
  };
  walk(undefined, 0);
  return rows;
}

function toDegreesVector(value: Vec3): Vec3 {
  return value.map((item) => (item * 180) / Math.PI) as Vec3;
}

function toRadiansVector(value: Vec3): Vec3 {
  return value.map((item) => (item * Math.PI) / 180) as Vec3;
}

export function RigInspector({
  object,
  embedded = false,
}: {
  object: SceneObject;
  embedded?: boolean;
}) {
  const rig = object.rig;
  const setObjectRigMode = useProjectStore((state) => state.setObjectRigMode);
  const toggleObjectSkeletonVisible = useProjectStore(
    (state) => state.toggleObjectSkeletonVisible,
  );
  const setActiveBone = useProjectStore((state) => state.setActiveBone);
  const updateBonePosition = useProjectStore((state) => state.updateBonePosition);
  const updateIkChain = useProjectStore((state) => state.updateIkChain);
  const updateBoneRotation = useProjectStore((state) => state.updateBoneRotation);
  const [boneSearch, setBoneSearch] = useState("");
  const [boneSuggestOpen, setBoneSuggestOpen] = useState(false);

  const selectedBone = rig?.bones.find((bone) => bone.id === rig.activeBoneId);
  const activeIkChain = rig?.ikChains.find((chain) => chain.id === rig.activeIkChainId);

  const boneRows = useMemo(() => (rig ? buildBoneTreeRows(rig.bones) : []), [rig]);
  const rootBone = boneRows[0];
  const ikControlRows = useMemo(() => getIkControlBones(boneRows), [boneRows]);
  const selectedIkControlBone =
    selectedBone && isIkControlBoneName(selectedBone.name) ? selectedBone : undefined;
  const visibleBoneRows = useMemo(() => {
    const query = boneSearch.trim().toLowerCase();
    const selectedLabel = selectedBone
      ? formatBoneDisplayName(selectedBone.name).toLowerCase()
      : undefined;
    if (!query || query === selectedLabel) {
      return boneRows;
    }
    return boneRows.filter((bone) =>
      `${formatBoneDisplayName(bone.name)} ${bone.name}`.toLowerCase().includes(query),
    );
  }, [boneRows, boneSearch, selectedBone]);
  useEffect(() => {
    setBoneSearch(selectedBone ? formatBoneDisplayName(selectedBone.name) : "");
  }, [selectedBone?.id, selectedBone?.name]);

  if (!rig?.hasSkeleton) {
    return null;
  }

  const content = (
    <>
      {!embedded ? (
        <div className="panel-heading object-heading">
          <div>
            <h2>骨骼控制</h2>
            <p>{rig.mode === "fk" ? "FK 关节旋转" : "IK 骨链控制"}</p>
          </div>
          <div className="object-actions">
            <button
              title={rig.showSkeleton ? "隐藏骨架" : "显示骨架"}
              type="button"
              onClick={() => toggleObjectSkeletonVisible(object.id)}
            >
              {rig.showSkeleton ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>
        </div>
      ) : null}

      <div className="field-group">
        <label>骨架显示</label>
        <button
          className={`switch-row ${rig.showSkeleton ? "is-active" : ""}`}
          type="button"
          onClick={() => toggleObjectSkeletonVisible(object.id)}
        >
          <span className="switch-row-label">
            {rig.showSkeleton ? <Eye size={15} /> : <EyeOff size={15} />}
            <span>显示骨架辅助</span>
          </span>
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
        </button>
      </div>

      <div className="field-group">
        <label>编辑模式</label>
        <div className="segmented-control two-columns">
          <button
            className={rig.mode === "fk" ? "is-active" : ""}
            disabled={object.locked}
            type="button"
            onClick={() => setObjectRigMode(object.id, "fk")}
          >
            <span>FK</span>
          </button>
          <button
            className={rig.mode === "ik" ? "is-active" : ""}
            disabled={object.locked}
            type="button"
            onClick={() => setObjectRigMode(object.id, "ik")}
          >
            <span>IK</span>
          </button>
        </div>
      </div>

      {rig.mode === "fk" ? (
        <>
          <div className="field-group">
            <label>骨骼选择</label>
            <div className="suggest-field bone-suggest">
              <label className="search-box compact-search suggest-input">
                <Search size={15} />
                <input
                  disabled={object.locked}
                  placeholder="搜索骨骼"
                  value={boneSearch}
                  onBlur={() => {
                    window.setTimeout(() => setBoneSuggestOpen(false), 120);
                  }}
                  onChange={(event) => {
                    setBoneSearch(event.target.value);
                    setBoneSuggestOpen(true);
                  }}
                  onFocus={() => setBoneSuggestOpen(true)}
                />
              </label>
              {boneSuggestOpen && !object.locked ? (
                <div className="suggest-dropdown rig-bone-suggest-list">
                  {visibleBoneRows.length ? (
                    visibleBoneRows.map((bone) => {
                      const displayName = formatBoneDisplayName(bone.name);
                      return (
                        <button
                          className={`bone-suggest-item ${
                            rig.activeBoneId === bone.id ? "is-active" : ""
                          }`}
                          key={bone.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setActiveBone(object.id, bone.id);
                            setBoneSearch(displayName);
                            setBoneSuggestOpen(false);
                          }}
                        >
                          <span
                            className="bone-indent"
                            style={{ width: bone.depth * 14 + 8 }}
                          />
                          <span className="bone-dot" />
                          <span className="bone-name-stack">
                            <strong>{displayName}</strong>
                            {displayName !== bone.name ? <small>{bone.name}</small> : null}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="suggest-empty">未找到匹配骨骼</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {selectedBone ? (
            <div className="rig-panel-card">
              <div className="rig-panel-title">骨骼旋转</div>
              <div className="small-meta">FK 模式仅支持旋转，不支持平移和缩放</div>
              <TransformFields
                disabled={object.locked}
                label="骨骼旋转"
                step={1}
                value={toDegreesVector(selectedBone.rotation)}
                onChange={(rotation) =>
                  updateBoneRotation(object.id, selectedBone.id, toRadiansVector(rotation))
                }
              />
            </div>
          ) : (
            <div className="material-empty">请先选择一个骨骼</div>
          )}
        </>
      ) : null}

      {rig.mode === "ik" ? (
        <>
          {rig.ikChains.length ? (
            <div className="rig-panel-card">
              <div className="rig-panel-title">IK 控制节点</div>
              <div className="small-meta">点击视口中的 IK 节点后，使用移动控制调整位置</div>
              {activeIkChain ? (
                <TransformFields
                  disabled={object.locked}
                  label={activeIkChain.name}
                  value={activeIkChain.targetPosition}
                  onChange={(targetPosition) =>
                    updateIkChain(object.id, activeIkChain.id, { targetPosition })
                  }
                />
              ) : (
                <div className="material-empty">请在视口中点击一个 IK 控制节点</div>
              )}
            </div>
          ) : ikControlRows.length ? (
            <div className="rig-panel-card">
              <div className="rig-panel-title">IK 控制节点</div>
              <div className="small-meta">点击视口中的 IK 节点后，使用移动控制调整位置</div>
              {selectedIkControlBone ? (
                <TransformFields
                  disabled={object.locked}
                  label={selectedIkControlBone.name}
                  value={selectedIkControlBone.position}
                  onChange={(position) =>
                    updateBonePosition(object.id, selectedIkControlBone.id, position)
                  }
                />
              ) : (
                <div className="material-empty">请在视口中点击一个 IK 控制节点</div>
              )}
            </div>
          ) : (
            <div className="material-empty">
              当前模型没有名称包含 IK 的控制骨骼节点
            </div>
          )}
        </>
      ) : null}
    </>
  );

  if (embedded) {
    return content;
  }

  return <section className="panel-block">{content}</section>;
}
