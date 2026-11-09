import type { Graph, Positions, TraceFrame, VertexId } from '../shared/contracts.ts';

type Point = { x: number; y: number; z: number; tx: number; ty: number; tz: number };

const vertexShader = `
  attribute vec3 position;
  attribute vec3 color;
  uniform mat4 projection;
  uniform mat4 view;
  uniform float pointSize;
  varying vec3 vertexColor;
  void main() {
    vec4 projected = projection * view * vec4(position, 1.0);
    gl_Position = projected;
    gl_PointSize = pointSize * (1.0 / max(0.35, projected.w * 0.075));
    vertexColor = color;
  }
`;
const fragmentShader = `
  precision mediump float;
  varying vec3 vertexColor;
  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    if (dot(centered, centered) > 0.25) discard;
    gl_FragColor = vec4(vertexColor, 1.0);
  }
`;
const lineVertexShader = `
  attribute vec3 position;
  uniform mat4 projection;
  uniform mat4 view;
  void main() { gl_Position = projection * view * vec4(position, 1.0); }
`;
const lineFragmentShader = `
  precision mediump float;
  uniform vec3 color;
  void main() { gl_FragColor = vec4(color, 0.9); }
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL shader could not be created.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'WebGL shader failed.');
  return shader;
}
function program(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const result = gl.createProgram();
  if (!result) throw new Error('WebGL program could not be created.');
  gl.attachShader(result, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(result, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result) ?? 'WebGL program failed.');
  return result;
}
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  const range = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (near + far) * range, -1, 0, 0, near * far * 2 * range, 0]);
}
function cameraView(angle: number, distance: number, lift: number) {
  const eyeX = Math.sin(angle) * distance;
  const eyeZ = Math.cos(angle) * distance;
  const targetY = lift * 0.12;
  const forward = normalize([-eyeX, targetY - 0.1, -eyeZ]);
  const right = normalize([forward[2], 0, -forward[0]]);
  const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return new Float32Array([
    right[0], up[0], -forward[0], 0, right[1], up[1], -forward[1], 0, right[2], up[2], -forward[2], 0,
    -dot(right, [eyeX, lift, eyeZ]), -dot(up, [eyeX, lift, eyeZ]), dot(forward, [eyeX, lift, eyeZ]), 1
  ]);
}
function normalize(vector: number[]) { const length = Math.hypot(...vector) || 1; return vector.map(value => value / length); }
function dot(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function color(hex: [number, number, number]) { return hex; }

export function createSpatialGraph(host: HTMLElement, graph: Graph, positions: Positions) {
  const canvas = document.createElement('canvas');
  canvas.className = 'webgl-spatial-canvas';
  canvas.setAttribute('aria-label', 'Interactive three-dimensional graph. Scroll to move through algorithm steps.');
  const overlay = document.createElement('canvas');
  overlay.className = 'spatial-overlay';
  const overlayContext = overlay.getContext('2d');
  const labels = document.createElement('div');
  labels.className = 'spatial-labels';
  const hud = document.createElement('div');
  hud.className = 'spatial-hud';
  const hudStep = document.createElement('span');
  const hudTitle = document.createElement('strong');
  const hudChange = document.createElement('p');
  hud.append(hudStep, hudTitle, hudChange);
  host.replaceChildren(canvas, overlay, labels);
  host.append(hud);
  const context = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!context) {
    host.replaceChildren(Object.assign(document.createElement('p'), { className: 'webgl-fallback', textContent: 'This browser does not support WebGL. Use the playback controls above to explore the graph.' }));
    return { update: () => undefined, dispose: () => undefined };
  }
  const gl = context;

  const nodes = new Map<VertexId, Point>();
  const labelNodes = new Map<VertexId, HTMLSpanElement>();
  const weightNodes = new Map<string, HTMLSpanElement>();
  graph.vertices.forEach(({ id }, index) => {
    const [x, y] = positions[id];
    const angle = index * 2.39996;
    const depth = ((index % 3) - 1) * 0.65;
    nodes.set(id, { x: (x - 230) / 55, y: (125 - y) / 55, z: depth, tx: (x - 230) / 55, ty: (125 - y) / 55, tz: depth });
    const point = nodes.get(id)!;
    point.tx += Math.cos(angle) * 0.1;
    point.ty += Math.sin(angle) * 0.1;
    const label = document.createElement('span');
    label.className = 'spatial-label';
    label.textContent = id;
    labelNodes.set(id, label);
    labels.append(label);
  });
  graph.edges.forEach(edge => {
    if (edge.weight === undefined) return;
    const label = document.createElement('span');
    label.className = 'spatial-weight';
    label.textContent = String(edge.weight);
    weightNodes.set(edge.id, label);
    labels.append(label);
  });
  let edgeVertices = new Float32Array(graph.edges.flatMap(edge => {
    const from = nodes.get(edge.from)!; const to = nodes.get(edge.to)!;
    return [from.x, from.y, from.z, to.x, to.y, to.z];
  }));
  const pointVertices = new Float32Array(graph.vertices.length * 3);
  const pointColors = new Float32Array(graph.vertices.length * 3);
  const edgeBuffer = gl.createBuffer();
  const pointBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const points = program(gl, vertexShader, fragmentShader);
  const lines = program(gl, lineVertexShader, lineFragmentShader);
  let frame: TraceFrame | undefined;
  let animation = 0;
  let depth = 0;
  let targetDepth = 0;
  let orbit = -0.22;
  let targetOrbit = -0.22;
  let lift = 0;
  let targetLift = 0;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let resizeObserver: ResizeObserver | undefined;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(host.clientWidth * ratio));
    const height = Math.max(1, Math.floor(host.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    overlay.width = width; overlay.height = height;
    gl.viewport(0, 0, width, height);
  }
  function updateBuffers() {
    graph.vertices.forEach(({ id }, index) => {
      const point = nodes.get(id)!;
      point.x += (point.tx - point.x) * 0.08;
      point.y += (point.ty - point.y) * 0.08;
      point.z += (point.tz - point.z) * 0.08;
      pointVertices.set([point.x, point.y, point.z], index * 3);
      const active = frame?.highlights.vertex === id;
      const result = frame?.highlights.resultVertices?.includes(id) ?? false;
      const ready = frame?.state.kind === 'topological-sort' && frame.state.ready.includes(id);
      pointColors.set(result ? color([0.56, 0.87, 0.65]) : active ? color([0.96, 0.49, 0.28]) : ready ? color([0.38, 0.83, 0.84]) : color([0.82, 0.91, 0.84]), index * 3);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer); gl.bufferData(gl.ARRAY_BUFFER, pointVertices, gl.DYNAMIC_DRAW);
  }
  function updateEdges() {
    edgeVertices = new Float32Array(graph.edges.flatMap(edge => {
      const from = nodes.get(edge.from)!; const to = nodes.get(edge.to)!;
      return [from.x, from.y, from.z, to.x, to.y, to.z];
    }));
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer); gl.bufferData(gl.ARRAY_BUFFER, edgeVertices, gl.DYNAMIC_DRAW);
  }
  function project(point: Point, projection: Float32Array, view: Float32Array) {
    const { x, y, z } = point;
    const viewX = view[0] * x + view[4] * y + view[8] * z + view[12];
    const viewY = view[1] * x + view[5] * y + view[9] * z + view[13];
    const viewZ = view[2] * x + view[6] * y + view[10] * z + view[14];
    const viewW = view[3] * x + view[7] * y + view[11] * z + view[15];
    const clipX = projection[0] * viewX + projection[4] * viewY + projection[8] * viewZ + projection[12] * viewW;
    const clipY = projection[1] * viewX + projection[5] * viewY + projection[9] * viewZ + projection[13] * viewW;
    const clipW = projection[3] * viewX + projection[7] * viewY + projection[11] * viewZ + projection[15] * viewW;
    const normalizedX = clipX / clipW;
    const normalizedY = clipY / clipW;
    return { x: host.clientWidth * (normalizedX * 0.5 + 0.5), y: host.clientHeight * (1 - (normalizedY * 0.5 + 0.5)), visible: clipW > 0 && Math.abs(normalizedX) <= 1 && Math.abs(normalizedY) <= 1 };
  }
  function updateLabels(projection: Float32Array, view: Float32Array) {
    if (!overlayContext) return;
    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
    overlayContext.font = `${Math.max(14, overlay.width * 0.011)}px ui-monospace, monospace`;
    overlayContext.textAlign = 'center'; overlayContext.textBaseline = 'middle';
    graph.vertices.forEach(({ id }) => {
      const point = nodes.get(id)!;
      const label = labelNodes.get(id)!;
      const position = project(point, projection, view);
      label.hidden = !position.visible;
      label.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -145%)`;
      label.style.opacity = String(Math.max(0.35, Math.min(1, 0.72 + (point.z + 2) * 0.07)));
    });
    graph.edges.forEach(edge => {
      const label = weightNodes.get(edge.id);
      if (!label) return;
      const from = nodes.get(edge.from)!; const to = nodes.get(edge.to)!;
      const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2, tx: 0, ty: 0, tz: 0 };
      const position = project(midpoint, projection, view);
      label.hidden = !position.visible;
      label.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`;
      if (position.visible) {
        overlayContext.fillStyle = '#102324e8';
        overlayContext.fillRect(position.x - 14, position.y - 11, 28, 22);
        overlayContext.strokeStyle = '#577b76'; overlayContext.strokeRect(position.x - 14, position.y - 11, 28, 22);
        overlayContext.fillStyle = '#f09a6b'; overlayContext.fillText(String(edge.weight), position.x, position.y);
      }
    });
  }
  function draw() {
    resize();
    depth += (targetDepth - depth) * 0.06;
    orbit += (targetOrbit - orbit) * 0.08;
    lift += (targetLift - lift) * 0.08;
    updateBuffers();
    gl.clearColor(0.035, 0.09, 0.095, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    const projection = perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 100);
    const view = cameraView(orbit, 6.2 - Math.min(depth, 8) * 0.15, lift + Math.sin(depth * 0.15) * 0.5);
    updateEdges(); updateLabels(projection, view);
    gl.useProgram(lines); gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer);
    const linePosition = gl.getAttribLocation(lines, 'position'); gl.enableVertexAttribArray(linePosition); gl.vertexAttribPointer(linePosition, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(lines, 'projection'), false, projection); gl.uniformMatrix4fv(gl.getUniformLocation(lines, 'view'), false, view);
    graph.edges.forEach((edge, index) => {
      const active = frame?.highlights.edge === edge.id;
      const result = frame?.highlights.resultEdges?.includes(edge.id) || frame?.state.kind === 'kruskal' && frame.state.selected.includes(edge.id) || frame?.state.kind === 'prim' && frame.state.selected.includes(edge.id);
      const skipped = frame?.highlights.skipped === edge.id;
      const known = frame?.state.kind === 'prim' && frame.state.frontier.includes(edge.id);
      const edgeColor = active ? [0.96, 0.49, 0.28] : result ? [0.56, 0.87, 0.65] : skipped ? [0.38, 0.43, 0.43] : known ? [0.38, 0.83, 0.84] : [0.32, 0.57, 0.56];
      gl.uniform3f(gl.getUniformLocation(lines, 'color'), edgeColor[0], edgeColor[1], edgeColor[2]);
      gl.lineWidth(active || result ? 3 : 1); gl.drawArrays(gl.LINES, index * 2, 2);
    });
    gl.useProgram(points); gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer); const pointPosition = gl.getAttribLocation(points, 'position'); gl.enableVertexAttribArray(pointPosition); gl.vertexAttribPointer(pointPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer); gl.bufferData(gl.ARRAY_BUFFER, pointColors, gl.DYNAMIC_DRAW); const pointColor = gl.getAttribLocation(points, 'color'); gl.enableVertexAttribArray(pointColor); gl.vertexAttribPointer(pointColor, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(points, 'projection'), false, projection); gl.uniformMatrix4fv(gl.getUniformLocation(points, 'view'), false, view); gl.uniform1f(gl.getUniformLocation(points, 'pointSize'), Math.min(canvas.width, canvas.height) * 0.055); gl.drawArrays(gl.POINTS, 0, graph.vertices.length);
    animation = window.requestAnimationFrame(draw);
  }
  canvas.addEventListener('pointerdown', event => { dragging = true; lastPointerX = event.clientX; lastPointerY = event.clientY; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    targetOrbit += (event.clientX - lastPointerX) * 0.008;
    targetLift = Math.max(-2, Math.min(2, targetLift + (event.clientY - lastPointerY) * 0.008));
    lastPointerX = event.clientX; lastPointerY = event.clientY;
  });
  const stopDragging = () => { dragging = false; };
  canvas.addEventListener('pointerup', stopDragging); canvas.addEventListener('pointercancel', stopDragging); canvas.addEventListener('pointerleave', stopDragging);
  resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); draw();
  return {
    update(next: TraceFrame) {
      frame = next; targetDepth = next.index;
      hudStep.textContent = `STEP ${String(next.index + 1).padStart(2, '0')}`;
      hudTitle.textContent = next.title;
      hudChange.textContent = next.change;
    },
    dispose() { window.cancelAnimationFrame(animation); resizeObserver?.disconnect(); canvas.remove(); overlay.remove(); labels.remove(); hud.remove(); }
  };
}
