import * as THREE from "three";
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three";
// import { IFCSPACE } from "web-ifc";

class IfcWall {
    constructor() {
        this.container = document.getElementById("threejsIFC");

        this._setScene();
        this._setAxes();
        this._setGrid();
        this._setCamera();
        this._setRenderer();
        this._setLights();
        this._setOrbit();
        this._setGeometry();
    }

    _setScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);
    }

    _setAxes() {
        const axes = new THREE.AxesHelper(3 / 2);
        axes.material.depthTest = false;
        axes.renderOrder = 1;
        this.scene.add(axes);
    }

    _setLights() {
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight.position.set(-5, 5, 5);
        directionalLight.target.position.set(0, 1.5, -1.5);
        directionalLight.shadow.camera.near = -100
        directionalLight.shadow.camera.far = 100
        directionalLight.shadow.camera.top = 100
        directionalLight.shadow.camera.bottom = 100
        directionalLight.shadow.camera.left = 100
        directionalLight.shadow.camera.right = 100
        directionalLight.castShadow = true;
        
        const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 2, 0xff0000)
        const helper = new THREE.CameraHelper( directionalLight.shadow.camera );
        
        this.scene.add(directionalLight);
        // console.log(this.scene)
        console.log(helper)
        // this.scene.add(helper)
    }

    _setCamera() {
        this.camera = new THREE.PerspectiveCamera(5, this.container.clientWidth / (this.container.clientWidth / 2), 0.1, 1000);
        this.camera.position.set(100, 100, 100);
    }

    _setGrid() {
        const gridHelper = new THREE.GridHelper(3, 10);
        this.scene.add(gridHelper);
    }

    _setRenderer() {
        this.renderer = new THREE.WebGLRenderer();
        this.container.appendChild(this.renderer.domElement);
    }

    _setOrbit() {
        this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.minDistance = 5;
        this.orbit.maxDistance = 150;
    }

    _setGeometry() {
        const ifcLoader = new IFCLoader();
        ifcLoader.ifcManager.setWasmPath('https://unpkg.com/web-ifc@0.0.36/', true);
        ifcLoader.load('../realbuilding/wall.ifc', function ( object ) {
              object.traverse(function ( child ) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
      
                    const edges = new THREE.EdgesGeometry(child.geometry)
                    const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial({color: 0xcfcfcf}) )
                    line.renderOrder = 1;

                    scene.add( object );
                    scene.add(line);
                  }
                }
              )
            }
        );

        const container = this.container;
        const renderer = this.renderer
        const scene = this.scene
        const camera = this.camera

        const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
        const planeMaterial = new THREE.ShadowMaterial();
        const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
        planeMesh.rotation.x = Math.PI * -0.5;
        planeMesh.receiveShadow = true;
        
        scene.add(planeMesh);
        animate();

        this.orbit.update();

        function animate() {
            requestAnimationFrame(animate);
            resize();

            renderer.render(scene, camera);
        }

        function resize() {
            camera.aspect = container.clientWidth / (container.clientWidth / 2);
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientWidth / 2);
        }
    }

}

new IfcWall();