import { createShape } from '../core/geometry';
import { History } from '../core/history';
import { recomputeNormals } from '../core/normals';
import { deserializeMesh, serializeMesh } from '../core/serialization';
import type { BrushParams, ClayMeshData, ShapeKind } from '../core/types';
import { ClayScene } from '../render/ClayScene';
import { SculptController } from './SculptController';
import { Toolbar, PALETTE } from '../ui/Toolbar';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** アプリ全体の状態管理と各層の結線。 */
export class App {
  private mesh: ClayMeshData;
  private shape: ShapeKind = 'sphere';
  private brush: BrushParams = {
    kind: 'pull',
    radius: 0.3,
    strength: 0.3,
    color: hexToRgb(PALETTE[1].hex),
  };
  private history = new History(50);
  private scene: ClayScene;
  private toolbar: Toolbar;

  constructor(viewport: HTMLElement, panel: HTMLElement) {
    this.mesh = createShape(this.shape);

    this.scene = new ClayScene(viewport);
    this.scene.setMesh(this.mesh);

    this.toolbar = new Toolbar(panel, {
      onToolSelect: (kind) => {
        this.brush.kind = kind;
        this.toolbar.setActiveTool(kind);
      },
      onRadiusChange: (v) => (this.brush.radius = v),
      onStrengthChange: (v) => (this.brush.strength = v),
      onColorSelect: (hex) => {
        this.brush.color = hexToRgb(hex);
        this.toolbar.setActiveColor(hex);
        // 色を選んだら塗るツールに切替(1操作で塗り始められるように)
        this.brush.kind = 'paint';
        this.toolbar.setActiveTool('paint');
      },
      onFillAll: () => this.fillAll(),
      onShapeSelect: (kind) => this.setShape(kind),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onReset: () => this.reset(),
      onSave: () => this.save(),
      onLoadFile: (f) => void this.load(f),
    });
    this.toolbar.setActiveTool(this.brush.kind);
    this.toolbar.setActiveColor(PALETTE[1].hex);

    new SculptController(this.scene, {
      getMesh: () => this.mesh,
      getBrush: () => this.brush,
      onStrokeEnd: () => this.commit(),
    });

    window.addEventListener('keydown', this.onKeyDown);

    // 初期状態を履歴の起点として登録
    this.history.push(this.mesh.positions, this.mesh.colors);
    this.refreshHistoryButtons();
  }

  /** 現在状態を履歴に確定する。 */
  private commit(): void {
    this.history.push(this.mesh.positions, this.mesh.colors);
    this.refreshHistoryButtons();
  }

  private undo(): void {
    const snap = this.history.undo();
    if (!snap) return;
    this.restoreSnapshot(snap.positions, snap.colors);
  }

  private redo(): void {
    const snap = this.history.redo();
    if (!snap) return;
    this.restoreSnapshot(snap.positions, snap.colors);
  }

  private restoreSnapshot(positions: Float32Array, colors: Float32Array): void {
    // 頂点数が同じ場合はバッファ再利用、異なる場合(形状切替を跨ぐUndo)は再構築
    if (positions.length === this.mesh.positions.length) {
      this.mesh.positions.set(positions);
      this.mesh.colors.set(colors);
      recomputeNormals(this.mesh);
      this.scene.updateFromData(this.mesh);
    } else {
      this.mesh = {
        positions: positions.slice(),
        normals: new Float32Array(positions.length),
        colors: colors.slice(),
        indices: this.mesh.indices,
      };
      recomputeNormals(this.mesh);
      this.scene.setMesh(this.mesh);
    }
    this.refreshHistoryButtons();
  }

  private setShape(kind: ShapeKind): void {
    this.shape = kind;
    this.mesh = createShape(kind);
    this.scene.setMesh(this.mesh);
    this.commit();
  }

  private fillAll(): void {
    const [r, g, b] = this.brush.color;
    const { colors } = this.mesh;
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }
    this.scene.updateFromData(this.mesh);
    this.commit();
  }

  private reset(): void {
    if (!window.confirm('最初からやり直しますか?(この操作は元に戻せます)')) {
      return;
    }
    this.setShape(this.shape);
  }

  private save(): void {
    const json = serializeMesh(this.mesh, this.shape);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .slice(0, 15);
    a.href = url;
    a.download = `nerikiri-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async load(file: File): Promise<void> {
    try {
      const text = await file.text();
      const { mesh, shape } = deserializeMesh(text);
      this.mesh = mesh;
      this.shape = shape;
      this.scene.setMesh(this.mesh);
      this.commit();
    } catch (e) {
      window.alert(
        `ファイルを読み込めませんでした: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private refreshHistoryButtons(): void {
    this.toolbar.setUndoEnabled(this.history.canUndo());
    this.toolbar.setRedoEnabled(this.history.canRedo());
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && e.shiftKey) {
      e.preventDefault();
      this.redo();
    } else if (key === 'z') {
      e.preventDefault();
      this.undo();
    } else if (key === 'y') {
      e.preventDefault();
      this.redo();
    }
  };
}
