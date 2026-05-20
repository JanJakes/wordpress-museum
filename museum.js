import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.min.js';

const releases = [...window.WP_MUSEUM_RELEASES].sort(compareVersions);
const eras = window.WP_MUSEUM_ERAS;
const eraColors = new Map(
	eras.map((era, index) => [
		era,
		[
			'#ffd166',
			'#ff4f64',
			'#2bb7ff',
			'#50d890',
			'#b37cff',
			'#ff9b54',
			'#78e0dc',
		][index],
	])
);

const canvas = document.querySelector('#museum-canvas');
const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true,
	powerPreference: 'high-performance',
});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 420);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickables = [];
const exhibitPositions = [];
const railButtons = [];
const keys = new Set();
const mobileMotion = {
	forward: false,
	back: false,
	left: false,
	right: false,
};

const spacing = 5.6;
const startZ = 7;
const corridorLength = startZ + (releases.length - 1) * spacing + 14;
const cameraBounds = {
	minX: -4.25,
	maxX: 4.25,
	minZ: -2,
	maxZ: corridorLength - 4,
};
let activeIndex = 0;
let guidedTarget = null;
let guidedTour = false;
let tourHoldUntil = 0;
let yaw = Math.PI;
let pitch = 0;
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let programmaticRailScroll = false;
let programmaticRailScrollTimer = 0;
let railScrollFrame = 0;

camera.rotation.order = 'YXZ';
camera.position.set(0, 1.65, -1);
setCameraRotation();

initRenderer();
buildScene();
buildRail();
bindControls();
focusRelease(0, true);
animate();

function initRenderer() {
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	scene.background = new THREE.Color(0x070a12);
	scene.fog = new THREE.Fog(0x070a12, 36, 190);

	scene.add(new THREE.HemisphereLight(0xfff0d0, 0x111827, 2.2));
	const keyLight = new THREE.DirectionalLight(0xffe2b0, 2.3);
	keyLight.position.set(2, 8, -6);
	scene.add(keyLight);

	window.addEventListener('resize', resizeRenderer);
	resizeRenderer();
}

function buildScene() {
	const root = new THREE.Group();
	scene.add(root);

	root.add(createFloor());
	root.add(createWall(-5.9));
	root.add(createWall(5.9));
	root.add(createCeilingBeams());

	let lastEra = '';
	releases.forEach((release, index) => {
		const z = startZ + index * spacing;
		const side = index % 2 === 0 ? -1 : 1;
		const color = eraColors.get(release.era);
		const position = new THREE.Vector3(side * 5.68, 2.05, z);
		exhibitPositions[index] = {
			card: position,
			stand: new THREE.Vector3(-side * 1.25, 1.65, z - 1.3),
			side,
		};
		root.add(createExhibit(release, index, position, side, color));
		root.add(createArtifact(release, index, side, z, color));

		if (release.era !== lastEra) {
			root.add(createEraGateway(release.era, z - 2.7, color));
			lastEra = release.era;
		}
	});
}

