try {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('output_canvas');
    const arLiveText = document.getElementById('ar-live-text');
    const arStepDescription = document.getElementById('ar-step-description');

    let cameraStream = null;
    let handsInstance = null;
    let cameraUtilsInstance = null;
    let isARRunning = false;
    
    // Auto-Advancing Tutorial State (0 = Waiting for hand, 1 = Waiting for pinch, 2 = Success)
    let tutorialState = 0; 

    // Three.js Core
    const scene = new THREE.Scene();
    const camera3D = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera3D.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);

    const componentContainer = new THREE.Group();
    let fovY = camera3D.fov * (Math.PI / 180);
    let viewHeight = 2 * Math.tan(fovY / 2) * camera3D.position.z;
    let viewWidth = viewHeight * camera3D.aspect;
    const dockedPosition = new THREE.Vector3(-(viewWidth / 2) + 0.6, (viewHeight / 2) - 1.2, 0);
    componentContainer.position.copy(dockedPosition);
    scene.add(componentContainer);

    const highlightBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true })
    );
    highlightBox.visible = false;
    componentContainer.add(highlightBox);

    const loader = new THREE.GLTFLoader();
    loader.load('model.glb', (gltf) => {
        const customModel = gltf.scene;
        const rawBox = new THREE.Box3().setFromObject(customModel);
        const maxDim = Math.max(rawBox.getSize(new THREE.Vector3()).x, rawBox.getSize(new THREE.Vector3()).y, rawBox.getSize(new THREE.Vector3()).z);
        customModel.scale.setScalar(0.8 / (maxDim || 1));

        const scaledBox = new THREE.Box3().setFromObject(customModel);
        customModel.position.sub(scaledBox.getCenter(new THREE.Vector3()));

        highlightBox.geometry.dispose();
        highlightBox.geometry = new THREE.BoxGeometry(scaledBox.getSize(new THREE.Vector3()).x * 1.15, scaledBox.getSize(new THREE.Vector3()).y * 1.15, scaledBox.getSize(new THREE.Vector3()).z * 1.15);
        componentContainer.add(customModel);
    }, undefined, () => {
        const pcb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x0f3e24 }));
        highlightBox.geometry.dispose();
        highlightBox.geometry = new THREE.BoxGeometry(1.1, 0.4, 0.1);
        componentContainer.add(pcb);
    });

    const fingerMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const thumbMarker = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), fingerMat);
    const indexMarker = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), fingerMat);
    thumbMarker.visible = false; indexMarker.visible = false;
    scene.add(thumbMarker); scene.add(indexMarker);

    function handleResize() {
        if (!camera3D || !renderer) return;
        camera3D.aspect = window.innerWidth / window.innerHeight;
        camera3D.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);

        fovY = camera3D.fov * (Math.PI / 180);
        viewHeight = 2 * Math.tan(fovY / 2) * camera3D.position.z;
        viewWidth = viewHeight * camera3D.aspect;
        dockedPosition.set(-(viewWidth / 2) + 0.6, (viewHeight / 2) - 1.2, 0);
    }
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 150));

    function mapLandmarkTo3D(normX, normY) {
        const screenAspect = window.innerWidth / window.innerHeight;
        const videoAspect = (video.videoWidth || window.innerWidth) / (video.videoHeight || window.innerHeight);
        let scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0;

        if (screenAspect > videoAspect) {
            scaleY = videoAspect / screenAspect; offsetY = (1 - scaleY) / 2;
        } else {
            scaleX = screenAspect / videoAspect; offsetX = (1 - scaleX) / 2;
        }

        return { x: (((normX - offsetX) / scaleX) - 0.5) * viewWidth, y: -(((normY - offsetY) / scaleY) - 0.5) * viewHeight };
    }

    let currentScale = 1.0;
    const targetPos = new THREE.Vector3();
    let lastInteractionTime = Date.now();

    function onResults(results) {
        if (!isARRunning) return;

        let isHandActive = false;
        let isPinched = false;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            isHandActive = true;
            
            // --- AUTO-ADVANCING TUTORIAL LOGIC: STEP 1 ---
            if (tutorialState === 0) {
                tutorialState = 1;
                arStepDescription.innerText = "Step 2: Hand detected! Pinch your index and thumb together to grab the component.";
            }

            const hand = results.multiHandLandmarks[0];
            const thumb3D = mapLandmarkTo3D(hand[4].x, hand[4].y);
            const index3D = mapLandmarkTo3D(hand[8].x, hand[8].y);

            thumbMarker.position.set(thumb3D.x, thumb3D.y, 0);
            indexMarker.position.set(index3D.x, index3D.y, 0);
            thumbMarker.visible = true; indexMarker.visible = true;

            const pinchDist = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y, hand[4].z - hand[8].z);

            if (pinchDist < 0.08) {
                isPinched = true;
                
                // --- AUTO-ADVANCING TUTORIAL LOGIC: STEP 2 ---
                if (tutorialState === 1) {
                    tutorialState = 2;
                    arStepDescription.innerText = "Step 3: Excellent! Move it around, then release your fingers to let go.";
                    arStepDescription.style.color = "#00c853"; // Turns green on success
                }

                lastInteractionTime = Date.now();
                highlightBox.visible = true;
                fingerMat.color.setHex(0x00ff66);

                targetPos.set((thumb3D.x + index3D.x) / 2, (thumb3D.y + index3D.y) / 2, 0);
                componentContainer.position.lerp(targetPos, 0.4);
            }
        }

        if (!isPinched) {
            highlightBox.visible = false;
            fingerMat.color.setHex(0x00e5ff);
            componentContainer.rotation.y += 0.01;

            if (Date.now() - lastInteractionTime > 10000) {
                componentContainer.position.lerp(dockedPosition, 0.1);
            }
        }

        if (!isHandActive) {
            thumbMarker.visible = false; indexMarker.visible = false;
            arLiveText.innerText = "🔴 SEARCHING FOR HAND...";
        } else {
            arLiveText.innerText = "🟢 TRACKING ACTIVE";
        }

        renderer.render(scene, camera3D);
    }

    window.launchAR = function() {
        switchScreen('screen-ar');
        isARRunning = true;
        handleResize();
        
        // Reset Tutorial when launched
        tutorialState = 0;
        arStepDescription.innerText = "Step 1: Place your hand in front of the camera to activate tracking.";
        arStepDescription.style.color = "#3b42c4";

        if (!handsInstance) {
            handsInstance = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
            handsInstance.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            handsInstance.onResults(onResults);
        }

        if (!cameraUtilsInstance) {
            cameraUtilsInstance = new Camera(video, {
                onFrame: async () => { if (isARRunning) await handsInstance.send({image: video}); },
                facingMode: 'environment'
            });
        }

        cameraUtilsInstance.start().then(() => arLiveText.innerText = "🟢 CAMERA READY");
    };

    window.exitAR = function(targetScreen) {
        isARRunning = false;
        thumbMarker.visible = false; indexMarker.visible = false; highlightBox.visible = false;
        if (video.srcObject) video.srcObject.getTracks().forEach(track => track.stop());
        cameraUtilsInstance = null;
        switchScreen(targetScreen);
    };

} catch (error) {
    console.error("AR Engine failed to initialize:", error);
}
