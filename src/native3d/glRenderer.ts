/** The parts of expo-gl's context used here (the project doesn't load DOM/WebGL type libs). */
export interface GLContext {
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  endFrameEXP(): void;
}
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { eyeOf, FAR, FOV, NEAR, progress3d, type Anim3, type Camera, type Scene3D } from '../core/index.ts';

/** A live GL view of a Scene3D. */
export interface GLScene {
  render(camera: Camera, ms: number): void;
  dispose(): void;
}

/**
 * three.js ≥ r163 only accepts WebGL2 and rejects any context that is
 * `instanceof WebGLRenderingContext`. expo-gl's context runs on OpenGL ES 3 and
 * provides the WebGL2 calls three uses, but is that class — so the global is
 * hidden just while the renderer is created.
 */
function createRenderer(gl: GLContext): THREE.WebGLRenderer {
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const canvas = { width: w, height: h, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientWidth: w, clientHeight: h } as unknown as HTMLCanvasElement;
  const g = globalThis as { WebGLRenderingContext?: unknown };
  const saved = g.WebGLRenderingContext;
  g.WebGLRenderingContext = undefined;
  try {
    const r = new THREE.WebGLRenderer({ canvas, context: gl as unknown as THREE.WebGLRendererParameters['context'], antialias: true });
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    return r;
  } finally {
    g.WebGLRenderingContext = saved;
  }
}

const tint = (hex: string, toWhite: number) => new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), toWhite);

type Animated =
  | { kind: 'mesh'; anim: Anim3; mesh: THREE.Mesh; base: Float32Array; baseZ: number; opacity: number }
  | { kind: 'line'; anim: Anim3; line: Line2; segments: number; material: LineMaterial; opacity: number }
  | { kind: 'lineGrow'; anim: Anim3; geo: LineGeometry; base: number[]; baseZ: number }
  | { kind: 'fade'; anim: Anim3; materials: { m: THREE.Material; opacity: number }[]; objects: THREE.Object3D[] };

/**
 * Builds a three.js scene from a Scene3D: lit, role-tinted surfaces with mesh
 * lines on top, thick curves (Line2), arrows (shaft + cone), dots, and the box,
 * all clipped to the view box. `pixelRatio` converts CSS line widths to pixels.
 */
