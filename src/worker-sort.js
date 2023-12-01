const data = {};
let gaussians;
let depthIndex;

instanceMode = false;
let instanceToColor = new Map();
onmessage = function (event) {
  // Init web worker event
  // console.log(
  //   "got msg",
  //   event.data,
  //   event.data.instanceMode,
  //   event.data.instanceMode !== undefined
  // );
  if (event.data.instanceMode !== undefined) {
    instanceMode = event.data.instanceMode;
    // console.log("GOT instance mode", instanceMode);
  }

  // console.log("got worker event", event.data);
  if (
    event.data.gaussians &&
    event.data.gaussians.selectedGaussians !== undefined &&
    event.data.gaussians.selectedGaussians.length != 0
  ) {
    // console.log("convering ", event.data.gaussians.selectedGaussians);
    selectedInSortedCoordiantes = event.data.gaussians.selectedGaussians;

    gaussians.selectedGaussians = [];
    inverseDepthIndex = new Uint32Array(gaussians.count);
    for (let j = 0; j < gaussians.count; j++) {
      const i = depthIndex[j];
      inverseDepthIndex[i] = j;
    }

    gaussians.selectedGaussians = [];
    for (let i = 0; i < selectedInSortedCoordiantes.length; i++) {
      const oldCord = selectedInSortedCoordiantes[i];
      // console.log("adding old cord");
      gaussians.selectedGaussians.push(inverseDepthIndex[oldCord]);
      // gaussians.selectedGaussians.push(oldCord);
    }

    // gaussians.selectedGaussians = event.data.selectedGaussians;

    // console.log(
    //   "got selected in worker from user after conversion",
    //   gaussians.selectedGaussians
    // );
  }

  if (event.data.gaussians) {
    gaussians = event.data.gaussians;
    gaussians.totalCount = gaussians.count;

    depthIndex = new Uint32Array(gaussians.count);

    // console.log(`[Worker] Received ${gaussians.count} gaussians`);
    // console.log(event.data);

    data.positions = new Float32Array(gaussians.count * 3);
    data.opacities = new Float32Array(gaussians.count);
    data.instances = new Float32Array(gaussians.count);
    data.cov3Da = new Float32Array(gaussians.count * 3);
    data.cov3Db = new Float32Array(gaussians.count * 3);

    data.colors = new Float32Array(gaussians.count * 3);
    data.selectedGaussians = [];
    // console.log("3ds are", gaussians);
    // gaussians.cov3Da = new Float32Array(gaussians.count * 3);
    // gaussians.cov3Db = new Float32Array(gaussians.count * 3);

    // for (let i = 0; i < gaussians.count; i++) {
    //   gaussians.cov3Da[i * 3] = gaussians.cov3Ds[i * 6];
    //   gaussians.cov3Da[i * 3 + 1] = gaussians.cov3Ds[i * 6 + 1];
    //   gaussians.cov3Da[i * 3 + 2] = gaussians.cov3Ds[i * 6 + 2];

    //   gaussians.cov3Db[i * 3] = gaussians.cov3Ds[i * 6 + 3];
    //   gaussians.cov3Db[i * 3 + 1] = gaussians.cov3Ds[i * 6 + 4];
    //   gaussians.cov3Db[i * 3 + 2] = gaussians.cov3Ds[i * 6 + 5];
    // }
    // console.log(gaussians);
  }
  // Sort gaussians event
  else if (event.data.viewMatrix) {
    const { viewMatrix, maxGaussians, sortingAlgorithm } = event.data;

    const start = performance.now();

    gaussians.count = Math.min(gaussians.totalCount, maxGaussians);

    // Sort the gaussians!
    sortGaussiansByDepth(depthIndex, gaussians, viewMatrix, sortingAlgorithm);

    // Update arrays containing the data
    // console.log("instances are", gaussians.instances);
    // console.log("data instances are", data.instances);

    for (let j = 0; j < gaussians.count; j++) {
      // for (let j = 0; j < 1000; j++) {
      const i = depthIndex[j];

      data.instances[j] = gaussians.instances[i];

      if (instanceMode) {
        // console.log(data.instances);
        // const instance = gaussians.instance[j]
        // if (gaussians.instances[j] != 0) {
        //   console.log("found non zero instance", gaussians.instances[j]);
        // }
        // console.log(data.instances);
        let color = [];
        const instance = data.instances[j];
        if (instanceToColor.has(instance)) {
          color = instanceToColor.get(instance);
          // console.log("existing color");
        } else {
          // console.log("did not find color");
          color = [Math.random(), Math.random(), Math.random()];
          instanceToColor.set(instance, color);
        }

        data.colors[j * 3] = color[0];
        data.colors[j * 3 + 1] = color[1];
        data.colors[j * 3 + 2] = color[2];
        // if (data.instances[j] == 0) {
        //   data.colors[j * 3] = 0;
        //   data.colors[j * 3 + 1] = 0;
        //   data.colors[j * 3 + 2] = 0;
        // } else if (data.instances[j] == 1) {
        //   data.colors[j * 3] = 1;
        //   data.colors[j * 3 + 1] = 0;
        //   data.colors[j * 3 + 2] = 0;
        // } else if (data.instances[j] == 2) {
        //   data.colors[j * 3] = 0;
        //   data.colors[j * 3 + 1] = 1;
        //   data.colors[j * 3 + 2] = 0;
        // } else if (data.instances[j] == 3) {
        //   data.colors[j * 3] = 0;
        //   data.colors[j * 3 + 1] = 0;
        //   data.colors[j * 3 + 2] = 1;
        // } else {
        //   data.colors[j * 3] = 0;
        //   data.colors[j * 3 + 1] = 1;
        //   data.colors[j * 3 + 2] = 1;
        // }
      } else {
        data.colors[j * 3] = gaussians.colors[i * 3];
        data.colors[j * 3 + 1] = gaussians.colors[i * 3 + 1];
        data.colors[j * 3 + 2] = gaussians.colors[i * 3 + 2];
      }

      data.positions[j * 3] = gaussians.positions[i * 3];
      data.positions[j * 3 + 1] = gaussians.positions[i * 3 + 1];
      data.positions[j * 3 + 2] = gaussians.positions[i * 3 + 2];

      data.opacities[j] = gaussians.opacities[i];

      data.cov3Da[j * 3] = gaussians.cov3Da[i * 3];
      data.cov3Da[j * 3 + 1] = gaussians.cov3Da[i * 3 + 1];
      data.cov3Da[j * 3 + 2] = gaussians.cov3Da[i * 3 + 2];

      data.cov3Db[j * 3] = gaussians.cov3Db[i * 3];
      data.cov3Db[j * 3 + 1] = gaussians.cov3Db[i * 3 + 1];
      data.cov3Db[j * 3 + 2] = gaussians.cov3Db[i * 3 + 2];

      // data.selectedGaussians[j] = gaussians.

      // Split the covariance matrix into two vec3
      // so they can be used as vertex shader attributes
      // data.cov3Da[j * 3] = gaussians.cov3Ds[i * 6];
      // data.cov3Da[j * 3 + 1] = gaussians.cov3Ds[i * 6 + 1];
      // data.cov3Da[j * 3 + 2] = gaussians.cov3Ds[i * 6 + 2];

      // data.cov3Db[j * 3] = gaussians.cov3Ds[i * 6 + 3];
      // data.cov3Db[j * 3 + 1] = gaussians.cov3Ds[i * 6 + 4];
      // data.cov3Db[j * 3 + 2] = gaussians.cov3Ds[i * 6 + 5];
    }

    data.selectedGaussians = [];
    // console.log("in worker selected are", gaussians.selectedGaussians);

    // gaussians.selectedGaussians = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // for (let k = 0; k < 1000; k++) {
    //   gaussians.selectedGaussians.push(k);
    // }

    inverseDepthIndex = new Uint32Array(gaussians.count);
    for (let j = 0; j < gaussians.count; j++) {
      const i = depthIndex[j];
      inverseDepthIndex[i] = j;
    }

    for (
      let selectedI = 0;
      selectedI < gaussians.selectedGaussians.length;
      selectedI++
    ) {
      const originalSelectedIndex = gaussians.selectedGaussians[selectedI];
      const j = inverseDepthIndex[originalSelectedIndex];

      // data.colors[j * 3] = 0;
      // data.colors[j * 3 + 1] = 0;
      // data.colors[j * 3 + 2] = 1;

      data.selectedGaussians.push(j);
    }

    const sortTime = `${((performance.now() - start) / 1000).toFixed(3)}s`;
    // console.log(
    // `[Worker] Sorted ${gaussians.count} gaussians in ${sortTime}. Algorithm: ${sortingAlgorithm}`
    // );
    //     );
    postMessage({
      data,
      sortTime,
    });
  }
};

