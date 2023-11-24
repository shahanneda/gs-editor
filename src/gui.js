const SORTING_ALGORITHMS = ["count sort", "quick sort", "Array.sort"];
const EDITING_MODES = ["color", "remove", "move"];

let maxGaussianController = null;
let camController = {
  texts: {
    default:
      "When in calibration mode, you can click on 3 points in your scene to define the ground and orientate the camera accordingly.",
    calibrating: "Click on 3 points in your scene to define a plane.",
    calibrated:
      "Click on Apply to orientate the camera so that the defined plane is parallel to the ground.",
  },
};

// Init settings GUI panel
function initGUI() {
  const gui = new lil.GUI({ title: "Settings" });

  // Main settings
  const sceneNames = Object.entries(defaultCameraParameters).map(
    ([name, { size }]) => `${name} (${size})`
  );

  // settings.scene = sceneNames[0];
  gui
    .add(settings, "scene", sceneNames)
    .name("Scene")
    .listen()
    .onChange((scene) => {
      if (currentlyDownloading) {
        shouldBreakDownload = true;
      }

      if ("URLSearchParams" in window) {
        var searchParams = new URLSearchParams(window.location.search);
        searchParams.set("scene", scene);
        window.location.search = searchParams.toString();
      }
      // Wait for previous download to finish canceling first
      setTimeout(() => {
        shouldBreakDownload = false;
        loadScene({ scene });
      }, 100);
    });

  gui.add(settings, "editingMode", EDITING_MODES).name("Editing(ALT + CLICK)");
  gui
    .add(settings, "instanceMode")
    .name("Instance mode")
    .onChange((value) => {
      console.log("sending message", value);
      worker.postMessage({
        instanceMode: value,
      });
    });
  // gui.add(settings, "Hello");

  gui.add(settings, "selectionSize", 0.01, 5, 0.01).name("Selection Size");
  gui.add(settings, "moveDistance", 0.01, 5, 0.01).name("Move Distance");
  gui.add(settings, "moveDirection", ["UP", "DOWN"]).name("Move Direction");
  gui.addColor(settings, "editColor").name("Color");
  // gui
  //   .add(settings, "pointCloudMode")
  //   .name("Point Cloud")
  //   .onChange(() => requestRender());

  addOtherFolder(gui);
  //   addCameraCalibrationFolder(gui);
}

function addOtherFolder(gui) {
  // Other settings
  const otherFolder = gui.addFolder("Other Settings").close();
  maxGaussianController = otherFolder
    .add(settings, "maxGaussians", 1, settings.maxGaussians, 1)
    .name("Max Gaussians")
    .onChange(() => {
      cam.needsWorkerUpdate = true;
      cam.updateWorker();
    });
  otherFolder
    .add(settings, "renderResolution", 0.1, 1, 0.01)
    .name("Preview Resolution");

  otherFolder
    .add(settings, "scalingModifier", 0.01, 1, 0.01)
    .name("Scaling Modifier")
    .onChange(() => requestRender());
  //   otherFolder
  //     .add(settings, "sortingAlgorithm", SORTING_ALGORITHMS)
  //     .name("Sorting Algorithm");

  //   otherFolder.add(settings, "sortTime").name("Sort Time").disable().listen();

  otherFolder
    .addColor(settings, "bgColor")
    .name("Background Color")
    .onChange((value) => {
      document.body.style.backgroundColor = value;
      requestRender();
    });

  otherFolder.add(settings, "speed", 0.01, 2, 0.01).name("Camera Speed");

  otherFolder
    .add(settings, "fov", 30, 110, 1)
    .name("FOV")
    .onChange((value) => {
      cam.fov_y = (value * Math.PI) / 180;
      requestRender();
    });

  otherFolder
    .add(settings, "debugDepth")
    .name("Show Depth Map")
    .onChange(() => requestRender());

  addCameraCalibrationToFolder(otherFolder);
  // otherFolder.add(settin)
}

function addCameraCalibrationToFolder(folder) {
  const p = document.createElement("p");
  p.className = "controller";
  //   p.textContent = camController.texts["default"];

  //   camController.p = p;

  camController.resetCalibration = () => {
    cam.resetCalibration();
    camController.finish.disable();
    camController.start.name("Start Calibration");
    camController.start.updateDisplay();
    // p.textContent = camController.texts["default"];
  };

  camController.start = folder
    .add(settings, "calibrateCamera")
    .name("Start Calibration")
    .onChange(() => {
      if (cam.isCalibrating) {
        camController.resetCalibration();
        requestRender();
      } else {
        cam.isCalibrating = true;
        camController.start.name("Abort Calibration");
        camController.start.updateDisplay();
        // p.textContent = camController.texts["calibrating"];
      }
    });

  camController.finish = folder
    .add(settings, "finishCalibration")
    .name("Apply changes")
    .disable()
    .onChange(() => {
      cam.isCalibrating = false;
      cam.finishCalibration();

      camController.finish.disable();
      camController.start.name("Calibrate Camera");
      camController.start.updateDisplay();
      camController.showGizmo.show();
      //   p.textContent = camController.texts["default"];
    });

  camController.showGizmo = folder
    .add(settings, "showGizmo")
    .name("Show Plane")
    .hide()
    .onChange(() => requestRender());

  // Camera calibration text info
  folder.children[0].domElement.parentNode.insertBefore(
    p,
    folder.children[0].domElement
  );
}