export function createGLScene(gl: GLContext, s: Scene3D, pixelRatio: number): GLScene {
  const renderer = createRenderer(gl);
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  renderer.setClearColor(new THREE.Color(s.theme.background), 1);
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, -3, 5);
  scene.add(sun);
  const back = new THREE.DirectionalLight(0xffffff, 0.45);
  back.position.set(-3, 2, -2);
  scene.add(back);

  const m = 1.0005;
  const clip = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), m), new THREE.Plane(new THREE.Vector3(-1, 0, 0), m),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), m), new THREE.Plane(new THREE.Vector3(0, -1, 0), m),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), m), new THREE.Plane(new THREE.Vector3(0, 0, -1), m),
  ];
  const roles = s.theme.roles;
  const animated: Animated[] = [];
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // surfaces and planes
  for (const mesh of s.meshes) {
    const geo = keep(new THREE.BufferGeometry());
    const pos = new Float32Array(mesh.positions);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
    geo.setIndex(mesh.indices);
    const mat = keep(
      new THREE.MeshLambertMaterial({
        color: tint(roles[mesh.role].color, 0.5),
        side: THREE.DoubleSide,
        transparent: mesh.opacity < 1,
        opacity: mesh.opacity,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        clippingPlanes: clip,
      }),
    );
    const obj = new THREE.Mesh(geo, mat);
    scene.add(obj);
    if (mesh.anim?.kind === 'grow') animated.push({ kind: 'mesh', anim: mesh.anim, mesh: obj, base: pos.slice(), baseZ: mesh.baseZ ?? 0, opacity: mesh.opacity });
    else if (mesh.anim) animated.push({ kind: 'fade', anim: mesh.anim, materials: [{ m: mat, opacity: mesh.opacity }], objects: [obj] });
  }

  // lines: curves, mesh lines, contours, box
  const lineObjects = new Map<string, Line2>();
  for (const l of s.lines) {
    const style = l.role === 'grid' || l.role === 'axis' ? roles[l.role] : roles[l.role];
    const isMeshLine = l.key.includes('-mesh-');
    const geo = keep(new LineGeometry());
    geo.setPositions(l.points.flat());
    const opacity = isMeshLine ? 0.45 : 1;
    const mat = keep(
      new LineMaterial({
        color: new THREE.Color(isMeshLine ? style.color : style.color).getHex(),
        linewidth: l.width * pixelRatio,
        transparent: opacity < 1,
        opacity,
        ...(l.role === 'grid' || l.role === 'axis' ? {} : { clippingPlanes: clip }),
      }),
    );
    mat.resolution.set(w, h);
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    scene.add(line);
    lineObjects.set(l.key, line);
    if (l.anim?.kind === 'draw') animated.push({ kind: 'line', anim: l.anim, line, segments: l.points.length - 1, material: mat, opacity });
    else if (l.anim?.kind === 'grow' && l.baseZ !== undefined) animated.push({ kind: 'lineGrow', anim: l.anim, geo, base: l.points.flat(), baseZ: l.baseZ });
    else if (l.anim) animated.push({ kind: 'fade', anim: l.anim, materials: [{ m: mat, opacity }], objects: [line] });
  }

  // arrows: shaft + cone head
  for (const a of s.arrows) {
    const from = new THREE.Vector3(...a.from);
    const to = new THREE.Vector3(...a.to);
    const dir = to.clone().sub(from);
    const length = dir.length();
    dir.normalize();
    const headLen = Math.min(0.16, length * 0.35);
    const shaftEnd = to.clone().addScaledVector(dir, -headLen * 0.9);
    const geo = keep(new LineGeometry());
    geo.setPositions([...from.toArray(), ...shaftEnd.toArray()]);
    const color = new THREE.Color(roles[a.role].color);
    const lm = keep(new LineMaterial({ color: color.getHex(), linewidth: 2.5 * pixelRatio }));
    lm.resolution.set(w, h);
    const shaft = new Line2(geo, lm);
    const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(headLen * 0.38, headLen, 18)), keep(new THREE.MeshBasicMaterial({ color })));
    cone.position.copy(to.clone().addScaledVector(dir, -headLen / 2));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(shaft, cone);
    if (a.anim) animated.push({ kind: 'fade', anim: a.anim, materials: [{ m: lm, opacity: 1 }, { m: cone.material as THREE.Material, opacity: 1 }], objects: [shaft, cone] });
  }

  // dots
  const dotGeo = keep(new THREE.SphereGeometry(0.04, 20, 14));
  for (const d of s.dots) {
    const mat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(roles[d.role].color) }));
    const dot = new THREE.Mesh(dotGeo, mat);
    dot.position.set(...d.at);
    scene.add(dot);
    if (d.anim) animated.push({ kind: 'fade', anim: d.anim, materials: [{ m: mat, opacity: 1 }], objects: [dot] });
  }

  const cam = new THREE.PerspectiveCamera(FOV, w / h, NEAR, FAR);
  cam.up.set(0, 0, 1);

  return {
    render(camera, ms) {
      for (const a of animated) {
        const p = progress3d(a.anim, ms);
        if (a.kind === 'mesh') {
          const attr = a.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
          const arr = attr.array as Float32Array;
          for (let k = 2; k < arr.length; k += 3) arr[k] = a.baseZ + (a.base[k]! - a.baseZ) * p;
          attr.needsUpdate = true;
          a.mesh.visible = p > 0;
        } else if (a.kind === 'lineGrow') {
          a.geo.setPositions(a.base.map((v, k) => (k % 3 === 2 ? a.baseZ + (v - a.baseZ) * p : v)));
        } else if (a.kind === 'line') {
          const n = Math.floor(a.segments * p);
          (a.line.geometry as LineGeometry).instanceCount = n;
          a.line.visible = n > 0;
        } else {
          for (const { m: mat, opacity } of a.materials) {
            mat.transparent = true;
            mat.opacity = opacity * p;
          }
          for (const o of a.objects) o.visible = p > 0;
        }
      }
      cam.position.set(...eyeOf(camera));
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      renderer.render(scene, cam);
      gl.endFrameEXP();
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      void lineObjects;
    },
  };
}
