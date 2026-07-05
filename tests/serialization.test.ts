import { describe, expect, it } from 'vitest';
import { createShape } from '../src/core/geometry';
import {
  deserializeMesh,
  serializeMesh,
} from '../src/core/serialization';

describe('serializeMesh / deserializeMesh', () => {
  // UT-S-01: 往復(serialize → deserialize)で位置・色・形状が一致
  it('往復で positions / colors / indices / shape が一致する', () => {
    const mesh = createShape('nerikiri');
    mesh.positions[0] += 0.123;
    mesh.colors[3] = 0.5;
    const json = serializeMesh(mesh, 'nerikiri');
    const restored = deserializeMesh(json);
    expect(restored.shape).toBe('nerikiri');
    expect(restored.mesh.positions).toEqual(mesh.positions);
    expect(restored.mesh.colors).toEqual(mesh.colors);
    expect(restored.mesh.indices).toEqual(mesh.indices);
  });

  // UT-S-02: 復元後に法線が再計算されている
  it('復元後の法線は単位長', () => {
    const mesh = createShape('sphere');
    const { mesh: restored } = deserializeMesh(serializeMesh(mesh, 'sphere'));
    for (let i = 0; i < restored.normals.length; i += 3) {
      const len = Math.hypot(
        restored.normals[i],
        restored.normals[i + 1],
        restored.normals[i + 2],
      );
      expect(len).toBeCloseTo(1, 4);
    }
  });

  // UT-S-03: JSON 構文エラーで throw
  it('不正なJSONで例外', () => {
    expect(() => deserializeMesh('{not json')).toThrow();
  });

  // UT-S-04: format 不一致で throw
  it('他形式のJSONで例外', () => {
    expect(() =>
      deserializeMesh(JSON.stringify({ format: 'other', version: 1 })),
    ).toThrow();
  });

  // UT-S-05: version 不一致で throw
  it('未対応バージョンで例外', () => {
    const mesh = createShape('sphere');
    const obj = JSON.parse(serializeMesh(mesh, 'sphere'));
    obj.version = 99;
    expect(() => deserializeMesh(JSON.stringify(obj))).toThrow();
  });

  // UT-S-06: 配列長不整合(positions と colors の不一致)で throw
  it('positions と colors の長さ不一致で例外', () => {
    const mesh = createShape('sphere');
    const obj = JSON.parse(serializeMesh(mesh, 'sphere'));
    obj.colors = obj.colors.slice(0, obj.colors.length - 3);
    expect(() => deserializeMesh(JSON.stringify(obj))).toThrow();
  });

  // UT-S-07: 範囲外インデックスで throw
  it('頂点数を超えるインデックスで例外', () => {
    const mesh = createShape('sphere');
    const obj = JSON.parse(serializeMesh(mesh, 'sphere'));
    obj.indices[0] = obj.positions.length; // 頂点数超過
    expect(() => deserializeMesh(JSON.stringify(obj))).toThrow();
  });

  // UT-S-08: 数値以外を含む配列で throw
  it('数値以外を含む頂点データで例外', () => {
    const mesh = createShape('sphere');
    const obj = JSON.parse(serializeMesh(mesh, 'sphere'));
    obj.positions[0] = 'abc';
    expect(() => deserializeMesh(JSON.stringify(obj))).toThrow();
  });

  // UT-S-09: 未知の shape は sphere にフォールバック
  it('不明な shape は sphere として復元', () => {
    const mesh = createShape('sphere');
    const obj = JSON.parse(serializeMesh(mesh, 'sphere'));
    obj.shape = 'unknown-shape';
    const restored = deserializeMesh(JSON.stringify(obj));
    expect(restored.shape).toBe('sphere');
  });

  // UT-S-10: 空データで throw
  it('空の頂点データで例外', () => {
    expect(() =>
      deserializeMesh(
        JSON.stringify({
          format: 'nendo-clay',
          version: 1,
          shape: 'sphere',
          positions: [],
          colors: [],
          indices: [],
        }),
      ),
    ).toThrow();
  });
});
