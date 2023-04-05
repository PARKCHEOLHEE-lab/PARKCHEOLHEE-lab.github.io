import * as THREE from "three";
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three";
import { IFCSPACE } from "web-ifc";

class IfcWall {
    constructor() {
        this.container = document.getElementById("threejs");

        this._setScene();
        this._setAxes();
        this._setGrid();
        this._setLights();
        this._setCamera();
        this._setRenderer();
        this._setOrbit();
        this._setGeometry();
    }

    _setScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);
    }

    _setAxes() {
        const axes = new THREE.AxesHelper();
        axes.material.depthTest = false;
        axes.renderOrder = 1;
        this.scene.add(axes);
    }

    _setLights() {
        const lightColor = 0xffffff;

        const ambientLight = new THREE.AmbientLight(lightColor, 0.5);
        ambientLight.castShadow = true;
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(lightColor, 1);
        directionalLight.position.set(100, 100, 0);
        directionalLight.target.position.set(0, 0, 0);
        this.scene.add(directionalLight);
        this.scene.add(directionalLight.target);
        directionalLight.castShadow = true;
    }

    _setCamera() {
        this.camera = new THREE.PerspectiveCamera(5, this.container.clientWidth / (this.container.clientWidth / 2), 0.1, 1000);
        this.camera.position.set(60, 60, 60);
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
    }

    _setGeometry() {
        const container = this.container;
        const renderer = this.renderer
        const scene = this.scene
        const camera = this.camera

        const planeGeometry = new THREE.PlaneGeometry(100, 100);
        const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = Math.PI * -0.5;
        plane.receiveShadow = true;
        scene.add(plane);

        const ifcLoader = new IFCLoader();
        ifcLoader.ifcManager.setWasmPath('https://unpkg.com/web-ifc@0.0.36/', true);

        ifcLoader.load('../realbuilding/wall.ifc', function (model) {
            scene.add(model.mesh);

        });

        animate();

        this.orbit.update();

        function animate() {
            requestAnimationFrame(animate);

            renderer.render(scene, camera);

            resize();
        }

        function resize() {
            camera.aspect = container.clientWidth / (container.clientWidth / 2);
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientWidth / 2);
        }
    }

}

new IfcWall();