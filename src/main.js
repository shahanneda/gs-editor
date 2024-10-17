let gl, program;
let cam = null;
let worker = null;
let isWorkerSorting = false;
let canvasSize = [0, 0];

let renderFrameRequest = null;
let renderTimeout = null;

let gaussianCount;
let sceneMin, sceneMax;
let currentlyDownloading = false;
let shouldBreakDownload = false;

let gizmoRenderer = new GizmoRenderer();
let colorBuffer,
  opacityBuffer,
  positionBuffer,
  positionData,
  opacityData,
  colorData;
globalData = undefined;

// Add these variables at the top of the file
let eraserCursor = null;
let eraserCursorContext = null;
let buffers; // Declare buffers at the top of the file

const urlParams = new URLSearchParams(window.location.search);
let startingScene = urlParams.get("scene");
if (!startingScene) {
  startingScene = "shahan";
}

const settings = {
  scene: startingScene,
  renderResolution: 0.2,
  maxGaussians: 3e6,
  scalingModifier: 1,
  sortingAlgorithm: "count sort",
  bgColor: "#000000",
  speed: 0.07,
  fov: 47,
  debugDepth: false,
  freeFly: false,
  sortTime: "NaN",
  file: "data/nike/model.splat",
  editingMode: "color",
  selectionSize: 0.5,
  moveDistance: 0.5,
  moveDirection: "UP",
  editColor: { r: 1, g: 1, b: 1 },
  pointCloudMode: false,
  uploadFile: () => document.querySelector("#input").click(),

  // Camera calibration
  calibrateCamera: () => {},
  finishCalibration: () => {},
  showGizmo: true,
  eraserSize: 0.1,
};

const defaultCameraParameters = {
  // building: {
  //   up: [0, 0.968912, 0.247403],
  //   target: [-0.262075, 0.76138, 1.27392],
  //   camera: [-1.1807959999999995, 1.8300000000000007, 3.99],
  //   defaultCameraMode: "orbit",
  //   size: "326mb",
  // },
  // garden: {
  //   up: [0.05554, 0.928368, 0.367486],
  //   target: [0.338164, 1.198655, 0.455374],
  //   defaultCameraMode: "orbit",
  //   size: "1.07gb [!]",
  // },

  shahan: {
    up: [0.0011537416139617562, 0.9714341759681702, 0.23730631172657013],
    target: [3.2103200629353523, 0.13693869020789862, 0.1940572769381106],
    camera: [0.05525314883290969, 1.7146055100920843, 0.28674553471761843],
    defaultCameraMode: "freefly",
    size: "54mb",
    url: "https://shahanneda-models.s3.us-east-2.amazonaws.com/Shahan_03_id01-30000.cply",
    localUrl: "http://127.0.0.1:5500/data/Shahan_03_id01-30000.cply",
    // localUrl: "http://127.0.0.1:5500/data/Shahan_03_id01-30000.cply",
  },

  // const url = `http://127.0.0.1:5500/data/shahan2-400005.ply`;
  // const url = `http://127.0.0.1:5500/data/shahan2-id05-100000.ply`;
  // const url = `http://127.0.0.1:5500/data/shahan2-id06-150000.ply`;
  // const url = `http://127.0.0.1:5500/data/playground.ply`;
  // const url = `http://127.0.0.1:5500/data/room.ply`;
  // const url = `http://127.0.0.1:5500/data/Shahan_03_id01-30000.ply`;
  // shahan2: {
  //   up: [0, 0.886994, 0.461779],
  //   target: [-0.428322434425354, 1.2004123210906982, 0.8184626698493958],
  //   camera: [4.950796326794864, 1.7307963267948987, 2.5],
  //   defaultCameraMode: "freefly",
  //   localUrl: "http://127.0.0.1:5500/data/shahan2-id06-150000.ply",
  //   size: "500mb",
  // },
  E7: {
    up: [0, 0.886994, 0.461779],
    camera: [3.240796326794875, 1.9407963267948949, 2.5],
    target: [-2.1753409490920603, 0.4094253536430188, 2.07857081561815],
    // [-3.103083372116089, 0.1313146948814392, 1.8296805620193481]
    // camera.js:270 tphirad 3.240796326794875 1.9407963267948949 2.5

    // up: [0.0011537416139617562, 0.9714341759681702, 0.23730631172657013],
    // target: [3.2103200629353523, 0.13693869020789862, 0.1940572769381106],
    // camera: [0.05525314883290969, 1.7146055100920843, 0.28674553471761843],
    defaultCameraMode: "freefly",
    url: "https://shahanneda-models.s3.us-east-2.amazonaws.com/E7_01_id01-30000.cply",
    // localUrl: "http://127.0.0.1:5500/data/E7_01_id01-30000.ply",
    localUrl: "http://127.0.0.1:5500/data/E7_01_id01-30000.cply",
    size: "119mb",
  },
};

