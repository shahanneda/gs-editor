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
    const gaussiansWithinDistance = getGuassiansWithinDistance(removeCenter, removeRadius);
    console.log("hits", gaussiansWithinDistance);
    let numRemoved = 0;
    let numReplaced = 0;
    // For each hit, determine if the Gaussian is a boundary Gaussian and approximate the outside region
    gaussiansWithinDistance.forEach((g) => {
        const i = g.id;

        const gaussian = {
            position: globalData.gaussians.positions.slice(3 * i, 3 * i + 3),
            cov3Da: globalData.gaussians.cov3Da.slice(3 * i, 3 * i + 3),
            cov3Db: globalData.gaussians.cov3Db.slice(3 * i, 3 * i + 3),
            color: globalData.gaussians.colors.slice(3 * i, 3 * i + 3),
            opacity: globalData.gaussians.opacities[i]
        };

        // If the Gaussian is a boundary Gaussian, compute the new Gaussian outside the removal region
        const newGaussian = approximateGaussianOutside(gaussian, removeCenter, removeRadius);

        // Replace the original Gaussian with the new one
        if (newGaussian) {
            // Update positions
            globalData.gaussians.positions.set(newGaussian.position, 3 * i);

            // Update covariances
            globalData.gaussians.cov3Da.set(newGaussian.cov3Da, 3 * i);
            globalData.gaussians.cov3Db.set(newGaussian.cov3Db, 3 * i);

            // Update colors and opacity
            globalData.gaussians.colors.set(newGaussian.color, 3 * i);
            globalData.gaussians.opacities[i] = newGaussian.opacity;
            numReplaced += 1;
        } else {
            // If no new Gaussian is created, remove it by setting opacity to 0
            globalData.gaussians.opacities[i] = 0;
            numRemoved += 1;
        }
    });
    console.log("numReplaced / (numReplaced + numRemoved):", numReplaced / (numReplaced + numRemoved));
    console.log("numReplaced + numRemoved:", numReplaced + numRemoved);
    console.log("gaussiansWithinDistance.length:", gaussiansWithinDistance.length);
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

function getGuassiansWithinDistance(pos, threshold, intensityThreshold) {
    const hits = [];
    for (let i = 0; i < gaussianCount; i++) {
        const gPos = globalData.gaussians.positions.slice(i * 3, i * 3 + 3);
        const dist = vec3.distance(gPos, pos);

        // Check if the Gaussian center is within the removal region
        if (dist < threshold) {
            hits.push({
                id: i,
            });
        }
    }

    // Also check for Gaussians intersecting with the boundary
    const boundaryGaussians = getGaussiansOnBoundary(pos, threshold, intensityThreshold);
    hits.push(...boundaryGaussians);

    return hits;
}

// Updated getGaussiansOnBoundary function
function getGaussiansOnBoundary(removeCenter, removeRadius, intensityThreshold) {
    const boundaryHits = [];

    for (let i = 0; i < gaussianCount; i++) {
        const gPos = globalData.gaussians.positions.slice(i * 3, i * 3 + 3);

        // Retrieve the covariance matrix (from cov3Da and cov3Db)
        const [a, b, c] = globalData.gaussians.cov3Da.slice(i * 3, i * 3 + 3);
        const [d, e, f] = globalData.gaussians.cov3Db.slice(i * 3, i * 3 + 3);
        const Sigma = [
            [a, b, c],
            [b, d, e],
            [c, e, f],
        ];

        // Test for intersection with the removal sphere
        if (ellipsoidIntersectsSphere(Sigma, gPos, removeCenter, removeRadius, intensityThreshold)) {
            boundaryHits.push({
                id: i,
            });
        }
    }

    return boundaryHits;
}

// Helper function to perform the ellipsoid-sphere intersection test
function ellipsoidIntersectsSphere(Sigma, gPos, removeCenter, removeRadius, intensityThreshold) {
    // First, set up the eigenvalues (lambdas) and eigenvectors (Phi) for the ellipsoid
    const SigmaInverse = math.inv(Sigma);
    const scalingFactor = Math.sqrt(-2 * Math.log(intensityThreshold));

    // Sphere covariance is removeRadius squared, times identity matrix
    const SigmaSphere = [
        [removeRadius * removeRadius, 0, 0],
        [0, removeRadius * removeRadius, 0],
        [0, 0, removeRadius * removeRadius]
    ];

    // Calculate lambdas and eigenvectors (Phi)
    const eigResult = math.eigs(SigmaInverse, SigmaSphere);
    const lambdas = eigResult.values;
    const Phi = eigResult.vectors;

    // Compute the Mahalanobis distance from the Gaussian center to the removal center
    const diff = vec3.subtract([], gPos, removeCenter);
    const v_squared = math.dotMultiply(math.transpose(Phi), diff).map(x => x * x);

    // Minimize the K function to test for intersection
    const result = minimizeScalar((s) => K_function(s, lambdas, v_squared, scalingFactor), [0.0, 0.5, 1.0]);

    return result >= 0;  // Returns true if ellipsoid intersects the sphere
}

