// js/templates.js — Project template definitions + picker UI

// ── Template registry ──────────────────────────────────────────────────────────
// Each template is a function(name) → files[]
export const TEMPLATES = {

    blank: {
        label: 'Blank',
        icon:  '⬜',
        desc:  'Empty HTML file, ready to go.',
        files: (name) => [
            { name: 'index.html', type: 'file', isBinary: false, strategy: 'classic',
              content:
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
</head>
<body>

</body>
</html>` }
        ]
    },

    vanilla: {
        label: 'Vanilla JS',
        icon:  '🟨',
        desc:  'HTML + CSS + JS with ES module structure.',
        files: (name) => [
            { name: 'css',            type: 'folder' },
            { name: 'js',             type: 'folder' },
            { name: 'index.html',     type: 'file', isBinary: false, strategy: 'classic',
              content:
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="js/main.js"></script>
</body>
</html>` },
            { name: 'css/style.css',  type: 'file', isBinary: false, strategy: 'classic',
              content:
`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
#app { text-align: center; }` },
            { name: 'js/main.js',     type: 'file', isBinary: false, strategy: 'module',
              content:
`import { greet } from './utils.js';

const app = document.getElementById('app');
app.innerHTML = \`<h1>\${greet('${name}')}</h1>\`;` },
            { name: 'js/utils.js',    type: 'file', isBinary: false, strategy: 'module',
              content:
`export function greet(name) {
  return \`Hello from \${name}!\`;
}` }
        ]
    },

    threejs: {
        label: 'Three.js',
        icon:  '🔷',
        desc:  'Spinning cube with lights and orbit controls.',
        files: (name) => [
            { name: 'index.html', type: 'file', isBinary: false, strategy: 'classic',
              content:
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/"
    }
  }
  </script>
  <script type="module" src="js/main.js"></script>
</body>
</html>` },
            { name: 'js',         type: 'folder' },
            { name: 'js/main.js', type: 'file', isBinary: false, strategy: 'module',
              content:
`import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dir = new THREE.DirectionalLight(0xffffff, 1.5);
dir.position.set(5, 10, 5);
scene.add(dir);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshStandardMaterial({ color: 0x6366f1 })
);
scene.add(cube);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

(function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.005;
  cube.rotation.y += 0.008;
  controls.update();
  renderer.render(scene, camera);
})();` }
        ]
    },

    pixijs: {
        label: 'PixiJS',
        icon:  '🟣',
        desc:  'Bouncing sprites with PixiJS v8.',
        files: (name) => [
            { name: 'index.html', type: 'file', isBinary: false, strategy: 'classic',
              content:
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #111; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="module" src="js/main.js"></script>
</body>
</html>` },
            { name: 'js',         type: 'folder' },
            { name: 'js/main.js', type: 'file', isBinary: false, strategy: 'module',
              content:
`import { Application, Graphics } from 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs';

const app = new Application();
await app.init({ background: '#1a1a2e', resizeTo: window });
document.body.appendChild(app.canvas);

const balls = [];
for (let i = 0; i < 20; i++) {
  const g = new Graphics()
    .circle(0, 0, 12 + Math.random() * 18)
    .fill({ color: Math.random() * 0xffffff });
  g.x  = Math.random() * app.screen.width;
  g.y  = Math.random() * app.screen.height;
  g.vx = (Math.random() - 0.5) * 4;
  g.vy = (Math.random() - 0.5) * 4;
  app.stage.addChild(g);
  balls.push(g);
}

app.ticker.add(() => {
  for (const b of balls) {
    b.x += b.vx; b.y += b.vy;
    if (b.x < 0 || b.x > app.screen.width)  b.vx *= -1;
    if (b.y < 0 || b.y > app.screen.height) b.vy *= -1;
  }
});` }
        ]
    }
};

// ── Expose on window for HTML onclick handlers ─────────────────────────────────
window._TEMPLATES = Object.fromEntries(
    Object.entries(TEMPLATES).map(([k, v]) => [k, v.files])
);

// ── Selected template state ───────────────────────────────────────────────────
let _selectedTemplate = 'blank';

export function getSelectedTemplate() { return _selectedTemplate; }

// ── Render the template grid in the modal ─────────────────────────────────────
export function renderTemplateGrid() {
    const grid = document.getElementById('template-grid');
    if (!grid) return;
    grid.innerHTML = '';
    _selectedTemplate = 'blank';

    for (const [key, tpl] of Object.entries(TEMPLATES)) {
        const card = document.createElement('div');
        card.className = `template-card flex flex-col gap-1 p-4 rounded-xl border cursor-pointer transition-all select-none
            ${key === 'blank' ? 'border-indigo-500 bg-indigo-900/20' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'}`;
        card.dataset.key = key;
        card.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-2xl">${tpl.icon}</span>
                <span class="font-bold text-sm text-white">${tpl.label}</span>
            </div>
            <p class="text-[11px] text-zinc-400 leading-relaxed">${tpl.desc}</p>`;
        card.addEventListener('click', () => {
            _selectedTemplate = key;
            grid.querySelectorAll('.template-card').forEach(c => {
                const active = c.dataset.key === key;
                c.classList.toggle('border-indigo-500', active);
                c.classList.toggle('bg-indigo-900/20',  active);
                c.classList.toggle('border-zinc-700',   !active);
                c.classList.toggle('bg-zinc-900',       !active);
            });
        });
        grid.appendChild(card);
    }
}

// Expose for HTML inline onload
window._renderTemplateGrid = renderTemplateGrid;
