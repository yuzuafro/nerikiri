# 詳細設計書

**プロジェクト名**: 粘土細工シミュレーション Webアプリケーション「nendo」
**作成日**: 2026-07-05
**版数**: 1.3
**関連文書**: 03_basic-design.md

**改訂履歴**

| 版数 | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-07-05 | 初版 |
| 1.1 | 2026-07-05 | 操作感フィードバック対応: 変位量を練り切り向けに減衰(基準変位 0.15→0.05、既定強さ 0.5→0.3)、ブラシ適用の頻度制限(25ms)追加、「つまむ」を接線方向ピンチ(畝立て)に変更、道具説明の常時表示を追加 |
| 1.2 | 2026-07-05 | 初期形状を「球・基本形(練り切りプロファイル)」の2種に変更。作業台グリッド・正面マーカー(▲)・高さ目盛りポールを追加し、初期カメラを俯瞰視点に変更 |
| 1.3 | 2026-07-05 | 接地感の改善: ワイヤーフレームの台を無垢の「まな板」(影を受ける板)に変更し、粘土から影を落とす。基本形の高さを約1.1→約1.4に増加(実物の高さ/直径比≈0.67に相当) |

---

## 1. コア層詳細設計

### 1.1 `src/core/types.ts` — 共通型定義

```ts
export interface ClayMeshData {
  positions: Float32Array;  // 長さ = 頂点数 × 3
  normals:   Float32Array;  // 長さ = 頂点数 × 3
  colors:    Float32Array;  // 長さ = 頂点数 × 3(RGB, 0..1)
  indices:   Uint32Array;   // 長さ = 三角形数 × 3
}

export type BrushKind =
  | 'pull' | 'push' | 'smooth' | 'pinch' | 'inflate' | 'flatten' | 'paint';

export interface BrushParams {
  kind: BrushKind;
  radius: number;      // 0.05..0.8
  strength: number;    // 0.1..1.0
  color: [number, number, number]; // paint 用 RGB(0..1)
}

export interface BrushHit {
  point:  [number, number, number]; // 粘土表面上のヒット点
  normal: [number, number, number]; // ヒット点の面法線(正規化済)
}

export type ShapeKind = 'sphere' | 'nerikiri';
```

### 1.2 `src/core/geometry.ts` — 形状生成

| 関数 | 仕様 |
|---|---|
| `createIcosphere(subdivisions: number, radius: number): {positions, indices}` | 正二十面体を `subdivisions` 回細分化し半径 `radius` の球面へ射影する。エッジ中点は Map(キー: 頂点ペア文字列)で共有し重複頂点を作らない。レベル4で頂点2,562・三角形5,120 |
| `createShape(kind: ShapeKind): ClayMeshData` | イコスフィア(レベル4, 半径1)を生成後、`kind` に応じたプロファイルを適用し、法線を再計算、色は初期色(白 `#f5f0e8` 相当)で塗りつぶして返す |

プリセット(F-01-03、v1.2で全面改訂)。いずれも底面 y=-1(まな板に接地):

| kind | 形状 | 変換(単位球の頂点 (x, y, z) に対して) |
|---|---|---|
| `sphere` | 球(丸めた直後の生地) | 恒等変換 |
| `nerikiri` | 練り切り基本形(上面が平ら・下すぼみ) | 上半球: `y' = (y - y³/3) × 1.05`(y=1 で勾配0 → 平らな上面)/ 下半球: `y' = y × 0.7`。水平: `(x,z) × 1.05 × (1 - 0.18·max(0,-y))`(下ほどすぼむ)。全体を `y' - 0.3` して底面を y=-1 に合わせる。高さ約1.40・幅約2.10(実物の高さ/直径比 ≈ 0.67 相当。v1.3で高さ増) |

**イコスフィア細分化アルゴリズム**
1. 黄金比 φ から正二十面体の12頂点・20面を定義する。
2. 各細分化パスで三角形1枚を4枚に分割する。エッジ中点のインデックスは `min(i,j)*N + max(i,j)` をキーにキャッシュし共有する。
3. 全頂点を正規化し `radius` 倍して球面へ射影する。

### 1.3 `src/core/brushes.ts` — ブラシ演算

