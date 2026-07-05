# nendo — 粘土細工シミュレーター

Webブラウザ上で粘土細工を楽しめる3Dモデリングシミュレーションアプリ。
将来的に和菓子「練り切り」の成形シミュレーションへの発展を想定しています。

## 使い方

```bash
npm install
npm run dev      # 開発サーバー起動 → http://localhost:5173
npm test         # 単体テスト(Vitest)
npm run build    # 本番ビルド(dist/ に静的ファイル出力)
```

## 操作方法

| 操作 | 動作 |
|---|---|
| 左ドラッグ | 粘土の変形・彩色(選択中の道具) |
| 右ドラッグ | カメラ回転 |
| ホイール | ズーム |
| Ctrl+Z / Ctrl+Y | 元に戻す / やり直す |

道具: 引く / 押す / なめらか / つまむ / ふくらます / ならす / 塗る。
色は練り切りの定番8色パレット+カラーピッカー。初期形状は「球」と「基本形」(上面が平らで下がすぼんだ練り切りの基本の形)から選択可能。
粘土はまな板の上に接地して置かれ(影付き)、▲マークが正面、左手前のポールが高さの目安(0.5刻み)を示します。
作品はJSONファイルとして保存・読み込みできます。

## 開発ドキュメント

| フェーズ | 成果物 |
|---|---|
| 要求仕様 | [docs/01_requirements-spec.md](docs/01_requirements-spec.md) |
| 要件定義 | [docs/02_requirements-definition.md](docs/02_requirements-definition.md) |
| 基本設計 | [docs/03_basic-design.md](docs/03_basic-design.md) |
| 詳細設計 | [docs/04_detailed-design.md](docs/04_detailed-design.md) |
| 実装 | `src/`(コア層 `core/` は描画非依存の純ロジック) |
| 単体テスト | `tests/` + [docs/05_unit-test-checklist.md](docs/05_unit-test-checklist.md) |
| 結合テスト | [docs/06_integration-test-checklist.md](docs/06_integration-test-checklist.md) |

## 技術構成

- TypeScript 5 / Vite 5 / Three.js / Vitest
- 頂点変位ベースの自前スカルプトエンジン(イコスフィア細分化レベル4、2,562頂点)
- サーバー不要。ビルド成果物は静的ホスティングでそのまま公開可能
