<template>
    <div id="app">
      <canvas id="renderCanvas"></canvas>
    </div>
  </template>
  
  <script setup>
  import { onMounted, ref } from 'vue';
  import * as BABYLON from 'babylonjs';
  
  const canvas = ref(null);
  
  onMounted(() => {
    canvas.value = document.getElementById('renderCanvas');
    const engine = new BABYLON.Engine(canvas.value, true);
  
    const createScene = () => {
      const scene = new BABYLON.Scene(engine);
  
      const camera = new BABYLON.FreeCamera('camera1', new BABYLON.Vector3(0, 5, -10), scene);
      camera.setTarget(BABYLON.Vector3.Zero());
      camera.attachControl(canvas.value, true);
  
      const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
      light.intensity = 0.7;
  
      const sphere = BABYLON.MeshBuilder.CreateSphere('sphere', { segments: 16, diameter: 2 }, scene);
      sphere.position.y = 1;
  
      const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 6, height: 6 }, scene);
  
      return scene;
    };
  
    const scene = createScene();
  
    engine.runRenderLoop(() => {
      scene.render();
    });
  
    window.addEventListener('resize', () => {
      engine.resize();
    });
  });
  </script>
  
  <style>
  #renderCanvas {
    width: 100%;
    height: 100vh;
    touch-action: none;
  }
  </style>