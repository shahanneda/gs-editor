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
    calibrateCamera: () => { },
    finishCalibration: () => { },
    showGizmo: true,
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
    // console.log("setting buffer", buffer, "data", data);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
};

const isLocalHost =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";

async function main() {
    // Setup webgl context and buffers
    const { glContext, glProgram, buffers } = await setupWebglContext();
    gl = glContext;
    program = glProgram; // Handy global vars

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

        globalData = {
            gaussians: {
                ...data,
                // ...globalData.gaussians,
                // colors: data.colors,
                // cov3Ds: globalData.gaussians.cov3Ds,
                // cov3Da: globalData.gaussians.cov3Da,
                // cov3Db: globalData.gaussians.cov3Db,
                count: gaussianCount,
            },
        };

        if (
            getComputedStyle(document.querySelector("#loading-container")).opacity !=
            0
        ) {
            document.querySelector("#loading-container").style.opacity = 0;
            cam.disableMovement = false;
        }

        updateBuffer(buffers.color, data.colors);
        updateBuffer(buffers.center, data.positions);
        updateBuffer(buffers.opacity, data.opacities);
        updateBuffer(buffers.covA, data.cov3Da);
        updateBuffer(buffers.covB, data.cov3Db);

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
    };

    // Setup GUI
    initGUI();

    // Setup gizmo renderer
    await gizmoRenderer.init();

    // Load the default scene
    await loadScene({ scene: settings.scene });
}

function handleInteractive(e) {
    if (e.altKey && e.ctrlKey) {
        moveUp(e.clientX, e.clientY);
    } else if (e.ctrlKey) {
        // colorRed(e.clientX, e.clientY);
        removeOpacity(e.clientX, e.clientY);
    } else if (e.altKey) {
        if (settings.editingMode == "remove") {
            removeOpacity(e.clientX, e.clientY);
        } else if (settings.editingMode == "move") {
            moveUp(e.clientX, e.clientY);
        } else {
            interactiveColor(e.clientX, e.clientY);
        }
    }
}

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

// function removeOpacity(x, y) {
//     const hit = cam.raycast(x, y);
//     const hits = getGuassiansWithinDistance(hit.pos, settings.selectionSize);
//     console.log("hits", hits);

//     hits.forEach((hit) => {
//         const i = hit.id;
//         globalData.gaussians.opacities[i] = 0;
//     });

//     updateBuffer(opacityBuffer, globalData.gaussians.opacities);
//     requestRender();
//     cam.needsWorkerUpdate = true;
//     worker.postMessage(globalData);
//     cam.updateWorker();
// }

function removeOpacity(x, y) {
    const hit = cam.raycast(x, y);  // Get the clicked position in 3D space
    const removeCenter = hit.pos;
    const removeRadius = settings.selectionSize;
    // const intensityThreshold = 0.168;  // For 70% volume
    const intensityThreshold = 0.4;

    // Step 1: Gather two lists (interior and potential boundary gaussians)
    console.log("Step 1: Gather two lists (interior and potential boundary gaussians)");
    const { interiorGaussians, potentialBoundaryGaussians } = gatherGaussianListsCube(removeCenter, removeRadius);

    // Step 2: Filter potential boundary gaussians using the intersection test
    console.log("Step 2: Filter potential boundary gaussians using the intersection test");
    const boundaryGaussians = filterBoundaryGaussians(potentialBoundaryGaussians, intensityThreshold, removeCenter, removeRadius);

    // Step 3: Process interior gaussians by setting opacity to zero
    console.log("Step 3: Process interior gaussians by setting opacity to zero");
    processInteriorGaussians(interiorGaussians);

    // Step 4: Process boundary gaussians by approximating the outside part
    console.log("Step 4: Process boundary gaussians by approximating the outside part");
    processBoundaryGaussians(boundaryGaussians, intensityThreshold, removeCenter, removeRadius);

    // Update buffers and trigger render
    updateBuffer(positionBuffer, globalData.gaussians.positions);
    updateBuffer(colorBuffer, globalData.gaussians.colors);
    updateBuffer(opacityBuffer, globalData.gaussians.opacities);

    requestRender();
    cam.needsWorkerUpdate = true;
    worker.postMessage(globalData);
    cam.updateWorker();
}

// ====================================================================================================
// ====================================================================================================

