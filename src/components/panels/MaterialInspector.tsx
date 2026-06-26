import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import type { SceneObject } from "../../domain/projectTypes";
import { useProjectStore } from "../../store/projectStore";
import {
  applyMaterialOverride,
  type EditableMaterial,
  getEditableMaterials,
} from "../../three/materialTools";
import { sceneRegistry } from "../../three/sceneRegistry";

type MaterialInspectorProps = {
  object: SceneObject;
};

export function MaterialInspector({ object }: MaterialInspectorProps) {
  const [materials, setMaterials] = useState<EditableMaterial[]>([]);
  const addAsset = useProjectStore((state) => state.addAsset);
  const updateObjectMaterial = useProjectStore((state) => state.updateObjectMaterial);

  const refreshMaterials = () => {
    const runtimeObject = sceneRegistry.getObject(object.id);
    setMaterials(runtimeObject ? getEditableMaterials(runtimeObject) : []);
  };

  useEffect(() => {
    refreshMaterials();
  }, [object.id, object.materialOverrides]);

  const updateMaterial = (
    material: EditableMaterial,
    updates: Parameters<typeof updateObjectMaterial>[2],
    textureUrl?: string,
  ) => {
    const runtimeObject = sceneRegistry.getObject(object.id);
    if (!runtimeObject) {
      return;
    }
    applyMaterialOverride(runtimeObject, material.id, {
      materialName: material.name,
      ...updates,
      textureUrl,
    });
    updateObjectMaterial(object.id, material.id, {
      materialName: material.name,
      ...updates,
    });
    window.setTimeout(refreshMaterials, 0);
  };

  const handleTextureChange = (material: EditableMaterial, file?: File) => {
    if (!file) {
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const textureAssetId = `texture_${crypto.randomUUID()}`;
    addAsset({
      id: textureAssetId,
      name: file.name,
      type: "texture",
      objectUrl,
      mimeType: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
    });
    updateMaterial(material, { textureAssetId }, objectUrl);
  };

  if (materials.length === 0) {
    return (
      <div className="material-empty">
        当前对象没有可编辑材质
      </div>
    );
  }

  return (
    <div className="material-list">
      {materials.map((material) => (
        <section className="material-row" key={material.id}>
          <div className="material-title">
            <span>{material.name}</span>
            <span>{material.hasTexture ? "有贴图" : "无贴图"}</span>
          </div>

          <div className="material-control">
            <label>颜色</label>
            <input
              disabled={object.locked || !material.supportsColor}
              type="color"
              value={material.color ?? "#ffffff"}
              onChange={(event) =>
                updateMaterial(material, { color: event.target.value })
              }
            />
          </div>

          <SliderControl
            disabled={object.locked || !material.supportsRoughness}
            label="粗糙度"
            value={material.roughness ?? 0}
            onChange={(roughness) => updateMaterial(material, { roughness })}
          />
          <SliderControl
            disabled={object.locked || !material.supportsMetalness}
            label="金属度"
            value={material.metalness ?? 0}
            onChange={(metalness) => updateMaterial(material, { metalness })}
          />
          <SliderControl
            disabled={object.locked || !material.supportsOpacity}
            label="透明度"
            value={material.opacity ?? 1}
            onChange={(opacity) => updateMaterial(material, { opacity })}
          />

          <label className={`texture-input ${object.locked ? "is-disabled" : ""}`}>
            <ImagePlus size={14} />
            <span>替换贴图</span>
            <input
              accept="image/*"
              disabled={object.locked || !material.supportsTexture}
              type="file"
              onChange={(event) =>
                handleTextureChange(material, event.target.files?.[0])
              }
            />
          </label>
        </section>
      ))}
    </div>
  );
}

function SliderControl({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="material-control">
      <label>{label}</label>
      <input
        disabled={disabled}
        max="1"
        min="0"
        step="0.01"
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span>{value.toFixed(2)}</span>
    </div>
  );
}