const updateBuffer = (buffer, data) => {
  if (!data || data.length === 0) {
    console.warn("Attempted to update buffer with no data");
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
};

const isLocalHost =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

async function setupWebglContext() {
  const canvas = document.querySelector('canvas')
  const gl = canvas.getContext('webgl2')

  // Handle canvas resize
  const resizeObserver = new ResizeObserver(onCanvasResize)
  resizeObserver.observe(canvas, {box: 'content-box'})

  // Load shaders
  const vertexShaderSource = await fetchFile('shaders/splat_vertex.glsl')
  const fragmentShaderSource = await fetchFile('shaders/splat_fragment.glsl')

  // Create shader program
  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource)

  // Set correct blending
  gl.disable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE)

  return { glContext: gl, glProgram: program }
}

function setupBuffers(gl, program) {
  const setupAttributeBuffer = (name, components) => {
    const location = gl.getAttribLocation(program, name)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gaussianCount * components), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, components, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(location, 1)
    return buffer
  }

  // Create attribute buffers
  const buffers = {
    color: setupAttributeBuffer('a_col', 3),
    center: setupAttributeBuffer('a_center', 3),
    opacity: setupAttributeBuffer('a_opacity', 1),
    covA: setupAttributeBuffer('a_covA', 3),
    covB: setupAttributeBuffer('a_covB', 3),
    isEraser: setupAttributeBuffer('a_isEraser', 1),
  }

  return buffers
}

async function main() {
  // Setup webgl context
  const { glContext, glProgram } = await setupWebglContext();
  gl = glContext;
  program = glProgram;

  if (gl == null || program == null) {
    document.querySelector("#loading-text").style.color = `red`;
    document.querySelector(
      "#loading-text"
    ).textContent = `Could not initialize the WebGL context.`;
    throw new Error("Could not initialize WebGL");
  }

  // Setup web worker for multi-threaded sorting
  worker = new Worker("src/worker-sort.js");

  // Event that receives sorted gaussian data from the worker
  worker.onmessage = (e) => {
    const { data, sortTime } = e.data;

    console.log("Received sorted data:", data);

    if (buffers) {
      updateBuffer(buffers.color, data.colors);
      updateBuffer(buffers.center, data.positions);
      updateBuffer(buffers.opacity, data.opacities);
      updateBuffer(buffers.covA, data.cov3Da);
      updateBuffer(buffers.covB, data.cov3Db);
      updateBuffer(buffers.isEraser, globalData.gaussians.isEraser);

      console.log("Buffers updated");

      // Needed for the gizmo renderer
      positionBuffer = buffers.center;
      opacityBuffer = buffers.opacity;
      colorBuffer = buffers.color;
      colorData = data.colors;
      positionData = data.positions;
      opacityData = data.opacities;

      settings.sortTime = sortTime;

      isWorkerSorting = false;
      requestRender();
    } else {
      console.error("Buffers not initialized");
    }
  };

  // Setup GUI
  initGUI();

  // Setup gizmo renderer
  await gizmoRenderer.init();

  // Load the default scene
  await loadScene({ scene: settings.scene });

  // Set up initial cursor
  updateCursor();

  // Add an event listener for cursor updates
  gl.canvas.addEventListener('mousemove', (e) => {
    if (settings.editingMode === 'eraser') {
      updateEraserCursor();
    }
  });
}

function handleInteractive(e) {
  if (e.altKey) {
    switch (settings.editingMode) {
      case "remove":
        removeOpacity(e.clientX, e.clientY);
        break;
      case "move":
        moveUp(e.clientX, e.clientY);
        break;
      case "carve":
        carveOpacity(e.clientX, e.clientY);
        break;
      case "eraser":
        createEraserGaussian(e.clientX, e.clientY);
        break;
      case "color":
        interactiveColor(e.clientX, e.clientY);
        break;
      default:
        console.warn(`Unknown editing mode: ${settings.editingMode}`);
    }
    requestRender(); // Ensure we re-render after any interaction
  }
}

