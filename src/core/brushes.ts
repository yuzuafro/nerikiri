import type { BrushHit, BrushParams, ClayMeshData } from './types';

/**
 * ブラシのフォールオフ(smoothstep)。中心で1、半径以上で0。
 */
export function falloff(dist: number, radius: number): number {
  if (radius <= 0) return 0;
  const t = Math.min(Math.max(1 - dist / radius, 0), 1);
  return t * t * (3 - 2 * t);
}

// 隣接頂点リスト(smooth用)。indices 配列単位でキャッシュする。
const adjacencyCache = new WeakMap<Uint32Array, number[][]>();

function getAdjacency(indices: Uint32Array, vertexCount: number): number[][] {
  const cached = adjacencyCache.get(indices);
  if (cached) return cached;
  const sets: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f];
    const b = indices[f + 1];
    const c = indices[f + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  const adj = sets.map((s) => [...s]);
  adjacencyCache.set(indices, adj);
  return adj;
}

/**
 * ブラシを1回適用する。positions / colors を直接書き換える。
 * @returns 影響を受けた頂点数(0 = 変更なし)
 */
export function applyBrush(
  mesh: ClayMeshData,
  hit: BrushHit,
  params: BrushParams,
): number {
  const { positions, normals, colors } = mesh;
  const { kind, radius, strength } = params;
  const [hx, hy, hz] = hit.point;
  const [nx, ny, nz] = hit.normal;
  // 練り切りの繊細な手作業を想定した控えめな基準変位量
  const step = strength * radius * 0.05;
  const vertexCount = positions.length / 3;

  // smooth は変形前の座標を参照する(逐次更新による方向依存を避ける)
  const source = kind === 'smooth' ? positions.slice() : positions;
  const adjacency =
    kind === 'smooth' ? getAdjacency(mesh.indices, vertexCount) : null;

  let affected = 0;

  for (let i = 0; i < vertexCount; i++) {
    const ix = i * 3;
    const px = positions[ix];
    const py = positions[ix + 1];
    const pz = positions[ix + 2];
    const d = Math.hypot(px - hx, py - hy, pz - hz);
    if (d >= radius) continue;
    const w = falloff(d, radius);
    if (w <= 0) continue;
    affected++;

    switch (kind) {
      case 'pull':
        positions[ix] += nx * step * w;
        positions[ix + 1] += ny * step * w;
        positions[ix + 2] += nz * step * w;
        break;
      case 'push':
        positions[ix] -= nx * step * w;
        positions[ix + 1] -= ny * step * w;
        positions[ix + 2] -= nz * step * w;
        break;
      case 'smooth': {
        const neighbors = adjacency![i];
        if (neighbors.length === 0) break;
        let ax = 0;
        let ay = 0;
        let az = 0;
        for (const n of neighbors) {
          ax += source[n * 3];
          ay += source[n * 3 + 1];
          az += source[n * 3 + 2];
        }
        ax /= neighbors.length;
        ay /= neighbors.length;
        az /= neighbors.length;
        const k = strength * 0.35 * w;
        positions[ix] += (ax - px) * k;
        positions[ix + 1] += (ay - py) * k;
        positions[ix + 2] += (az - pz) * k;
        break;
      }
      case 'pinch': {
        // 接線方向に中心へ寄せ集め、わずかに持ち上げて畝(うね)を作る
        // (練り切りの「摘み」: 生地を指先で寄せてエッジを立てる操作)
        const tcx = hx - px;
        const tcy = hy - py;
        const tcz = hz - pz;
        const along = tcx * nx + tcy * ny + tcz * nz;
        const k = strength * 0.1 * w;
        const lift = step * 0.5 * w;
        positions[ix] += (tcx - nx * along) * k + nx * lift;
        positions[ix + 1] += (tcy - ny * along) * k + ny * lift;
        positions[ix + 2] += (tcz - nz * along) * k + nz * lift;
        break;
      }
      case 'inflate':
        positions[ix] += normals[ix] * step * 0.8 * w;
        positions[ix + 1] += normals[ix + 1] * step * 0.8 * w;
        positions[ix + 2] += normals[ix + 2] * step * 0.8 * w;
        break;
      case 'flatten': {
        // 接平面 (hit.point, hit.normal) への引き寄せ
        const dist =
          (px - hx) * nx + (py - hy) * ny + (pz - hz) * nz;
        const k = strength * 0.4 * w;
        positions[ix] -= nx * dist * k;
        positions[ix + 1] -= ny * dist * k;
        positions[ix + 2] -= nz * dist * k;
        break;
      }
      case 'paint': {
        const [cr, cg, cb] = params.color;
        const k = Math.min(1, strength * 1.5) * w;
        colors[ix] += (cr - colors[ix]) * k;
        colors[ix + 1] += (cg - colors[ix + 1]) * k;
        colors[ix + 2] += (cb - colors[ix + 2]) * k;
        break;
      }
    }
  }

  return affected;
}
