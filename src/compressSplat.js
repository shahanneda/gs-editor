var fs = require("fs");

async function startCompression(filename) {
  // const response = await fetch(url);
  // let contentLength = parseInt(response.headers.get("content-length"));
  // const url = "http://127.0.0.1:5500/data/room.ply";
  // const response = await fetch(url);
  // let contentLength = parseInt(response.headers.get("content-length"));
  // const reader = response.body.getReader();
  // const content = await downloadPly(reader, contentLength);
  // console.log(content);

  // const data = await compressSplat(content.buffer);
  // // const reader = response.body.getReader();
  var buffer = fs.readFileSync(filename);
  outputName = filename.split(".")[0] + ".csply";
  console.log(outputName);
  // let content2 = new Uint8Array(buffer.buffer);
  // console.log(content2);
  // console
  await compressSplat(buffer.buffer, outputName);
}

async function compressSplat(content, outputName) {
  // Read header
  console.log(content);
  const start = performance.now();
  const contentStart = new TextDecoder("utf-8").decode(content.slice(0, 2000));
  const headerEnd =
    contentStart.indexOf("end_header") + "end_header".length + 1;
  const [header] = contentStart.split("end_header");

  // Get number of gaussians
  const regex = /element vertex (\d+)/;
  const match = header.match(regex);
  gaussianCount = parseInt(match[1]);

  // Create arrays for gaussian properties
  const positions = [];
  const opacities = [];
  const rotations = [];
  const scales = [];
  const harmonics = [];
  const colors = [];
  const cov3Ds = [];

  // Scene bouding box
  sceneMin = new Array(3).fill(Infinity);
  sceneMax = new Array(3).fill(-Infinity);

  // Helpers
  const sigmoid = (m1) => 1 / (1 + Math.exp(-m1));
  const NUM_PROPS = 63;

  // Create a dataview to access the buffer's content on a byte levele
  const view = new DataView(content);

  // Get a slice of the dataview relative to a splat index
  const fromDataView = (splatID, start, end) => {
    const startOffset = headerEnd + splatID * NUM_PROPS * 4 + start * 4;

    if (end == null) return view.getFloat32(startOffset, true);

    return new Float32Array(end - start).map((_, i) =>
      view.getFloat32(startOffset + i * 4, true)
    );
  };

  // Extract all properties for a gaussian splat using the dataview
  const extractSplatData = (splatID) => {
    const position = fromDataView(splatID, 0, 3);
    // const n = fromDataView(splatID, 3, 6) // Not used
    const harmonic = fromDataView(splatID, 6, 9);

    const H_END = 6 + 48; // Offset of the last harmonic coefficient
    const opacity = fromDataView(splatID, H_END);
    const instance = fromDataView(splatID, H_END + 1);
    const scale = fromDataView(splatID, H_END + 2, H_END + 5);
    const rotation = fromDataView(splatID, H_END + 5, H_END + 9);

    return { position, harmonic, opacity, scale, rotation, instance };
  };

  // format is opacity (1), color(3), cov3d(6), position(3)
  out = [];
  out.push(gaussianCount);
  for (let i = 0; i < gaussianCount; i++) {
    currentSpat = [];
    // Extract data for current gaussian
    let { position, harmonic, opacity, scale, rotation, instance } = extractSplatData(i);

    // Update scene bounding box
    sceneMin = sceneMin.map((v, j) => Math.min(v, position[j]));
    sceneMax = sceneMax.map((v, j) => Math.max(v, position[j]));

    // Normalize quaternion
    let length2 = 0;

    for (let j = 0; j < 4; j++) length2 += rotation[j] * rotation[j];

    const length = Math.sqrt(length2);

    rotation = rotation.map((v) => v / length);

    // Exponentiate scale
    scale = scale.map((v) => Math.exp(v));

    // Activate alpha
    opacity = sigmoid(opacity);
    opacities.push(opacity);

    // (Webgl-specific) Equivalent to computeColorFromSH() with degree 0:
    // Use the first spherical harmonic to pre-compute the color.
    // This allow to avoid sending harmonics to the web worker or GPU,
    // but removes view-dependent lighting effects like reflections.
    // If we were to use a degree > 0, we would need to recompute the color
    // each time the camera moves, and send many more harmonics to the worker:
    // Degree 1: 4 harmonics needed (12 floats) per gaussian
    // Degree 2: 9 harmonics needed (27 floats) per gaussian
    // Degree 3: 16 harmonics needed (48 floats) per gaussian
    const SH_C0 = 0.28209479177387814;
    const color = [
      0.5 + SH_C0 * harmonic[0],
      0.5 + SH_C0 * harmonic[1],
      0.5 + SH_C0 * harmonic[2],
    ];
    colors.push(...color);
    // harmonics.push(...harmonic)

    // (Webgl-specific) Pre-compute the 3D covariance matrix from
    // the rotation and scale in order to avoid recomputing it at each frame.
    // This also allow to avoid sending rotations and scales to the web worker or GPU.
    const cov3D = computeCov3D(scale, 1, rotation);
    cov3Ds.push(...cov3D);
    // rotations.push(...rotation)
    // scales.push(...scale)

    positions.push(...position);

    currentSpat.push(opacity);
    currentSpat.push(...color);
    currentSpat.push(...cov3D);
    currentSpat.push(...position);
    currentSpat.push(instance);
    // console.log(currentSpat);
    out.push(...currentSpat);
  }

  var wstream = fs.createWriteStream(outputName);
  // var data = new Float32Array([1.1, 2.2, 3.3, 4.4, 5.5]);
  var data = out;
  console.log(data);
  // console.log(data.slice(0, 20));
  //prepare the length of the buffer to 4 bytes per float
  var buffer = new Buffer.alloc(data.length * 4);
  for (var i = 0; i < data.length; i++) {
    //write the float in Little-Endian and move the offset
    buffer.writeFloatLE(data[i], i * 4);
    // buffer.writeDoubleLE(data[i], i * 8);
  }
  wstream.write(buffer);
  wstream.end();

  console.log(
    `Loaded ${gaussianCount} gaussians in ${(
      (performance.now() - start) /
      1000
    ).toFixed(3)}s`
  );

  return { positions, opacities, colors, cov3Ds };
}

