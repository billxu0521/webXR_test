<template>
  <canvas ref="renderCanvas" id="renderCanvas"></canvas>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import {
  Engine,
  Scene,
  Vector3,
  WebXRDefaultExperience,
  ShadowGenerator,
  DirectionalLight,
  HemisphericLight,
  StandardMaterial,
  Color3,
  PolygonMeshBuilder,
  MeshBuilder,
  Quaternion,
  Vector2,
  WebXRFeatureName,
  WebXRInputSource,
  Ray,
  WebXRFeaturesManager,
  Animation,
  PickingInfo,
  TransformNode,
  SceneLoader
} from '@babylonjs/core';
import '@babylonjs/core/XR/features/WebXRPlaneDetector'; // 确保引入了 WebXRPlaneDetector
import { Inspector } from '@babylonjs/inspector';
import earcut from 'earcut'; // 导入 earcut 库
// import modelUrl from '@/assets/models/door.glb'


const renderCanvas = ref(null);
const debug = false;
const sessionMode = ref("immersive-ar");
const referenceSpaceType = ref("local");
const optionalFeatures = ref(true);
const xr = ref(null); //XR對話
const fm = ref(null); //功能管理器
const shadowGenerator = ref(null);
const xrPlanes = ref(null); //平面偵測物件
const planes = ref([]);
const box = ref(null);
const marker = ref(null);
const xrHitTest = ref(null);
const hitTest = ref(null);
const xrAnchors = ref(null);
const handle = ref(null);
const door = ref(null);
const doorFrame = ref(null);
const doorContainer = ref(null);
const doorIsOpen = ref(false);
const doorIsPlaced = ref(false);


const createScene = async (scene) => {
  createLightsAndShadows(scene);
  createPlaneMeshesFromXrPlane(scene);
  createBox(scene);
  addMarkerForHitTest(scene);
  performHitTest();
  handleControllerSelection(scene);
  animateBox(scene);
  observeAnchors();
  addDoor(scene);

  if (debug) Inspector.Show(scene, {});

  return scene;
}

const addFeaturesToSession = () => {
  if (xr.value === null) {
    return;
  }
  fm.value = xr.value.baseExperience.featuresManager;
  try {
    xrPlanes.value = fm.value.enableFeature(WebXRFeatureName.PLANE_DETECTION, 'latest'); //平面偵測 
    xrHitTest.value = fm.value.enableFeature(WebXRFeatureName.HIT_TEST, "latest"); //視角偵測
    xrAnchors.value = fm.value.enableFeature(WebXRFeatureName.ANCHOR_SYSTEM, "latest") ; //錨點系統

  } catch (error) {
    console.log(error);
  }
}

/**
 * Creates a box mesh.
 */
const createBox = (scene) =>{
  const material = new StandardMaterial("material", scene);

  material.diffuseColor = Color3.Random();

  box.value = MeshBuilder.CreateBox("box", { width: 0.5, height: 0.5, depth: 0.5 }, scene);
  box.value.material = material;
  box.value.material.alpha = .5;
  box.value.rotation.y = Math.PI / 4;
  box.value.rotation.x = Math.PI / 4;
  box.value.position = new Vector3(-1, -0.5, -0.5);
  shadowGenerator.value.addShadowCaster(box.value);
}

/**
 * Adds a marker for hit testing.
 */
const addMarkerForHitTest = (scene) => {
  marker.value = MeshBuilder.CreateTorus("marker", { diameter: 0.3, thickness: 0.1 }, scene);
  marker.value.isVisible = false;
  marker.value.rotationQuaternion = new Quaternion();
}

/**
 * Performs a hit test.
 */
const performHitTest = () => {
  if (xrHitTest.value === null || marker.value === null) {
      return;
  }
  xrHitTest.value.onHitTestResultObservable.add((results) => {
      if (results.length) {
        if (marker.value) {
          marker.value.isVisible = true;
        }
        hitTest.value = results[0];
        //命中時更新標記位置
        if (marker.value && marker.value.rotationQuaternion && marker.value.position) {
          hitTest.value.transformationMatrix.decompose(undefined, marker.value.rotationQuaternion, marker.value.position);
        }
      } else {
        if (marker.value) {
          marker.value.isVisible = false;
        }
        hitTest.value = undefined;
      }
  });
}


