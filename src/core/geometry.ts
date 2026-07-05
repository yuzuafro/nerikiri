import type { ClayMeshData, ShapeKind } from './types';
import { INITIAL_COLOR } from './types';
import { recomputeNormals } from './normals';

/**
 * 正二十面体を subdivisions 回細分化したイコスフィアを生成する。
 * エッジ中点は共有され、重複頂点は生じない。
 */
export function createIcosphere(
  subdivisions: number,
  radius: number,
): { positions: Float32Array; indices: Uint32Array } {
  const t = (1 + Math.sqrt(5)) / 2;

  // 正二十面体の12頂点
  const verts: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];

  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let s = 0; s < subdivisions; s++) {
    const midCache = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      const cached = midCache.get(key);
      if (cached !== undefined) return cached;
      const va = verts[a];
      const vb = verts[b];
      verts.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
      const idx = verts.length - 1;
      midCache.set(key, idx);
      return idx;
    };

    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  // 球面へ射影
  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const [x, y, z] = verts[i];
    const len = Math.hypot(x, y, z);
    positions[i * 3] = (x / len) * radius;
    positions[i * 3 + 1] = (y / len) * radius;
    positions[i * 3 + 2] = (z / len) * radius;
  }

  const indices = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    indices[i * 3] = faces[i][0];
    indices[i * 3 + 1] = faces[i][1];
    indices[i * 3 + 2] = faces[i][2];
  }

  return { positions, indices };
}

/** 細分化レベル(頂点2,562 / 三角形5,120) */
export const DEFAULT_SUBDIVISIONS = 4;

/**
 * 練り切りの基本形プロファイルを単位球に適用する。
 * 上面は平らに近く(y=1で勾配0)、下は少しすぼんだ形。
 */
function applyNerikiriProfile(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]; // 単位球なので -1..1
    // 上半球: y - y^3/3 は y=1 で勾配0 → 上面が平らな肩の丸い形
    // 高さ約1.4・幅約2.1(実物の練り切りの高さ/直径比 ≈ 0.67 に相当)
    const newY = y > 0 ? (y - (y * y * y) / 3) * 1.05 : y * 0.7;
    // 下半球ほど水平半径を絞る(最大18%)
    const taper = 1 - 0.18 * Math.max(0, -y);
    positions[i] *= 1.05 * taper;
    // 球と同じく底面が y=-1 になるよう下げる(まな板に載る位置)
    positions[i + 1] = newY - 0.3;
    positions[i + 2] *= 1.05 * taper;
  }
}

/** 初期形状の粘土メッシュを生成する。 */
export function createShape(kind: ShapeKind): ClayMeshData {
  const { positions, indices } = createIcosphere(DEFAULT_SUBDIVISIONS, 1);
  if (kind === 'nerikiri') applyNerikiriProfile(positions);

  const vertexCount = positions.length / 3;
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3] = INITIAL_COLOR[0];
    colors[i * 3 + 1] = INITIAL_COLOR[1];
    colors[i * 3 + 2] = INITIAL_COLOR[2];
  }

  const mesh: ClayMeshData = {
    positions,
    normals: new Float32Array(positions.length),
    colors,
    indices,
  };
  recomputeNormals(mesh);
  return mesh;
}
