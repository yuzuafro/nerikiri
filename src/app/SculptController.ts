import { applyBrush } from '../core/brushes';
import { recomputeNormals } from '../core/normals';
import type { BrushParams, ClayMeshData } from '../core/types';
import type { ClayScene } from '../render/ClayScene';

export interface SculptCallbacks {
  getMesh(): ClayMeshData;
  getBrush(): BrushParams;
  onStrokeEnd(): void; // 変更のあったストローク確定時(履歴push用)
}

/**
 * ポインタ入力 → レイキャスト → ブラシ適用のストローク制御。
 * 左ボタンのみスカルプトに使い、右・中ボタンはカメラ操作(ClayScene)に委ねる。
 */
export class SculptController {
  private sculpting = false;
  private strokeChanged = false;
  private lastApplyTime = 0;

  /** ブラシ適用の最短間隔(ms)。高頻度のpointermoveでも効きすぎないよう制限する */
  private static readonly APPLY_INTERVAL_MS = 25;

  constructor(
    private scene: ClayScene,
    private cb: SculptCallbacks,
  ) {
    const el = scene.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const hit = this.scene.raycast(e.clientX, e.clientY);
    if (!hit) return;
    this.sculpting = true;
    this.strokeChanged = false;
    this.lastApplyTime = 0;
    this.scene.domElement.setPointerCapture(e.pointerId);
    this.applyAt(e.clientX, e.clientY);
  };

  private onMove = (e: PointerEvent): void => {
    const hit = this.scene.raycast(e.clientX, e.clientY);
    this.scene.showCursor(hit, this.cb.getBrush().radius);
    if (this.sculpting) this.applyAt(e.clientX, e.clientY);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.button !== 0 && e.type !== 'pointercancel') return;
    this.endStroke();
  };

  private onLeave = (): void => {
    if (!this.sculpting) this.scene.showCursor(null, 0);
  };

  private applyAt(x: number, y: number): void {
    const now = performance.now();
    if (now - this.lastApplyTime < SculptController.APPLY_INTERVAL_MS) return;
    const hit = this.scene.raycast(x, y);
    if (!hit) return;
    this.lastApplyTime = now;
    const mesh = this.cb.getMesh();
    const affected = applyBrush(mesh, hit, this.cb.getBrush());
    if (affected > 0) {
      this.strokeChanged = true;
      recomputeNormals(mesh);
      this.scene.updateFromData(mesh);
    }
  }

  private endStroke(): void {
    if (!this.sculpting) return;
    this.sculpting = false;
    if (this.strokeChanged) this.cb.onStrokeEnd();
  }
}