const createXrExperience = async (scene) => {
  xr.value = await WebXRDefaultExperience.CreateAsync(scene, {
    uiOptions: {
      sessionMode: sessionMode.value,
      referenceSpaceType: referenceSpaceType.value,
      onError: (error) => {
        alert(error);
      }
    },
    optionalFeatures: optionalFeatures.value,
  });

  if (!xr.value.baseExperience) {
    throw new Error('Unable to create XR experience');
  }
}
/**
 * Handles controller selection.
 */
const handleControllerSelection = (scene) => {

  if (xr.value === null) {
      return;
  }
  xr.value.input.onControllerAddedObservable.add((motionControllerAdded) => {
    motionControllerAdded.onMotionControllerInitObservable.add((motionControllerInit) => {
      const motionControllerComponentIds = motionControllerInit.getComponentIds();
      const triggerComponent = motionControllerInit.getComponent(motionControllerComponentIds[0]);

      const buttonComponent = motionControllerInit.getComponent(motionControllerComponentIds[3]);

      if (buttonComponent) {
          buttonComponent.onButtonStateChangedObservable.add((component) => {
              if (component.pressed) {
                  (doorIsOpen.value) ? closeDoor() : openDoor();
              }
          });
      }


      triggerComponent.onButtonStateChangedObservable.add((component) => {
        if (component.pressed && component.value > 0.8) {          
          const resultRay = createRayFromController(motionControllerAdded);
          const raycastHit = scene.pickWithRay(resultRay);
          if (debug) console.log(raycastHit);
          
          if (raycastHit && raycastHit.hit && raycastHit.pickedMesh) {
            if (raycastHit.pickedMesh.name === box.value.name) {

              if (raycastHit.pickedMesh.name.includes('vertical') ||
                  (raycastHit.pickedMesh.name.includes('horizontal') && raycastHit.pickedMesh.position.y > 0.5)) {
                  if (debug) console.log('hit a plane other than the floor');
                  return;
              }
              console.log(door);
              if (raycastHit.pickedMesh.name === door.value.name ||
                  raycastHit.pickedMesh.name === handle.value.name ||
                  raycastHit.pickedMesh.name === doorFrame.value.name ||
                  raycastHit.pickedMesh.name === marker.value.name) {
                  if (debug)   console.log('permitted mesh hit');
                  return;
              }

              if (box.value && box.value.material) {
                const mat = box.value.material;
                mat.diffuseColor = Color3.Random();
                box.value.material = mat;
              }

              if (!doorIsPlaced.value) {
                if (debug)  console.log(raycastHit);
                  addAnchorAtPosition(raycastHit);
              }

            }
          }
        }
      });
    });
  });
}

/**
 * Adds an anchor at the specified position.
 * We use a transform node to attach the box to the anchor.
 * Since anchors can't be animated we use the transform node as a parent.
 * @param raycastHit The raycast hit information containing the picked point.
 */
const addAnchorAtPosition = (raycastHit) => {
  xrAnchors.value.addAnchorAtPositionAndRotationAsync(raycastHit.pickedPoint).then((anchor) => {
    const boxTransformNode = new TransformNode('boxTransformNode');
    boxTransformNode.position = raycastHit.pickedPoint;

    box.value.parent = boxTransformNode;
    box.value.position = Vector3.Zero();
    box.value.isVisible = true;

    door.value.isVisible = true;
    doorFrame.value.isVisible = true;
    handle.value.isVisible = true;

    doorContainer.value.position = raycastHit.pickedPoint;
    boxTransformNode.parent = doorContainer.value;
    
    anchor.attachedNode = doorContainer.value;
    anchor.attachedNode.position = raycastHit.pickedPoint;
  });
}
/**
 * Observes the XR anchors and removes them when added.
 */
