import { describe, expect, it } from 'vitest';
import { createIcosphere } from '../src/core/geometry';
import { recomputeNormals } from '../src/core/normals';
import type { ClayMeshData } from '../src/core/types';

function meshFrom(positions: Float32Array, indices: Uint32Array): ClayMeshData {
  return {
    positions,
    normals: new Float32Array(positions.length),
    colors: new Float32Array(positions.length),
    indices,
  };
}

describe('recomputeNormals', () => {
  // UT-N-01: すべての法線が単位長
  it('全法線が単位長になる', () => {
    const { positions, indices } = createIcosphere(3, 1);
    const mesh = meshFrom(positions, indices);
    recomputeNormals(mesh);
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const len = Math.hypot(
        mesh.normals[i],
        mesh.normals[i + 1],
        mesh.normals[i + 2],
      );
      expect(len).toBeCloseTo(1, 4);
    }
  });

  // UT-N-02: 球面では法線 ≒ 位置方向(外向き)
  it('球面の法線は位置ベクトル方向と一致する', () => {
    const { positions, indices } = createIcosphere(3, 1);
    const mesh = meshFrom(positions, indices);
    recomputeNormals(mesh);
    for (let i = 0; i < positions.length; i += 3) {
      const dot =
        positions[i] * mesh.normals[i] +
        positions[i + 1] * mesh.normals[i + 1] +
        positions[i + 2] * mesh.normals[i + 2];
      expect(dot).toBeGreaterThan(0.99); // ほぼ平行かつ外向き
    }
  });

  // UT-N-03: 退化三角形(全頂点同一)ではフォールバック法線 (0,1,0)
  it('退化メッシュでは (0,1,0) にフォールバックする', () => {
    const positions = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const mesh = meshFrom(positions, indices);
    recomputeNormals(mesh);
    for (let v = 0; v < 3; v++) {
      expect(mesh.normals[v * 3]).toBe(0);
      expect(mesh.normals[v * 3 + 1]).toBe(1);
      expect(mesh.normals[v * 3 + 2]).toBe(0);
    }
  });

  // UT-N-04: 再実行しても結果が安定(冪等)
  it('2回実行しても同一結果', () => {
    const { positions, indices } = createIcosphere(2, 1);
    const mesh = meshFrom(positions, indices);
    recomputeNormals(mesh);
    const first = mesh.normals.slice();
    recomputeNormals(mesh);
    expect(mesh.normals).toEqual(first);
  });
});
