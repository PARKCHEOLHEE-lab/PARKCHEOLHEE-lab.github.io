import * as THREE from "three";
import dat from "https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js";
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";


class Box {
  constructor (size=4) {
    this.size = size;
    this.container = document.getElementById("threejsSphere");

    this._initialSegments = 10;

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
      const axes = new THREE.AxesHelper(this.size * 5);
      axes.material.depthTest = false;
      axes.renderOrder = 1;
      this.scene.add(axes);
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
    this.orbit.minDistance = 10;
    this.orbit.maxDistance = 50;
  }

  _setGeometry () {
    const geometry = new THREE.SphereGeometry(this.size, this._initialSegments, this._initialSegments);
    const material = new THREE.MeshBasicMaterial({color: 0xff00a1, wireframe: false});
    const sphere = new THREE.Mesh(geometry, material);

    const edges = new THREE.WireframeGeometry(geometry);
    const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color: 0xffffff } ) );

    const container = this.container;
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    const gridHelper = new THREE.GridHelper(this.size * 10, this.size * 30);
    
    line.renderOrder = 1;
    scene.add(gridHelper);
    scene.add(sphere);
    scene.add(line);
    animate();

    this.sphere = sphere;
    this.sphere.position.y = 4.5;
    
    this.line = line;
    this.line.position.y = 4.5;
    this.orbit.update();

    function animate () {
      requestAnimationFrame(animate);

      sphere.rotation.x += 0.005;
      sphere.rotation.y += 0.005;

      line.rotation.x += 0.005;
      line.rotation.y += 0.005;

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

    const gui = new dat.GUI({width: 230, closeOnTop: true});

    const sphereData = {
        sphere: this.sphere,
        line: this.line,
        radius: this.size,
        widthSegments: this._initialSegments,
        heightSegments: this._initialSegments
    }

    gui.add(sphereData, "radius", 1, this.size * 2).onChange(regenerateSphereGeometry);
    gui.add(sphereData, "widthSegments", 5, 50).onChange(regenerateSphereGeometry);
    gui.add(sphereData, "heightSegments", 5, 50).onChange(regenerateSphereGeometry);

    document.getElementById("gui").appendChild(gui.domElement);
    
    function regenerateSphereGeometry() {
        const newGeometry = new THREE.SphereGeometry(
            sphereData.radius, sphereData.widthSegments, sphereData.heightSegments
        )
        sphereData.sphere.geometry.dispose()
        sphereData.sphere.geometry = newGeometry

        const newEdges = new THREE.WireframeGeometry(newGeometry);
        sphereData.line.geometry.dispose()
        sphereData.line.geometry = newEdges
    }

  }
}

new Box();