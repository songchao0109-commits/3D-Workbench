import {
  ChevronDown,
  Box,
  Eye,
  EyeOff,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";
import { useState } from "react";
import type { SceneObject, Vec3 } from "../../domain/projectTypes";
import { useProjectStore } from "../../store/projectStore";
import { MaterialInspector } from "./MaterialInspector";
import { RigInspector } from "./RigInspector";
import { TransformFields } from "./TransformFields";

function toDegreesVector(value: Vec3): Vec3 {
  return value.map((item) => (item * 180) / Math.PI) as Vec3;
}

function toRadiansVector(value: Vec3): Vec3 {
  return value.map((item) => (item * Math.PI) / 180) as Vec3;
}

export function ObjectInspector({ object }: { object: SceneObject }) {
  const [transformExpanded, setTransformExpanded] = useState(true);
  const [dimensionsExpanded, setDimensionsExpanded] = useState(true);
  const [rigExpanded, setRigExpanded] = useState(true);
  const [materialExpanded, setMaterialExpanded] = useState(true);
  const updateObject = useProjectStore((state) => state.updateObject);
  const updateObjectTransform = useProjectStore(
    (state) => state.updateObjectTransform,
  );
  const toggleObjectVisible = useProjectStore((state) => state.toggleObjectVisible);
  const toggleObjectLocked = useProjectStore((state) => state.toggleObjectLocked);
  const toggleObjectBoundsVisible = useProjectStore(
    (state) => state.toggleObjectBoundsVisible,
  );
  const removeObject = useProjectStore((state) => state.removeObject);

  const disabled = object.locked;
  const actualDimensions = object.actualDimensions ?? [0, 0, 0];

  const formatDimension = (value: number) => `${value.toFixed(3)} m`;
  const transformSummary = `${object.position
    .map((value) => value.toFixed(2))
    .join(" / ")}`;
  const dimensionSummary = `X ${actualDimensions[0].toFixed(3)}  Y ${actualDimensions[1].toFixed(
    3,
  )}  Z ${actualDimensions[2].toFixed(3)}`;
  const rigSummary = object.rig?.hasSkeleton
    ? object.rig.mode === "fk"
      ? "FK 关节旋转"
      : "IK 骨链控制"
    : "当前对象没有骨架";
  const materialSummary = object.materialOverrides?.length
    ? `已覆盖 ${object.materialOverrides.length} 个材质`
    : "展开查看材质参数";

  return (
    <section className="panel-block object-panel">
      <div className="panel-heading object-heading">
        <div>
          <h2>模型属性</h2>
          <p>{object.type === "character" ? "占位角色" : "导入模型"}</p>
        </div>
        <div className="object-actions">
          <button
            title={object.visible ? "隐藏" : "显示"}
            type="button"
            onClick={() => toggleObjectVisible(object.id)}
          >
            {object.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            title={object.locked ? "解锁" : "锁定"}
            type="button"
            onClick={() => toggleObjectLocked(object.id)}
          >
            {object.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button
            title="删除"
            type="button"
            onClick={() => removeObject(object.id)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="field-group">
        <label>名称</label>
        <input
          className="text-field"
          disabled={disabled}
          value={object.name}
          onChange={(event) => updateObject(object.id, { name: event.target.value })}
        />
      </div>

      <div className={`panel-subsection ${transformExpanded ? "is-open" : ""}`}>
        <button
          className={`panel-subsection-trigger ${transformExpanded ? "is-open" : ""}`}
          type="button"
          onClick={() => setTransformExpanded((current) => !current)}
        >
          <span>参数调节</span>
          <ChevronDown size={16} />
        </button>
        {!transformExpanded ? (
          <div className="panel-subsection-summary">当前位置：{transformSummary}</div>
        ) : null}

        {transformExpanded ? (
          <div className="panel-subsection-body">
            <TransformFields
              disabled={disabled}
              label="位置"
              value={object.position}
              onChange={(position) => updateObjectTransform(object.id, { position })}
            />
            <TransformFields
              disabled={disabled}
              label="旋转"
              step={1}
              value={toDegreesVector(object.rotation)}
              onChange={(rotation) =>
                updateObjectTransform(object.id, { rotation: toRadiansVector(rotation) })
              }
            />
            <TransformFields
              disabled={disabled}
              label="缩放"
              step={0.05}
              value={object.scale}
              onChange={(scale) =>
                updateObjectTransform(object.id, {
                  scale: scale.map((item) => Math.max(0.01, item)) as Vec3,
                })
              }
            />
          </div>
        ) : null}
      </div>

      <div className={`panel-subsection ${dimensionsExpanded ? "is-open" : ""}`}>
        <button
          className={`panel-subsection-trigger ${dimensionsExpanded ? "is-open" : ""}`}
          type="button"
          onClick={() => setDimensionsExpanded((current) => !current)}
        >
          <span>尺寸与显示</span>
          <ChevronDown size={16} />
        </button>
        {!dimensionsExpanded ? (
          <div className="panel-subsection-summary">{dimensionSummary}</div>
        ) : null}

        {dimensionsExpanded ? (
          <div className="panel-subsection-body">
            <div className="field-group">
              <label>实际尺寸</label>
              <div className="axis-fields dimension-fields">
                <div className="axis-field dimension-field">
                  <span>X</span>
                  <strong className="dimension-value">
                    {formatDimension(actualDimensions[0])}
                  </strong>
                </div>
                <div className="axis-field dimension-field">
                  <span>Y</span>
                  <strong className="dimension-value">
                    {formatDimension(actualDimensions[1])}
                  </strong>
                </div>
                <div className="axis-field dimension-field">
                  <span>Z</span>
                  <strong className="dimension-value">
                    {formatDimension(actualDimensions[2])}
                  </strong>
                </div>
              </div>
              <div className="small-meta">按包围盒计算，精度到毫米级</div>
            </div>

            <div className="field-group">
              <label>包围盒</label>
              <button
                className={`switch-row ${object.boundsVisible ? "is-active" : ""}`}
                disabled={!object.visible}
                type="button"
                onClick={() => toggleObjectBoundsVisible(object.id)}
              >
                <span className="switch-row-label">
                  <Box size={15} />
                  <span>显示包围盒</span>
                </span>
                <span className="switch-track">
                  <span className="switch-thumb" />
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {object.rig?.hasSkeleton ? (
        <div className={`panel-subsection ${rigExpanded ? "is-open" : ""}`}>
          <button
            className={`panel-subsection-trigger ${rigExpanded ? "is-open" : ""}`}
            type="button"
            onClick={() => setRigExpanded((current) => !current)}
          >
            <span>骨骼控制</span>
            <ChevronDown size={16} />
          </button>
          {!rigExpanded ? (
            <div className="panel-subsection-summary">{rigSummary}</div>
          ) : null}
          {rigExpanded ? (
            <div className="panel-subsection-body">
              <RigInspector embedded object={object} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`panel-subsection ${materialExpanded ? "is-open" : ""}`}>
        <button
          className={`panel-subsection-trigger ${materialExpanded ? "is-open" : ""}`}
          type="button"
          onClick={() => setMaterialExpanded((current) => !current)}
        >
          <span>材质调节</span>
          <ChevronDown size={16} />
        </button>
        {!materialExpanded ? (
          <div className="panel-subsection-summary">{materialSummary}</div>
        ) : null}

        {materialExpanded ? (
          <div className="panel-subsection-body">
            <MaterialInspector object={object} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