// // Helper function for Step 1: Gather interior and potential boundary gaussians
// function gatherGaussianListsBall(removeCenter, removeRadius) {
//     const interiorGaussians = [];
//     const potentialBoundaryGaussians = [];

//     for (let i = 0; i < gaussianCount; i++) {
//         const gPos = globalData.gaussians.positions.slice(i * 3, i * 3 + 3);
//         const dist = vec3.distance(gPos, removeCenter);

//         if (dist < removeRadius) {
//             // Gaussian center is inside the removal radius
//             interiorGaussians.push({ id: i });
//         } else if (dist < 2 * removeRadius) {
//             // Gaussian center is potentially on the boundary
//             potentialBoundaryGaussians.push({
//                 id: i,
//                 position: gPos,
//                 cov3Da: globalData.gaussians.cov3Da.slice(i * 3, i * 3 + 3),
//                 cov3Db: globalData.gaussians.cov3Db.slice(i * 3, i * 3 + 3),
//                 color: globalData.gaussians.colors.slice(i * 3, i * 3 + 3),
//                 opacity: globalData.gaussians.opacities[i]
//             });
//         }
//     }

//     return { interiorGaussians, potentialBoundaryGaussians };
// }

function gatherGaussianListsCube(removeCenter, removeRadius) {
    const interiorGaussians = [];
    const potentialBoundaryGaussians = [];

    // Cube extends along the Z-axis by 2 * removeRadius, and horizontally centered at removeCenter
    const cubeMin = [
        removeCenter[0] - removeRadius,  // X min
        removeCenter[1] - removeRadius,  // Y min
        removeCenter[2],                 // Z min (bottom face, centered at removeCenter)
    ];

    const cubeMax = [
        removeCenter[0] + removeRadius,  // X max
        removeCenter[1] + removeRadius,  // Y max
        removeCenter[2] + 2 * removeRadius,  // Z max (top face of the cube)
    ];

    for (let i = 0; i < gaussianCount; i++) {
        const gPos = globalData.gaussians.positions.slice(i * 3, i * 3 + 3);

        // Check if the Gaussian center is inside the cube (interior)
        const insideX = gPos[0] >= cubeMin[0] && gPos[0] <= cubeMax[0];
        const insideY = gPos[1] >= cubeMin[1] && gPos[1] <= cubeMax[1];
        const insideZ = gPos[2] >= cubeMin[2] && gPos[2] <= cubeMax[2];

        if (insideX && insideY && insideZ) {
            // Gaussian center is inside the removal region (interior)
            interiorGaussians.push({ id: i });
        } else {
            // Check if the Gaussian is near the boundary (within a shell around the cube)
            const nearBoundaryX = gPos[0] >= (cubeMin[0] - removeRadius) && gPos[0] <= (cubeMax[0] + removeRadius);
            const nearBoundaryY = gPos[1] >= (cubeMin[1] - removeRadius) && gPos[1] <= (cubeMax[1] + removeRadius);
            const nearBoundaryZ = gPos[2] >= (cubeMin[2] - removeRadius) && gPos[2] <= (cubeMax[2] + removeRadius);

            if (nearBoundaryX && nearBoundaryY && nearBoundaryZ) {
                // Gaussian center is potentially on the boundary
                potentialBoundaryGaussians.push({ id: i });
            }
        }
    }

    return { interiorGaussians, potentialBoundaryGaussians };
}

// ====================================================================================================
// ====================================================================================================

// Helper function for Step 2: Filter potential boundary gaussians
function filterBoundaryGaussians(potentialBoundaryGaussians, intensityThreshold, removeCenter, removeRadius) {
    const boundaryGaussians = [];

    potentialBoundaryGaussians.forEach(gaussian => {
        const i = gaussian.id;
        const gPos = globalData.gaussians.positions.slice(i * 3, i * 3 + 3);

        // Retrieve the covariance matrix of the Gaussian
        const [a, b, c] = globalData.gaussians.cov3Da.slice(i * 3, i * 3 + 3);
        const [d, e, f] = globalData.gaussians.cov3Db.slice(i * 3, i * 3 + 3);
        const gCov = [
            [a, b, c],
            [b, d, e],
            [c, e, f],
        ];

        // Call the ellipsoid intersection test with the updated arguments
        if (ellipsoidCubeIntersectionTest(gPos, gCov, intensityThreshold, removeCenter, removeRadius)) {
            boundaryGaussians.push(gaussian);
        }
    });

    return boundaryGaussians;
}

