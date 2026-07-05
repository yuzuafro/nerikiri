import { describe, expect, it } from 'vitest';
import { createIcosphere, createShape } from '../src/core/geometry';
import { INITIAL_COLOR } from '../src/core/types';

describe('createIcosphere', () => {
  // UT-G-01: 細分化レベルごとの頂点数・三角形数が理論値と一致する
  it.each([
    [0, 12, 20],
    [1, 42, 80],
    [2, 162, 320],
    [3, 642, 1280],
    [4, 2562, 5120],
    [5, 10242, 20480],
  ])('レベル%iで頂点%i・三角形%i', (level, verts, tris) => {
    const { positions, indices } = createIcosphere(level, 1);
    expect(positions.length).toBe(verts * 3);
    expect(indices.length).toBe(tris * 3);
  });

  // UT-G-02: 全頂点が指定半径の球面上にある
  it('全頂点が半径上に射影される', () => {
    const r = 2.5;
    const { positions } = createIcosphere(3, r);
    for (let i = 0; i < positions.length; i += 3) {
      const len = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
      expect(len).toBeCloseTo(r, 5);
    }
  });

  // UT-G-03: インデックスがすべて頂点範囲内
  it('三角形インデックスが頂点数の範囲内', () => {
    const { positions, indices } = createIcosphere(2, 1);
    const vertexCount = positions.length / 3;
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertexCount);
    }
  });

  // UT-G-04: 重複頂点がない(エッジ中点の共有)
  it('重複頂点が生成されない', () => {
    const { positions } = createIcosphere(2, 1);
    const seen = new Set<string>();
    for (let i = 0; i < positions.length; i += 3) {
      const key = [positions[i], positions[i + 1], positions[i + 2]]
        .map((v) => v.toFixed(6))
        .join(',');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('createShape', () => {
  // UT-G-05: 球プリセットは半径1の球
  it('プリセット sphere は半径1', () => {
    const mesh = createShape('sphere');
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const len = Math.hypot(
        mesh.positions[i],
        mesh.positions[i + 1],
        mesh.positions[i + 2],
      );
      expect(len).toBeCloseTo(1, 4);
    }
  });

  // UT-G-08: 練り切り基本形 — 上面が平ら、下がすぼんだ形
  describe('プリセット nerikiri(基本形)', () => {
    const mesh = createShape('nerikiri');
    let maxY = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      maxY = Math.max(maxY, mesh.positions[i + 1]);
      minY = Math.min(minY, mesh.positions[i + 1]);
    }
    /** 高さ y±tol の帯にある頂点の最大水平半径 */
    const bandRadius = (y: number, tol: number): number => {
      let r = 0;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        if (Math.abs(mesh.positions[i + 1] - y) < tol) {
          r = Math.max(r, Math.hypot(mesh.positions[i], mesh.positions[i + 2]));
        }
      }
      return r;
    };

    const yMid = (maxY + minY) / 2;

    it('高さ≈1.4で幅≈2.1より低い(扁平)、底面は球と同じ y=-1', () => {
      expect(maxY).toBeCloseTo(0.4, 2);
      expect(minY).toBeCloseTo(-1.0, 2);
      expect(bandRadius(yMid, 0.06)).toBeGreaterThan(0.95); // 幅 ≈ 1.05
    });

    it('上面が平らに近い(頂上付近でも水平方向に広がる)', () => {
      // 頂上から高さ2%以内にある頂点の水平半径。球なら ≈0.2、平らな上面なら大きい
      const height = maxY - minY;
      let r = 0;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        if (mesh.positions[i + 1] >= maxY - height * 0.02) {
          r = Math.max(r, Math.hypot(mesh.positions[i], mesh.positions[i + 2]));
        }
      }
      expect(r).toBeGreaterThan(0.35);
    });

    it('下がすぼんでいる(中心から同じ高さで下側の半径が小さい)', () => {
      const topR = bandRadius(yMid + 0.3, 0.04);
      const bottomR = bandRadius(yMid - 0.3, 0.04);
      expect(bottomR).toBeLessThan(topR * 0.9);
    });
  });

  // UT-G-06: 初期色で全頂点が塗られている
  it('初期色(白あん)で塗りつぶされる', () => {
    const mesh = createShape('sphere');
    for (let i = 0; i < mesh.colors.length; i += 3) {
      expect(mesh.colors[i]).toBeCloseTo(INITIAL_COLOR[0], 5);
      expect(mesh.colors[i + 1]).toBeCloseTo(INITIAL_COLOR[1], 5);
      expect(mesh.colors[i + 2]).toBeCloseTo(INITIAL_COLOR[2], 5);
    }
  });

  // UT-G-07: 法線が計算済み(単位長)
  it('法線が正規化済みで返る', () => {
    const mesh = createShape('nerikiri');
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const len = Math.hypot(
        mesh.normals[i],
        mesh.normals[i + 1],
        mesh.normals[i + 2],
      );
      expect(len).toBeCloseTo(1, 4);
    }
  });
});
