import * as THREE from "https://unpkg.com/three@0.126.1/build/three.module.js";

// TODO: Refactor to use Object

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xffffff );

const container = document.getElementById("threejs"); 

const camera = new THREE.PerspectiveCamera( 45, container.clientWidth / (container.clientWidth / 2), 0.1, 100 );

const renderer = new THREE.WebGLRenderer();
container.appendChild( renderer.domElement );

const geometry = new THREE.BoxGeometry( 1.5, 1.5, 1.5 );
const material = new THREE.MeshBasicMaterial( { color: 0x0011e3 } );
const cube = new THREE.Mesh( geometry, material );
scene.add(cube);

camera.position.z = 10;

function onResize() {
    camera.aspect = container.clientWidth / (container.clientWidth / 2);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientWidth / 2);
  }

function animate() {
    requestAnimationFrame(animate);

    cube.rotation.x += 0.005;
    cube.rotation.y += 0.005;

    renderer.render(scene, camera);
    onResize();
};


animate();