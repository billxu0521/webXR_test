import { createRouter, createWebHistory } from 'vue-router';
import HelloWorld from '../components/HelloWorld.vue';
import WebXR from '../views/WebXR.vue';
import WebXRFPS from '../views/WebXRFPS.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HelloWorld
  },
  {
    path: '/webxr',
    name: 'WebXR',
    component: WebXR
  },
  {
    path: '/webxr_FPS',
    name: 'WebXRFPS',
    component: WebXRFPS
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;