function createFloor() {
	const group = new THREE.Group();
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(11.8, corridorLength),
		new THREE.MeshStandardMaterial({
			color: 0x111827,
			roughness: 0.82,
			metalness: 0.08,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.z = corridorLength / 2 - 1;
	group.add(floor);

	for (let z = 1; z < corridorLength; z += spacing) {
		const stripe = new THREE.Mesh(
			new THREE.BoxGeometry(9.7, 0.035, 0.05),
			new THREE.MeshBasicMaterial({ color: 0x28364f })
		);
		stripe.position.set(0, 0.025, z);
		group.add(stripe);
	}

	const runner = new THREE.Mesh(
		new THREE.PlaneGeometry(2.15, corridorLength),
		new THREE.MeshBasicMaterial({
			color: 0x172033,
			transparent: true,
			opacity: 0.82,
		})
	);
	runner.rotation.x = -Math.PI / 2;
	runner.position.set(0, 0.028, corridorLength / 2 - 1);
	group.add(runner);
	return group;
}

function createWall(x) {
	const group = new THREE.Group();
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(0.26, 4.6, corridorLength),
		new THREE.MeshStandardMaterial({
			color: 0x11141f,
			roughness: 0.9,
			metalness: 0.04,
		})
	);
	wall.position.set(x, 2.2, corridorLength / 2 - 1);
	group.add(wall);

	for (let z = 1; z < corridorLength; z += 11.2) {
		const pilaster = new THREE.Mesh(
			new THREE.BoxGeometry(0.42, 4.7, 0.18),
			new THREE.MeshBasicMaterial({ color: 0x222c42 })
		);
		pilaster.position.set(x * 0.995, 2.25, z);
		group.add(pilaster);
	}
	return group;
}

function createCeilingBeams() {
	const group = new THREE.Group();
	for (let z = 2; z < corridorLength; z += spacing * 2) {
		const beam = new THREE.Mesh(
			new THREE.BoxGeometry(11.6, 0.12, 0.22),
			new THREE.MeshBasicMaterial({ color: 0x2b3651 })
		);
		beam.position.set(0, 4.45, z);
		group.add(beam);
	}
	return group;
}

function createExhibit(release, index, position, side, color) {
	const group = new THREE.Group();
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(3.38, 2.48, 0.16),
		new THREE.MeshStandardMaterial({
			color: new THREE.Color(color),
			roughness: 0.42,
			metalness: 0.35,
		})
	);
	frame.position.copy(position);
	frame.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
	group.add(frame);

	const plaque = new THREE.Mesh(
		new THREE.PlaneGeometry(3.02, 2.16),
		new THREE.MeshBasicMaterial({
			map: createPlaqueTexture(release, index, color),
			side: THREE.DoubleSide,
		})
	);
	plaque.position.copy(position);
	plaque.position.x -= side * 0.09;
	plaque.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
	plaque.userData.releaseIndex = index;
	group.add(plaque);
	pickables.push(plaque);

	const glow = new THREE.PointLight(new THREE.Color(color), 0.8, 8);
	glow.position.set(side * 4.4, 2.8, position.z);
	group.add(glow);
	return group;
}