function getGuassiansWithinDistance(pos, threshold) {
  const hits = [];
  for (let i = 0; i < gaussianCount; i++) {
    const gPos = globalData.gaussians.positions.slice(i * 3, i * 3 + 3);
    const dist = vec3.distance(gPos, pos);
    if (dist < threshold) {
      hits.push({
        id: i,
      });
    }
  }
  return hits;
}

// function vec3_array_mean(){

// }

function getGuassiansSameColor(pos, id, posThreshold, colorThreshold) {
  let targetColors = [globalData.gaussians.colors.slice(id * 3, id * 3 + 3)];
  const hits = [];
  console.log("Got target color", targetColors);

  for (let j = 0; j < 1; j++) {
    for (let i = 0; i < gaussianCount; i++) {
      const gPos = globalData.gaussians.positions.slice(i * 3, i * 3 + 3);
      const gColor = globalData.gaussians.colors.slice(i * 3, i * 3 + 3);
      const posDist = vec3.distance(gPos, pos);

      let targetColorDistances = targetColors.map((targetColor) =>
        vec3.distance(targetColor, gColor)
      );

      const colorDist = Math.min(targetColorDistances);

      if (posDist < posThreshold && colorDist < colorThreshold) {
        // targetColors.push(gColor);

        hits.push({
          id: i,
        });
      }
    }
    console.log(targetColors);
    console.log(hits);
  }
  return hits;
}

function interactiveColor(x, y) {
  const hit = cam.raycast(x, y);
  const hits = getGuassiansWithinDistance(hit.pos, settings.selectionSize);
  // const hits = getGuassiansSameColor(hit.pos, hit.id, 1, 0.1);
  hits.forEach((hit) => {
    const i = hit.id;
    globalData.gaussians.colors[3 * i] = settings.editColor.r;
    globalData.gaussians.colors[3 * i + 1] = settings.editColor.g;
    globalData.gaussians.colors[3 * i + 2] = settings.editColor.b;
  });

  updateBuffer(colorBuffer, globalData.gaussians.colors);
  requestRender();
  cam.needsWorkerUpdate = true;
  worker.postMessage(globalData);
  cam.updateWorker();
  // updateBuffer(buffers.center, data.positions);
  // updateBuffer(buffers.opacity, data.opacities);
}

function moveUp(x, y) {
  // console.log("moving up!");
  const hit = cam.raycast(x, y);
  const hits = getGuassiansWithinDistance(hit.pos, settings.selectionSize);
  // const hits = getGuassiansSameColor(hit.pos, hit.id, 1, 0.1);
  // console.log("hits", hits);
  hits.forEach((hit) => {
    const i = hit.id;
    globalData.gaussians.positions[i * 3 + 0] += 0.0;
    globalData.gaussians.positions[i * 3 + 1] -=
      (settings.moveDirection == "UP" ? 1 : -1) * settings.moveDistance;
    globalData.gaussians.positions[i * 3 + 2] += 0.0;
    // /*  */ globalData.gaussians.opacities[i] = 0;
    // globalData.gaussians.colors[3 * i] = 1;
    // globalData.gaussians.colors[3 * i + 1] = 0;
    // globalData.gaussians.colors[3 * i + 2] = 0;
  });

  // console.log(globalData.gaussians.colors);
  updateBuffer(positionBuffer, globalData.gaussians.positions);
  // updateBuffer(colorBuffer, globalData.gaussians.colors);
  // updateBuffer(opacityBuffer, globalData.gaussians.opacities);
  requestRender();
  cam.needsWorkerUpdate = true;
  worker.postMessage(globalData);
  cam.updateWorker();
  // updateBuffer(buffers.center, data.positions);
}

function carveOpacity(x, y) {
  const hit = cam.raycast(x, y);
  const hits = getGuassiansWithinDistance(hit.pos, settings.selectionSize);
  console.log("hits", hits);
  hits.forEach((hit) => {
    const i = hit.id;
    globalData.gaussians.opacities[i] = 0;
  });
}

