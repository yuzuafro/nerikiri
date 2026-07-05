import { applyBrush } from '../core/brushes';
import { GrooveStroke, grooveWidth } from '../core/groove';
import { recomputeNormals } from '../core/normals';
import type { BrushHit, BrushParams, ClayMeshData } from '../core/types';
import type { ClayScene } from '../render/ClayScene';

export interface SculptCallbacks {
  getMesh(): ClayMeshData;
  getBrush(): BrushParams;
  onStrokeEnd(): void; // 変更のあったストローク確定時(履歴push用)
}

/**
 * ポインタ入力 → レイキャスト → ブラシ適用のストローク制御。
 * 左ボタンのみスカルプトに使い、右・中ボタンはカメラ操作(ClayScene)に委ねる。
 * 三角棒(sankaku)は点ブラシではなく、手ぶれ補正した軌跡の線分彫りで適用する。
 */
export class SculptController {
  private sculpting = false;
  private strokeChanged = false;
  private lastApplyTime = 0;

  // 三角棒ストロークの状態
  private groove: GrooveStroke | null = null;
  private smoothHit: BrushHit | null = null;

  /** ブラシ適用の最短間隔(ms)。高頻度のpointermoveでも効きすぎないよう制限する */
  private static readonly APPLY_INTERVAL_MS = 25;

  /** 三角棒の手ぶれ補正(指数移動平均)の追従率。小さいほど直線的になる */
  private static readonly SMOOTHING_ALPHA = 0.25;

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
    if (this.cb.getBrush().kind === 'sankaku') {
      const mesh = this.cb.getMesh();
      this.groove = new GrooveStroke(mesh.positions.length / 3);
      this.smoothHit = hit;
    }
    this.scene.domElement.setPointerCapture(e.pointerId);
    this.applyAt(e.clientX, e.clientY);
  };

  private onMove = (e: PointerEvent): void => {
    const hit = this.scene.raycast(e.clientX, e.clientY);
    this.scene.showCursor(hit, this.cursorRadius());
    if (this.sculpting) this.applyAt(e.clientX, e.clientY);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.button !== 0 && e.type !== 'pointercancel') return;
    this.endStroke();
  };

  private onLeave = (): void => {
    if (!this.sculpting) this.scene.showCursor(null, 0);
  };

  /** カーソルリングの半径。三角棒は道具固有の線幅を表示する */
  private cursorRadius(): number {
    const brush = this.cb.getBrush();
    return brush.kind === 'sankaku' ? grooveWidth(brush.strength) : brush.radius;
  }

  private applyAt(x: number, y: number): void {
    const now = performance.now();
    if (now - this.lastApplyTime < SculptController.APPLY_INTERVAL_MS) return;
    const hit = this.scene.raycast(x, y);
    if (!hit) return;
    this.lastApplyTime = now;

    const mesh = this.cb.getMesh();
    const brush = this.cb.getBrush();
    let affected = 0;

    if (brush.kind === 'sankaku' && this.groove && this.smoothHit) {
      // 手ぶれ補正: 生のヒット位置を指数移動平均でならし、直線的な軌跡にする
      const a = SculptController.SMOOTHING_ALPHA;
      const prev = this.smoothHit;
      const sm: BrushHit = {
        point: [
          prev.point[0] + (hit.point[0] - prev.point[0]) * a,
          prev.point[1] + (hit.point[1] - prev.point[1]) * a,
          prev.point[2] + (hit.point[2] - prev.point[2]) * a,
        ],
        normal: normalizeLerp(prev.normal, hit.normal, a),
      };
      affected = this.groove.apply(mesh, prev, sm, brush.strength);
      this.smoothHit = sm;
    } else {
      affected = applyBrush(mesh, hit, brush);
    }

    if (affected > 0) {
      this.strokeChanged = true;
      recomputeNormals(mesh);
      this.scene.updateFromData(mesh);
    }
  }

  private endStroke(): void {
    if (!this.sculpting) return;
    this.sculpting = false;
    this.groove = null;
    this.smoothHit = null;
    if (this.strokeChanged) this.cb.onStrokeEnd();
  }
}

function normalizeLerp(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const x = a[0] + (b[0] - a[0]) * t;
  const y = a[1] + (b[1] - a[1]) * t;
  const z = a[2] + (b[2] - a[2]) * t;
  const len = Math.hypot(x, y, z);
  if (len < 1e-12) return [...b];
  return [x / len, y / len, z / len];
}
