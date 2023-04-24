import * as THREE from "three";
import dat from "https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js";
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";


class Box {
  constructor (size=5) {
    this.size = size;
    this.container = document.getElementById("threejs");

    this._setScene();
    this._setAxes();
    this._setCamera();
    this._setRenderer();
    this._setOrbit();
    this._setGeometry();
    this._setGUI();
  }

  _setScene () {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);
  }

  _setAxes() {
      const axes = new THREE.AxesHelper(10);
      axes.material.depthTest = false;
      axes.renderOrder = 1;
      this.scene.add(axes);
  }

  _setCamera () {
    this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / (this.container.clientWidth / 2), 0.1, 1000); 
    this.camera.position.x = 15;
    this.camera.position.y = 15;
    this.camera.position.z = 15;
  }

  _setRenderer () {
    this.renderer = new THREE.WebGLRenderer();
    this.container.appendChild(this.renderer.domElement);
  }

  _setOrbit () {
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
  }

  _setGeometry () {
    let geometry = new THREE.BoxGeometry(this.size, this.size, this.size);
    let material = new THREE.MeshBasicMaterial({color: 0x0011e3});
    let cube = new THREE.Mesh(geometry, material);

    let container = this.container;
    let renderer = this.renderer
    let scene = this.scene
    let camera = this.camera
    let gridHelper = new THREE.GridHelper(cube.geometry.parameters.depth * 10, cube.geometry.parameters.depth * 30);
    
    scene.add(gridHelper);
    scene.add(cube);
    animate();

    this.cube = cube
    this.cube.position.y = 3;
    this.orbit.update();

    function animate () {
      requestAnimationFrame(animate);

      cube.rotation.x += 0.005;
      cube.rotation.y += 0.005;

      renderer.render(scene, camera);

      resize();
    }

    function resize () {
      camera.aspect = container.clientWidth / (container.clientWidth / 2);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientWidth / 2);
    }
  }
  
  _setGUI () {

    let gui = new dat.GUI({width: 150, closeOnTop: true});

    gui.add(this.cube.material, "wireframe");
    gui.add(this.cube.scale, "x", 0.5, 2, 0.1).name("scaleX");
    gui.add(this.cube.scale, "y", 0.5, 2, 0.1).name("scaleY");
    gui.add(this.cube.scale, "z", 0.5, 2, 0.1).name("scaleZ");

    document.getElementById("gui").appendChild(gui.domElement);

  }
}

new Box();