// Converts scale and rotation properties of each
// Gaussian to a 3D covariance matrix in world space.
// Original CUDA implementation: https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/main/cuda_rasterizer/forward.cu#L118
const { mat3 } = require("gl-matrix");
const tmp = mat3.create();
const S = mat3.create();
const R = mat3.create();
const M = mat3.create();
const Sigma = mat3.create();
function computeCov3D(scale, mod, rot) {
  //   console.log("computing cov 3d");
  // Create scaling matrix
  mat3.set(S, mod * scale[0], 0, 0, 0, mod * scale[1], 0, 0, 0, mod * scale[2]);

  const r = rot[0];
  const x = rot[1];
  const y = rot[2];
  const z = rot[3];

  // Compute rotation matrix from quaternion
  mat3.set(
    R,
    1 - 2 * (y * y + z * z),
    2 * (x * y - r * z),
    2 * (x * z + r * y),
    2 * (x * y + r * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - r * x),
    2 * (x * z - r * y),
    2 * (y * z + r * x),
    1 - 2 * (x * x + y * y)
  );

  mat3.multiply(M, S, R); // M = S * R

  // Compute 3D world covariance matrix Sigma
  mat3.multiply(Sigma, mat3.transpose(tmp, M), M); // Sigma = transpose(M) * M

  // Covariance is symmetric, only store upper right
  const cov3D = [Sigma[0], Sigma[1], Sigma[2], Sigma[4], Sigma[5], Sigma[8]];

  return cov3D;
}

// Download a .ply file from a ReadableStream chunk by chunk and monitor the progress
async function downloadPly(reader, contentLength) {
  return new Promise(async (resolve, reject) => {
    const buffer = new Uint8Array(contentLength);
    let downloadedBytes = 0;

    const readNextChunk = async () => {
      const { value, done } = await reader.read();

      if (!done) {
        downloadedBytes += value.byteLength;
        buffer.set(value, downloadedBytes - value.byteLength);

        const progress = (downloadedBytes / contentLength) * 100;

        readNextChunk();
      } else {
        resolve(buffer);
      }
    };

    readNextChunk();
  });
}

var args = process.argv.slice(2);
if (args.length != 1) {
  throw "Please enter file name!";
}
startCompression(args[0]);
