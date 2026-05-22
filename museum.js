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
const textureCanvases = new Map();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 420);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickables = [];
const exhibitPositions = [];
const spinningArtifacts = [];
let railButtons = [];
let railItems = [];
let railMode = '';
let railEra = '';
let activeExhibitMarker = null;
const keys = new Set();
const mobileMotion = {
	forward: false,
	back: false,
	left: false,
	right: false,
};

const roomWidth = 16;
const roomDepth = 13;
const wallHeight = 5.2;
const wallThickness = 0.26;
const roomDoorHalfWidth = 2.9;
const exhibitFrameOffset = wallThickness / 2 + 0.06;
const exhibitPlaqueOffset = exhibitFrameOffset + 0.015;
const sideExhibitMinZ = -roomDepth / 2 + 5.2;
const sideExhibitMaxZ = roomDepth / 2 - 2.1;
const hubApothem = 15.5;
const hubCircumradius = hubApothem / Math.cos(Math.PI / 8);
const hubSideLength = 2 * hubApothem * Math.tan(Math.PI / 8);
const entryDistanceFromCenter = 5.2;
const shellPadding = 1.4;
const shellHeight = 5.45;
const walkSpeed = 7.2;
const sprintSpeed = 12;
const maxMovementStep = 0.16;
const activeFrameInterval = 1000 / 60;
const idleFrameInterval = 1000 / 30;
const hubSides = createHubSides();
const muralSide = hubSides.find((side) => side.kind === 'mural');
const roomSides = hubSides.filter((side) => side.era);
const roomLayout = new Map(roomSides.map((side) => [side.era, side]));
const atriumCenterPosition = new THREE.Vector3(0, 1.65, 0);
const atriumStartPosition = atriumCenterPosition
	.clone()
	.add(muralSide.normal.clone().multiplyScalar(-entryDistanceFromCenter));
const museumBounds = getMuseumBounds();
const cameraBounds = {
	minX: museumBounds.minX - 1.5,
	maxX: museumBounds.maxX + 1.5,
	minZ: museumBounds.minZ - 1.5,
	maxZ: museumBounds.maxZ + 1.5,
};
const movementZones = roomSides;
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
let lastFrameTime = 0;

camera.rotation.order = 'YXZ';
camera.position.copy(atriumStartPosition);
setCameraRotation();

initRenderer();
buildScene();
buildRail();
bindControls();
startAtMuseumCenter();
animate();

function initRenderer() {
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	scene.background = new THREE.Color(0x151a2a);
	scene.fog = new THREE.Fog(0x151a2a, 42, 95);

	scene.add(new THREE.HemisphereLight(0xfff7df, 0x2d3a58, 3.1));
	scene.add(new THREE.AmbientLight(0xe8edff, 0.9));
	const keyLight = new THREE.DirectionalLight(0xffe2b0, 2.8);
	keyLight.position.set(2, 8, -6);
	scene.add(keyLight);

	window.addEventListener('resize', resizeRenderer);
	resizeRenderer();
}

function buildScene() {
	const root = new THREE.Group();
	scene.add(root);

	root.add(createBuildingShell());
	root.add(createAtrium());
	activeExhibitMarker = createActiveExhibitMarker();
	root.add(activeExhibitMarker);
	getEraReleaseGroups().forEach(({ era, items }) => {
		const roomSide = roomLayout.get(era);
		const color = eraColors.get(era);
		const room = {
			era,
			color,
			yearRange: getReleaseYearRange(items),
			...roomSide,
		};
		root.add(createRoom(room));
		createExhibitSlots(room, items.length).forEach((slot, slotIndex) => {
			const { release, index } = items[slotIndex];
			exhibitPositions[index] = {
				card: slot.position.clone(),
				era,
				stand: slot.position
					.clone()
					.add(slot.normal.clone().multiplyScalar(5.6)),
				color,
				normal: slot.normal.clone(),
				rotationY: slot.rotationY,
			};
			exhibitPositions[index].stand.y = 1.65;
			root.add(createExhibit(release, index, slot, color));
			root.add(createArtifact(release, index, slot, color));
		});
	});
}

