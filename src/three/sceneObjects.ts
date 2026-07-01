import * as THREE from "three";

type StandinVariant = "male" | "female";
type PrimitiveVariant =
  | "cube"
  | "sphere"
  | "cylinder"
  | "torus"
  | "cone"
  | "pyramid";

export function createStandinCharacter(variant: StandinVariant) {
  const group = new THREE.Group();
  group.name = variant === "female" ? "女性素体" : "男性素体";

  const material = new THREE.MeshStandardMaterial({
    color: variant === "female" ? 0xd68ce8 : 0xf0b72f,
    roughness: 0.55,
    metalness: 0.05,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x202026,
    roughness: 0.7,
  });

  const bodyRadius = variant === "female" ? 0.145 : 0.16;
  const bodyHeight = variant === "female" ? 0.7 : 0.75;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(bodyRadius, bodyHeight, 6, 12),
    material,
  );
  body.position.y = variant === "female" ? 0.9 : 0.92;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(variant === "female" ? 0.17 : 0.18, 20, 20),
    material,
  );
  head.position.y = variant === "female" ? 1.48 : 1.55;

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.48, 4, 8), darkMaterial);
  leftLeg.position.set(-0.07, 0.34, 0);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.07;

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.025, 24), material);
  foot.position.y = 0.02;

  group.add(body, head, leftLeg, rightLeg, foot);
  return group;
}

export function createPlaceholderCharacter() {
  return createStandinCharacter("male");
}

export function createPrimitiveObject(variant: PrimitiveVariant) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x8fb3ff,
    roughness: 0.45,
    metalness: 0.08,
  });

  if (variant === "sphere") {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 28), material);
    mesh.position.y = 0.48;
    mesh.name = "球体";
    return mesh;
  }

  if (variant === "cylinder") {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 1.1, 28),
      material,
    );
    mesh.position.y = 0.55;
    mesh.name = "圆柱";
    return mesh;
  }

  if (variant === "torus") {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.14, 20, 36),
      material,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.56;
    mesh.name = "环状体";
    return mesh;
  }

  if (variant === "cone") {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.12, 28), material);
    mesh.position.y = 0.56;
    mesh.name = "圆锥";
    return mesh;
  }

  if (variant === "pyramid") {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4), material);
    mesh.rotation.y = Math.PI / 4;
    mesh.position.y = 0.55;
    mesh.name = "棱锥";
    return mesh;
  }

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.y = 0.5;
  mesh.name = "立方体";
  return mesh;
}

export function createCameraMarker() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x4a4a56, roughness: 0.4 }),
  );
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.11, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: 0x4fa3ff, roughness: 0.25 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.2;

  group.add(body, lens);
  return group;
}
