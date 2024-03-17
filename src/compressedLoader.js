// format is opacity (1), color(3), cov3d(6), position(3)
async function loadPly(content) {
  // console.log(content);
  var data = new Float32Array(content);
  // console.log(data.slice(0, 14));
  gaussianCount = parseInt(data[0]);
  // console.log(gaussianCount);

  document.querySelector(
    "#loading-text"
  ).textContent = `Success. Initializing ${gaussianCount} gaussians...`;

  const positions = [];
  const opacities = [];
  const rotations = [];
  const scales = [];
  const harmonics = [];
  const colors = [];
  const originalColors = [];
  const cov3Ds = [];
  const instances = [];

  // Scene bouding box
  sceneMin = new Array(3).fill(Infinity);
  sceneMax = new Array(3).fill(-Infinity);

  // console.log(gaussianCount);
  for (let i = 0; i < gaussianCount; i++) {
    shift = 14 * i + 1;
    const opacity = data[shift];
    const color = data.slice(shift + 1, shift + 4);
    const cov3d = data.slice(shift + 4, shift + 10);
    const position = data.slice(shift + 10, shift + 13);
    const instance = data.slice(shift + 13, shift + 14);
    // console.log(data.slice(0, 100))

    opacities.push(opacity);
    colors.push(...color);
    originalColors.push(...color);
    cov3Ds.push(...cov3d);
    positions.push(...position);
    instances.push(instance);
  }
  // console.log("opacitiy", opacities[1]);
  // console.log("color", colors.slice(3, 6));
  // console.log("cov3d", cov3Ds.slice(6, 12));
  // console.log("position", positions.slice(3, 6));
  // console.log(instances)
  // console.log(opacities);

  return { positions, opacities, colors, cov3Ds, instances, originalColors };
}

// Converts scale and rotation properties of each
// Gaussian to a 3D covariance matrix in world space.
// Original CUDA implementation: https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/main/cuda_rasterizer/forward.cu#L118
const { mat3 } = glMatrix;
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
  currentlyDownloading = true;
  return new Promise(async (resolve, reject) => {
    const buffer = new Uint8Array(contentLength);
    let downloadedBytes = 0;

    const readNextChunk = async () => {
      if (shouldBreakDownload) {
        shouldBreakDownload = false;
        currentlyDownloading = false;
        return;
      }

      const { value, done } = await reader.read();

      if (!done) {
        downloadedBytes += value.byteLength;
        buffer.set(value, downloadedBytes - value.byteLength);

        const progress = (downloadedBytes / contentLength) * 100;
        document.querySelector("#loading-bar").style.width = progress + "%";
        document.querySelector(
          "#loading-text"
        ).textContent = `Downloading 3D scene... ${progress.toFixed(2)}%`;

        readNextChunk();
      } else {
        currentlyDownloading = false;
        resolve(buffer);
      }
    };

    readNextChunk();
  });
}