function ellipsoidCubeIntersectionTest(gPos, gCov, intensityThreshold, removeCenter, removeRadius) {
    // Calculate the scaling factor
    const scalingFactor = Math.sqrt((2 * Math.PI) ** 3 * Math.abs(math.det(gCov))) * intensityThreshold;

    // Calculate the effective contour level
    const k = -2 * Math.log(scalingFactor);

    // Calculate semi-axis lengths for the ellipsoid
    const r_x = Math.sqrt(k * gCov[0][0]);
    const r_y = Math.sqrt(k * gCov[1][1]);
    const r_z = Math.sqrt(k * gCov[2][2]);

    // Define the bounding box for the ellipsoid
    const ellipsoidBounds = {
        min: [
            gPos[0] - r_x,
            gPos[1] - r_y,
            gPos[2] - r_z
        ],
        max: [
            gPos[0] + r_x,
            gPos[1] + r_y,
            gPos[2] + r_z
        ]
    };

    // Calculate the bounds of the cube
    const cubeBounds = {
        min: [
            removeCenter[0] - removeRadius,
            removeCenter[1] - removeRadius,
            removeCenter[2], // Bottom face
        ],
        max: [
            removeCenter[0] + removeRadius,
            removeCenter[1] + removeRadius,
            removeCenter[2] + 2 * removeRadius, // Height of the cube
        ]
    };

    // Check for intersection between the ellipsoid and the cube
    const intersects = (
        ellipsoidBounds.min[0] <= cubeBounds.max[0] && ellipsoidBounds.max[0] >= cubeBounds.min[0] &&
        ellipsoidBounds.min[1] <= cubeBounds.max[1] && ellipsoidBounds.max[1] >= cubeBounds.min[1] &&
        ellipsoidBounds.min[2] <= cubeBounds.max[2] && ellipsoidBounds.max[2] >= cubeBounds.min[2]
    );

    return intersects;
}

// ====================================================================================================
// ====================================================================================================

// function ellipsoidSphereIntersectionTest(gPos, gCov, intensityThreshold, removeCenter, removeRadius) {
//     // Convert input positions and covariance matrices into math.js matrices
//     const mu_A = math.matrix(Array.from(gPos));          // Gaussian's position
//     const mu_B = math.matrix(Array.from(removeCenter));  // Removal sphere's center
//     const Sigma_A = math.matrix(Array.from(gCov));       // Gaussian's covariance

//     // Define Sigma_B (covariance matrix for the sphere)
//     const Sigma_B = math.multiply(removeRadius ** 2, math.identity(3));  // Sphere's covariance matrix

//     // Calculate scaling factor based on intensity threshold
//     const scalingFactor = Math.sqrt(-2 * Math.log(intensityThreshold));

//     // Compute eigenvalues and eigenvectors
//     const { values: lambdas, vectors: Phi } = math.eigs(math.multiply(math.inv(Sigma_B), Sigma_A));

//     // Calculate the squared distance transformed by the eigenvectors
//     const v_squared = math.square(math.multiply(math.transpose(Phi), math.subtract(mu_A, mu_B)));

//     // Minimize KFunction over the range [0, 1]
//     const result = minimizeScalar((s) => KFunction(s, lambdas, v_squared, scalingFactor), 0.0, 1.0);

//     // Return whether the intersection occurs
//     return result >= 0;
// }

// // K function to evaluate during minimization
// function KFunction(s, lambdas, v_squared, tau) {
//     const term1 = math.sum(math.multiply(v_squared, math.multiply(s, math.subtract(1, s))));
//     const term2 = math.sum(math.dotMultiply(term1, math.dotDivide(1, math.add(1, math.multiply(s, math.subtract(lambdas, 1))))));
//     return 1 - (1 / (tau ** 2)) * term2;
// }

// // Minimize function using ternary search
// function minimizeScalar(func, left, right) {
//     const epsilon = 1e-9; // Precision for the search

//     while (right - left > epsilon) {
//         const m1 = left + (right - left) / 3;
//         const m2 = right - (right - left) / 3;

//         if (func(m1) < func(m2)) {
//             right = m2;
//         } else {
//             left = m1;
//         }
//     }