```ts
export function falloff(dist: number, radius: number): number;
export function applyBrush(mesh: ClayMeshData, hit: BrushHit, params: BrushParams): number;
// 戻り値: 影響を受けた頂点数(0 = 変更なし)
```

**フォールオフ(F-03-10)**: `t = clamp(1 - dist/radius, 0, 1)` に対し `w = t*t*(3-2t)`(smoothstep)。`dist ≥ radius` で 0、`dist = 0` で 1。

**共通処理**: 全頂点を走査し、`hit.point` からの距離 `d < radius` の頂点 i に重み `w_i = falloff(d, radius)` を計算して各ブラシの変位則を適用する。1適用あたりの基準変位量 `step = strength * radius * 0.05`(半径に比例。練り切りの繊細な手作業を想定し控えめに設定。v1.1で0.15から減衰)。

| kind | 変位則(頂点 p、重み w) | 対応要件 |
|---|---|---|
| `pull` | `p += hit.normal * step * w` | F-03-03 |
| `push` | `p -= hit.normal * step * w` | F-03-02 |
| `smooth` | 隣接頂点平均 `avg(p)` へ `p += (avg - p) * strength * 0.35 * w`。隣接関係は indices から遅延構築し WeakMap でキャッシュ | F-03-04 |
| `pinch` | ヒット点への差分 `t = hit.point - p` の**接線成分** `t⊥ = t - hit.normal * dot(t, hit.normal)` で寄せ集め、わずかに持ち上げる: `p += t⊥ * strength * 0.1 * w + hit.normal * step * 0.5 * w`。生地を指先で寄せて畝・エッジを立てる練り切りの「摘み」を再現(v1.1で3D引き寄せから変更) | F-03-05 |
| `inflate` | 頂点自身の法線方向 `p += n_p * step * 0.8 * w` | F-03-06 |
| `flatten` | ヒット点・法線の定める接平面へ射影 `p -= hit.normal * dot(p - hit.point, hit.normal) * strength * 0.4 * w` | F-03-07 |
| `paint` | `c += (color - c) * min(1, strength * 1.5) * w`(位置は不変) | F-04-01 |

**設計上の性質(単体テストで検証)**
- 影響半径外の頂点は位置・色とも完全に不変。
- `push` と `pull` は同一パラメータで対称(符号のみ逆)。
- `smooth` は凸凹の分散を減少させる(極値頂点が隣接平均へ近づく)。
- `paint` は位置を変えない。`flatten` は平面距離を縮める。

### 1.4 `src/core/normals.ts` — 法線再計算

```ts
export function recomputeNormals(mesh: ClayMeshData): void;
```

1. `normals` を 0 クリア。
2. 各三角形の面法線(外積、非正規化 = 面積重み)を3頂点に加算。
3. 各頂点法線を正規化(ゼロベクトルは (0,1,0) にフォールバック)。

計算量 O(三角形数 + 頂点数)。

### 1.5 `src/core/history.ts` — 履歴管理

```ts
export class History {
  constructor(limit = 50);
  push(positions: Float32Array, colors: Float32Array): void; // コピーして保存、Redoスタック破棄
  undo(): Snapshot | null;  // 戻り先スナップショット(なければ null)
  redo(): Snapshot | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}
```

- 内部は `snapshots: Snapshot[]` と `cursor`(現在位置)。`push` 時に cursor 以降を破棄して追加。
- 保持数が `limit + 1`(現在状態 + 履歴50)を超えたら先頭を破棄(F-05-03)。
- `undo()` は cursor を1つ戻しそのスナップショットを返す。cursor が先頭なら null。
- スナップショットは呼び出し側配列のコピー(`slice()`)。返却値もコピーを返し、内部状態の破壊を防ぐ。

### 1.6 `src/core/serialization.ts` — 保存・読込

```ts
export function serializeMesh(mesh: ClayMeshData, shape: ShapeKind): string; // JSON文字列
export function deserializeMesh(json: string): { mesh: ClayMeshData; shape: ShapeKind }; // 失敗時 throw
```

