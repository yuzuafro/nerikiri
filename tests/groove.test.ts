import { describe, expect, it } from 'vitest';
import { createShape } from '../src/core/geometry';
import { GrooveStroke, grooveDepth, grooveWidth } from '../src/core/groove';
import type { BrushHit, ClayMeshData } from '../src/core/types';

// 球の頂上付近を +X 方向に横切る線分(接平面上)
const FROM: BrushHit = { point: [-0.3, 1, 0], normal: [0, 1, 0] };
const TO: BrushHit = { point: [0.3, 1, 0], normal: [0, 1, 0] };
const STRENGTH = 0.5;

/** 頂点の線分(FROM-TO)への垂直距離 */
function distToSegment(mesh: ClayMeshData, i: number): number {
  const px = mesh.positions[i * 3];
  const py = mesh.positions[i * 3 + 1];
  const pz = mesh.positions[i * 3 + 2];
  const t = Math.min(Math.max((px - FROM.point[0]) / 0.6, 0), 1);
  const cx = FROM.point[0] + 0.6 * t;
  return Math.hypot(px - cx, py - 1, pz);
}

describe('grooveWidth / grooveDepth', () => {
  // UT-V-01: 強さに対して単調増加、想定レンジ内
  it('強さに応じて太さ・深さが増える', () => {
    expect(grooveWidth(1)).toBeGreaterThan(grooveWidth(0.1));
    expect(grooveDepth(1)).toBeGreaterThan(grooveDepth(0.1));
    expect(grooveWidth(0.1)).toBeGreaterThan(0.04); // メッシュ解像度(0.033)より太い
    expect(grooveDepth(1)).toBeLessThan(0.1); // 繊細な線の範囲
  });
});

describe('GrooveStroke.apply', () => {
  // UT-V-02: 線幅の外の頂点は不変
  it('線幅の外は位置が変化しない', () => {
    const mesh = createShape('sphere');
    const before = mesh.positions.slice();
    const stroke = new GrooveStroke(mesh.positions.length / 3);
    stroke.apply(mesh, FROM, TO, STRENGTH);
    const width = grooveWidth(STRENGTH);
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      if (distToSegment(mesh, i) >= width + 0.05) {
        expect(mesh.positions[i * 3]).toBe(before[i * 3]);
        expect(mesh.positions[i * 3 + 1]).toBe(before[i * 3 + 1]);
        expect(mesh.positions[i * 3 + 2]).toBe(before[i * 3 + 2]);
      }
    }
  });

  // UT-V-03: 線上の頂点は法線と逆方向(内側)へ凹む
  it('線に沿って内側へ彫られる', () => {
    const mesh = createShape('sphere');
    const before = mesh.positions.slice();
    const stroke = new GrooveStroke(mesh.positions.length / 3);
    const affected = stroke.apply(mesh, FROM, TO, STRENGTH);
    expect(affected).toBeGreaterThan(0);
    let carvedCount = 0;
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      const dy = mesh.positions[i * 3 + 1] - before[i * 3 + 1];
      if (dy !== 0) {
        expect(dy).toBeLessThan(0); // 法線(+Y)と逆方向
        carvedCount++;
      }
    }
    expect(carvedCount).toBeGreaterThan(5); // 線分に沿って複数頂点が連続的に彫られる
  });

  // UT-V-04: 最大変位はほぼ目標深さ(V字の谷)で、深さを超えない
  it('彫りの深さが目標深さに一致する', () => {
    const mesh = createShape('sphere');
    const before = mesh.positions.slice();
    const stroke = new GrooveStroke(mesh.positions.length / 3);
    stroke.apply(mesh, FROM, TO, STRENGTH);
    const depth = grooveDepth(STRENGTH);
    let maxDisp = 0;
    for (let i = 0; i < mesh.positions.length; i++) {
      maxDisp = Math.max(maxDisp, Math.abs(mesh.positions[i] - before[i]));
    }
    expect(maxDisp).toBeLessThanOrEqual(depth + 1e-6);
    expect(maxDisp).toBeGreaterThan(depth * 0.6); // 谷はほぼ目標深さまで届く
  });

  // UT-V-05: 同一ストローク内で同じ線分を重ねても深くならない(実物の一筆と同じ)
  it('1ストローク内の重ね彫りで深さが増えない', () => {
    const mesh = createShape('sphere');
    const stroke = new GrooveStroke(mesh.positions.length / 3);
    stroke.apply(mesh, FROM, TO, STRENGTH);
    const afterFirst = mesh.positions.slice();
    const affected = stroke.apply(mesh, FROM, TO, STRENGTH);
    expect(affected).toBe(0);
    expect(mesh.positions).toEqual(afterFirst);
  });

  // UT-V-06: 新しいストローク(引き直し)では追加で深くなる
  it('ストロークを重ねると深くなる', () => {
    const mesh = createShape('sphere');
    const s1 = new GrooveStroke(mesh.positions.length / 3);
    s1.apply(mesh, FROM, TO, STRENGTH);
    const afterFirst = mesh.positions.slice();
    const s2 = new GrooveStroke(mesh.positions.length / 3);
    const affected = s2.apply(mesh, FROM, TO, STRENGTH);
    expect(affected).toBeGreaterThan(0);
    // 谷の頂点がさらに下がっている
    let deepened = false;
    for (let i = 1; i < mesh.positions.length; i += 3) {
      if (mesh.positions[i] < afterFirst[i] - 1e-6) deepened = true;
    }
    expect(deepened).toBe(true);
  });

  // UT-V-07: 連続する線分(折れ線)の継ぎ目で二重に彫られない
  it('折れ線の継ぎ目が二重彫りにならない', () => {
    const mid: BrushHit = { point: [0, 1, 0], normal: [0, 1, 0] };
    const meshSeg = createShape('sphere');
    const s = new GrooveStroke(meshSeg.positions.length / 3);
    s.apply(meshSeg, FROM, mid, STRENGTH);
    s.apply(meshSeg, mid, TO, STRENGTH);
    const depth = grooveDepth(STRENGTH);
    const before = createShape('sphere').positions;
    let maxDisp = 0;
    for (let i = 0; i < meshSeg.positions.length; i++) {
      maxDisp = Math.max(maxDisp, Math.abs(meshSeg.positions[i] - before[i]));
    }
    expect(maxDisp).toBeLessThanOrEqual(depth + 1e-6);
  });

  // UT-V-08: 長さゼロの線分(クリックのみ)でも安全に動作する
  it('長さゼロの線分でも例外なく点彫りになる', () => {
    const mesh = createShape('sphere');
    const stroke = new GrooveStroke(mesh.positions.length / 3);
    const affected = stroke.apply(mesh, FROM, FROM, STRENGTH);
    expect(affected).toBeGreaterThan(0);
  });
});