function removeOpacity(x, y) {
  const hit = cam.raycast(x, y);
  const hits = getGuassiansWithinDistance(hit.pos, settings.selectionSize);
  console.log("hits", hits);
  hits.forEach((hit) => {
    const i = hit.id;
    globalData.gaussians.opacities[i] = 0;
    // globalData.gaussians.colors[3 * i] = 1;
    // globalData.gaussians.colors[3 * i + 1] = 0;
    // globalData.gaussians.colors[3 * i + 2] = 0;
  });

  // console.log(globalData.gaussians.colors);
  // updateBuffer(colorBuffer, globalData.gaussians.colors);
  // updateBuffer(opacityBuffer, globalData.gaussians.opacities);
  updateBuffer(opacityBuffer, globalData.gaussians.opacities);
  requestRender();
  cam.needsWorkerUpdate = true;
  worker.postMessage(globalData);
  cam.updateWorker();
  // updateBuffer(buffers.center, data.positions);
}

// Load a .ply scene specified as a name (URL fetch) or local file
async function loadScene({ scene, file }) {
  console.log("loading scene", file, scene);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (cam) cam.disableMovement = true;
  document.querySelector("#loading-container").style.opacity = 1;

  let reader, contentLength;

  // Create a StreamableReader from a URL Response object
  if (scene != null) {
    scene = scene.split("(")[0].trim();

    const url = isLocalHost
      ? defaultCameraParameters[scene].localUrl
      : defaultCameraParameters[scene].url;
    // const url = `http://127.0.0.1:5500/data/Shahan_02_id02-30000.cply`;
    // const url = `http://127.0.0.1:5500/data/room.ply`;
    // const url = `https://huggingface.co/kishimisu/3d-gaussian-splatting-webgl/resolve/main/${scene}.ply`;
    // const url = `http://127.0.0.1:5500/data/shahan2-400005.ply`;
    // const url = `http://127.0.0.1:5500/data/shahan2-id05-100000.ply`;
    // const url = `http://127.0.0.1:5500/data/shahan2-id06-150000.ply`;
    // const url = `http://127.0.0.1:5500/data/playground.ply`;
    // const url = `http://127.0.0.1:5500/data/Shahan_03_id01-30000.ply`;
    // const url = `http://127.0.0.1:5500/data/Shahan_03_id02-30000.ply`;
    // const url = `http://127.0.0.1:5500/data/Shahan_04_id01-30000.ply`;
    // const url = `http://127.0.0.1:5500/data/E7_01_id01-30000.cply`;
    // const url = `https://shahanneda-models.s3.us-east-2.amazonaws.com/E7_01_id01-30000.ply`;
    // const url = `http://127.0.0.1:5500/data/E7_01_id02-70000.ply`;
    // const url = `http://127.0.0.1:5500/data/Shahan_02_id02-120000.ply`;
    const response = await fetch(url);
    contentLength = parseInt(response.headers.get("content-length"));
    reader = response.body.getReader();
  }
  // Create a StreamableReader from a File object
  else if (file != null) {
    contentLength = file.size;
    reader = file.stream().getReader();
    settings.scene = "custom";
  } else throw new Error("No scene or file specified");

  // Download .ply file and monitor the progress
  const content = await downloadPly(reader, contentLength);

  // Load and pre-process gaussian data from .ply file
  const data = await loadPly(content.buffer);
  console.log(gaussianCount);
  data.cov3Da = new Float32Array(gaussianCount * 3);
  data.cov3Db = new Float32Array(gaussianCount * 3);

  for (let i = 0; i < gaussianCount; i++) {
    if (settings.pointCloudMode) {
      data.cov3Da[i * 3] = 0;
      data.cov3Da[i * 3 + 1] = 0;
      data.cov3Da[i * 3 + 2] = 0;

      data.cov3Db[i * 3] = 0;
      data.cov3Db[i * 3 + 1] = 0;
      data.cov3Db[i * 3 + 2] = 0;
    } else {
      data.cov3Da[i * 3] = data.cov3Ds[i * 6];
      data.cov3Da[i * 3 + 1] = data.cov3Ds[i * 6 + 1];
      data.cov3Da[i * 3 + 2] = data.cov3Ds[i * 6 + 2];

      data.cov3Db[i * 3] = data.cov3Ds[i * 6 + 3];
      data.cov3Db[i * 3 + 1] = data.cov3Ds[i * 6 + 4];
      data.cov3Db[i * 3 + 2] = data.cov3Ds[i * 6 + 5];
    }
  }

  // console.log("at load time data is", data);
  globalData = {
    gaussians: {
      ...data,
      count: gaussianCount,
      isEraser: new Uint8Array(gaussianCount),
    },
  };

  console.log("Loaded Gaussians:", globalData.gaussians);

  // Setup buffers after loading the scene data
  buffers = setupBuffers(gl, program);

  // Update buffers with initial data
  updateBuffer(buffers.color, globalData.gaussians.colors);
  updateBuffer(buffers.center, globalData.gaussians.positions);
  updateBuffer(buffers.opacity, globalData.gaussians.opacities);
  updateBuffer(buffers.covA, globalData.gaussians.cov3Da);
  updateBuffer(buffers.covB, globalData.gaussians.cov3Db);
  updateBuffer(buffers.isEraser, globalData.gaussians.isEraser);

  // Send gaussian data to the worker
  worker.postMessage({
    gaussians: {
      ...data,
      count: gaussianCount,
      isEraser: new Uint8Array(gaussianCount),
    },
  });

  // Setup camera
  console.log(scene);
  const cameraParameters = scene ? defaultCameraParameters[scene] : {};
  console.log(cameraParameters);

  if (cam == null) cam = new Camera(cameraParameters);
  else cam.setParameters(cameraParameters);
  cam.update();

  console.log("Camera set up:", cam);

  // Update GUI
  settings.maxGaussians = gaussianCount;
  maxGaussianController.max(gaussianCount);
  maxGaussianController.updateDisplay();
}

