import {
  Globe,
  Grid3X3,
  ImagePlus,
  PanelBottom,
  Tags,
  X,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef } from "react";
import type { Vec3 } from "../../domain/projectTypes";
import { useProjectStore } from "../../store/projectStore";
import { TransformFields } from "./TransformFields";

function toDegreesVector(value: Vec3): Vec3 {
  return value.map((item) => (item * 180) / Math.PI) as Vec3;
}

function toRadiansVector(value: Vec3): Vec3 {
  return value.map((item) => (item * Math.PI) / 180) as Vec3;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function WorldInspector() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assets = useProjectStore((state) => state.assets);
  const worldSettings = useProjectStore((state) => state.worldSettings);
  const updateWorldSettings = useProjectStore((state) => state.updateWorldSettings);
  const setWorldPanoramaAsset = useProjectStore(
    (state) => state.setWorldPanoramaAsset,
  );

  const panoramaAsset = assets.find(
    (item) => item.id === worldSettings.panoramaSphere.assetId,
  );

  const handlePanoramaChange = (event: ChangeEvent<HTMLInputElement>) => {
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

  return (
    <section className="panel-block world-panel">
      <div className="panel-heading object-heading">
        <div>
          <h2>3D 世界属性</h2>
          <p>未选中对象或机位时，编辑场景与环境</p>
        </div>
      </div>

      <div className="world-section-title">
        <Globe size={15} />
        <span>场景整体</span>
      </div>
      <TransformFields
        label="场景位置"
        value={worldSettings.rootTransform.position}
        onChange={(position) =>
          updateWorldSettings({
            rootTransform: {
              ...worldSettings.rootTransform,
              position,
            },
          })
        }
      />
      <TransformFields
        label="场景旋转"
        step={1}
        value={toDegreesVector(worldSettings.rootTransform.rotation)}
        onChange={(rotation) =>
          updateWorldSettings({
            rootTransform: {
              ...worldSettings.rootTransform,
              rotation: toRadiansVector(rotation),
            },
          })
        }
      />
      <TransformFields
        label="场景缩放"
        value={worldSettings.rootTransform.scale}
        onChange={(scale) =>
          updateWorldSettings({
            rootTransform: {
              ...worldSettings.rootTransform,
              scale,
            },
          })
        }
      />

      <div className="world-section-title">
        <ImagePlus size={15} />
        <span>全景球</span>
      </div>
      <div className="field-group">
        <label>全景图</label>
        <div className="camera-panorama-row">
          <button
            className="primary-small"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={14} />
            绑定全景图
          </button>
          {panoramaAsset ? (
            <button
              className="ghost-tag"
              type="button"
              onClick={() => setWorldPanoramaAsset(undefined)}
            >
              <X size={12} />
              <span>移除</span>
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          className="file-input"
          accept="image/*"
          type="file"
          onChange={handlePanoramaChange}
        />
        <div className="small-meta">
          {panoramaAsset ? panoramaAsset.name : "当前未绑定全景图"}
        </div>
      </div>
      <div className="field-group">
        <label>显示全景球</label>
        <div className="segmented-control two-columns">
          <button
            className={worldSettings.panoramaSphere.visible ? "is-active" : ""}
            type="button"
            onClick={() =>
              updateWorldSettings({
                panoramaSphere: {
                  ...worldSettings.panoramaSphere,
                  visible: true,
                },
              })
            }
          >
            <span>显示</span>
          </button>
          <button
            className={!worldSettings.panoramaSphere.visible ? "is-active" : ""}
            type="button"
            onClick={() =>
              updateWorldSettings({
                panoramaSphere: {
                  ...worldSettings.panoramaSphere,
                  visible: false,
                },
              })
            }
          >
            <span>隐藏</span>
          </button>
        </div>
      </div>
      <div className="field-group">
        <label>全景球半径</label>
        <div className="fov-row">
          <input
            aria-label="全景球半径"
            min="10"
            max="300"
            step="1"
            type="range"
            value={worldSettings.panoramaSphere.radius}
            onChange={(event) =>
              updateWorldSettings({
                panoramaSphere: {
                  ...worldSettings.panoramaSphere,
                  radius: Number(event.currentTarget.value),
                },
              })
            }
          />
          <div className="fov-value-field">
            <input
              aria-label="全景球半径数值"
              className="text-field"
              min="10"
              max="300"
              type="number"
              value={worldSettings.panoramaSphere.radius}
              onChange={(event) =>
                updateWorldSettings({
                  panoramaSphere: {
                    ...worldSettings.panoramaSphere,
                    radius: clamp(Number(event.currentTarget.value || 60), 10, 300),
                  },
                })
              }
            />
          </div>
        </div>
      </div>
      <div className="field-group">
        <label>水平旋转</label>
        <div className="fov-row">
          <input
            aria-label="全景球水平旋转"
            min="-180"
            max="180"
            step="1"
            type="range"
            value={worldSettings.panoramaSphere.horizontalRotationDeg}
            onChange={(event) =>
              updateWorldSettings({
                panoramaSphere: {
                  ...worldSettings.panoramaSphere,
                  horizontalRotationDeg: Number(event.currentTarget.value),
                },
              })
            }
          />
          <div className="fov-value-field">
            <input
              aria-label="全景球水平旋转数值"
              className="text-field"
              min="-180"
              max="180"
              type="number"
              value={worldSettings.panoramaSphere.horizontalRotationDeg}
              onChange={(event) =>
                updateWorldSettings({
                  panoramaSphere: {
                    ...worldSettings.panoramaSphere,
                    horizontalRotationDeg: clamp(
                      Number(event.currentTarget.value || 0),
                      -180,
                      180,
                    ),
                  },
                })
              }
            />
            <span>°</span>
          </div>
        </div>
      </div>

      <div className="world-section-title">
        <Tags size={15} />
        <span>视口辅助</span>
      </div>
      <div className="field-group">
        <label>展示元素标签</label>
        <div className="segmented-control two-columns">
          <button
            className={worldSettings.labelsVisible ? "is-active" : ""}
            type="button"
            onClick={() => updateWorldSettings({ labelsVisible: true })}
          >
            <span>显示</span>
          </button>
          <button
            className={!worldSettings.labelsVisible ? "is-active" : ""}
            type="button"
            onClick={() => updateWorldSettings({ labelsVisible: false })}
          >
            <span>隐藏</span>
          </button>
        </div>
      </div>
      <div className="field-group">
        <label>网格吸附</label>
        <div className="segmented-control two-columns">
          <button
            className={worldSettings.snap.enabled ? "is-active" : ""}
            type="button"
            onClick={() =>
              updateWorldSettings({
                snap: { ...worldSettings.snap, enabled: true },
              })
            }
          >
            <Grid3X3 size={14} />
            <span>开启</span>
          </button>
          <button
            className={!worldSettings.snap.enabled ? "is-active" : ""}
            type="button"
            onClick={() =>
              updateWorldSettings({
                snap: { ...worldSettings.snap, enabled: false },
              })
            }
          >
            <span>关闭</span>
          </button>
        </div>
      </div>
      <TransformFields
        label="吸附参数"
        step={0.1}
        value={[
          worldSettings.snap.translate,
          worldSettings.snap.rotateDeg,
          worldSettings.snap.scale,
        ]}
        onChange={([translate, rotateDeg, scale]) =>
          updateWorldSettings({
            snap: {
              ...worldSettings.snap,
              translate: Math.max(0.1, translate),
              rotateDeg: Math.max(1, rotateDeg),
              scale: Math.max(0.01, scale),
            },
          })
        }
      />

      <div className="world-section-title">
        <PanelBottom size={15} />
        <span>地面</span>
      </div>
      <div className="field-group">
        <label>显示地面</label>
        <div className="segmented-control two-columns">
          <button
            className={worldSettings.ground.visible ? "is-active" : ""}
            type="button"
            onClick={() =>
              updateWorldSettings({
                ground: { ...worldSettings.ground, visible: true },
              })
            }
          >
            <span>显示</span>
          </button>
          <button
            className={!worldSettings.ground.visible ? "is-active" : ""}
            type="button"
            onClick={() =>
              updateWorldSettings({
                ground: { ...worldSettings.ground, visible: false },
              })
            }
          >
            <span>隐藏</span>
          </button>
        </div>
      </div>
      <div className="field-group">
        <label>地面高度</label>
        <input
          className="text-field"
          step="0.1"
          type="number"
          value={Number(worldSettings.ground.y.toFixed(3))}
          onChange={(event) =>
            updateWorldSettings({
              ground: {
                ...worldSettings.ground,
                y: Number(event.currentTarget.value || 0),
              },
            })
          }
        />
      </div>
      <div className="field-group">
        <label>地面透明度</label>
        <div className="fov-row">
          <input
            aria-label="地面透明度"
            min="0"
            max="1"
            step="0.01"
            type="range"
            value={worldSettings.ground.opacity}
            onChange={(event) =>
              updateWorldSettings({
                ground: {
                  ...worldSettings.ground,
                  opacity: clamp(Number(event.currentTarget.value), 0, 1),
                },
              })
            }
          />
          <div className="fov-value-field">
            <input
              aria-label="地面透明度数值"
              className="text-field"
              min="0"
              max="1"
              step="0.01"
              type="number"
              value={Number(worldSettings.ground.opacity.toFixed(2))}
              onChange={(event) =>
                updateWorldSettings({
                  ground: {
                    ...worldSettings.ground,
                    opacity: clamp(Number(event.currentTarget.value || 0), 0, 1),
                  },
                })
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
