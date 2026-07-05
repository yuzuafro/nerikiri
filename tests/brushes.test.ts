import { describe, expect, it } from 'vitest';
import { applyBrush, falloff } from '../src/core/brushes';
import { createShape } from '../src/core/geometry';
import type { BrushHit, BrushParams, ClayMeshData } from '../src/core/types';

const HIT: BrushHit = { point: [0, 0, 1], normal: [0, 0, 1] };

function makeBrush(overrides: Partial<BrushParams> = {}): BrushParams {
  return {
    kind: 'pull',
    radius: 0.3,
    strength: 0.5,
    color: [1, 0, 0],
    ...overrides,
  };
}

/** ヒット点から dist 以上離れた頂点のインデックス集合 */
function verticesOutside(mesh: ClayMeshData, dist: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const d = Math.hypot(
      mesh.positions[i * 3] - HIT.point[0],
      mesh.positions[i * 3 + 1] - HIT.point[1],
      mesh.positions[i * 3 + 2] - HIT.point[2],
    );
    if (d >= dist) out.push(i);
  }
  return out;
}

describe('falloff', () => {
  // UT-B-01: 境界値 — 中心で1、半径以上で0、単調減少
  it('中心で1、半径境界・半径外で0', () => {
    expect(falloff(0, 0.3)).toBe(1);
    expect(falloff(0.3, 0.3)).toBe(0);
    expect(falloff(0.5, 0.3)).toBe(0);
  });

  it('距離に対して単調減少する', () => {
    let prev = falloff(0, 1);
    for (let d = 0.1; d <= 1; d += 0.1) {
      const w = falloff(d, 1);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });

  it('半径0では常に0(ゼロ除算なし)', () => {
    expect(falloff(0, 0)).toBe(0);
  });
});

describe('applyBrush', () => {
  // UT-B-02: 半径外の頂点は位置・色とも不変
  it('影響半径外の頂点は変化しない', () => {
    const mesh = createShape('sphere');
    const before = mesh.positions.slice();
    const beforeColors = mesh.colors.slice();
    const brush = makeBrush({ kind: 'pull', radius: 0.3 });
    applyBrush(mesh, HIT, brush);
    for (const i of verticesOutside(mesh, 0.31)) {
      expect(mesh.positions[i * 3]).toBe(before[i * 3]);
      expect(mesh.positions[i * 3 + 1]).toBe(before[i * 3 + 1]);
      expect(mesh.positions[i * 3 + 2]).toBe(before[i * 3 + 2]);
      expect(mesh.colors[i * 3]).toBe(beforeColors[i * 3]);
    }
  });

  // UT-B-03: pull はヒット法線方向に盛り上がる
  it('pull: ヒット点近傍がヒット法線方向(+Z)へ移動する', () => {
    const mesh = createShape('sphere');
    const zBefore = mesh.positions[maxZVertex(mesh) * 3 + 2];
    applyBrush(mesh, HIT, makeBrush({ kind: 'pull' }));
    const zAfter = mesh.positions[maxZVertex(mesh) * 3 + 2];
    expect(zAfter).toBeGreaterThan(zBefore);
  });

  // UT-B-04: push は凹む
  it('push: ヒット点近傍が法線と逆方向へ移動する', () => {
    const mesh = createShape('sphere');
    const i = maxZVertex(mesh);
    const zBefore = mesh.positions[i * 3 + 2];
    applyBrush(mesh, HIT, makeBrush({ kind: 'push' }));
    expect(mesh.positions[i * 3 + 2]).toBeLessThan(zBefore);
  });

  // UT-B-05: push と pull は対称(同一パラメータで変位が符号反転)
  it('pushとpullの変位は対称', () => {
    const meshA = createShape('sphere');
    const meshB = createShape('sphere');
    const base = meshA.positions.slice();
    applyBrush(meshA, HIT, makeBrush({ kind: 'pull' }));
    applyBrush(meshB, HIT, makeBrush({ kind: 'push' }));
    for (let i = 0; i < base.length; i++) {
      const dA = meshA.positions[i] - base[i];
      const dB = meshB.positions[i] - base[i];
      expect(dA + dB).toBeCloseTo(0, 5);
    }
  });

  // UT-B-06: smooth は凹凸を減らす(突起頂点が隣接平均に近づく)
  it('smooth: 突起が隣接平均へ近づく', () => {
    const mesh = createShape('sphere');
    // 突起を作る
    applyBrush(mesh, HIT, makeBrush({ kind: 'pull', strength: 1, radius: 0.15 }));
    const i = maxZVertex(mesh);
    const spikeBefore = mesh.positions[i * 3 + 2];
    applyBrush(mesh, HIT, makeBrush({ kind: 'smooth', strength: 1, radius: 0.3 }));
    expect(mesh.positions[i * 3 + 2]).toBeLessThan(spikeBefore);
  });

  // UT-B-07: pinch はヒット点へ向かって寄る
  it('pinch: 近傍頂点のヒット点までの距離が縮む', () => {
    const mesh = createShape('sphere');
    const distBefore = nearbyDistances(mesh);
    applyBrush(mesh, HIT, makeBrush({ kind: 'pinch', strength: 1 }));
    const distAfter = nearbyDistances(mesh);
    expect(distAfter).toBeLessThan(distBefore);
  });

  // UT-B-08: inflate は頂点法線方向へ膨張(球なら半径が増える)
  it('inflate: 球面の近傍頂点の原点距離が増える', () => {
    const mesh = createShape('sphere');
    const i = maxZVertex(mesh);
    const rBefore = vertexRadius(mesh, i);
    applyBrush(mesh, HIT, makeBrush({ kind: 'inflate' }));
    expect(vertexRadius(mesh, i)).toBeGreaterThan(rBefore);
  });

  // UT-B-09: flatten は接平面への距離を縮める
  it('flatten: 接平面からの距離が縮む', () => {
    const mesh = createShape('sphere');
    const planeDist = (idx: number) =>
      Math.abs(mesh.positions[idx * 3 + 2] - HIT.point[2]);
    // 半径内で平面から離れている頂点を選ぶ
    const idx = pickVertexNear(mesh, 0.2);
    const before = planeDist(idx);
    applyBrush(mesh, HIT, makeBrush({ kind: 'flatten', strength: 1, radius: 0.3 }));
    expect(planeDist(idx)).toBeLessThan(before);
  });

  // UT-B-10: paint は色のみ変え、位置を変えない
  it('paint: 位置は不変、近傍の色が選択色へ近づく', () => {
    const mesh = createShape('sphere');
    const posBefore = mesh.positions.slice();
    const i = maxZVertex(mesh);
    const rBefore = mesh.colors[i * 3];
    applyBrush(mesh, HIT, makeBrush({ kind: 'paint', color: [1, 0, 0] }));
    expect(mesh.positions).toEqual(posBefore);
    expect(mesh.colors[i * 3]).toBeGreaterThanOrEqual(rBefore);
    expect(mesh.colors[i * 3 + 1]).toBeLessThan(1); // G は初期色から赤方向へ減少
  });

  // UT-B-11: 戻り値は影響頂点数。粘土から離れたヒットでは0
  it('戻り値: ヒットが遠いと0、近いと正の数', () => {
    const mesh = createShape('sphere');
    const far: BrushHit = { point: [10, 10, 10], normal: [0, 0, 1] };
    expect(applyBrush(mesh, far, makeBrush())).toBe(0);
    expect(applyBrush(mesh, HIT, makeBrush())).toBeGreaterThan(0);
  });

  // UT-B-12: strength が大きいほど変位が大きい
  it('強さに応じて変位量が増える', () => {
    const weak = createShape('sphere');
    const strong = createShape('sphere');
    const i = maxZVertex(weak);
    const base = weak.positions[i * 3 + 2];
    applyBrush(weak, HIT, makeBrush({ strength: 0.1 }));
    applyBrush(strong, HIT, makeBrush({ strength: 1.0 }));
    const dWeak = weak.positions[i * 3 + 2] - base;
    const dStrong = strong.positions[i * 3 + 2] - base;
    expect(dStrong).toBeGreaterThan(dWeak);
  });
});

// ---- ヘルパー ----

function maxZVertex(mesh: ClayMeshData): number {
  let best = 0;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    if (mesh.positions[i * 3 + 2] > mesh.positions[best * 3 + 2]) best = i;
  }
  return best;
}

function vertexRadius(mesh: ClayMeshData, i: number): number {
  return Math.hypot(
    mesh.positions[i * 3],
    mesh.positions[i * 3 + 1],
    mesh.positions[i * 3 + 2],
  );
}

/** ヒット点近傍(半径0.25以内)頂点のヒット点までの平均距離 */
function nearbyDistances(mesh: ClayMeshData): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const d = Math.hypot(
      mesh.positions[i * 3] - HIT.point[0],
      mesh.positions[i * 3 + 1] - HIT.point[1],
      mesh.positions[i * 3 + 2] - HIT.point[2],
    );
    if (d > 0.01 && d < 0.25) {
      sum += d;
      count++;
    }
  }
  return sum / count;
}

/** ヒット点からおよそ dist 離れた頂点を1つ選ぶ */
function pickVertexNear(mesh: ClayMeshData, dist: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const d = Math.hypot(
      mesh.positions[i * 3] - HIT.point[0],
      mesh.positions[i * 3 + 1] - HIT.point[1],
      mesh.positions[i * 3 + 2] - HIT.point[2],
    );
    const diff = Math.abs(d - dist);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}