function sortGaussiansByDepth(
  depthIndex,
  gaussians,
  viewMatrix,
  sortingAlgorithm
) {
  const calcDepth = (i) =>
    gaussians.positions[i * 3] * viewMatrix[2] +
    gaussians.positions[i * 3 + 1] * viewMatrix[6] +
    gaussians.positions[i * 3 + 2] * viewMatrix[10];

  // Default javascript sort [~0.9s]
  if (sortingAlgorithm == "Array.sort") {
    const indices = new Array(gaussians.count)
      .fill(0)
      .map((_, i) => ({
        depth: calcDepth(i),
        index: i,
      }))
      .sort((a, b) => a.depth - b.depth)
      .map((v) => v.index);

    depthIndex.set(indices);
  }
  // Quick sort algorithm (Hoare partition scheme) [~0.4s]
  else if (sortingAlgorithm == "quick sort") {
    const depths = new Float32Array(gaussians.count);

    for (let i = 0; i < gaussians.count; i++) {
      depthIndex[i] = i;
      depths[i] = calcDepth(i);
    }

    quicksort(depths, depthIndex, 0, gaussians.count - 1);
  }
  // 16 bit single-pass counting sort [~0.3s]
  // https://github.com/antimatter15/splat
  else if (sortingAlgorithm == "count sort") {
    let maxDepth = -Infinity;
    let minDepth = Infinity;
    let sizeList = new Int32Array(gaussians.count);

    for (let i = 0; i < gaussians.count; i++) {
      const depth = (calcDepth(i) * 4096) | 0;

      sizeList[i] = depth;
      maxDepth = Math.max(maxDepth, depth);
      minDepth = Math.min(minDepth, depth);
    }

    let depthInv = (256 * 256) / (maxDepth - minDepth);
    let counts0 = new Uint32Array(256 * 256);
    for (let i = 0; i < gaussians.count; i++) {
      sizeList[i] = ((sizeList[i] - minDepth) * depthInv) | 0;
      counts0[sizeList[i]]++;
    }
    let starts0 = new Uint32Array(256 * 256);
    for (let i = 1; i < 256 * 256; i++)
      starts0[i] = starts0[i - 1] + counts0[i - 1];
    for (let i = 0; i < gaussians.count; i++)
      depthIndex[starts0[sizeList[i]]++] = i;
  }
}

// Quicksort algorithm - https://en.wikipedia.org/wiki/Quicksort#Hoare_partition_scheme
function quicksort(A, B, lo, hi) {
  if (lo < hi) {
    const p = partition(A, B, lo, hi);
    quicksort(A, B, lo, p);
    quicksort(A, B, p + 1, hi);
  }
}

function partition(A, B, lo, hi) {
  const pivot = A[Math.floor((hi - lo) / 2) + lo];
  let i = lo - 1;
  let j = hi + 1;

  while (true) {
    do {
      i++;
    } while (A[i] < pivot);
    do {
      j--;
    } while (A[j] > pivot);

    if (i >= j) return j;

    let tmp = A[i];
    A[i] = A[j];
    A[j] = tmp; // Swap A
    tmp = B[i];
    B[i] = B[j];
    B[j] = tmp; // Swap B
  }
}