function createArtifact(release, index, side, z, color) {
	const group = new THREE.Group();
	const plinth = new THREE.Mesh(
		new THREE.BoxGeometry(1.2, 0.82, 1.2),
		new THREE.MeshStandardMaterial({
			color: 0x1c2538,
			roughness: 0.72,
			metalness: 0.12,
		})
	);
	plinth.position.set(side * 3.75, 0.41, z + 1.15);
	group.add(plinth);

	const artifact = new THREE.Mesh(
		index % 3 === 0
			? new THREE.BoxGeometry(0.66, 0.66, 0.66)
			: index % 3 === 1
				? new THREE.CylinderGeometry(0.36, 0.36, 0.72, 6)
				: new THREE.TorusGeometry(0.34, 0.095, 10, 20),
		new THREE.MeshStandardMaterial({
			color: new THREE.Color(color),
			roughness: 0.36,
			metalness: 0.28,
			emissive: new THREE.Color(color),
			emissiveIntensity: 0.12,
		})
	);
	artifact.position.set(side * 3.75, 1.08, z + 1.15);
	artifact.rotation.set(0.35, index * 0.31, 0.18);
	artifact.userData.spin = 0.18 + (index % 5) * 0.035;
	group.add(artifact);

	const label = new THREE.Mesh(
		new THREE.PlaneGeometry(1.08, 0.34),
		new THREE.MeshBasicMaterial({
			map: createSmallLabelTexture(release.version),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	label.position.set(side * 3.75, 1.62, z + 1.15);
	label.rotation.y = side > 0 ? -0.45 : 0.45;
	group.add(label);
	return group;
}

function createEraGateway(era, z, color) {
	const group = new THREE.Group();
	const left = new THREE.Mesh(
		new THREE.BoxGeometry(0.28, 4.1, 0.28),
		new THREE.MeshBasicMaterial({ color })
	);
	const right = left.clone();
	const top = new THREE.Mesh(
		new THREE.BoxGeometry(10.8, 0.24, 0.28),
		new THREE.MeshBasicMaterial({ color })
	);
	left.position.set(-5.25, 2.05, z);
	right.position.set(5.25, 2.05, z);
	top.position.set(0, 4.12, z);
	group.add(left, right, top);

	const sign = new THREE.Mesh(
		new THREE.PlaneGeometry(5.6, 0.74),
		new THREE.MeshBasicMaterial({
			map: createEraTexture(era, color),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	sign.position.set(0, 3.55, z - 0.04);
	group.add(sign);
	return group;
}

function createPlaqueTexture(release, index, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 736;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#111827';
	ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
	ctx.fillStyle = color;
	ctx.fillRect(24, 24, canvas.width - 48, 18);
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.14;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.globalAlpha = 1;

	ctx.fillStyle = '#fff5df';
	ctx.font = '900 150px Arial Black, Impact, sans-serif';
	ctx.fillText(release.version, 64, 190);
	ctx.font = '700 42px system-ui, sans-serif';
	ctx.fillText(release.name, 70, 258);
	ctx.fillStyle = 'rgba(255, 245, 223, 0.68)';
	ctx.font = '600 28px system-ui, sans-serif';
	ctx.fillText(release.released, 70, 310);

	ctx.fillStyle = color;
	ctx.font = '800 38px system-ui, sans-serif';
	wrapText(ctx, release.knownFor, 70, 392, 860, 48, 2);

	ctx.fillStyle = 'rgba(255, 245, 223, 0.82)';
	ctx.font = '500 30px system-ui, sans-serif';
	wrapText(ctx, release.detail, 70, 506, 860, 40, 3);

	ctx.fillStyle = 'rgba(255, 245, 223, 0.52)';
	ctx.font = '700 22px system-ui, sans-serif';
	ctx.fillText(
		`Exhibit ${String(index + 1).padStart(2, '0')} / ${releases.length}`,
		70,
		672
	);
	ctx.fillText(release.artifact, 630, 672);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createSmallLabelTexture(text) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 160;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = 'rgba(7, 10, 18, 0.78)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = '#fff5df';
	ctx.lineWidth = 8;
	ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 84px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function createEraTexture(text, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 160;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.92;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#07100b';
	ctx.font = '900 66px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2 + 6);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function bindControls() {
	document.querySelector('#walk-button').addEventListener('click', () => {
		canvas.requestPointerLock();
	});
	document.querySelector('#tour-button').addEventListener('click', () => {
		guidedTour = !guidedTour;
		document.querySelector('#tour-button').textContent = guidedTour
			? 'Pause tour'
			: 'Guided tour';
	});
	document
		.querySelector('#previous-release')
		.addEventListener('click', () => focusRelease(activeIndex - 1));
	document
		.querySelector('#next-release')
		.addEventListener('click', () => focusRelease(activeIndex + 1));

	document.addEventListener('pointerlockchange', () => {
		document.body.classList.toggle(
			'is-walking',
			document.pointerLockElement === canvas
		);
	});
	document.addEventListener('mousemove', (event) => {
		if (document.pointerLockElement !== canvas) {
			return;
		}
		turnCamera(event.movementX, event.movementY);
	});
	document.addEventListener('keydown', (event) => {
		keys.add(event.code);
		if (isMovementKey(event.code)) {
			event.preventDefault();
			stopGuidedTour();
			guidedTarget = null;
		}
		if (event.code === 'Enter') {
			document.querySelector('#open-playground').click();
		}
	});
	document.addEventListener('keyup', (event) => {
		if (isMovementKey(event.code)) {
			event.preventDefault();
		}
		keys.delete(event.code);
	});

	canvas.addEventListener('click', (event) => {
		if (document.pointerLockElement === canvas) {
			pickFromScreen(0, 0);
			return;
		}
		const rect = canvas.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
		pickFromScreen(x, y);
	});

	canvas.addEventListener('pointerdown', (event) => {
		if (event.pointerType === 'mouse') {
			return;
		}
		dragging = true;
		lastPointer = { x: event.clientX, y: event.clientY };
	});
	window.addEventListener('pointermove', (event) => {
		if (!dragging) {
			return;
		}
		turnCamera(
			event.clientX - lastPointer.x,
			event.clientY - lastPointer.y
		);
		lastPointer = { x: event.clientX, y: event.clientY };
	});
	window.addEventListener('pointerup', () => {
		dragging = false;
	});
	document.addEventListener(
		'wheel',
		(event) => {
			if (shouldIgnoreMuseumWheel(event.target)) {
				return;
			}
			event.preventDefault();
			stopGuidedTour();
			scrollRailBy(getWheelRailDelta(event));
		},
		{ passive: false }
	);

	document.querySelectorAll('[data-mobile-move]').forEach((button) => {
		const direction = button.dataset.mobileMove;
		button.addEventListener('pointerdown', () => {
			stopGuidedTour();
			mobileMotion[direction] = true;
			guidedTarget = null;
		});
		button.addEventListener('pointerup', () => {
			mobileMotion[direction] = false;
		});
		button.addEventListener('pointerleave', () => {
			mobileMotion[direction] = false;
		});
	});
	document.querySelectorAll('[data-mobile-turn]').forEach((button) => {
		const direction = button.dataset.mobileTurn;
		button.addEventListener('pointerdown', () => {
			stopGuidedTour();
			mobileMotion[direction] = true;
			guidedTarget = null;
		});
		button.addEventListener('pointerup', () => {
			mobileMotion[direction] = false;
		});
		button.addEventListener('pointerleave', () => {
			mobileMotion[direction] = false;
		});
	});
}

function buildRail() {
	const rail = document.querySelector('#release-rail-track');
	releases.forEach((release, index) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = release.version;
		button.title = `${release.version} ${release.name}: ${release.knownFor}`;
		button.addEventListener('click', () => focusRelease(index));
		rail.append(button);
		railButtons[index] = button;
	});
	bindRailScroll(rail);
}

function bindRailScroll(rail) {
	rail.addEventListener(
		'wheel',
		(event) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
				return;
			}
			event.preventDefault();
			scrollRailBy(event.deltaY);
		},
		{ passive: false }
	);
	rail.addEventListener('scroll', () => {
		if (programmaticRailScroll || railScrollFrame) {
			return;
		}
		railScrollFrame = requestAnimationFrame(() => {
			railScrollFrame = 0;
			focusNearestRailRelease();
		});
	});
}

function focusNearestRailRelease() {
	const nearestIndex = getNearestRailIndex();
	if (nearestIndex !== activeIndex) {
		stopGuidedTour();
		focusRelease(nearestIndex, false, { syncRail: false });
	}
}

function shouldIgnoreMuseumWheel(target) {
	if (!(target instanceof Element)) {
		return false;
	}
	return target.closest('.release-panel') || target.closest('.release-rail');
}

function getWheelRailDelta(event) {
	return Math.abs(event.deltaY) > Math.abs(event.deltaX)
		? event.deltaY
		: event.deltaX;
}

function scrollRailBy(delta) {
	document.querySelector('#release-rail-track').scrollLeft += delta;
}

function getNearestRailIndex() {
	const rail = document.querySelector('#release-rail-track');
	const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
	if (maxScrollLeft <= 0) {
		return activeIndex;
	}
	return Math.round(
		THREE.MathUtils.clamp(rail.scrollLeft / maxScrollLeft, 0, 1) *
			(releases.length - 1)
	);
}

function animate() {
	const delta = Math.min(clock.getDelta(), 0.05);
	updateCamera(delta);
	spinArtifacts(delta);
	renderer.render(scene, camera);
	requestAnimationFrame(animate);
}

function updateCamera(delta) {
	if (guidedTour && !guidedTarget) {
		const now = performance.now();
		if (now > tourHoldUntil) {
			focusRelease(activeIndex + 1);
			tourHoldUntil = now + 3600;
		}
	}

	if (guidedTarget) {
		camera.position.lerp(guidedTarget.position, 1 - Math.pow(0.002, delta));
		yaw = lerpAngle(yaw, guidedTarget.yaw, 1 - Math.pow(0.004, delta));
		pitch = THREE.MathUtils.lerp(
			pitch,
			guidedTarget.pitch,
			1 - Math.pow(0.004, delta)
		);
		setCameraRotation();
		if (camera.position.distanceTo(guidedTarget.position) < 0.035) {
			guidedTarget = null;
			tourHoldUntil = performance.now() + 1700;
		}
		return;
	}

	let forward = 0;
	let side = 0;
	if (keys.has('KeyW') || keys.has('ArrowUp') || mobileMotion.forward) {
		forward += 1;
	}
	if (keys.has('KeyS') || keys.has('ArrowDown') || mobileMotion.back) {
		forward -= 1;
	}
	if (keys.has('KeyA')) {
		side -= 1;
	}
	if (keys.has('KeyD')) {
		side += 1;
	}
	if (keys.has('ArrowLeft')) {
		turnCamera(-220 * delta, 0);
	}
	if (keys.has('ArrowRight')) {
		turnCamera(220 * delta, 0);
	}
	if (mobileMotion.left) {
		turnCamera(-220 * delta, 0);
	}
	if (mobileMotion.right) {
		turnCamera(220 * delta, 0);
	}
	if (forward || side) {
		stopGuidedTour();
		const speed =
			keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.5 : 4.2;
		const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
		const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
		camera.position.addScaledVector(fwd, forward * speed * delta);
		camera.position.addScaledVector(right, side * speed * delta);
		clampCamera();
		updateNearestRelease();
	}
}

function stopGuidedTour() {
	guidedTour = false;
	document.querySelector('#tour-button').textContent = 'Guided tour';
}

function spinArtifacts(delta) {
	scene.traverse((object) => {
		if (object.userData.spin) {
			object.rotation.y += object.userData.spin * delta;
		}
	});
}

function focusRelease(index, immediate = false, options = {}) {
	activeIndex = wrapIndex(index);
	const release = releases[activeIndex];
	const target = exhibitPositions[activeIndex];
	const viewPoint = target.stand.clone();
	const lookPoint = target.card.clone();
	const view = getViewAngles(viewPoint, lookPoint);
	if (immediate) {
		camera.position.copy(viewPoint);
		yaw = view.yaw;
		pitch = view.pitch;
		setCameraRotation();
		guidedTarget = null;
	} else {
		guidedTarget = {
			position: viewPoint,
			yaw: view.yaw,
			pitch: view.pitch,
		};
	}
	updatePanel(release);
	updateRail(options.syncRail !== false);
}

function updatePanel(release) {
	document.querySelector('#release-era').textContent = release.era;
	document.querySelector('#release-title').textContent =
		`WordPress ${release.version} ${release.name}`;
	document.querySelector('#release-date').textContent = release.released;
	document.querySelector('#release-known-for').textContent = release.knownFor;
	document.querySelector('#release-detail').textContent = release.detail;
	document.querySelector('#release-counter').textContent =
		`${activeIndex + 1} / ${releases.length}`;

	const blueprintUrl = new URL(release.blueprint, window.location.href);
	const playgroundUrl = new URL('../../', window.location.href);
	playgroundUrl.searchParams.set('blueprint-url', blueprintUrl.href);
	document.querySelector('#open-playground').href = playgroundUrl.href;
	document.querySelector('#open-blueprint').href = blueprintUrl.href;
}

function updateRail(syncRail = true) {
	railButtons.forEach((button, index) => {
		button.classList.toggle('is-active', index === activeIndex);
	});
	if (!syncRail) {
		return;
	}
	scrollActiveRailButton();
}

function scrollActiveRailButton() {
	programmaticRailScroll = true;
	window.clearTimeout(programmaticRailScrollTimer);
	railButtons[activeIndex]?.scrollIntoView({
		behavior: 'smooth',
		inline: 'center',
		block: 'nearest',
	});
	programmaticRailScrollTimer = window.setTimeout(() => {
		programmaticRailScroll = false;
	}, 450);
}

function updateNearestRelease() {
	let nearest = activeIndex;
	let nearestDistance = Infinity;
	exhibitPositions.forEach((position, index) => {
		const distance = Math.abs(camera.position.z - position.card.z);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearest = index;
		}
	});
	if (nearest !== activeIndex && nearestDistance < spacing * 0.52) {
		activeIndex = nearest;
		updatePanel(releases[activeIndex]);
		updateRail();
	}
}

function pickFromScreen(x, y) {
	pointer.set(x, y);
	raycaster.setFromCamera(pointer, camera);
	const hit = raycaster.intersectObjects(pickables, false)[0];
	if (hit) {
		focusRelease(hit.object.userData.releaseIndex);
	}
}

function turnCamera(deltaX, deltaY) {
	yaw -= deltaX * 0.0022;
	pitch -= deltaY * 0.0018;
	pitch = THREE.MathUtils.clamp(pitch, -0.62, 0.58);
	setCameraRotation();
}

function setCameraRotation() {
	camera.rotation.y = yaw;
	camera.rotation.x = pitch;
}

function clampCamera() {
	camera.position.x = THREE.MathUtils.clamp(
		camera.position.x,
		cameraBounds.minX,
		cameraBounds.maxX
	);
	camera.position.y = 1.65;
	camera.position.z = THREE.MathUtils.clamp(
		camera.position.z,
		cameraBounds.minZ,
		cameraBounds.maxZ
	);
}

function resizeRenderer() {
	const width = window.innerWidth;
	const height = window.innerHeight;
	renderer.setSize(width, height, false);
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
}

function getViewAngles(from, to) {
	const direction = to.clone().sub(from);
	const length = direction.length();
	return {
		yaw: Math.atan2(-direction.x, -direction.z),
		pitch: Math.asin(
			THREE.MathUtils.clamp(direction.y / length, -0.72, 0.72)
		),
	};
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
	const words = text.split(' ');
	let line = '';
	let lines = 0;
	for (const word of words) {
		const testLine = line ? `${line} ${word}` : word;
		if (ctx.measureText(testLine).width > maxWidth && line) {
			ctx.fillText(line, x, y);
			y += lineHeight;
			line = word;
			lines += 1;
			if (lines >= maxLines) {
				return;
			}
		} else {
			line = testLine;
		}
	}
	if (line && lines < maxLines) {
		ctx.fillText(line, x, y);
	}
}

function wrapIndex(index) {
	return (index + releases.length) % releases.length;
}

function isMovementKey(code) {
	return [
		'KeyW',
		'KeyA',
		'KeyS',
		'KeyD',
		'ArrowUp',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
	].includes(code);
}

function compareVersions(a, b) {
	const left = a.version.split('.').map(Number);
	const right = b.version.split('.').map(Number);
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const difference = (left[index] || 0) - (right[index] || 0);
		if (difference !== 0) {
			return difference;
		}
	}
	return 0;
}

function lerpAngle(start, end, amount) {
	const difference = Math.atan2(Math.sin(end - start), Math.cos(end - start));
	return start + difference * amount;
}