function getReleaseYearRange(items) {
	const years = items.map(({ release }) => release.year);
	const minYear = Math.min(...years);
	const maxYear = Math.max(...years);
	return minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`;
}

function createBuildingShell() {
	const group = new THREE.Group();
	const bounds = getShellBounds();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;

	group.add(createShellWall(centerX, bounds.minZ, width, true));
	group.add(createShellWall(centerX, bounds.maxZ, width, true));
	group.add(createShellWall(bounds.minX, centerZ, depth, false));
	group.add(createShellWall(bounds.maxX, centerZ, depth, false));
	group.add(createCeiling(bounds));
	return group;
}

function createMuseumMaterial(textureName, options = {}) {
	const texture = createMuseumTexture(
		textureName,
		options.repeatX ?? 1,
		options.repeatY ?? 1
	);
	return new THREE.MeshStandardMaterial({
		map: texture,
		color: options.color ?? 0xffffff,
		roughness: options.roughness ?? 0.82,
		metalness: options.metalness ?? 0.04,
	});
}

function createMuseumTexture(name, repeatX, repeatY) {
	const texture = new THREE.CanvasTexture(getTextureCanvas(name));
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeatX, repeatY);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
	return texture;
}

function getTextureCanvas(name) {
	if (textureCanvases.has(name)) {
		return textureCanvases.get(name);
	}

	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 512;
	const ctx = canvas.getContext('2d');
	const draw = {
		atriumFloor: drawAtriumFloorTexture,
		ceiling: drawCeilingTexture,
		roomFloor: drawRoomFloorTexture,
		roomWall: drawRoomWallTexture,
		shellWall: drawShellWallTexture,
	}[name];
	draw(ctx, canvas.width, canvas.height);
	textureCanvases.set(name, canvas);
	return canvas;
}

function drawRoomFloorTexture(ctx, width, height) {
	ctx.fillStyle = '#2f3f5f';
	ctx.fillRect(0, 0, width, height);
	drawTileGrid(ctx, width, height, 48, '#1f2b44', '#405373');
	drawSpeckles(ctx, width, height, 220, [
		'#7f90ad',
		'#ffcf6a',
		'#ed6b78',
		'#26324d',
	]);
}

function drawAtriumFloorTexture(ctx, width, height) {
	const center = width / 2;
	ctx.fillStyle = '#31415f';
	ctx.fillRect(0, 0, width, height);
	for (let radius = 46; radius < 350; radius += 42) {
		ctx.beginPath();
		ctx.arc(center, center, radius, 0, Math.PI * 2);
		ctx.strokeStyle = radius % 84 === 0 ? '#ffd166' : '#536681';
		ctx.lineWidth = radius % 84 === 0 ? 5 : 3;
		ctx.stroke();
	}
	for (let index = 0; index < 24; index++) {
		const angle = (Math.PI * 2 * index) / 24;
		ctx.beginPath();
		ctx.moveTo(center, center);
		ctx.lineTo(
			center + Math.cos(angle) * width,
			center + Math.sin(angle) * height
		);
		ctx.strokeStyle = index % 2 === 0 ? '#435671' : '#26344f';
		ctx.lineWidth = 2;
		ctx.stroke();
	}
	drawSpeckles(ctx, width, height, 180, [
		'#ffd166',
		'#79e0dc',
		'#f7e7bf',
		'#4e6685',
	]);
}

function drawShellWallTexture(ctx, width, height) {
	drawPlasterTexture(ctx, width, height, '#b9c7da', '#8fa3bd', '#dce6f2');
	drawWallPanels(ctx, width, height, 128, 96, '#7d91ad');
}

function drawRoomWallTexture(ctx, width, height) {
	drawPlasterTexture(ctx, width, height, '#cbd7e7', '#9fb1c9', '#f3f0dd');
	drawWallPanels(ctx, width, height, 96, 128, '#879bb7');
}

function drawCeilingTexture(ctx, width, height) {
	ctx.fillStyle = '#d5dde8';
	ctx.fillRect(0, 0, width, height);
	drawTileGrid(ctx, width, height, 128, '#97a8bf', '#e7edf4');
	drawSpeckles(ctx, width, height, 160, ['#ffffff', '#b6c2d3', '#8393aa']);
}

function drawPlasterTexture(ctx, width, height, base, lowlight, highlight) {
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, width, height);
	for (let y = 0; y < height; y += 8) {
		const alpha = 0.04 + pseudoRandom(y) * 0.05;
		ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
		ctx.fillRect(0, y, width, 4);
	}
	drawSpeckles(ctx, width, height, 340, [lowlight, highlight, '#f5d587']);
}

function drawWallPanels(ctx, width, height, panelWidth, panelHeight, color) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.globalAlpha = 0.62;
	for (let x = 0; x <= width; x += panelWidth) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	for (let y = 0; y <= height; y += panelHeight) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawTileGrid(ctx, width, height, size, grout, highlight) {
	for (let y = 0; y < height; y += size) {
		for (let x = 0; x < width; x += size) {
			ctx.fillStyle =
				(x / size + y / size) % 2 === 0
					? 'rgba(255, 255, 255, 0.035)'
					: 'rgba(0, 0, 0, 0.035)';
			ctx.fillRect(x, y, size, size);
			ctx.strokeStyle = grout;
			ctx.lineWidth = 3;
			ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
			ctx.strokeStyle = highlight;
			ctx.lineWidth = 1;
			ctx.strokeRect(x + 5.5, y + 5.5, size - 11, size - 11);
		}
	}
}

function drawSpeckles(ctx, width, height, count, palette) {
	for (let index = 0; index < count; index++) {
		const x = pseudoRandom(index * 3 + 1) * width;
		const y = pseudoRandom(index * 3 + 2) * height;
		const size = 1 + Math.floor(pseudoRandom(index * 3 + 3) * 5);
		ctx.fillStyle = palette[index % palette.length];
		ctx.globalAlpha = 0.13 + pseudoRandom(index * 7) * 0.32;
		ctx.fillRect(x, y, size, size);
	}
	ctx.globalAlpha = 1;
}

function pseudoRandom(seed) {
	const value = Math.sin(seed * 12.9898) * 43758.5453;
	return value - Math.floor(value);
}

function createShellWall(xOrCenter, zOrCenter, length, isHorizontal) {
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			isHorizontal ? length : wallThickness * 1.6,
			shellHeight,
			isHorizontal ? wallThickness * 1.6 : length
		),
		createShellWallMaterial(length)
	);
	wall.position.set(xOrCenter, shellHeight / 2, zOrCenter);
	return wall;
}

function createShellWallMaterial(length) {
	return createMuseumMaterial('shellWall', {
		repeatX: length / 6,
		repeatY: shellHeight / 2,
		roughness: 0.92,
		metalness: 0.02,
	});
}

function createCeiling(bounds) {
	const group = new THREE.Group();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const panel = new THREE.Mesh(
		new THREE.PlaneGeometry(width, depth),
		new THREE.MeshStandardMaterial({
			map: createMuseumTexture('ceiling', width / 8, depth / 8),
			roughness: 0.9,
			metalness: 0.02,
			side: THREE.DoubleSide,
		})
	);
	panel.rotation.x = Math.PI / 2;
	panel.position.set(centerX, shellHeight, centerZ);
	group.add(panel);
	return group;
}

function createAtrium() {
	const group = new THREE.Group();
	group.add(createHubFloor());
	group.add(createHubWalls());
	return group;
}

function createHubFloor() {
	const floor = new THREE.Mesh(
		new THREE.CircleGeometry(hubCircumradius, 8, Math.PI / 8),
		createMuseumMaterial('atriumFloor', {
			repeatX: 1,
			repeatY: 1,
			roughness: 0.78,
			metalness: 0.08,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	return floor;
}

function createHubWalls() {
	const group = new THREE.Group();
	const ring = new THREE.Mesh(
		new THREE.RingGeometry(
			hubCircumradius,
			hubCircumradius + 0.45,
			8,
			1,
			Math.PI / 8
		),
		new THREE.MeshBasicMaterial({
			color: 0xffd166,
			transparent: true,
			opacity: 0.84,
		})
	);
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.025;
	group.add(ring);

	for (const side of hubSides) {
		if (side.kind === 'mural') {
			group.add(createHubWallSegment(side, hubSideLength, 0));
			group.add(createWordPressMural(side));
		} else {
			const segmentLength = (roomWidth - roomDoorHalfWidth * 2) / 2;
			const segmentOffset = roomDoorHalfWidth + segmentLength / 2;
			group.add(createHubWallSegment(side, segmentLength, -segmentOffset));
			group.add(createHubWallSegment(side, segmentLength, segmentOffset));
		}
	}
	return group;
}

function createHubWallSegment(side, length, tangentOffset) {
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			length,
			wallHeight,
			wallThickness
		),
		createRoomWallMaterial(length)
	);
	wall.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(tangentOffset));
	wall.position.y = wallHeight / 2;
	wall.rotation.y = getRotationForNormal(side.normal);
	return wall;
}

function createWordPressMural(side) {
	const mural = new THREE.Mesh(
		new THREE.PlaneGeometry(hubSideLength * 0.72, wallHeight * 0.68),
		new THREE.MeshBasicMaterial({
			map: createWordPressMuralTexture(),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	mural.position
		.copy(side.midpoint)
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.08));
	mural.position.y = 2.65;
	mural.rotation.y = getRotationForNormal(
		side.normal.clone().multiplyScalar(-1)
	);
	return mural;
}

function createWordPressMuralTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 640;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#111827';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#ffd166';
	ctx.fillRect(0, 0, canvas.width, 28);
	ctx.fillRect(0, canvas.height - 28, canvas.width, 28);

	ctx.strokeStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.lineWidth = 6;
	for (let index = 0; index < 9; index++) {
		ctx.beginPath();
		ctx.arc(512, 320, 76 + index * 48, 0, Math.PI * 2);
		ctx.stroke();
	}

	ctx.fillStyle = '#fff5df';
	ctx.font = '900 122px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('WORDPRESS', 512, 245);
	ctx.font = '900 116px Arial Black, Impact, sans-serif';
	ctx.fillText('MUSEUM', 512, 370);

	ctx.fillStyle = '#50d890';
	ctx.font = '800 34px system-ui, sans-serif';
	ctx.fillText('2004 -> BLOCKS -> PLAYGROUND', 512, 455);

	ctx.fillStyle = 'rgba(255, 245, 223, 0.72)';
	ctx.font = '700 24px system-ui, sans-serif';
	ctx.fillText(
		'Every publishing era, lovingly over-indexed',
		512,
		510
	);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createRoom(room) {
	const group = new THREE.Group();
	group.position.copy(room.center);
	group.rotation.y = getRotationForNormal(room.normal);

	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth, roomDepth),
		createMuseumMaterial('roomFloor', {
			repeatX: roomWidth / 4,
			repeatY: roomDepth / 4,
			roughness: 0.82,
			metalness: 0.08,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = 0.01;
	group.add(floor);
	group.add(createRoomCeiling());

	group.add(createRoomWall('back'));
	group.add(createRoomWall('left'));
	group.add(createRoomWall('right'));
	group.add(createFloorTrim('front', room.color));
	group.add(createFloorTrim('back', room.color));
	group.add(createFloorTrim('left', room.color));
	group.add(createFloorTrim('right', room.color));
	group.add(createDoorFrame(room));
	group.add(createRoomLight(room.color));
	return group;
}

function createRoomCeiling() {
	const ceiling = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth, roomDepth),
		new THREE.MeshBasicMaterial({
			map: createMuseumTexture('ceiling', roomWidth / 7, roomDepth / 7),
			side: THREE.DoubleSide,
		})
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.y = wallHeight - 0.04;
	return ceiling;
}

function createRoomWall(side) {
	return createRoomWallSegment(
		side,
		side === 'front' || side === 'back'
			? roomWidth
			: roomDepth + wallThickness * 2,
		0
	);
}

function createRoomWallSegment(side, length, tangentOffset) {
	const isWidthWall = side === 'front' || side === 'back';
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			isWidthWall ? length : wallThickness,
			wallHeight,
			isWidthWall ? wallThickness : length
		),
		createRoomWallMaterial(length)
	);
	wall.position.copy(getLocalWallPosition(side, tangentOffset));
	wall.position.y = wallHeight / 2;
	return wall;
}

function createRoomWallMaterial(length) {
	return createMuseumMaterial('roomWall', {
		repeatX: length / 4.8,
		repeatY: wallHeight / 2.2,
		roughness: 0.94,
		metalness: 0.02,
	});
}

function createFloorTrim(side, color) {
	const isWidthTrim = side === 'front' || side === 'back';
	const trim = new THREE.Mesh(
		new THREE.BoxGeometry(
			isWidthTrim ? roomWidth : 0.08,
			0.04,
			isWidthTrim ? 0.08 : roomDepth
		),
		new THREE.MeshBasicMaterial({ color })
	);
	trim.position.copy(getLocalWallPosition(side, 0));
	trim.position.y = 0.05;
	return trim;
}

function createDoorFrame(room) {
	const group = new THREE.Group();
	const pillarGeometry = new THREE.BoxGeometry(0.25, wallHeight, 0.3);
	const beamGeometry = new THREE.BoxGeometry(5.2, 0.25, 0.3);
	const material = new THREE.MeshBasicMaterial({ color: room.color });
	const first = new THREE.Mesh(pillarGeometry, material);
	const second = first.clone();
	const beam = new THREE.Mesh(beamGeometry, material);
	const gap = roomDoorHalfWidth;
	first.position.set(-gap, wallHeight / 2, -roomDepth / 2);
	second.position.set(gap, wallHeight / 2, -roomDepth / 2);
	beam.position.set(0, 3.55, -roomDepth / 2);
	group.add(first, second, beam);
	const signMaterial = new THREE.MeshBasicMaterial({
		map: createEraTexture(room.era, room.color, room.yearRange),
		transparent: true,
	});
	group.add(createDoorSign(signMaterial, -roomDepth / 2 - 0.08, Math.PI));
	group.add(createDoorSign(signMaterial, -roomDepth / 2 + 0.08, 0));
	return group;
}

function createDoorSign(material, z, rotationY) {
	const sign = new THREE.Mesh(
		new THREE.PlaneGeometry(5.6, 0.7),
		material
	);
	sign.position.set(0, 3.05, z);
	sign.rotation.y = rotationY;
	return sign;
}

function createRoomLight(color) {
	const group = new THREE.Group();
	const light = new THREE.PointLight(new THREE.Color(color), 1.6, 18);
	light.position.set(0, 3.35, 0);
	group.add(light);

	const fixture = new THREE.Mesh(
		new THREE.BoxGeometry(3.4, 0.08, 0.32),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.9,
		})
	);
	fixture.position.set(0, 4.48, 0);
	group.add(fixture);
	return group;
}

function getLocalWallPosition(side, tangentOffset) {
	return {
		front: new THREE.Vector3(tangentOffset, 0, -roomDepth / 2),
		back: new THREE.Vector3(tangentOffset, 0, roomDepth / 2),
		left: new THREE.Vector3(-roomWidth / 2, 0, tangentOffset),
		right: new THREE.Vector3(roomWidth / 2, 0, tangentOffset),
	}[side];
}

function createActiveExhibitMarker() {
	const group = new THREE.Group();
	const wallGlow = new THREE.Mesh(
		new THREE.PlaneGeometry(3.7, 2.8),
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.18,
			depthWrite: false,
			side: THREE.DoubleSide,
		})
	);
	wallGlow.name = 'activeWallGlow';
	group.add(wallGlow);

	const floorRing = new THREE.Mesh(
		new THREE.RingGeometry(0.72, 0.94, 48),
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.85,
			depthWrite: false,
			side: THREE.DoubleSide,
		})
	);
	floorRing.name = 'activeFloorRing';
	floorRing.rotation.x = -Math.PI / 2;
	group.add(floorRing);
	return group;
}

function createExhibit(release, index, slot, color) {
	const group = new THREE.Group();
	const frame = createExhibitFrame(color);
	frame.position
		.copy(slot.position)
		.add(slot.normal.clone().multiplyScalar(exhibitFrameOffset));
	frame.rotation.y = slot.rotationY;
	group.add(frame);

	const plaque = new THREE.Mesh(
		new THREE.PlaneGeometry(3.02, 2.16),
		new THREE.MeshBasicMaterial({
			map: createPlaqueTexture(release, index, color),
			side: THREE.DoubleSide,
		})
	);
	plaque.position
		.copy(slot.position)
		.add(slot.normal.clone().multiplyScalar(exhibitPlaqueOffset));
	plaque.rotation.y = slot.rotationY;
	plaque.renderOrder = 2;
	plaque.userData.releaseIndex = index;
	group.add(plaque);
	pickables.push(plaque);

	return group;
}

function createExhibitFrame(color) {
	const outerWidth = 3.38;
	const outerHeight = 2.48;
	const rail = 0.16;
	const innerWidth = outerWidth - rail * 2;
	const innerHeight = outerHeight - rail * 2;
	const shape = new THREE.Shape();
	shape.moveTo(-outerWidth / 2, -outerHeight / 2);
	shape.lineTo(outerWidth / 2, -outerHeight / 2);
	shape.lineTo(outerWidth / 2, outerHeight / 2);
	shape.lineTo(-outerWidth / 2, outerHeight / 2);
	shape.lineTo(-outerWidth / 2, -outerHeight / 2);

	const hole = new THREE.Path();
	hole.moveTo(-innerWidth / 2, -innerHeight / 2);
	hole.lineTo(-innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, -innerHeight / 2);
	hole.lineTo(-innerWidth / 2, -innerHeight / 2);
	shape.holes.push(hole);

	const geometry = new THREE.ShapeGeometry(shape);
	const material = new THREE.MeshBasicMaterial({
		color,
		side: THREE.DoubleSide,
	});
	return new THREE.Mesh(geometry, material);
}

function createArtifact(release, index, slot, color) {
	const group = new THREE.Group();
	const base = slot.position
		.clone()
		.add(slot.normal.clone().multiplyScalar(1.35))
		.add(slot.tangent.clone().multiplyScalar(index % 2 === 0 ? -1.6 : 1.6));
	const plinth = new THREE.Mesh(
		new THREE.BoxGeometry(1.2, 0.82, 1.2),
		new THREE.MeshStandardMaterial({
			color: 0x1c2538,
			roughness: 0.72,
			metalness: 0.12,
		})
	);
	plinth.position.set(base.x, 0.41, base.z);
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
	artifact.position.set(base.x, 1.08, base.z);
	artifact.rotation.set(0.35, index * 0.31, 0.18);
	artifact.userData.spin = 0.18 + (index % 5) * 0.035;
	group.add(artifact);
	spinningArtifacts.push(artifact);
	return group;
}

function createExhibitSlots(room, releaseCount) {
	// Room-local x points toward the visitor's left when entering from the hub.
	const walls = [
		{ side: 'right', reverse: false },
		{ side: 'back', reverse: true },
		{ side: 'left', reverse: true },
	];
	const wallCounts = distributeCount(releaseCount, walls.length);
	return walls.flatMap(({ side, reverse }, wallIndex) => {
		const slotCount = wallCounts[wallIndex];
		return Array.from({ length: slotCount }, (_, slotIndex) => {
			const wallSlotIndex = reverse ? slotCount - slotIndex - 1 : slotIndex;
			return createWallSlot(room, side, wallSlotIndex, slotCount);
		});
	});
}

function createWallSlot(room, side, slotIndex, slotCount) {
	const localPosition = getLocalSlotPosition(side, slotIndex, slotCount);
	const position = roomLocalToWorld(room, localPosition);
	position.y = 2.05;
	const normal = getSlotNormal(room, side);
	return {
		position,
		normal,
		tangent: getSlotTangent(room, side),
		rotationY: getRotationForNormal(normal),
	};
}

function getLocalSlotPosition(side, slotIndex, slotCount) {
	if (side === 'back') {
		const spread = roomWidth - 5.2;
		const value = getSlotAxisValue(
			slotIndex,
			slotCount,
			-spread / 2,
			spread / 2
		);
		return new THREE.Vector3(value, 0, roomDepth / 2);
	}
	const value = getSlotAxisValue(
		slotIndex,
		slotCount,
		sideExhibitMinZ,
		sideExhibitMaxZ
	);
	return new THREE.Vector3(
		side === 'left' ? -roomWidth / 2 : roomWidth / 2,
		0,
		value
	);
}

function getSlotAxisValue(slotIndex, slotCount, min, max) {
	return slotCount === 1
		? (min + max) / 2
		: min + ((max - min) * slotIndex) / (slotCount - 1);
}

function roomLocalToWorld(room, localPosition) {
	return room.center
		.clone()
		.add(room.tangent.clone().multiplyScalar(localPosition.x))
		.add(room.normal.clone().multiplyScalar(localPosition.z))
		.setY(localPosition.y);
}

function getSlotNormal(room, side) {
	if (side === 'back') {
		return room.normal.clone().multiplyScalar(-1);
	}
	return side === 'left'
		? room.tangent.clone()
		: room.tangent.clone().multiplyScalar(-1);
}

function getSlotTangent(room, side) {
	return side === 'back' ? room.tangent.clone() : room.normal.clone();
}

function distributeCount(count, buckets) {
	return Array.from({ length: buckets }, (_, index) => {
		const base = Math.floor(count / buckets);
		return base + (index < count % buckets ? 1 : 0);
	});
}

function getEraReleaseGroups() {
	const groups = new Map(eras.map((era) => [era, []]));
	releases.forEach((release, index) => {
		groups.get(release.era)?.push({ release, index });
	});
	return eras.map((era) => ({
		era,
		items: groups.get(era) || [],
	}));
}

function getMuseumBounds() {
	const bounds = {
		minX: Infinity,
		maxX: -Infinity,
		minZ: Infinity,
		maxZ: -Infinity,
	};
	for (const point of getMuseumFootprintPoints()) {
		bounds.minX = Math.min(bounds.minX, point.x);
		bounds.maxX = Math.max(bounds.maxX, point.x);
		bounds.minZ = Math.min(bounds.minZ, point.z);
		bounds.maxZ = Math.max(bounds.maxZ, point.z);
	}
	return bounds;
}

function getMuseumFootprintPoints() {
	const points = hubSides.map((side) =>
		side.normal.clone().multiplyScalar(hubCircumradius)
	);
	for (const room of roomSides) {
		const halfWidth = roomWidth / 2;
		const halfDepth = roomDepth / 2;
		for (const x of [-halfWidth, halfWidth]) {
			for (const z of [-halfDepth, halfDepth]) {
				points.push(roomLocalToWorld(room, new THREE.Vector3(x, 0, z)));
			}
		}
	}
	return points;
}

function createHubSides() {
	// Facing the mural, chronology starts on the visitor's right.
	return [
		createHubSide(0, eras[3]),
		createHubSide(Math.PI / 4, eras[4]),
		createHubSide(Math.PI / 2, eras[5]),
		createHubSide((Math.PI * 3) / 4, eras[6]),
		createHubSide(Math.PI, undefined, 'mural'),
		createHubSide((-Math.PI * 3) / 4, eras[0]),
		createHubSide(-Math.PI / 2, eras[1]),
		createHubSide(-Math.PI / 4, eras[2]),
	];
}

function createHubSide(angle, era, kind = 'room') {
	const normal = getDirectionFromAngle(angle);
	const tangent = getTangentForNormal(normal);
	const midpoint = normal.clone().multiplyScalar(hubApothem);
	const center = normal.clone().multiplyScalar(hubApothem + roomDepth / 2);
	return {
		angle,
		center,
		doorway: midpoint.clone(),
		era,
		kind,
		midpoint,
		normal,
		tangent,
	};
}

function getDirectionFromAngle(angle) {
	return new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
}

function getTangentForNormal(normal) {
	return new THREE.Vector3(normal.z, 0, -normal.x);
}

function getRotationForNormal(normal) {
	return Math.atan2(normal.x, normal.z);
}

function getShellBounds() {
	return {
		minX: museumBounds.minX - shellPadding,
		maxX: museumBounds.maxX + shellPadding,
		minZ: museumBounds.minZ - shellPadding,
		maxZ: museumBounds.maxZ + shellPadding,
	};
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
	ctx.fillText(release.artifact, 70, 672);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createEraTexture(text, color, yearRange) {
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
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '800 30px system-ui, sans-serif';
	ctx.globalAlpha = 0.72;
	ctx.fillText(yearRange, canvas.width / 2, 42);
	ctx.globalAlpha = 1;
	fillFittedCanvasText(
		ctx,
		text.toUpperCase(),
		canvas.width / 2,
		107,
		900,
		58,
		'900',
		'Arial Black, Impact, sans-serif'
	);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function fillFittedCanvasText(
	ctx,
	text,
	x,
	y,
	maxWidth,
	maxFontSize,
	fontWeight,
	fontFamily
) {
	let fontSize = maxFontSize;
	do {
		ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
		fontSize -= 2;
	} while (ctx.measureText(text).width > maxWidth && fontSize > 34);
	ctx.fillText(text, x, y);
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
		.querySelector('#center-button')
		.addEventListener('click', () => returnToMuseumCenter());
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

function returnToMuseumCenter() {
	stopGuidedTour();
	keys.clear();
	for (const direction of Object.keys(mobileMotion)) {
		mobileMotion[direction] = false;
	}

	const view = getViewAngles(
		atriumCenterPosition,
		getRoomLookPoint(releases[activeIndex].era)
	);
	guidedTarget = {
		position: atriumCenterPosition.clone(),
		yaw: view.yaw,
		pitch: 0,
	};
}

function buildRail() {
	const rail = document.querySelector('#release-rail-track');
	bindRailScroll(rail);
	updateRail(false);
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
		if (programmaticRailScroll) {
			scheduleProgrammaticRailScrollEnd();
			return;
		}
		if (railScrollFrame) {
			return;
		}
		railScrollFrame = requestAnimationFrame(() => {
			railScrollFrame = 0;
			focusNearestRailItem();
		});
	});
}

function focusNearestRailItem() {
	const item = railItems[getNearestRailItemIndex()];
	if (!item || isRailItemActive(item)) {
		return;
	}
	stopGuidedTour();
	focusRailItem(item, { syncRail: false });
}

function focusRailItem(item, options = {}) {
	if (item.kind === 'room') {
		focusRoom(item.era, options);
		return;
	}
	focusRelease(item.index, false, options);
}

function focusRoom(era, options = {}) {
	const index = getEraReleaseItems(era)[0]?.index;
	if (index === undefined) {
		return;
	}
	focusRelease(index, false, options);
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

function getNearestRailItemIndex() {
	const rail = document.querySelector('#release-rail-track');
	const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
	if (maxScrollLeft <= 0) {
		const activeItemIndex = getActiveRailItemIndex();
		return activeItemIndex >= 0 ? activeItemIndex : 0;
	}
	return Math.round(
		THREE.MathUtils.clamp(rail.scrollLeft / maxScrollLeft, 0, 1) *
			(railItems.length - 1)
	);
}

function getActiveRailItemIndex() {
	return railItems.findIndex(isRailItemActive);
}

function animate(timestamp = 0) {
	requestAnimationFrame(animate);
	if (lastFrameTime && timestamp - lastFrameTime < getFrameInterval()) {
		return;
	}
	lastFrameTime = timestamp;

	const delta = Math.min(clock.getDelta(), 0.05);
	updateCamera(delta);
	spinArtifacts(delta);
	renderer.render(scene, camera);
}

function getFrameInterval() {
	return guidedTarget || guidedTour || dragging || hasActiveMovementInput()
		? activeFrameInterval
		: idleFrameInterval;
}

function hasActiveMovementInput() {
	for (const code of keys) {
		if (isMovementKey(code)) {
			return true;
		}
	}
	return (
		mobileMotion.forward ||
		mobileMotion.back ||
		mobileMotion.left ||
		mobileMotion.right
	);
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
			updateNearestRelease();
			updateRail();
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
		turnCamera(-300 * delta, 0);
	}
	if (keys.has('ArrowRight')) {
		turnCamera(300 * delta, 0);
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
			keys.has('ShiftLeft') || keys.has('ShiftRight')
				? sprintSpeed
				: walkSpeed;
		const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
		const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
		const movement = fwd
			.multiplyScalar(forward * speed * delta)
			.add(right.multiplyScalar(side * speed * delta));
		moveCamera(movement);
		updateNearestRelease();
	}
}

function moveCamera(movement) {
	const steps = Math.max(1, Math.ceil(movement.length() / maxMovementStep));
	const step = movement.clone().divideScalar(steps);
	for (let index = 0; index < steps; index++) {
		moveCameraStep(step);
	}
}

function moveCameraStep(movement) {
	const start = camera.position.clone();
	const direct = getBoundedCameraPoint(start.clone().add(movement));
	if (canStandAt(direct)) {
		camera.position.copy(direct);
		return;
	}

	const xOnly = getBoundedCameraPoint(start.clone().setX(start.x + movement.x));
	if (canStandAt(xOnly)) {
		camera.position.copy(xOnly);
	}

	const zOnly = getBoundedCameraPoint(
		camera.position.clone().setZ(camera.position.z + movement.z)
	);
	if (canStandAt(zOnly)) {
		camera.position.copy(zOnly);
	}
}

function getBoundedCameraPoint(position) {
	position.x = THREE.MathUtils.clamp(
		position.x,
		cameraBounds.minX,
		cameraBounds.maxX
	);
	position.y = 1.65;
	position.z = THREE.MathUtils.clamp(
		position.z,
		cameraBounds.minZ,
		cameraBounds.maxZ
	);
	return position;
}

function canStandAt(position) {
	return isPointInsideClosedMuseum(position);
}

function stopGuidedTour() {
	guidedTour = false;
	document.querySelector('#tour-button').textContent = 'Guided tour';
}

function spinArtifacts(delta) {
	spinningArtifacts.forEach((artifact) => {
		artifact.rotation.y += artifact.userData.spin * delta;
	});
}

function startAtMuseumCenter() {
	activeIndex = 0;
	camera.position.copy(atriumStartPosition);

	const view = getViewAngles(
		atriumStartPosition,
		getMuralLookPoint()
	);
	yaw = view.yaw;
	pitch = 0;
	setCameraRotation();
	guidedTarget = null;

	updatePanel(releases[activeIndex]);
	updateRail();
	updateActiveExhibitMarker();
}

function getMuralLookPoint() {
	return new THREE.Vector3(
		muralSide.midpoint.x,
		atriumCenterPosition.y,
		muralSide.midpoint.z
	);
}

function getRoomLookPoint(era) {
	const { doorway } = roomLayout.get(era);
	return new THREE.Vector3(doorway.x, atriumCenterPosition.y, doorway.z);
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
	updateActiveExhibitMarker();
}

function updatePanel(release) {
	document.querySelector('#release-era').textContent = release.era;
	document.querySelector('#release-title').textContent =
		`WordPress ${release.version} ${release.name}`;
	document.querySelector('#release-date').textContent = release.released;
	document.querySelector('#release-known-for').textContent = release.knownFor;
	document.querySelector('#release-detail').textContent = release.detail;
	document.querySelector('#release-counter').textContent =
		`WP ${release.version}`;

	const blueprintUrl = new URL(release.blueprint, window.location.href);
	const playgroundUrl = new URL('https://playground.wordpress.net/');
	playgroundUrl.searchParams.set('blueprint-url', blueprintUrl.href);
	document.querySelector('#open-playground').href = playgroundUrl.href;
	document.querySelector('#open-blueprint').href = blueprintUrl.href;
}

function updateRail(syncRail = true) {
	renderRailForCurrentContext();
	railButtons.forEach((button, index) => {
		button.classList.toggle('is-active', isRailItemActive(railItems[index]));
	});
	if (!syncRail) {
		return;
	}
	scrollActiveRailButton();
}

function renderRailForCurrentContext() {
	const context = getRailContext();
	if (context.mode === railMode && context.era === railEra) {
		return;
	}

	railMode = context.mode;
	railEra = context.era;
	railItems =
		context.mode === 'releases'
			? getReleaseRailItems(context.era)
			: getRoomRailItems();
	railButtons = railItems.map(createRailButton);
	document.querySelector('#release-rail-track').replaceChildren(...railButtons);
}

function getRailContext() {
	const roomEra = getCameraNavigationEra();
	return roomEra
		? {
				mode: 'releases',
				era: roomEra,
			}
		: {
				mode: 'rooms',
				era: '',
			};
}

function getCameraNavigationEra() {
	const cameraPoint = camera.position.clone();
	cameraPoint.y = 1.65;
	return getCameraRoomEra(cameraPoint);
}

function getReleaseRailItems(era) {
	return getEraReleaseItems(era).map(({ release, index }) => ({
		kind: 'release',
		era,
		index,
		label: release.version,
		release,
	}));
}

function getRoomRailItems() {
	return getEraReleaseGroups().map(({ era, items }) => ({
		kind: 'room',
		era,
		label: era,
		title: `${era}: ${getReleaseYearRange(items)}`,
	}));
}

function getEraReleaseItems(era) {
	return releases
		.map((release, index) => ({ release, index }))
		.filter(({ release }) => release.era === era);
}

function createRailButton(item) {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = item.label;
	button.classList.add(`is-${item.kind}`);
	button.title =
		item.kind === 'room'
			? item.title
			: `${item.release.version} ${item.release.name}: ${item.release.knownFor}`;
	button.style.setProperty('--release-color', eraColors.get(item.era));
	button.addEventListener('click', () => focusRailItem(item));
	return button;
}

function isRailItemActive(item) {
	if (!item) {
		return false;
	}
	return item.kind === 'room'
		? item.era === releases[activeIndex].era
		: item.index === activeIndex;
}

function scrollActiveRailButton() {
	programmaticRailScroll = true;
	scheduleProgrammaticRailScrollEnd();
	railButtons[getActiveRailItemIndex()]?.scrollIntoView({
		behavior: 'smooth',
		inline: 'center',
		block: 'nearest',
	});
}

function scheduleProgrammaticRailScrollEnd() {
	window.clearTimeout(programmaticRailScrollTimer);
	programmaticRailScrollTimer = window.setTimeout(() => {
		programmaticRailScroll = false;
	}, 900);
}

function updateActiveExhibitMarker() {
	const marker = activeExhibitMarker;
	const position = exhibitPositions[activeIndex];
	if (!marker || !position) {
		return;
	}
	const wallGlow = marker.getObjectByName('activeWallGlow');
	const floorRing = marker.getObjectByName('activeFloorRing');
	wallGlow.position
		.copy(position.card)
		.add(position.normal.clone().multiplyScalar(0.5));
	wallGlow.rotation.y = position.rotationY;
	wallGlow.material.color.set(position.color);

	floorRing.position.set(position.stand.x, 0.08, position.stand.z);
	floorRing.material.color.set(position.color);
}

function updateNearestRelease() {
	let nearest = activeIndex;
	let nearestDistance = Infinity;
	const cameraPoint = camera.position.clone();
	cameraPoint.y = 1.65;
	const activeRoomEra = getCameraRoomEra(cameraPoint);
	if (!activeRoomEra) {
		updateRail();
		return;
	}
	exhibitPositions.forEach((position, index) => {
		if (position.era !== activeRoomEra) {
			return;
		}
		const distance = cameraPoint.distanceTo(position.stand);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearest = index;
		}
	});
	if (
		releases[activeIndex].era !== activeRoomEra ||
		(nearest !== activeIndex && nearestDistance < 5.2)
	) {
		activeIndex = nearest;
		updatePanel(releases[activeIndex]);
		updateActiveExhibitMarker();
	}
	updateRail();
}

function getCameraRoomEra(position) {
	return movementZones.find(
		(room) =>
			isPointInsideRoom(position, room) ||
			isPointInsideDoorway(position, room)
	)?.era;
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

function isPointInsideClosedMuseum(position) {
	return (
		isPointInsideHub(position) ||
		movementZones.some(
			(room) =>
				isPointInsideRoom(position, room) ||
				isPointInsideDoorway(position, room)
		)
	);
}

function isPointInsideHub(position) {
	const wallPadding = 0.64;
	return hubSides.every(
		(side) => getPlanarDot(position, side.normal) <= hubApothem - wallPadding
	);
}

function isPointInsideRoom(position, room) {
	const local = getRoomLocalPoint(position, room);
	const wallPadding = 0.62;
	return (
		Math.abs(local.x) <= roomWidth / 2 - wallPadding &&
		Math.abs(local.z) <= roomDepth / 2 - wallPadding
	);
}

function isPointInsideDoorway(position, room) {
	const local = getRoomLocalPoint(position, room);
	const doorDepth = 1.4;
	return (
		Math.abs(local.x) <= roomDoorHalfWidth &&
		local.z >= -roomDepth / 2 - doorDepth &&
		local.z <= -roomDepth / 2 + doorDepth
	);
}

function getRoomLocalPoint(position, room) {
	const relative = position.clone().sub(room.center);
	return {
		x: getPlanarDot(relative, room.tangent),
		z: getPlanarDot(relative, room.normal),
	};
}

function getPlanarDot(left, right) {
	return left.x * right.x + left.z * right.z;
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
