import type { ClayMeshData, ShapeKind } from './types';
import { recomputeNormals } from './normals';

const FORMAT = 'nendo-clay';
const VERSION = 1;
// 旧版('manju'/'tawara')のファイルは未知shape扱いで sphere にフォールバックする
const SHAPES: ShapeKind[] = ['sphere', 'nerikiri'];

/** 現在の粘土をJSON文字列に変換する。法線は保存しない(読込時に再計算)。 */
export function serializeMesh(mesh: ClayMeshData, shape: ShapeKind): string {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    shape,
    positions: Array.from(mesh.positions),
    colors: Array.from(mesh.colors),
    indices: Array.from(mesh.indices),
  });
}

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/**
 * JSON文字列から粘土を復元する。形式不正の場合は Error を throw する。
 */
export function deserializeMesh(json: string): {
  mesh: ClayMeshData;
  shape: ShapeKind;
} {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('JSONとして解釈できません');
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('オブジェクトではありません');
  }
  const obj = data as Record<string, unknown>;

  if (obj.format !== FORMAT) throw new Error('nendoの保存ファイルではありません');
  if (obj.version !== VERSION) throw new Error('対応していないバージョンです');

  const { positions, colors, indices } = obj;
  if (!isNumberArray(positions) || !isNumberArray(colors) || !isNumberArray(indices)) {
    throw new Error('頂点データが不正です');
  }
  if (
    positions.length === 0 ||
    positions.length % 3 !== 0 ||
    positions.length !== colors.length ||
    indices.length === 0 ||
    indices.length % 3 !== 0
  ) {
    throw new Error('頂点データの長さが不正です');
  }
  const vertexCount = positions.length / 3;
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= vertexCount) {
      throw new Error('三角形インデックスが不正です');
    }
  }

  const shape: ShapeKind = SHAPES.includes(obj.shape as ShapeKind)
    ? (obj.shape as ShapeKind)
    : 'sphere';

  const mesh: ClayMeshData = {
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  };
  recomputeNormals(mesh);
  return { mesh, shape };
}
