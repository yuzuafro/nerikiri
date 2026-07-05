import './style.css';
import { App } from './app/App';

function start(): void {
  const viewport = document.getElementById('viewport');
  const panel = document.getElementById('panel');
  if (!viewport || !panel) throw new Error('レイアウト要素が見つかりません');

  try {
    new App(viewport, panel);
  } catch (e) {
    viewport.innerHTML = `<div class="fatal">
      3D表示を初期化できませんでした。<br>
      WebGL 2.0 に対応したブラウザ(Chrome / Edge / Firefox / Safari の最新版)でお試しください。
    </div>`;
    console.error(e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