const observeAnchors = () => {
  if (xrAnchors.value === null) {
      return;
  }
  xrAnchors.value.onAnchorAddedObservable.add((addedAnchor) => {
    xrAnchors.value.anchors.forEach((anchor) => {
      if (anchor !== addedAnchor) {
        anchor.remove();
      }
    });
  });
}

/**
 * Creates a ray from the controller.
 * @param controller The controller to create the ray from.
 * @returns A ray.
 */
 const createRayFromController = (controller) => {
    const origin = controller.pointer.position;
    const direction = controller.pointer.forward;
    const length = 100; // 設定光線的長度
    return new Ray(origin, direction, length);
}

//透過偵測平面，建立平面網格
const createPlaneMeshesFromXrPlane = (scene) => {
  let mat;

  if (xrPlanes.value === null) {
    return;
  }

  //新增平面網格
  xrPlanes.value.onPlaneAddedObservable.add((plane) => {
    debug && console.log("plane added", plane);
    mat = new StandardMaterial("mat", scene);
    mat.alpha = 0.35;
    mat.diffuseColor = Color3.Random();
    initPolygon(plane, mat, scene);
  });

  //持續更新平面網格
  xrPlanes.value.onPlaneUpdatedObservable.add((plane) => {
    if (planes.value[plane.id].material) {
      mat = planes.value[plane.id].material;
      planes.value[plane.id].dispose(false, false);
    }
    const some = plane.polygonDefinition.some(p => !p);
    if (some) {
      return;
    }
    initPolygon(plane, mat, scene);
  });
  //釋出平面網格
  xrPlanes.value.onPlaneRemovedObservable.add((plane) => {
    if (plane && planes.value[plane.id]) {
      planes.value[plane.id].dispose();
    }
  });

  //如果沒有xr，清除所有平面
  if (xr.value !== null) {
    xr.value.baseExperience.sessionManager.onXRSessionInit.add(() => {
      planes.value.forEach((plane) => plane.dispose());
      while (planes.value.pop());
    });
  }
}

//初始化與建立網格
const initPolygon = (plane, mat, scene) => {
  plane.polygonDefinition.push(plane.polygonDefinition[0]);
  const polygonTriangulation = new PolygonMeshBuilder(plane.xrPlane.orientation, plane.polygonDefinition.map((p) => new Vector2(p.x, p.z)), scene, earcut);
  const polygon = polygonTriangulation.build(false, 0.01);

  //建立法線
  polygon.createNormals(false);

  if (mat) {
    polygon.material = mat;
  }

  polygon.rotationQuaternion = new Quaternion();
  polygon.checkCollisions = true;
  polygon.receiveShadows = true;

  
  plane.transformationMatrix.decompose(polygon.scaling, polygon.rotationQuaternion, polygon.position);

  planes.value[plane.id] = polygon;

  return polygon;
}

const createLightsAndShadows = (scene) => {
  const directionalLight = createLights(scene);
  const _shadowGenerator = new ShadowGenerator(1024, directionalLight);
  _shadowGenerator.useBlurExponentialShadowMap = true;
  _shadowGenerator.blurKernel = 32;
  shadowGenerator.value = _shadowGenerator;
}

