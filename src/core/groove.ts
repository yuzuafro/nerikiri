import type { BrushHit, ClayMeshData } from './types';

/**
 * 三角棒(線引き)の線幅・深さ。実物の三角棒は道具の形が固定なので、
 * 半径スライダーではなく「強さ」(押し付ける力)だけで太さ・深さが決まる。
 */
export function grooveWidth(strength: number): number {
  return 0.045 + 0.055 * strength; // 0.05..0.10
}

export function grooveDepth(strength: number): number {
  return 0.015 + 0.05 * strength; // 0.02..0.065
}

/**
 * 三角棒の1ストローク。
 *
 * 現実の三角棒の挙動を模した線分彫り:
 * - 前回位置から現在位置までの「線分」に沿って彫る(点の連打ではないため、
 *   ポインタのサンプリング間隔によらず連続した溝になる)
 * - 断面はV字(線形減衰)— 三角棒の稜の跡
 * - ストローク中は頂点ごとの彫り済み深さを記録し、目標深さまでしか彫らない。
 *   同じ場所を何度なぞっても、一定の力で引いた1本の線として深さが揃う。
 *   ストロークを重ねる(引き直す)と深くなる
 */
export class GrooveStroke {
  /** 頂点ごとの彫り済み深さ(このストローク内) */
  private carved: Float32Array;

  constructor(vertexCount: number) {
    this.carved = new Float32Array(vertexCount);
  }

  /**
   * 線分 from→to に沿って彫る。positions を直接書き換える。
   * @returns 変位した頂点数(0 = 変更なし)
   */
  apply(
    mesh: ClayMeshData,
    from: BrushHit,
    to: BrushHit,
    strength: number,
  ): number {
    const { positions } = mesh;
    const width = grooveWidth(strength);
    const depth = grooveDepth(strength);

    // 彫る方向: 両端の面法線の平均(正規化)
    let nx = from.normal[0] + to.normal[0];
    let ny = from.normal[1] + to.normal[1];
    let nz = from.normal[2] + to.normal[2];
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-12) return 0;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    const [ax, ay, az] = from.point;
    const abx = to.point[0] - ax;
    const aby = to.point[1] - ay;
    const abz = to.point[2] - az;
    const abLen2 = abx * abx + aby * aby + abz * abz;

    const vertexCount = positions.length / 3;
    let affected = 0;

    for (let i = 0; i < vertexCount; i++) {
      const ix = i * 3;
      const pax = positions[ix] - ax;
      const pay = positions[ix + 1] - ay;
      const paz = positions[ix + 2] - az;

      // 線分上の最近点(パラメータ t を 0..1 に制限)
      let t = 0;
      if (abLen2 > 1e-12) {
        t = (pax * abx + pay * aby + paz * abz) / abLen2;
        t = Math.min(Math.max(t, 0), 1);
      }
      const dx = pax - abx * t;
      const dy = pay - aby * t;
      const dz = paz - abz * t;
      const d = Math.hypot(dx, dy, dz);
      if (d >= width) continue;

      // V字断面(線形減衰)
      const target = depth * (1 - d / width);
      const already = this.carved[i];
      if (target <= already) continue;

      const delta = target - already;
      positions[ix] -= nx * delta;
      positions[ix + 1] -= ny * delta;
      positions[ix + 2] -= nz * delta;
      this.carved[i] = target;
      affected++;
    }

    return affected;
  }
}
