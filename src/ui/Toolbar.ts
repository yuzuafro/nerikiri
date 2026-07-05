import type { BrushKind, ShapeKind } from '../core/types';

export interface ToolbarCallbacks {
  onToolSelect(kind: BrushKind): void;
  onRadiusChange(v: number): void;
  onStrengthChange(v: number): void;
  onColorSelect(hex: string): void;
  onFillAll(): void;
  onShapeSelect(kind: ShapeKind): void;
  onUndo(): void;
  onRedo(): void;
  onReset(): void;
  onSave(): void;
  onLoadFile(file: File): void;
}

/** 練り切りの定番色パレット(F-04-03) */
export const PALETTE: { name: string; hex: string }[] = [
  { name: '白(しろあん)', hex: '#f5f0e8' },
  { name: '桃(さくら)', hex: '#f2b8c6' },
  { name: '紅(べに)', hex: '#d8556c' },
  { name: '抹茶', hex: '#8faf6e' },
  { name: '黄(きなこ)', hex: '#e8c86a' },
  { name: '紫(むらさきいも)', hex: '#9b7cb6' },
  { name: '空(みずいろ)', hex: '#a8cfe0' },
  { name: '小豆(こしあん)', hex: '#6b4a3f' },
];

const TOOLS: { kind: BrushKind; label: string; title: string }[] = [
  { kind: 'pull', label: '引く', title: 'なでた場所を一方向に盛り上げる(角や先端づくり)' },
  { kind: 'push', label: '押す', title: 'なでた場所を凹ませる(指で押した跡)' },
  { kind: 'smooth', label: 'なめらか', title: '凹凸をならして表面を整える' },
  { kind: 'pinch', label: 'つまむ', title: '生地を指先で寄せて畝・エッジを立てる' },
  { kind: 'inflate', label: 'ふくらます', title: '丸みを保ったまま全体的にふっくらさせる' },
  { kind: 'flatten', label: 'ならす', title: 'ヘラで押さえるように面を平らにする' },
  { kind: 'paint', label: '塗る', title: '選択色をぼかしながら塗る' },
];

const SHAPES: { kind: ShapeKind; label: string; title: string }[] = [
  { kind: 'sphere', label: '球', title: '丸めた直後の生地' },
  {
    kind: 'nerikiri',
    label: '基本形',
    title: '上面が平らで下が少しすぼんだ、練り切りの基本の形',
  },
];

/** サイドパネルUIの構築とイベント配線。状態は持たず、通知はコールバック経由。 */
export class Toolbar {
  private toolButtons = new Map<BrushKind, HTMLButtonElement>();
  private toolDesc!: HTMLParagraphElement;
  private swatches = new Map<string, HTMLButtonElement>();
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private picker!: HTMLInputElement;

  constructor(
    root: HTMLElement,
    private cb: ToolbarCallbacks,
  ) {
    root.appendChild(this.section('道具', this.buildTools()));
    root.appendChild(this.section('ブラシ', this.buildSliders()));
    root.appendChild(this.section('色', this.buildColors()));
    root.appendChild(this.section('形', this.buildShapes()));
    root.appendChild(this.section('操作', this.buildActions()));
  }

  setActiveTool(kind: BrushKind): void {
    for (const [k, b] of this.toolButtons) {
      b.classList.toggle('active', k === kind);
    }
    const tool = TOOLS.find((t) => t.kind === kind);
    this.toolDesc.textContent = tool ? tool.title : '';
  }

  setActiveColor(hex: string): void {
    for (const [h, b] of this.swatches) {
      b.classList.toggle('active', h.toLowerCase() === hex.toLowerCase());
    }
    this.picker.value = hex;
  }

  setUndoEnabled(on: boolean): void {
    this.undoBtn.disabled = !on;
  }

  setRedoEnabled(on: boolean): void {
    this.redoBtn.disabled = !on;
  }

  private section(title: string, body: HTMLElement): HTMLElement {
    const sec = document.createElement('section');
    sec.className = 'panel-section';
    const h = document.createElement('h2');
    h.textContent = title;
    sec.append(h, body);
    return sec;
  }

  private buildTools(): HTMLElement {
    const wrap = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'tool-grid';
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.textContent = t.label;
      b.title = t.title;
      b.addEventListener('click', () => this.cb.onToolSelect(t.kind));
      this.toolButtons.set(t.kind, b);
      grid.appendChild(b);
    }
    this.toolDesc = document.createElement('p');
    this.toolDesc.className = 'tool-desc';
    wrap.append(grid, this.toolDesc);
    return wrap;
  }

  private buildSliders(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.appendChild(
      this.slider('半径', 0.05, 0.8, 0.01, 0.3, this.cb.onRadiusChange),
    );
    wrap.appendChild(
      this.slider('強さ', 0.1, 1.0, 0.05, 0.3, this.cb.onStrengthChange),
    );
    return wrap;
  }

  private slider(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement('label');
    row.className = 'slider-row';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => onChange(Number(input.value)));
    row.append(span, input);
    return row;
  }

  private buildColors(): HTMLElement {
    const wrap = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'swatch-grid';
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = c.hex;
      b.title = c.name;
      b.addEventListener('click', () => this.cb.onColorSelect(c.hex));
      this.swatches.set(c.hex, b);
      grid.appendChild(b);
    }
    wrap.appendChild(grid);

    const row = document.createElement('div');
    row.className = 'row';
    this.picker = document.createElement('input');
    this.picker.type = 'color';
    this.picker.value = PALETTE[1].hex;
    this.picker.title = '任意の色を選ぶ';
    this.picker.addEventListener('input', () =>
      this.cb.onColorSelect(this.picker.value),
    );
    const fill = document.createElement('button');
    fill.textContent = '全体を塗る';
    fill.addEventListener('click', () => this.cb.onFillAll());
    row.append(this.picker, fill);
    wrap.appendChild(row);
    return wrap;
  }

  private buildShapes(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    for (const s of SHAPES) {
      const b = document.createElement('button');
      b.textContent = s.label;
      b.title = s.title;
      b.addEventListener('click', () => this.cb.onShapeSelect(s.kind));
      row.appendChild(b);
    }
    return row;
  }

  private buildActions(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'action-list';

    const row1 = document.createElement('div');
    row1.className = 'row';
    this.undoBtn = document.createElement('button');
    this.undoBtn.textContent = '元に戻す';
    this.undoBtn.title = 'Ctrl+Z';
    this.undoBtn.addEventListener('click', () => this.cb.onUndo());
    this.redoBtn = document.createElement('button');
    this.redoBtn.textContent = 'やり直す';
    this.redoBtn.title = 'Ctrl+Y';
    this.redoBtn.addEventListener('click', () => this.cb.onRedo());
    row1.append(this.undoBtn, this.redoBtn);

    const reset = document.createElement('button');
    reset.textContent = 'リセット';
    reset.className = 'danger';
    reset.addEventListener('click', () => this.cb.onReset());

    const row2 = document.createElement('div');
    row2.className = 'row';
    const save = document.createElement('button');
    save.textContent = '保存';
    save.addEventListener('click', () => this.cb.onSave());
    const load = document.createElement('button');
    load.textContent = '読み込み';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) this.cb.onLoadFile(f);
      fileInput.value = '';
    });
    load.addEventListener('click', () => fileInput.click());
    row2.append(save, load, fileInput);

    wrap.append(row1, reset, row2);
    return wrap;
  }
}
