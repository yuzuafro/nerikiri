import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BrushHit, ClayMeshData } from '../core/types';

/**
 * Three.js シーン管理。粘土メッシュの描画・カメラ操作・レイキャスト・
 * ブラシカーソル表示を担う。
 */
export class ClayScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clay: THREE.Mesh | null = null;
  private cursorRing: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#2b2723');

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // 作業台全体(正面マーカー・目盛り)が視界に入る俯瞰気味の初期視点
    this.camera.position.set(0, 2.4, 5.6);

    // カメラ操作: 回転=右 / パン=中。左はスカルプト専用(F-02-03)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, -0.35, 0); // 台上の粘土を見下ろす注視点
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 8;
    this.controls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    // ライティング: 粘土のマット質感が映える構成
    const hemi = new THREE.HemisphereLight('#fff4e0', '#5a4a3a', 0.9);
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(2.5, 3.5, 2.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2.5;
    key.shadow.camera.right = 2.5;
    key.shadow.camera.top = 2.5;
    key.shadow.camera.bottom = -2.5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.bias = -0.0005;
    const fill = new THREE.DirectionalLight('#cfe0ff', 0.35);
    fill.position.set(-2.5, -1.0, -2.0);
    this.scene.add(hemi, key, fill);

    // まな板: 粘土の底面 y=-1 がぴったり載る無垢の板。影を受けて接地感を出す(F-01-04)
    const BOARD_TOP = -1.0;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.14, 3.4),
      new THREE.MeshStandardMaterial({
        color: '#c8a478',
        roughness: 0.85,
        metalness: 0,
      }),
    );
    board.position.y = BOARD_TOP - 0.07; // 上面が y=-1
    board.receiveShadow = true;
    this.scene.add(board);

    // まな板上の同心円ガイド(中心合わせ用、控えめに)
    const grid = new THREE.PolarGridHelper(1.6, 8, 4, 48, '#8a7355', '#a88f6b');
    grid.position.y = BOARD_TOP + 0.005;
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.35;
    this.scene.add(grid);

    // 高さの目盛り: まな板の左手前に0.5刻み(粘土の高さの目安)
    const POLE_X = -1.25;
    const POLE_Z = 1.35;
    const tickMat = new THREE.LineBasicMaterial({ color: '#b09a75' });
    const tickGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.12, 0, 0),
      new THREE.Vector3(0.12, 0, 0),
    ]);
    for (let h = 1; h <= 4; h++) {
      const tick = new THREE.Line(tickGeo, tickMat);
      tick.position.set(POLE_X, BOARD_TOP + h * 0.5, POLE_Z);
      this.scene.add(tick);
    }
    const pole = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 2.0, 0),
      ]),
      tickMat,
    );
    pole.position.set(POLE_X, BOARD_TOP, POLE_Z);
    this.scene.add(pole);

    // 正面マーカー(▲): 初期カメラから見て手前が正面
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 4),
      new THREE.MeshBasicMaterial({ color: '#e07b3a' }),
    );
    marker.position.set(0, BOARD_TOP + 0.02, 1.5);
    marker.rotation.x = -Math.PI / 2; // 先端を粘土(中心)へ向ける
    this.scene.add(marker);

    // ブラシカーソルリング
    const ringGeo = new THREE.RingGeometry(0.92, 1.0, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#ffb84d',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    this.cursorRing = new THREE.Mesh(ringGeo, ringMat);
    this.cursorRing.visible = false;
    this.cursorRing.renderOrder = 999;
    this.scene.add(this.cursorRing);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });

    // デバッグ用フック(開発時のみ使用)
    (window as unknown as Record<string, unknown>).__nendoScene = this;
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** メッシュを新規構築する(起動・リセット・読込時)。 */
  setMesh(data: ClayMeshData): void {
    if (this.clay) {
      this.scene.remove(this.clay);
      this.clay.geometry.dispose();
      (this.clay.material as THREE.Material).dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    });
    this.clay = new THREE.Mesh(geo, mat);
    this.clay.castShadow = true;
    this.scene.add(this.clay);
  }

  /** ストローク中の属性更新を GPU に反映する。 */
  updateFromData(_data: ClayMeshData): void {
    if (!this.clay) return;
    const geo = this.clay.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }

  /** 画面座標から粘土表面へのレイキャスト。非ヒット時 null。 */
  raycast(clientX: number, clientY: number): BrushHit | null {
    if (!this.clay) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.clay, false);
    if (hits.length === 0 || !hits[0].face) return null;
    const h = hits[0];
    const n = h.face!.normal.clone().normalize();
    return {
      point: [h.point.x, h.point.y, h.point.z],
      normal: [n.x, n.y, n.z],
    };
  }

  /** ブラシ範囲リングの表示更新。hit=null で非表示。 */
  showCursor(hit: BrushHit | null, radius: number): void {
    if (!hit) {
      this.cursorRing.visible = false;
      return;
    }
    this.cursorRing.visible = true;
    this.cursorRing.scale.setScalar(radius);
    const p = new THREE.Vector3(...hit.point);
    const n = new THREE.Vector3(...hit.normal);
    this.cursorRing.position.copy(p).addScaledVector(n, 0.01);
    this.cursorRing.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      n,
    );
  }

  setCameraEnabled(on: boolean): void {
    this.controls.enabled = on;
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