//     return func((left + right) / 2);
// }

// ====================================================================================================
// ====================================================================================================

// Helper function for Step 3: Process interior gaussians by setting opacity to zero
function processInteriorGaussians(interiorGaussians) {
    interiorGaussians.forEach(g => {
        globalData.gaussians.opacities[g.id] = 0;
    });
}

function concatTypedArrays(arr1, arr2) {
    const newArr = new arr1.constructor(arr1.length + arr2.length); // Creates new typed array
    newArr.set(arr1); // Copies arr1 into newArr
    newArr.set(arr2, arr1.length); // Copies arr2 after arr1
    return newArr;
}

// Helper function for Step 4: Process boundary gaussians by approximating the outside part
function processBoundaryGaussians(boundaryGaussians, intensityThreshold, removeCenter, removeRadius) {
    boundaryGaussians.forEach(gaussian_idx => {
        const i = gaussian_idx.id;
        // Make the old gaussian invisible
        globalData.gaussians.opacities[i] = 0;
        const newGaussians = approximateGaussianOutsideCube(gaussian_idx, intensityThreshold, removeCenter, removeRadius);

        newGaussians.forEach(newGaussian => {
            if (newGaussian) {
                // Concatenate new data for positions, cov3Da, cov3Db, and colors
                globalData.gaussians.positions = concatTypedArrays(globalData.gaussians.positions, new Float32Array(newGaussian.position));
                globalData.gaussians.cov3Da = concatTypedArrays(globalData.gaussians.cov3Da, new Float32Array(newGaussian.cov3Da));
                globalData.gaussians.cov3Db = concatTypedArrays(globalData.gaussians.cov3Db, new Float32Array(newGaussian.cov3Db));
                globalData.gaussians.colors = concatTypedArrays(globalData.gaussians.colors, new Float32Array(newGaussian.color));
                globalData.gaussians.opacities = concatTypedArrays(globalData.gaussians.opacities, new Float32Array([newGaussian.opacity]));
            }
        });
    });
}

// ====================================================================================================
// method 2: approximate the remove region with half-space
// ====================================================================================================

function approximateGaussianOutsideCube(gaussian_idx, intensityThreshold, removeCenter, removeRadius) {
    const resultEllipsoids = [];

    // Define the six planes of the cube
    const planes = [
        {
            normal: [0, 0, -1], point: [
                removeCenter[0],
                removeCenter[1],
                removeCenter[2]]
        }, // Bottom face
        {
            normal: [0, 0, 1], point: [
                removeCenter[0],
                removeCenter[1],
                removeCenter[2] + removeRadius * 2]
        }, // Top face
        {
            normal: [-1, 0, 0], point: [
                removeCenter[0] - removeRadius,
                removeCenter[1],
                removeCenter[2] + removeRadius]
        }, // Left face
        {
            normal: [1, 0, 0], point: [
                removeCenter[0] + removeRadius,
                removeCenter[1],
                removeCenter[2] + removeRadius]
        }, // Right face
        {
            normal: [0, -1, 0], point: [
                removeCenter[0],
                removeCenter[1] - removeRadius,
                removeCenter[2] + removeRadius]
        }, // Front face
        {
            normal: [0, 1, 0], point: [
                removeCenter[0],
                removeCenter[1] + removeRadius,
                removeCenter[2] + removeRadius]
        }  // Back face
    ];

    // Loop through each plane and call the helper function
    for (const { normal, point } of planes) {
        // approximate using 3 balls
        const smallerEllipsoids = approximateGaussianOutsideHalfSpace(gaussian_idx, intensityThreshold, point, normal, 3);
        resultEllipsoids.push(...smallerEllipsoids);
    }

    return resultEllipsoids;
}

