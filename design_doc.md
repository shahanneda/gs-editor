# Space Carving Gaussian Splatting: Eraser Feature Design Document

## 1. Overview

The eraser feature allows users to selectively remove or modify parts of a scene represented by Gaussian splats. This document outlines the implementation details, changes made to the codebase, and the rationale behind these changes.

## 2. Key Components

1. Eraser Gaussian Creation
2. Eraser Visualization
3. Intersection Detection
4. Opacity Modification
5. Rendering Pipeline Adjustments

## 3. Implementation Details

### 3.1 Changes in src/main.js

1. Added new global variables:
   ```javascript
   let eraserCursor = null;
   let eraserCursorContext = null;
   let buffers;
   ```

2. Modified `setupWebglContext` function:
   - Removed buffer creation from this function
   - Now only sets up the WebGL context and shader program

3. Added new `setupBuffers` function:
   - Creates attribute buffers after `gaussianCount` is known
   - Sets up buffers for color, center, opacity, covA, covB, and isEraser

4. Modified `main` function:
   - Calls `setupBuffers` after loading the scene
   - Sets up event listener for cursor updates

5. Added `createEraserGaussian` function:
   - Creates a new Gaussian with negative opacity
   - Updates all relevant buffers

6. Added `updateEraserCursor` and `updateCursor` functions:
   - Create and update a custom cursor for the eraser tool

7. Modified `handleInteractive` function:
   - Added case for "eraser" mode

8. Modified `loadScene` function:
   - Initializes `isEraser` array in `globalData`
   - Calls `setupBuffers` after loading scene data

9. Modified `render` function:
   - Added debug logging for Gaussian count and drawing

### 3.2 Changes in src/worker-sort.js

1. Modified `sortGaussiansByDepth` function:
   - Added loop to check for intersections with eraser Gaussians after sorting

2. Added `gaussianIntersect` function:
   - Implements intersection check between two Gaussians

3. Modified `onmessage` handler:
   - Added logging for received Gaussians and sorting process

### 3.3 Changes in shaders/splat_vertex.glsl

1. Added new input attribute:
   ```glsl
   in float a_isEraser;
   ```

2. Added new output variables:
   ```glsl
   out float isEraser;
   out float v_isEraser;
   ```

3. Modified `main` function:
   - Passes `isEraser` value to fragment shader:
     ```glsl
     isEraser = a_isEraser;
     v_isEraser = a_isEraser;
     ```

### 3.4 Changes in shaders/splat_fragment.glsl

1. Added new input variable:
   ```glsl
   in float v_isEraser;
   ```

2. Modified `main` function:
   - Added condition to render eraser Gaussians differently:
     ```glsl
     if (v_isEraser > 0.5) {
         fragColor = vec4(1.0, 0.0, 1.0, 0.5);
     } else {
         fragColor = vec4(color * alpha, alpha);
     }
     ```

### 3.5 Changes in src/gui.js

1. Modified `EDITING_MODES` array:
   - Added "eraser" to the list of editing modes

2. Modified `initGUI` function:
   - Added GUI controls for eraser size and updated editing mode control:
     ```javascript
     gui.add(settings, "editingMode", EDITING_MODES).name("Editing Mode").onChange(updateCursor);
     gui.add(settings, "eraserSize", 0.01, 1, 0.01).name("Eraser Size").onChange(updateEraserCursor);
     ```

### 3.6 Changes in src/camera.js

1. Modified `raycast` function:
   - Updated to handle eraser Gaussians:
     ```javascript
     const isEraser = globalData.gaussians.isEraser[i];
     if (alpha < 0.1 && !isEraser) continue;
     const t = raySphereIntersection(this.pos, rd, pos, isEraser ? settings.eraserSize : 0.1);
     ```

### 3.7 Changes in src/loader.js

No changes were made to this file for the eraser feature implementation.

## 4. Data Flow

1. User activates eraser mode and clicks on the scene
2. `handleInteractive` function calls `createEraserGaussian`
3. `createEraserGaussian` adds a new Gaussian with negative opacity to the scene
4. Worker receives updated Gaussian data
5. Worker sorts Gaussians and checks for intersections with eraser Gaussians
6. Worker modifies opacity of intersecting Gaussians
7. Main thread receives sorted and modified Gaussian data
8. Rendering pipeline uses updated data to display the scene with "erased" areas

## 5. Challenges and Considerations

1. Performance: Intersection checks add computational overhead. Consider optimizing this process for large scenes.
2. Memory usage: Adding eraser Gaussians increases memory usage. Monitor and optimize if necessary.
3. Undo functionality: Current implementation doesn't support undoing eraser actions. Consider implementing a history mechanism.
4. Precision: The current intersection detection is simplified. More complex shapes might require more sophisticated intersection algorithms.

## 6. Future Improvements

1. Implement undo/redo functionality for eraser actions
2. Optimize intersection detection for better performance with large scenes
3. Add support for different eraser shapes (e.g., ellipsoid, cube)
4. Implement a "soft eraser" that gradually reduces opacity instead of setting it to 0

## 7. Testing Strategy

1. Unit tests for `gaussianIntersect` function
2. Integration tests for eraser creation and intersection detection
3. Visual tests to ensure proper rendering of eraser cursor and erased areas
4. Performance tests with large scenes to identify potential bottlenecks

This design document provides a comprehensive overview of the eraser feature implementation for Space Carving Gaussian Splatting. It outlines the changes made to each file, the rationale behind these changes, and considerations for future improvements and testing.
