/** 粘土メッシュの中心データ構造。トポロジー(indices)は生成後不変。 */
export interface ClayMeshData {
  positions: Float32Array; // (x,y,z) × 頂点数
  normals: Float32Array; // (x,y,z) × 頂点数
  colors: Float32Array; // (r,g,b) × 頂点数、各 0..1
  indices: Uint32Array; // 三角形インデックス
}

export type BrushKind =
  | 'pull'
  | 'push'
  | 'smooth'
  | 'pinch'
  | 'inflate'
  | 'flatten'
  | 'sankaku' // 三角棒(線引き)。点ブラシではなく線分彫りで適用される
  | 'paint';

export interface BrushParams {
  kind: BrushKind;
  radius: number; // 0.05..0.8(sankaku は半径不使用、太さ・深さは strength で決まる)
  strength: number; // 0.1..1.0
  color: [number, number, number]; // paint 用 RGB (0..1)
}

export interface BrushHit {
  point: [number, number, number];
  normal: [number, number, number]; // 正規化済み
}

export type ShapeKind = 'sphere' | 'nerikiri';

/** 初期粘土色(白あん) */
export const INITIAL_COLOR: [number, number, number] = [
  0xf5 / 255,
  0xf0 / 255,
  0xe8 / 255,
];
