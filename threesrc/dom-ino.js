import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.151.3/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "https://threejs.org/examples/jsm/loaders/OBJLoader.js";

class DomIno {
  constructor () {
    this.container = document.getElementById("threejsDomIno");

    this._setScene();
    this._setAxes();
    this._setRenderer();
    this._setLights();
    this._setCamera();
    this._setOrbit();
    this._setGeometry();
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

  _setLights() {
      const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
      directionalLight.position.set(-15, 10, 10);
      directionalLight.shadow.camera.near = 0.5
      directionalLight.shadow.camera.far = 40
      directionalLight.shadow.camera.top = 10
      directionalLight.castShadow = true;

      const helper = new THREE.CameraHelper( directionalLight.shadow.camera );
      
      this.scene.add(directionalLight);
      this.scene.add( helper );
  }

  _setCamera () {
    this.camera = new THREE.PerspectiveCamera(5, this.container.clientWidth / (this.container.clientWidth / 2), 0.1, 1000); 
    this.camera.position.x = -70 * 1.2;
    this.camera.position.y = 50 * 1.2;
    this.camera.position.z = 120 * 1.2;
  }

  _setRenderer () {
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  _setOrbit () {
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.minDistance = 10;
    this.orbit.maxDistance = 300;
  }

  _setGeometry () {
    const loader = new OBJLoader();

    loader.load(
      "../model/dom-ino/dom-ino.obj",
      function ( object ) {
        object.traverse(function ( child ) {
          if (child.isMesh) {

              const materials = [];
              for (let i = 0; i < child.material.length; i++) {
                materials.push(
                  new THREE.MeshPhongMaterial({
                    color: 0xffffff,
                    shininess: 200,
                    specular: new THREE.Color(0x111111),
                  })
                )
              }
              
              child.material = materials
              child.geometry.center();

              child.geometry.computeBoundingBox();
              child.position.y = child.geometry.boundingBox.max.y;
              child.castShadow = true;
              child.receiveShadow = true;

              // const edgesGeometry = new THREE.EdgesGeometry(child.geometry, 30); // 30 degrees threshold
              // const edgesMaterial = new THREE.LineBasicMaterial({ 
              //   color: 0xffffff,
              //   linewidth: 1
              // });
              // const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
              // edges.position.y = child.geometry.boundingBox.max.y;
              // edges.renderOrder = 1; // Ensure edges render on top
              
              
              // const edges = new THREE.WireframeGeometry(child.geometry)
              // const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial({color: 0xcfcfcf}) )
              // line.position.y = child.geometry.boundingBox.max.y;
              // line.renderOrder = 1;
              
              scene.add( object );
              // scene.add(line);
              // scene.add(edges);
            }
          }
        )
        
        
      },
      function () {
      },
      function ( onError ) {
        console.log(onError);
      }
    )

    const container = this.container;
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    const gridHelper = new THREE.GridHelper(3, 10);
    
    const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
    const planeMaterial = new THREE.ShadowMaterial();
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    planeMesh.rotation.x = Math.PI * -0.5;
    planeMesh.receiveShadow = true;

    scene.add(planeMesh)
    scene.add(gridHelper);
    animate();

    this.orbit.update();

    function animate () {
      requestAnimationFrame(animate);
      resize();

      renderer.render(scene, camera);
    }

    function resize () {
      camera.aspect = container.clientWidth / (container.clientWidth / 2);
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientWidth / 2);
    }
  }
  
}

new DomIno();