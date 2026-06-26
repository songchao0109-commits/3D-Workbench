import * as THREE from "three";
import type { MaterialOverride } from "../domain/projectTypes";

export type EditableMaterial = {
  id: string;
  name: string;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  hasTexture: boolean;
  supportsColor: boolean;
  supportsRoughness: boolean;
  supportsMetalness: boolean;
  supportsOpacity: boolean;
  supportsTexture: boolean;
};

type WorkbenchMaterial = THREE.Material & {
  color?: THREE.Color;
  roughness?: number;
  metalness?: number;
  opacity: number;
  transparent: boolean;
  map?: THREE.Texture | null;
  needsUpdate: boolean;
  userData: Record<string, unknown>;
};

function ensureMaterialId(material: THREE.Material) {
  if (!material.userData.workbenchMaterialId) {
    material.userData.workbenchMaterialId = `material_${crypto.randomUUID()}`;
  }
  return String(material.userData.workbenchMaterialId);
}

function eachMaterial(object: THREE.Object3D, callback: (material: WorkbenchMaterial) => void) {
  const seen = new Set<string>();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      const id = ensureMaterialId(material);
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      callback(material as WorkbenchMaterial);
    });
  });
}

export function getEditableMaterials(object: THREE.Object3D): EditableMaterial[] {
  const materials: EditableMaterial[] = [];

  eachMaterial(object, (material) => {
    const id = ensureMaterialId(material);
    const supportsColor = "color" in material && material.color instanceof THREE.Color;
    const supportsRoughness = "roughness" in material;
    const supportsMetalness = "metalness" in material;
    const supportsOpacity = "opacity" in material;
    const supportsTexture = "map" in material;

    materials.push({
      id,
      name: material.name || id.replace("material_", "材质 "),
      color: supportsColor ? `#${material.color!.getHexString()}` : undefined,
      roughness: supportsRoughness ? material.roughness : undefined,
      metalness: supportsMetalness ? material.metalness : undefined,
      opacity: supportsOpacity ? material.opacity : undefined,
      hasTexture: Boolean(material.map),
      supportsColor,
      supportsRoughness,
      supportsMetalness,
      supportsOpacity,
      supportsTexture,
    });
  });

  return materials;
}

export function applyMaterialOverride(
  object: THREE.Object3D,
  materialId: string,
  override: Partial<MaterialOverride> & { textureUrl?: string },
) {
  eachMaterial(object, (material) => {
    if (ensureMaterialId(material) !== materialId) {
      return;
    }

    if (override.color && material.color instanceof THREE.Color) {
      material.color.set(override.color);
    }
    if (typeof override.roughness === "number" && "roughness" in material) {
      material.roughness = override.roughness;
    }
    if (typeof override.metalness === "number" && "metalness" in material) {
      material.metalness = override.metalness;
    }
    if (typeof override.opacity === "number" && "opacity" in material) {
      material.opacity = override.opacity;
      material.transparent = override.opacity < 1;
      material.depthWrite = override.opacity >= 1;
    }
    if (override.textureUrl && "map" in material) {
      const previousMap = material.map;
      new THREE.TextureLoader().load(override.textureUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        previousMap?.dispose();
        material.map = texture;
        material.needsUpdate = true;
      });
    }
    material.needsUpdate = true;
  });
}