function requestRender(...params) {
  if (renderFrameRequest != null) cancelAnimationFrame(renderFrameRequest);

  renderFrameRequest = requestAnimationFrame(() => render(...params));
}

// Render a frame on the canvas
function render(width, height, res) {
  console.log("Rendering frame");
  console.log("Gaussian count:", globalData.gaussians.count);
  console.log("Max Gaussians:", settings.maxGaussians);

  // Update canvas size
  const resolution = res ?? settings.renderResolution;
  const canvasWidth = width ?? Math.round(canvasSize[0] * resolution);
  const canvasHeight = height ?? Math.round(canvasSize[1] * resolution);

  if (gl.canvas.width != canvasWidth || gl.canvas.height != canvasHeight) {
    gl.canvas.width = canvasWidth;
    gl.canvas.height = canvasHeight;
  }

  // Setup viewport
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  // Update camera
  cam.update();

  // Original implementation parameters
  const W = gl.canvas.width;
  const H = gl.canvas.height;
  const tan_fovy = Math.tan(cam.fov_y * 0.5);
  const tan_fovx = (tan_fovy * W) / H;
  const focal_y = H / (2 * tan_fovy);
  const focal_x = W / (2 * tan_fovx);

  gl.uniform1f(gl.getUniformLocation(program, "W"), W);
  gl.uniform1f(gl.getUniformLocation(program, "H"), H);
  gl.uniform1f(gl.getUniformLocation(program, "focal_x"), focal_x);
  gl.uniform1f(gl.getUniformLocation(program, "focal_y"), focal_y);
  gl.uniform1f(gl.getUniformLocation(program, "tan_fovx"), tan_fovx);
  gl.uniform1f(gl.getUniformLocation(program, "tan_fovy"), tan_fovy);
  gl.uniform1f(
    gl.getUniformLocation(program, "scale_modifier"),
    settings.scalingModifier
  );
  gl.uniform3fv(gl.getUniformLocation(program, "boxmin"), sceneMin);
  gl.uniform3fv(gl.getUniformLocation(program, "boxmax"), sceneMax);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "projmatrix"),
    false,
    cam.vpm
  );
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, "viewmatrix"),
    false,
    cam.vm
  );

  // Custom parameters
  gl.uniform1i(
    gl.getUniformLocation(program, "show_depth_map"),
    settings.debugDepth
  );

  // Draw
  const gaussiansToDraw = Math.min(settings.maxGaussians, globalData.gaussians.count);
  console.log("Drawing Gaussians:", gaussiansToDraw);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, gaussiansToDraw);

  // Draw gizmo
  gizmoRenderer.render();

  renderFrameRequest = null;

  // Progressively draw with higher resolution after the camera stops moving
  let nextResolution = Math.floor(resolution * 4 + 1) / 4;
  if (nextResolution - resolution < 0.1) nextResolution += 0.25;

  if (nextResolution <= 1 && !cam.needsWorkerUpdate && !isWorkerSorting) {
    const nextWidth = Math.round(canvasSize[0] * nextResolution);
    const nextHeight = Math.round(canvasSize[1] * nextResolution);

    if (renderTimeout != null) clearTimeout(renderTimeout);

    renderTimeout = setTimeout(
      () => requestRender(nextWidth, nextHeight, nextResolution),
      200
    );
  }
}