function approximateGaussianOutsideHalfSpace(gaussian_idx, intensityThreshold, planeCenter, planeNormal, numSmallerBalls) {
    // read data
    const i = gaussian_idx.id;
    const gPos = Array.from(globalData.gaussians.positions.slice(i * 3, i * 3 + 3));
    const [a, b, c] = globalData.gaussians.cov3Da.slice(i * 3, i * 3 + 3);
    const [d, e, f] = globalData.gaussians.cov3Db.slice(i * 3, i * 3 + 3);
    const gCov = math.matrix([
        [a, b, c],
        [b, d, e],
        [c, e, f],
    ]);
    const color = globalData.gaussians.colors.slice(i * 3, i * 3 + 3);
    const opacity = globalData.gaussians.opacities[i];

    // Eigen decomposition of Sigma to get U and Lambda
    const { values: eigenvalues, vectors: eigenvectors } = math.eigs(gCov);

    // Construct the affine transformation matrix A = U^T * Lambda^(-1/2) * U
    const LambdaInvSqrt = math.diag(eigenvalues.map(v => Math.sqrt(1 / v))); // Lambda^(-1/2)
    const U = eigenvectors;
    const A = math.multiply(math.multiply(math.transpose(U), LambdaInvSqrt), U); // A = U^T * Lambda^(-1/2) * U

    // Apply transformations
    const transformedPosition = math.multiply(A, gPos); // A * mu
    const transformedPlanePoint = math.multiply(A, planeCenter); // Transform removeCenter
    let transformedPlaneNormal = math.multiply(math.inv(A), planeNormal);
    transformedPlaneNormal = math.divide(transformedPlaneNormal, math.norm(transformedPlaneNormal)); // Normalize the normal

    // Calculate the determinant of the covariance matrix to determine scaling factor
    const scalingFactor = Math.sqrt((2 * Math.PI) ** 3 * Math.abs(math.det(gCov))) * intensityThreshold;
    const C = -2 * Math.log(scalingFactor);

    // Define the radius R of the transformed Gaussian (which is now a ball)
    const R = Math.sqrt(C); // Effective radius based on contour level

    // Use the utility function to get the smaller balls
    const ball = {
        center: transformedPosition,
        radius: R
    }
    let smallerBalls = []
    console.log("Computing smaller balls...");
    if (numSmallerBalls === 2) {
        smallerBalls.push(...approximateCutBall2(ball, transformedPlanePoint, transformedPlaneNormal));
    }
    else if (numSmallerBalls === 3) {
        smallerBalls.push(...approximateCutBall3(ball, transformedPlanePoint, transformedPlaneNormal));
    }

    // Transform the smaller balls back to the original space
    const resultEllipsoids = smallerBalls.map(ball => {
        const newPos = math.multiply(math.inv(A), ball.center); // Transform back
        const newCov = math.multiply(gCov, ball.radius ** 2 / C)._data;
        const newCov3Da = [newCov[0][0], newCov[0][1], newCov[0][2]]; // Upper triangular part, row 0
        const newCov3Db = [newCov[1][1], newCov[1][2], newCov[2][2]]; // Upper triangular part, row 1
        return {
            position: newPos,
            cov3Da: newCov3Da,
            cov3Db: newCov3Db,
            color: color,
            opacity: opacity,
        };
    });

    return resultEllipsoids;
}

function approximateCutBall2(originalBall, planePoint, planeNormal) {
    // Calculate the distance h from the ball center to the plane
    const h = math.dot(math.subtract(originalBall.center, planePoint), planeNormal);

    // Check if the ball intersects the plane
    if (h >= originalBall.radius) {
        return [originalBall]; // Ball is entirely above the plane
    }

    // To find an offset vector parallel to the plane, we can pick one vector in the plane
    let planeTangent = math.cross(planeNormal, [1, 0, 0]); // First tangent vector

    // Ensure we have a valid tangent, recalculate if the first cross product resulted in a zero vector
    if (math.norm(planeTangent) === 0) {
        planeTangent = math.cross(planeNormal, [0, 1, 0]);
    }

    let r, centerPoint;

    if (h >= originalBall.radius / 2) {
        r = originalBall.radius / 2;
        centerPoint = originalBall.center;
    }
    else {
        // Solve for r using the quadratic equation: r^2 + (2R - 2h)r + (h^2 - R^2) = 0
        const a = 1; // Coefficient of r^2
        const b = 2 * originalBall.radius - 2 * h; // Coefficient of r
        const c = h * h - originalBall.radius * originalBall.radius; // Constant term
        // Use the quadratic formula: r = (-b ± sqrt(b^2 - 4ac)) / 2a
        const discriminant = b * b - 4 * a * c;
        const r1 = (-b + Math.sqrt(discriminant)) / (2 * a);
        const r2 = (-b - Math.sqrt(discriminant)) / (2 * a);
        r = Math.max(r1, r2); // Choose the positive radius

        // Calculate the center point on the plane
        centerPoint = math.add(planePoint, math.multiply(planeNormal, r));
    }

    const offset = math.multiply(planeTangent, r); // Offset in the direction of the tangent

    // Create two smaller balls centered symmetrically about the centerPoint
    const smallerBalls = [
        {
            center: math.add(centerPoint, offset),
            radius: r
        },  // First smaller ball
        {
            center: math.subtract(centerPoint, offset),
            radius: r
        } // Second smaller ball
    ];

    return smallerBalls;
}

