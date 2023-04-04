import * as THREE from "three";
import { OrbitControls } from "https://threejs.org/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "https://unpkg.com/browse/web-ifc-three@0.0.103/IFCLoader.js";

// class DomIno {
//   constructor () {
//     this.container = document.getElementById("threejs");

//     this._setScene();
//     this._setCamera();
//     this._setRenderer();
//     this._setOrbit();
//     this._setGeometry();
//   }

//   _setScene () {
//     this.scene = new THREE.Scene();
//     this.scene.background = new THREE.Color(0xffffff);
//   }

//   _setCamera () {
//     this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / (this.container.clientWidth / 2), 0.1, 1000); 
//     this.camera.position.x = 10;
//     this.camera.position.y = 1;
//     this.camera.position.z = 7;
//   }

//   _setRenderer () {
//     this.renderer = new THREE.WebGLRenderer();
//     this.container.appendChild(this.renderer.domElement);
//   }

//   _setOrbit () {
//     this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
//   }

//   _setGeometry () {
//     let loader = new OBJLoader();

//     loader.load(
//       "../model/dom-ino/dom-ino.obj",
//       function ( object ) {
//         object.traverse(function ( child ) {
//           if (child instanceof THREE.Mesh) {
//               child.material = new THREE.MeshBasicMaterial({color: 0x808080});
//             }
//           }
//         )
//         scene.add( object );
//       },
//       function () {
//       },
//       function ( onError ) {
//         console.log(onError);
//       }
//     )

//     let container = this.container;
//     let renderer = this.renderer
//     let scene = this.scene
//     let camera = this.camera
//     let gridHelper = new THREE.GridHelper(3, 10);
    
//     scene.add(gridHelper);
//     animate();

//     this.orbit.update();

//     function animate () {
//       requestAnimationFrame(animate);

//       renderer.render(scene, camera);

//       resize();
//     }

//     function resize () {
//       camera.aspect = container.clientWidth / (container.clientWidth / 2);
//       camera.updateProjectionMatrix();
//       renderer.setSize(container.clientWidth, container.clientWidth / 2);
//     }
//   }
  
// }

// new DomIno();