function createEraserGaussian(x, y) {
  console.log("Creating eraser gaussian at", x, y);
  const hit = cam.raycast(x, y);
  if (!hit) {
    console.log("No hit detected");
    return;
  }

  console.log("Hit detected at", hit.pos);

  const newIndex = globalData.gaussians.count;
  globalData.gaussians.count++;

  // Set position
  globalData.gaussians.positions[newIndex * 3] = hit.pos[0];
  globalData.gaussians.positions[newIndex * 3 + 1] = hit.pos[1];
  globalData.gaussians.positions[newIndex * 3 + 2] = hit.pos[2];

  // Set opacity (negative for eraser)
  globalData.gaussians.opacities[newIndex] = -1;

  // Set color (can be distinctive for visualization)
  globalData.gaussians.colors[newIndex * 3] = 1;
  globalData.gaussians.colors[newIndex * 3 + 1] = 0;
  globalData.gaussians.colors[newIndex * 3 + 2] = 1;

  // Set covariance (adjusted for eraser size)
  const eraserSize = settings.eraserSize;
  globalData.gaussians.cov3Da[newIndex * 3] = eraserSize;
  globalData.gaussians.cov3Da[newIndex * 3 + 1] = 0;
  globalData.gaussians.cov3Da[newIndex * 3 + 2] = 0;
  globalData.gaussians.cov3Db[newIndex * 3] = 0;
  globalData.gaussians.cov3Db[newIndex * 3 + 1] = eraserSize;
  globalData.gaussians.cov3Db[newIndex * 3 + 2] = eraserSize;

  // Mark as eraser
  globalData.gaussians.isEraser[newIndex] = 1;

  console.log("Created eraser gaussian at index", newIndex);

  // Update buffers
  updateBuffer(buffers.center, globalData.gaussians.positions);
  updateBuffer(buffers.opacity, globalData.gaussians.opacities);
  updateBuffer(buffers.color, globalData.gaussians.colors);
  updateBuffer(buffers.covA, globalData.gaussians.cov3Da);
  updateBuffer(buffers.covB, globalData.gaussians.cov3Db);
  updateBuffer(buffers.isEraser, globalData.gaussians.isEraser);

  // Update worker
  worker.postMessage(globalData);
  cam.updateWorker();
  requestRender();
}

// Modify updateEraserCursor function
function updateEraserCursor() {
  if (!gl || !gl.canvas) return;

  if (!eraserCursor) {
    eraserCursor = document.createElement('canvas');
    eraserCursor.width = 64;
    eraserCursor.height = 64;
    eraserCursorContext = eraserCursor.getContext('2d');
  }

  const size = Math.min(32, Math.max(4, settings.eraserSize * 32));
  eraserCursorContext.clearRect(0, 0, 64, 64);
  eraserCursorContext.beginPath();
  eraserCursorContext.arc(32, 32, size, 0, Math.PI * 2);
  eraserCursorContext.fillStyle = 'rgba(255, 0, 255, 0.3)';
  eraserCursorContext.fill();
  eraserCursorContext.strokeStyle = 'rgba(255, 0, 255, 0.8)';
  eraserCursorContext.stroke();

  gl.canvas.style.cursor = `url(${eraserCursor.toDataURL()}) 32 32, auto`;
}

// Modify updateCursor function
function updateCursor() {
  if (!gl || !gl.canvas) return;

  if (settings.editingMode === 'eraser') {
    updateEraserCursor();
  } else {
    gl.canvas.style.cursor = 'default';
  }
}

window.onload = main;