function approximateCutBall3(originalBall, planePoint, planeNormal) {
    // Calculate the distance h from the ball center to the plane
    const h = math.dot(math.subtract(originalBall.center, planePoint), planeNormal);

    // Check if the ball intersects the plane
    if (h >= originalBall.radius) {
        return [originalBall]; // Ball is entirely above the plane
    }

    // To find an offset vector parallel to the plane, we can pick one vector in the plane
    let planeTangent1 = math.cross(planeNormal, [1, 0, 0]); // First tangent vector
    let planeTangent2 = math.cross(planeNormal, [0, 1, 0]);
    // Ensure we have a valid tangent, recalculate if the first cross product resulted in a zero vector
    if (math.norm(planeTangent1) === 0) {
        planeTangent1 = math.cross(planeTangent1, [0, 0, 1]);
    }
    if (math.norm(planeTangent2) === 0) {
        planeTangent2 = math.cross(planeTangent2, [0, 0, 1]);
    }

    let r, centerPoint;

    if (h >= math.multiply((2 * math.sqrt(3) + 3) / 3, originalBall.radius)) {
        r = math.multiply((2 * math.sqrt(3) + 3) / 3, originalBall.radius);
        centerPoint = originalBall.center;
    }
    else {
        // Solve for r using the quadratic equation: 4/3 * r^2 + (2R - 2h)r + (h^2 - R^2) = 0
        const a = 4 / 3; // Coefficient of r^2
        const b = 2 * originalBall.radius - 2 * h; // Coefficient of r
        const c = h * h - originalBall.radius * originalBall.radius; // Constant term
        // Use the quadratic formula: r = (-b ± sqrt(b^2 - 4ac)) / 2a
        const discriminant = b * b - 4 * a * c;
        const r1 = (-b + Math.sqrt(discriminant)) / (2 * a);
        const r2 = (-b - Math.sqrt(discriminant)) / (2 * a);
        r = Math.max(r1, r2); // Choose the positive radius

        // Calculate the center point on the plane
        centerPoint = math.add(planePoint, math.multiply(planeNormal, r));
    }

    const offset1 = math.multiply(planeTangent1, 2 / math.sqrt(3) * r); // Offset in the direction of the tangent
    const offset2 = math.add(math.multiply(planeTangent1, -1 / math.sqrt(3) * r), math.multiply(planeTangent2, r));
    const offset3 = math.subtract(math.multiply(planeTangent1, -1 / math.sqrt(3) * r), math.multiply(planeTangent2, r));

    // Create two smaller balls centered symmetrically about the centerPoint
    const smallerBalls = [
        {
            center: math.add(centerPoint, offset1),
            radius: r
        },  // First smaller ball
        {
            center: math.add(centerPoint, offset2),
            radius: r
        }, // Second smaller ball
        {
            center: math.add(centerPoint, offset3),
            radius: r
        } // Second smaller ball
    ];

    return smallerBalls;
}

// ====================================================================================================
// method 1: LS fitting to points sampled on the surface of the out side region
// ====================================================================================================

// Helper function to approximate the Gaussian outside the removal region
// function approximateGaussianOutside(gaussian, intensityThreshold, removeCenter, removeRadius) {

//     // Step 1: Check if the Gaussian center is outside the removal region
//     const distToRemove = vec3.distance(gaussian.position, removeCenter);
//     if (distToRemove >= removeRadius) {
//         // Step 2: If the center is outside, sample points on the boundary of the intersection
//         console.log("Calling sampleBoundaryPoints...");
//         const boundaryPoints = sampleBoundaryPoints(gaussian, intensityThreshold, removeCenter, removeRadius, 10);  // Sample 10 points

//         // Step 3: Fit an ellipsoid to the sampled points using least squares
//         console.log("Calling fitEllipsoidToPoints...");
//         const fittedEllipsoid = fitEllipsoidToPoints(boundaryPoints, intensityThreshold);