**deserialize バリデーション(F-06-04)** — いずれか不成立で `Error` を throw:
1. JSONとしてパース可能。
2. `format === 'nendo-clay'` かつ `version === 1`。
3. `positions` / `colors` / `indices` が数値配列。
4. `positions.length === colors.length` かつ両者が3の倍数、`indices.length` が3の倍数。
5. `indices` の全要素が `0 ≤ idx < 頂点数` の整数。
6. `shape` が既知の `ShapeKind`(不明時は `'sphere'` にフォールバック)。

法線は復元後に `recomputeNormals` で再生成する。

## 2. 描画層詳細設計 — `src/render/ClayScene.ts`

```ts
export class ClayScene {
  constructor(container: HTMLElement);
  setMesh(data: ClayMeshData): void;          // BufferGeometry 再構築(読込・リセット時)
  updateFromData(data: ClayMeshData): void;   // 位置/法線/色属性の needsUpdate 反映(毎ストローク)
  raycast(clientX, clientY): BrushHit | null; // 画面座標→粘土表面ヒット
  showCursor(hit: BrushHit | null, radius: number): void; // ブラシリング表示
  setCameraEnabled(on: boolean): void;
  dispose(): void;
}
```

| 項目 | 設定 |
|---|---|
| カメラ | PerspectiveCamera fov=45、初期位置 (0, 2.4, 5.6)、注視点 (0, -0.35, 0)。作業台全体と正面マーカーが初期視界に入る俯瞰視点(v1.2変更) |
| まな板 | BoxGeometry 4.6×0.14×3.4、木色 #c8a478、上面 y=-1.0(粘土底面が接地)。`receiveShadow` で粘土の影を受ける(F-01-04、v1.3変更) |
| 影 | renderer.shadowMap 有効(PCFSoft)。キーライトが castShadow(mapSize 1024、範囲±2.5)、粘土メッシュが castShadow。接地感の主要因 |
| 中心ガイド | PolarGridHelper 半径1.6 をまな板上面(y=-0.995)に不透明度0.35で重ねる(中心合わせ用) |
| 正面マーカー | ▲(ConeGeometry、橙 #e07b3a)をまな板の手前 (0, -0.98, 1.5) に配置、先端は粘土方向。初期カメラから見て手前=正面 |
| 高さ目盛り | 左手前 (-1.25, ・, 1.35) に高さ2.0のポール+0.5刻みの目盛り線4本(F-01-04) |
| カメラ操作 | OrbitControls。回転=右ボタン、ズーム=ホイール、パン=中ボタン。左ボタンは無効化(F-02-03)。zoom範囲 1.6〜8 |
| ライト | HemisphereLight(空色/地面色) + DirectionalLight(キー、影なし) + 弱い DirectionalLight(フィル) |
| 粘土マテリアル | MeshStandardMaterial { vertexColors: true, roughness: 0.9, metalness: 0 } — マットな粘土質感(F-01-02) |
| 背景 | 暖色系の淡いグラデーション(和菓子の雰囲気) |
| カーソル | ヒット点に接平面向きのリング(RingGeometry)。半径=ブラシ半径。非ヒット時は非表示(F-03-11) |
| リサイズ | ResizeObserver でコンテナ追従 |

`raycast` は Three.js の `Raycaster` を粘土メッシュに対して実行し、`face.normal`(ワールド変換済)とヒット点を返す。

## 3. アプリ層詳細設計

### 3.1 `src/app/SculptController.ts`

ポインタイベントの状態機械:

| 状態 | イベント | 遷移・動作 |
|---|---|---|
| idle | pointerdown(左) & 粘土ヒット | sculpting へ。`onStrokeStart()` 通知、ブラシ1回適用 |
| idle | pointermove | カーソルリング更新のみ |
| sculpting | pointermove | レイキャスト再実行、ヒット時ブラシ適用 + 法線再計算 + `updateFromData` |
| sculpting | pointerup / pointerleave | idle へ。変更があれば `onStrokeEnd()` 通知(履歴確定) |

- `setPointerCapture` により、ドラッグ中にビューポート外へ出てもストロークを追跡する。
- ブラシ適用はpointermoveイベント駆動だが、**最短適用間隔 25ms** のスロットリングを行う(v1.1追加)。高レートのマウス(120Hz以上)でも適用回数が毎秒約40回に抑えられ、ポインティングデバイスによらず繊細な操作感となる。

### 3.2 `src/app/App.ts` — 状態管理・結線

保持する状態:

```ts
{ mesh: ClayMeshData; shape: ShapeKind; brush: BrushParams; history: History }
```

| 操作 | 処理 |
|---|---|
| 起動 | `createShape('sphere')` → ClayScene 構築 → Toolbar 構築 → History に初期状態 push |
| ストローク確定 | `history.push(positions, colors)`、Undo/Redoボタン状態更新 |
| Undo/Redo | `history.undo()/redo()` の結果を mesh に書き戻し、`recomputeNormals` → `updateFromData` |
| 形状切替(F-01-03) | 確認なしで新形状生成(履歴には push するので Undo 可能) |
| 全体を塗る(F-04-02) | colors 全体を選択色で上書き、履歴 push |
| リセット(F-06-01) | `confirm()` 確認後、現在の shape で再生成、履歴 push |
| 保存(F-06-02) | `serializeMesh` → Blob → a[download] クリックで `nendo-<日時>.json` |
| 読込(F-06-03/04) | input[type=file] → `deserializeMesh`。成功: setMesh + 履歴 push / 失敗: `alert('ファイルを読み込めませんでした…')` で現状維持 |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Undo / Redo(F-05-04)。input フォーカス時は無視 |

### 3.3 `src/ui/Toolbar.ts`

- コンストラクタで DOM を構築し、コールバック集 `ToolbarCallbacks` を受け取る(UI層→アプリ層は関数呼び出しのみ。逆依存なし)。
- 公開メソッド: `setUndoEnabled(b)`, `setRedoEnabled(b)`, `setActiveTool(kind)`。
- ツールボタン7種 + スライダー2種(半径 0.05–0.8 step0.01 初期値0.3 / 強さ 0.1–1.0 step0.05 初期値0.3)+ パレット8色 + カラーピッカー + 全体を塗る + 形状2種(球/基本形、v1.2変更)+ Undo/Redo/リセット/保存/読込。
- 道具グリッドの直下に、選択中の道具の効果説明を常時表示する(`.tool-desc`。道具の違いを1行で伝える。v1.1追加)。

**パレット定義(F-04-03)**

| 名称 | HEX | | 名称 | HEX |
|---|---|---|---|---|
| 白(しろあん) | `#f5f0e8` | | 黄(きなこ) | `#e8c86a` |
| 桃(さくら) | `#f2b8c6` | | 紫(むらさきいも) | `#9b7cb6` |
| 紅(べに) | `#d8556c` | | 空(みずいろ) | `#a8cfe0` |
| 抹茶 | `#8faf6e` | | 小豆(こしあん) | `#6b4a3f` |

## 4. エントリ・画面

- `index.html`: `#app`(サイドパネル `#panel` + ビューポート `#viewport` + フッター操作ガイド)。`<script type="module" src="/src/main.ts">`。
- `src/main.ts`: DOMContentLoaded 後 `new App(document.getElementById('app'))`。WebGL 非対応例外を捕捉してメッセージ表示。
- `src/style.css`: ダーク基調 + 和色アクセント。パネル幅 220px 固定、ビューポートは残り全域。

## 5. 単体テスト設計(対象: コア層)

| テストファイル | 対象 | 主な観点 |
|---|---|---|
| `tests/geometry.test.ts` | geometry.ts | 頂点数・面数の理論値一致、全頂点が半径上、インデックス範囲、プリセットのスケール反映 |
| `tests/brushes.test.ts` | brushes.ts | フォールオフ境界値、各ブラシの変位方向、半径外不変、push/pull対称性、paintの位置不変、戻り値(影響頂点数) |
| `tests/normals.test.ts` | normals.ts | 単位長、球面法線=位置方向、退化時フォールバック |
| `tests/history.test.ts` | history.ts | undo/redo系列、redoスタック破棄、上限破棄、コピー独立性 |
| `tests/serialization.test.ts` | serialization.ts | 往復一致、不正入力6系統の throw、shapeフォールバック |

描画層・アプリ層・UI層は WebGL/DOM 依存のため結合テスト(手動)で確認する(06_integration-test-checklist)。
