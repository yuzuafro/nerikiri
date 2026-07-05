export interface Snapshot {
  positions: Float32Array;
  colors: Float32Array;
}

/**
 * スナップショット方式のUndo/Redo履歴。
 * 初期状態を含め limit + 1 件まで保持し、超過時は最古を破棄する。
 */
export class History {
  private snapshots: Snapshot[] = [];
  private cursor = -1; // 現在状態を指す

  constructor(private readonly limit = 50) {}

  /** 現在状態を履歴に積む。Redo可能だった分岐は破棄される。 */
  push(positions: Float32Array, colors: Float32Array): void {
    this.snapshots.length = this.cursor + 1; // redo分岐を破棄
    this.snapshots.push({
      positions: positions.slice(),
      colors: colors.slice(),
    });
    if (this.snapshots.length > this.limit + 1) {
      this.snapshots.shift();
    }
    this.cursor = this.snapshots.length - 1;
  }

  canUndo(): boolean {
    return this.cursor > 0;
  }

  canRedo(): boolean {
    return this.cursor < this.snapshots.length - 1;
  }

  /** 1つ前の状態のコピーを返す。不可なら null。 */
  undo(): Snapshot | null {
    if (!this.canUndo()) return null;
    this.cursor--;
    return this.copyAt(this.cursor);
  }

  /** 1つ先の状態のコピーを返す。不可なら null。 */
  redo(): Snapshot | null {
    if (!this.canRedo()) return null;
    this.cursor++;
    return this.copyAt(this.cursor);
  }

  clear(): void {
    this.snapshots = [];
    this.cursor = -1;
  }

  private copyAt(i: number): Snapshot {
    const s = this.snapshots[i];
    return { positions: s.positions.slice(), colors: s.colors.slice() };
  }
}