//         // Step 4: Create a new Gaussian with the ellipsoid parameters (covariance, center)
//         if (fittedEllipsoid) {
//             return {
//                 position: fittedEllipsoid.center,
//                 cov3Da: fittedEllipsoid.cov3Da,
//                 cov3Db: fittedEllipsoid.cov3Db,
//                 color: gaussian.color,  // Keep original color
//                 opacity: gaussian.opacity  // Keep original opacity
//             };
//         }
//     }

//     // Return null if no approximation is needed
//     return null;
// }

// ====================================================================================================
// ====================================================================================================

// Helper function to sample boundary points between the Gaussian and removal region
function sampleBoundaryPoints(gaussian, intensityThreshold, removeCenter, removeRadius, numPoints) {
    const points = [];
    const [a, b, c] = gaussian.cov3Da;
    const [d, e, f] = gaussian.cov3Db;
    const Sigma = [
        [a, b, c],
        [b, d, e],
        [c, e, f],
    ];
    for (let i = 0; i < numPoints; i++) {
        // Sample random directions on the Gaussian ellipsoid
        const randomDirection = getRandomUnitVector();

        // Find points on the Gaussian's contour using the covariance
        const pointOnGaussian = getPointOnEllipsoid(gaussian.position, Sigma, randomDirection, intensityThreshold);

        // Check if the point is outside the removal region (distance > removeRadius)
        const distToCenter = vec3.distance(pointOnGaussian, removeCenter);
        if (distToCenter > removeRadius) {
            points.push(pointOnGaussian);
        }
        else {
            // Find the point where the ray from Gaussian center intersects with the remove region's boundary
            const pointOnBoundary = getPointOnBoundary(gaussian.position, randomDirection, removeCenter, removeRadius);
            points.push(pointOnBoundary);
        }
    }
    console.log("points:", points);
    return points;
}

// Helper function to get a point on the Gaussian ellipsoid's boundary at a specific intensity threshold
function getPointOnEllipsoid(center, covariance, direction, intensityThreshold) {
    // The direction vector is a unit vector pointing away from the center
    const unitDirection = vec3.normalize([], direction);

    // To get the scale factor (distance from center), we solve for the distance
    // such that the Gaussian function's value is equal to the intensity threshold.
    // The ellipsoid equation is (x - mu)^T * Sigma^-1 * (x - mu) = constant.
    // The intensity threshold gives us the value of this constant.

    // First, scale the direction vector by the covariance matrix
    const scaledDirection = vec3.transformMat3([], unitDirection, covariance);

    // Compute the scaling factor for the boundary contour based on the intensity threshold
    const scalingFactor = Math.sqrt(-2 * Math.log(intensityThreshold));  // Example: intensity threshold defines contour

    // Scale the direction by the scale factor to find the point on the ellipsoid
    const boundaryPoint = vec3.scaleAndAdd([], center, scaledDirection, scalingFactor);

    return boundaryPoint;
}

// Updated getPointOnBoundary function to correctly sample from the boundary of the removal region
function getPointOnBoundary(gaussianCenter, direction, removeCenter, removeRadius) {
    // Define the vector from the remove center to the Gaussian center
    const removeToGaussian = vec3.subtract([], gaussianCenter, removeCenter);

    // Coefficients for the quadratic equation to find the intersection point of the ray with the sphere (removal region)
    const a = vec3.dot(direction, direction); // This will be 1 for a unit vector
    const b = 2 * vec3.dot(direction, removeToGaussian);
    const c = vec3.dot(removeToGaussian, removeToGaussian) - removeRadius * removeRadius;

    // Solve the quadratic equation: a * t^2 + b * t + c = 0
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
        // No real solutions, no intersection
        console.log("No real solutions, no intersection");
        return null;
    }

    // Calculate the two possible solutions (t values)
    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

    // Use the smaller t to get the first intersection point (closest to the Gaussian center)
    const t = Math.min(t1, t2);

    // Compute the intersection point: gaussianCenter + t * direction
    const intersectionPoint = vec3.add([], gaussianCenter, vec3.scale([], direction, t));

    return intersectionPoint;
}