// K function for minimizing the ellipsoid-sphere intersection test
function K_function(s, lambdas, v_squared, tau) {
    let sum = 0;
    for (let i = 0; i < lambdas.length; i++) {
        sum += v_squared[i] * ((s * (1 - s)) / (1 + s * (lambdas[i] - 1)));
    }
    return 1 - (1 / tau ** 2) * sum;
}

// Perform the minimization of a scalar function (used in ellipsoid intersection test)
function minimizeScalar(fn, bracket) {
    const tol = 1e-5;
    let [a, b, c] = bracket;

    while ((c - a) > tol) {
        const u = a + (b - a) / 1.618;
        const v = b + (c - b) / 1.618;

        const fu = fn(u);
        const fv = fn(v);

        if (fu < fv) {
            c = v;
        } else {
            a = u;
        }
    }

    return (a + c) / 2;
}

// ====================================================================================================
// ====================================================================================================

// Helper function to approximate the Gaussian outside the removal region
function approximateGaussianOutside(gaussian, removeCenter, removeRadius) {
    const { position: mu, cov3Da: cov3Da, cov3Db: cov3Db, color: color, opacity: opacity } = gaussian;

    // Step 1: Check if the Gaussian center is outside the removal region
    const distToRemove = vec3.distance(mu, removeCenter);
    if (distToRemove >= removeRadius) {
        // Step 2: If the center is outside, sample points on the boundary of the intersection
        const boundaryPoints = sampleBoundaryPoints(gaussian, removeCenter, removeRadius, 10);  // Sample 10 points

        // Step 3: Fit an ellipsoid to the sampled points using least squares
        const fittedEllipsoid = fitEllipsoidToPoints(boundaryPoints);

        // Step 4: Create a new Gaussian with the ellipsoid parameters (covariance, center)
        if (fittedEllipsoid) {
            return {
                position: fittedEllipsoid.center,
                cov3Da: fittedEllipsoid.cov3Da,
                cov3Db: fittedEllipsoid.cov3Db,
                color: gaussian.color,  // Keep original color
                opacity: gaussian.opacity  // Keep original opacity
            };
        }
    }

    // Return null if no approximation is needed
    return null;
}

// ====================================================================================================
// ====================================================================================================

// Helper function to sample boundary points between the Gaussian and removal region
function sampleBoundaryPoints(gaussian, removeCenter, removeRadius, numPoints) {
    const points = [];
    const [a, b, c] = gaussian.cov3Da;
    const [d, e, f] = gaussian.cov3Db;
    const Sigma = [
        [a, b, c],
        [b, d, e],
        [c, e, f],
    ];
    const intensityThreshold = 0.168;  // For 70% volume
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
        else{
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
    const scaleFactor = Math.sqrt(-2 * Math.log(intensityThreshold));  // Example: intensity threshold defines contour

    // Scale the direction by the scale factor to find the point on the ellipsoid
    const boundaryPoint = vec3.scaleAndAdd([], center, scaledDirection, scaleFactor);

    return boundaryPoint;
}

// Updated getPointOnBoundary function to correctly sample from the boundary of the removal region
function getPointOnBoundary(gaussianCenter, direction, removeCenter, removeRadius) {
    // Define the vector from the Gaussian center to the remove center
    const originToRemoveCenter = vec3.subtract([], removeCenter, gaussianCenter);

    // Coefficients for the quadratic equation to find the intersection point of the ray with the sphere (removal region)
    const a = vec3.dot(direction, direction); // This will be 1 for a unit vector
    const b = 2 * vec3.dot(direction, originToRemoveCenter);
    const c = vec3.dot(originToRemoveCenter, originToRemoveCenter) - removeRadius * removeRadius;

    // Solve the quadratic equation: a * t^2 + b * t + c = 0
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
        // No real solutions, no intersection
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
