import * as THREE from "three";
import dat from "https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js";
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";


class Box {
  constructor (size=4) {
    this.size = size;
    this.container = document.getElementById("threejs");

    this._setScene();
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

  _setCamera () {
    this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / (this.container.clientWidth / 2), 0.1, 1000); 
    this.camera.position.x = 13;
    this.camera.position.y = 13;
    this.camera.position.z = 13;
  }

  _setRenderer () {
    this.renderer = new THREE.WebGLRenderer();
    this.container.appendChild(this.renderer.domElement);
  }

  _setOrbit () {
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
  }

  _setGeometry () {
    let geometry = new THREE.SphereGeometry(this.size, 15, 15);
    let material = new THREE.MeshBasicMaterial({color: 0xff00a1, wireframe: true});
    let sphere = new THREE.Mesh(geometry, material);

    let container = this.container;
    let renderer = this.renderer
    let scene = this.scene
    let camera = this.camera
    let gridHelper = new THREE.GridHelper(this.size * 10, this.size * 30);
    
    scene.add(gridHelper);
    scene.add(sphere);
    animate();

    this.sphere = sphere
    this.sphere.position.y = 3;
    this.orbit.update();

    function animate () {
      requestAnimationFrame(animate);

      sphere.rotation.x += 0.005;
      sphere.rotation.y += 0.005;

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

    let gui = new dat.GUI({width: 230, closeOnTop: true});

    const sphereData = {
        sphere: this.sphere,
        radius: this.size,
        widthSegments: 15,
        heightSegments: 15
    }

    gui.add(sphereData, "radius", 1, this.size * 2).onChange(regenerateSphereGeometry);
    gui.add(sphereData, "widthSegments", 5, 25).onChange(regenerateSphereGeometry);
    gui.add(sphereData, "heightSegments", 5, 25).onChange(regenerateSphereGeometry);

    document.getElementById("gui").appendChild(gui.domElement);
    
    function regenerateSphereGeometry() {
        let newGeometry = new THREE.SphereGeometry(
            sphereData.radius, sphereData.widthSegments, sphereData.heightSegments
        )

        sphereData.sphere.geometry.dispose()
        sphereData.sphere.geometry = newGeometry
    }

  }
}

new Box();