// Helper function to get a random unit vector (for sampling points on the ellipsoid)
function getRandomUnitVector() {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.sin(phi) * Math.sin(theta);
    const z = Math.cos(phi);
    return [x, y, z];
}

// ====================================================================================================
// ====================================================================================================

// Helper function to fit an ellipsoid to a set of points using least squares and intensity threshold
function fitEllipsoidToPoints(points, intensityThreshold) {
    const n = points.length;
    if (n < 5) {
        console.error("Not enough points to fit an ellipsoid");
        return null;
    }

    // Scale the points based on the intensity threshold
    const scalingFactor = Math.sqrt(-2 * Math.log(intensityThreshold));  // Mahalanobis distance scaling factor

    const A = [];
    const B = [];

    // Construct the least squares matrix A and vector B
    points.forEach(point => {
        // Scale the point to match the contour of the desired intensity threshold
        const scaledPoint = vec3.scale([], point, scalingFactor);
        const [x, y, z] = scaledPoint;
        A.push([x * x, y * y, z * z, 2 * x * y, 2 * x * z, 2 * y * z, 2 * x, 2 * y, 2 * z]);
        B.push(1);  // Right-hand side of the equation for least squares fitting
    });

    // Solve the least squares system: A * p = B
    const p = solveLeastSquares(A, B);

    if (!p) {
        console.error("Ellipsoid fitting failed");
        return null;
    }

    // Extract ellipsoid parameters (center, covariance) from the solution vector p
    const ellipsoidCenter = extractEllipsoidCenter(p);

    // Construct the covariance matrix as upper triangle (cov3Da and cov3Db)
    const [cov3Da, cov3Db] = extractEllipsoidCovariance(p);

    return {
        center: ellipsoidCenter,
        cov3Da: cov3Da,  // First part of the upper triangle of covariance
        cov3Db: cov3Db   // Second part of the upper triangle of covariance
    };
}

// Solve the least squares system (math.js will be globally available via script tag)
function solveLeastSquares(A, B) {
    // Convert A and B to math.js matrix format
    const A_matrix = math.matrix(A);
    const B_matrix = math.matrix(B);

    // Compute the least squares solution p using the formula p = (A^T * A)^{-1} * (A^T * B)
    const AT = math.transpose(A_matrix);
    const ATA = math.multiply(AT, A_matrix);
    const ATb = math.multiply(AT, B_matrix);
    const ATA_inv = math.inv(ATA);
    const p = math.multiply(ATA_inv, ATb);

    return p.valueOf(); // Convert result back to a regular array
}

// Helper function to extract ellipsoid center from the least squares solution
function extractEllipsoidCenter(p) {
    // The center coordinates (x_0, y_0, z_0) are calculated as follows:
    const x0 = -p[6] / p[0];  // G / A
    const y0 = -p[7] / p[1];  // H / B
    const z0 = -p[8] / p[2];  // I / C

    return [x0, y0, z0];
}

// Helper function to extract ellipsoid covariance from the least squares solution
function extractEllipsoidCovariance(p) {
    // Construct the covariance matrix:
    // Diagonal terms (variance along x, y, z axes)
    const sigma_xx = 1 / p[0];
    const sigma_yy = 1 / p[1];
    const sigma_zz = 1 / p[2];

    // Off-diagonal terms (covariance terms, normalized)
    const sigma_xy = p[3] / (p[0] * p[1]);  // D / (A * B)
    const sigma_xz = p[4] / (p[0] * p[2]);  // E / (A * C)
    const sigma_yz = p[5] / (p[1] * p[2]);  // F / (B * C)

    // Upper triangular part of the covariance matrix
    const cov3Da = [sigma_xx, sigma_xy, sigma_xz];
    const cov3Db = [sigma_yy, sigma_yz, sigma_zz];

    return [cov3Da, cov3Db];
}

// ====================================================================================================
// ====================================================================================================

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
        },
    };
    // console.log(globalData);

    // Send gaussian data to the worker

    worker.postMessage({
        gaussians: {
            ...data,
            count: gaussianCount,
        },
    });

    // Setup camera
    console.log(scene);
    const cameraParameters = scene ? defaultCameraParameters[scene] : {};
    console.log(cameraParameters);

    if (cam == null) cam = new Camera(cameraParameters);
    else cam.setParameters(cameraParameters);
    cam.update();

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
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, settings.maxGaussians);

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

window.onload = main;
