import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';

function snap(v: number): [Float32Array, Float32Array] {
  return [new Float32Array([v, v, v]), new Float32Array([v / 10, 0, 0])];
}

describe('History', () => {
  // UT-H-01: 初期状態では undo も redo も不可
  it('空の履歴では undo/redo 不可', () => {
    const h = new History();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  // UT-H-02: push → undo で1つ前の状態が返る
  it('undo で直前の状態に戻る', () => {
    const h = new History();
    h.push(...snap(1));
    h.push(...snap(2));
    expect(h.canUndo()).toBe(true);
    const s = h.undo()!;
    expect(s.positions[0]).toBe(1);
    expect(h.canUndo()).toBe(false);
  });

  // UT-H-03: undo → redo で元に戻る
  it('redo で undo を取り消せる', () => {
    const h = new History();
    h.push(...snap(1));
    h.push(...snap(2));
    h.undo();
    expect(h.canRedo()).toBe(true);
    const s = h.redo()!;
    expect(s.positions[0]).toBe(2);
    expect(h.canRedo()).toBe(false);
  });

  // UT-H-04: undo 後の push で redo 分岐が破棄される
  it('undo 後に push すると redo 不可になる', () => {
    const h = new History();
    h.push(...snap(1));
    h.push(...snap(2));
    h.undo();
    h.push(...snap(3));
    expect(h.canRedo()).toBe(false);
    const s = h.undo()!;
    expect(s.positions[0]).toBe(1);
  });

  // UT-H-05: 上限を超えると最古が破棄される(要件: 30以上 → 実装は50)
  it('上限超過で最古のスナップショットが破棄される', () => {
    const h = new History(50);
    for (let i = 0; i <= 60; i++) h.push(...snap(i));
    // 51件保持(現在+50履歴)→ 50回まで undo 可能
    let count = 0;
    let last = null;
    while (h.canUndo()) {
      last = h.undo();
      count++;
    }
    expect(count).toBe(50);
    expect(last!.positions[0]).toBe(10); // 0..9 は破棄済み
  });

  // UT-H-06: 保存されたスナップショットは呼び出し側の配列と独立
  it('push 後に元配列を変更しても履歴に影響しない', () => {
    const h = new History();
    const [p, c] = snap(1);
    h.push(p, c);
    h.push(...snap(2));
    p[0] = 999;
    const s = h.undo()!;
    expect(s.positions[0]).toBe(1);
  });

  // UT-H-07: 返却スナップショットの変更が内部状態を壊さない
  it('返却値を書き換えても再取得結果は不変', () => {
    const h = new History();
    h.push(...snap(1));
    h.push(...snap(2));
    const s1 = h.undo()!;
    s1.positions[0] = 777;
    h.redo();
    const s2 = h.undo()!;
    expect(s2.positions[0]).toBe(1);
  });

  // UT-H-08: clear で全履歴が消える
  it('clear 後は undo/redo とも不可', () => {
    const h = new History();
    h.push(...snap(1));
    h.push(...snap(2));
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });
});