const createLights = (scene) => {
  const directionalLight = new DirectionalLight("directionalLight", new Vector3(0, 1, 1), scene);
  directionalLight.intensity = 0.7;
  directionalLight.position = new Vector3(0, 2, 0);

  const hemiLight = new HemisphericLight("hemisphericLight", new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.7;

  return directionalLight;
}

/**
 * Adds a door to the scene.
 */
const addDoor = (scene) => {
  const modelUrl = new URL('/src/assets/models/door.glb', import.meta.url).href;
  console.log('Loading model from URL:', modelUrl);

  SceneLoader.Append("", modelUrl, scene, (scene) => {
    try {
      console.log('Model loaded successfully:', scene.meshes);

      handle.value = scene.getMeshByName("Handle");
      door.value = scene.getMeshByName("Door");
      doorFrame.value = scene.getMeshByName("Door_frame");
      doorContainer.value = scene.getMeshByName("__root__");

      console.log('Handle:', handle.value);
      console.log('Door:', door.value);
      console.log('DoorFrame:', doorFrame.value);
      console.log('DoorContainer:', doorContainer.value);

      if (!handle.value || !door.value || !doorFrame.value || !doorContainer.value) {
        throw new Error('One or more meshes not found');
      }

      const meshes = doorContainer.value.getChildMeshes();
      meshes.forEach((mesh) => {
        mesh.receiveShadows = true;
        shadowGenerator.value.addShadowCaster(mesh);
      });

      handle.value.isVisible = false;
      door.value.isVisible = false;
      doorFrame.value.isVisible = false;

    } catch (error) {
      console.error('Error in onSuccess callback:', error);
    }
  }, (scene, message, exception) => {
    console.error('SceneLoader error:', message, exception);
  });
}

onMounted(() => {
  if (!Engine.isSupported()) {
    throw 'WebGL not supported';
  }

  const canvasElement = renderCanvas.value;
  if (!canvasElement) {
    throw 'Canvas element not found';
  }

  const engine = new Engine(canvasElement, true);
  const scene = new Scene(engine);

  createXrExperience(scene).then(() => {
    addFeaturesToSession();
    createScene(scene).then(() => {
      engine.runRenderLoop(() => {
        scene.render();
      });
      window.addEventListener('resize', () => {
        engine.resize();
      });
    });
  }).catch((error) => {
    console.log(error);
  });
});

const animateBox = (scene) => {
  const rotateAnimation = new Animation("rotateAnimation", "rotation.y", 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
  const keyFrames = [];

  keyFrames.push({
      frame: 0,
      value: 0
  });

  keyFrames.push({
      frame: 50,
      value: Math.PI / 2
  });

  keyFrames.push({
      frame: 100,
      value: Math.PI
  });



  // 设置动画的关键帧
  rotateAnimation.setKeys(keyFrames);

  // 确保 _box 和 _scene 存在，然后应用动画
  if (box.value && scene) {
    box.value.animations = [rotateAnimation];
    scene.beginAnimation(box.value, 0, 100, true);
  }

  /**
   * Rotates the door mesh.
   */
  const animateDoor = (duration) => {
      const animationName = doorIsOpen.value ? "doorOpenQuat" : "doorCloseQuat";
      const doorAnimation = new Animation(animationName, "rotationQuaternion", 30, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CONSTANT);

      const startRotation = door.value.rotationQuaternion.clone();

      const axis = new Vector3(0, 1, 0);
      const angle = doorIsOpen.value ? -Math.PI / 1.5 : Math.PI / 1.5;
      const endRotation = Quaternion.RotationAxis(axis, angle).multiply(startRotation);

      const keyFrames = [];

      keyFrames.push({
          frame: 0,
          value: startRotation
      });

      keyFrames.push({
          frame: duration,
          value: endRotation
      });

      doorAnimation.setKeys(keyFrames);

      if (!door.value.rotationQuaternion) {
          door.value.rotationQuaternion = new Quaternion();
      }

      door.value.animations = [doorAnimation];

      scene.beginAnimation(door.value, 0, duration, false);
  }


  /**
   * Opens the door by rotating it 120 degrees clockwise.
   */
  const openDoor = () => {
      if (door.value !== null) {
          animateDoor(30);
          doorIsOpen.value = true;
      }
  }


  /**
   * Closes the door by rotating it 120 degrees counterclockwise.
   */
  const closeDoor = () => {
    if (door.value !== null) {
          animateDoor(30);
          doorIsOpen.value = false;
      }
  }


}


</script>

<style scoped>
#renderCanvas {
  width: 100%;
  height: 100vh;
  touch-action: none;
}
</style>