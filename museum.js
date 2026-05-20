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
const wallHeight = 4.45;
const wallThickness = 0.26;
const shellPadding = 7;
const shellHeight = 5.4;
const roomLayout = new Map([
	['Early Blog Engine', new THREE.Vector3(-18, 0, -13)],
	['Dashboard Matures', new THREE.Vector3(0, 0, -18)],
	['CMS Expansion', new THREE.Vector3(18, 0, -13)],
	['Modern Admin', new THREE.Vector3(-20, 0, 4)],
	['Customizer and API', new THREE.Vector3(20, 0, 4)],
	['Block Foundations', new THREE.Vector3(-10, 0, 19)],
	['Block Site Editing', new THREE.Vector3(10, 0, 19)],
]);
const atriumStartPosition = new THREE.Vector3(0, 1.65, 0);
const museumBounds = getMuseumBounds();
const cameraBounds = {
	minX: museumBounds.minX - 1.5,
	maxX: museumBounds.maxX + 1.5,
	minZ: museumBounds.minZ - 1.5,
	maxZ: museumBounds.maxZ + 1.5,
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
camera.position.copy(atriumStartPosition);
setCameraRotation();

initRenderer();
buildScene();
buildRail();
bindControls();
startAtMuseumCenter();
animate();

function initRenderer() {
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
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
		const center = roomLayout.get(era);
		const color = eraColors.get(era);
		const room = {
			era,
			center,
			color,
			openSide: getRoomOpenSide(center),
		};
		root.add(createRoom(room, items.length));
		createExhibitSlots(room, items.length).forEach((slot, slotIndex) => {
			const { release, index } = items[slotIndex];
			exhibitPositions[index] = {
				card: slot.position.clone(),
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

function createBuildingShell() {
	const group = new THREE.Group();
	const bounds = getShellBounds();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;

	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(width, depth),
		new THREE.MeshStandardMaterial({
			color: 0x24304a,
			roughness: 0.76,
			metalness: 0.04,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(centerX, -0.015, centerZ);
	group.add(floor);

	group.add(createFloorGrid(bounds));
	group.add(createShellWall(centerX, bounds.minZ, width, true));
	group.add(createShellWall(centerX, bounds.maxZ, width, true));
	group.add(createShellWall(bounds.minX, centerZ, depth, false));
	group.add(createShellWall(bounds.maxX, centerZ, depth, false));
	group.add(createCeiling(bounds));
	group.add(createShellColumns(bounds));
	return group;
}

function createFloorGrid(bounds) {
	const group = new THREE.Group();
	const material = new THREE.MeshBasicMaterial({
		color: 0x3c4a68,
		transparent: true,
		opacity: 0.52,
	});
	for (let x = Math.ceil(bounds.minX / 4) * 4; x <= bounds.maxX; x += 4) {
		const line = new THREE.Mesh(
			new THREE.BoxGeometry(0.035, 0.02, bounds.maxZ - bounds.minZ),
			material
		);
		line.position.set(x, 0.026, (bounds.minZ + bounds.maxZ) / 2);
		group.add(line);
	}
	for (let z = Math.ceil(bounds.minZ / 4) * 4; z <= bounds.maxZ; z += 4) {
		const line = new THREE.Mesh(
			new THREE.BoxGeometry(bounds.maxX - bounds.minX, 0.02, 0.035),
			material
		);
		line.position.set((bounds.minX + bounds.maxX) / 2, 0.027, z);
		group.add(line);
	}
	return group;
}

function createShellWall(xOrCenter, zOrCenter, length, isHorizontal) {
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			isHorizontal ? length : wallThickness * 1.6,
			shellHeight,
			isHorizontal ? wallThickness * 1.6 : length
		),
		new THREE.MeshStandardMaterial({
			color: 0x33405d,
			roughness: 0.84,
			metalness: 0.03,
		})
	);
	wall.position.set(xOrCenter, shellHeight / 2, zOrCenter);
	return wall;
}

function createCeiling(bounds) {
	const group = new THREE.Group();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const panel = new THREE.Mesh(
		new THREE.PlaneGeometry(width, depth),
		new THREE.MeshBasicMaterial({
			color: 0x202943,
			transparent: true,
			opacity: 0.74,
			side: THREE.DoubleSide,
		})
	);
	panel.rotation.x = Math.PI / 2;
	panel.position.set(centerX, shellHeight, centerZ);
	group.add(panel);

	const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x4f6181 });
	for (let z = Math.ceil(bounds.minZ / 8) * 8; z <= bounds.maxZ; z += 8) {
		const beam = new THREE.Mesh(
			new THREE.BoxGeometry(width, 0.16, 0.2),
			beamMaterial
		);
		beam.position.set(centerX, shellHeight - 0.18, z);
		group.add(beam);
	}
	for (let x = Math.ceil(bounds.minX / 10) * 10; x <= bounds.maxX; x += 10) {
		const beam = new THREE.Mesh(
			new THREE.BoxGeometry(0.2, 0.14, depth),
			beamMaterial
		);
		beam.position.set(x, shellHeight - 0.22, centerZ);
		group.add(beam);
	}
	return group;
}

function createShellColumns(bounds) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({
		color: 0x51617f,
		roughness: 0.68,
		metalness: 0.08,
	});
	const points = [
		[bounds.minX + 1.5, bounds.minZ + 1.5],
		[bounds.maxX - 1.5, bounds.minZ + 1.5],
		[bounds.minX + 1.5, bounds.maxZ - 1.5],
		[bounds.maxX - 1.5, bounds.maxZ - 1.5],
		[-8, -8],
		[8, -8],
		[-8, 8],
		[8, 8],
	];
	for (const [x, z] of points) {
		const column = new THREE.Mesh(
			new THREE.BoxGeometry(0.42, shellHeight, 0.42),
			material
		);
		column.position.set(x, shellHeight / 2, z);
		group.add(column);
	}
	return group;
}

function createAtrium() {
	const group = new THREE.Group();
	const floor = new THREE.Mesh(
		new THREE.CircleGeometry(10.5, 64),
		new THREE.MeshStandardMaterial({
			color: 0x30405f,
			roughness: 0.78,
			metalness: 0.08,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	group.add(floor);

	const ring = new THREE.Mesh(
		new THREE.RingGeometry(10.5, 11.05, 64),
		new THREE.MeshBasicMaterial({
			color: 0xffd166,
			transparent: true,
			opacity: 0.84,
		})
	);
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.025;
	group.add(ring);

	for (const center of roomLayout.values()) {
		group.add(createMuseumPath(center));
	}
	group.add(createAtriumSign());
	return group;
}

function createMuseumPath(center) {
	const length = Math.max(0, Math.hypot(center.x, center.z) - 5.2);
	const path = new THREE.Mesh(
		new THREE.BoxGeometry(1.35, 0.035, length),
		new THREE.MeshBasicMaterial({
			color: 0x586884,
			transparent: true,
			opacity: 0.86,
		})
	);
	const direction = new THREE.Vector3(center.x, 0, center.z).normalize();
	path.position.set(
		direction.x * (5.2 + length / 2),
		0.035,
		direction.z * (5.2 + length / 2)
	);
	path.rotation.y = Math.atan2(direction.x, direction.z);
	return path;
}

function createAtriumSign() {
	const sign = new THREE.Mesh(
		new THREE.PlaneGeometry(5.1, 1.05),
		new THREE.MeshBasicMaterial({
			map: createEraTexture('WordPress Museum', '#ffd166'),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	sign.position.set(0, 3.2, 0);
	return sign;
}

function createRoom(room, releaseCount) {
	const group = new THREE.Group();

	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth, roomDepth),
		new THREE.MeshStandardMaterial({
			color: 0x283654,
			roughness: 0.82,
			metalness: 0.08,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(room.center.x, 0.01, room.center.z);
	group.add(floor);

	for (const side of ['north', 'east', 'south', 'west']) {
		if (side !== room.openSide) {
			group.add(createRoomWall(room.center, side));
		}
		group.add(createFloorTrim(room.center, side, room.color));
	}

	group.add(createDoorFrame(room));
	group.add(createRoomLight(room.center, room.color));
	group.add(createRoomLabel(room, releaseCount));
	return group;
}

function createRoomWall(center, side) {
	const isHorizontal = side === 'north' || side === 'south';
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(
			isHorizontal ? roomWidth : wallThickness,
			wallHeight,
			isHorizontal ? wallThickness : roomDepth
		),
		new THREE.MeshStandardMaterial({
			color: 0x36435e,
			roughness: 0.9,
			metalness: 0.04,
		})
	);
	wall.position.set(
		center.x + getSideOffset(side).x,
		wallHeight / 2,
		center.z + getSideOffset(side).z
	);
	return wall;
}

function createFloorTrim(center, side, color) {
	const isHorizontal = side === 'north' || side === 'south';
	const trim = new THREE.Mesh(
		new THREE.BoxGeometry(
			isHorizontal ? roomWidth : 0.08,
			0.04,
			isHorizontal ? 0.08 : roomDepth
		),
		new THREE.MeshBasicMaterial({ color })
	);
	trim.position.set(
		center.x + getSideOffset(side).x,
		0.05,
		center.z + getSideOffset(side).z
	);
	return trim;
}

function createDoorFrame(room) {
	const group = new THREE.Group();
	const outward = getOutwardNormal(room.openSide);
	const edge = getSideOffset(room.openSide);
	const isHorizontal = room.openSide === 'north' || room.openSide === 'south';
	const pillarGeometry = isHorizontal
		? new THREE.BoxGeometry(0.25, wallHeight, 0.3)
		: new THREE.BoxGeometry(0.3, wallHeight, 0.25);
	const beamGeometry = isHorizontal
		? new THREE.BoxGeometry(5.2, 0.25, 0.3)
		: new THREE.BoxGeometry(0.3, 0.25, 5.2);
	const material = new THREE.MeshBasicMaterial({ color: room.color });
	const first = new THREE.Mesh(pillarGeometry, material);
	const second = first.clone();
	const beam = new THREE.Mesh(beamGeometry, material);
	const gap = 2.9;
	if (isHorizontal) {
		first.position.set(
			room.center.x - gap,
			wallHeight / 2,
			room.center.z + edge.z
		);
		second.position.set(
			room.center.x + gap,
			wallHeight / 2,
			room.center.z + edge.z
		);
		beam.position.set(room.center.x, 3.55, room.center.z + edge.z);
	} else {
		first.position.set(
			room.center.x + edge.x,
			wallHeight / 2,
			room.center.z - gap
		);
		second.position.set(
			room.center.x + edge.x,
			wallHeight / 2,
			room.center.z + gap
		);
		beam.position.set(room.center.x + edge.x, 3.55, room.center.z);
	}
	group.add(first, second, beam);

	const sign = new THREE.Mesh(
		new THREE.PlaneGeometry(5.6, 0.7),
		new THREE.MeshBasicMaterial({
			map: createEraTexture(room.era, room.color),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	sign.position
		.copy(room.center)
		.add(edge)
		.add(outward.clone().multiplyScalar(0.08));
	sign.position.y = 3.05;
	sign.rotation.y = getRotationForNormal(outward);
	group.add(sign);
	return group;
}

function createRoomLight(center, color) {
	const group = new THREE.Group();
	const light = new THREE.PointLight(new THREE.Color(color), 1.6, 18);
	light.position.set(center.x, 3.35, center.z);
	group.add(light);

	const fixture = new THREE.Mesh(
		new THREE.BoxGeometry(3.4, 0.08, 0.32),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.9,
		})
	);
	fixture.position.set(center.x, 4.48, center.z);
	group.add(fixture);
	return group;
}

function createRoomLabel(room, releaseCount) {
	const label = new THREE.Mesh(
		new THREE.PlaneGeometry(3.6, 0.62),
		new THREE.MeshBasicMaterial({
			map: createSmallLabelTexture(`${releaseCount} exhibits`),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	label.position.set(room.center.x, 0.95, room.center.z);
	label.rotation.x = -0.2;
	label.rotation.y = getRotationForNormal(getOutwardNormal(room.openSide));
	return label;
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
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(3.38, 2.48, 0.16),
		new THREE.MeshStandardMaterial({
			color: new THREE.Color(color),
			roughness: 0.36,
			metalness: 0.28,
		})
	);
	frame.position
		.copy(slot.position)
		.add(slot.normal.clone().multiplyScalar(0.24));
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
		.add(slot.normal.clone().multiplyScalar(0.36));
	plaque.rotation.y = slot.rotationY;
	plaque.renderOrder = 2;
	plaque.userData.releaseIndex = index;
	group.add(plaque);
	pickables.push(plaque);

	const glow = new THREE.PointLight(new THREE.Color(color), 0.8, 8);
	glow.position
		.copy(slot.position)
		.add(slot.normal.clone().multiplyScalar(1.2));
	glow.position.y = 2.8;
	group.add(glow);
	return group;
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

	const label = new THREE.Mesh(
		new THREE.PlaneGeometry(1.08, 0.34),
		new THREE.MeshBasicMaterial({
			map: createSmallLabelTexture(release.version),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	label.position.set(base.x, 1.62, base.z);
	label.rotation.y = slot.rotationY;
	group.add(label);
	return group;
}

function createExhibitSlots(room, releaseCount) {
	const walls = ['north', 'east', 'south', 'west'].filter(
		(side) => side !== room.openSide
	);
	const wallCounts = distributeCount(releaseCount, walls.length);
	return walls.flatMap((side, wallIndex) =>
		Array.from({ length: wallCounts[wallIndex] }, (_, slotIndex) =>
			createWallSlot(room.center, side, slotIndex, wallCounts[wallIndex])
		)
	);
}

function createWallSlot(center, side, slotIndex, slotCount) {
	const normal = getWallNormal(side);
	const offset = getSlotOffset(side, slotIndex, slotCount);
	const position = center.clone().add(getSideOffset(side)).add(offset);
	position.y = 2.05;
	return {
		position,
		normal,
		tangent:
			side === 'north' || side === 'south'
				? new THREE.Vector3(1, 0, 0)
				: new THREE.Vector3(0, 0, 1),
		rotationY: getRotationForNormal(normal),
	};
}

function getSlotOffset(side, slotIndex, slotCount) {
	const spread =
		side === 'north' || side === 'south' ? roomWidth - 5.2 : roomDepth - 5;
	const value =
		slotCount === 1
			? 0
			: -spread / 2 + (spread * slotIndex) / (slotCount - 1);
	return side === 'north' || side === 'south'
		? new THREE.Vector3(value, 0, 0)
		: new THREE.Vector3(0, 0, value);
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

function getRoomOpenSide(center) {
	if (Math.abs(center.x) > Math.abs(center.z)) {
		return center.x < 0 ? 'east' : 'west';
	}
	return center.z < 0 ? 'south' : 'north';
}

function getSideOffset(side) {
	return {
		north: new THREE.Vector3(0, 0, -roomDepth / 2),
		east: new THREE.Vector3(roomWidth / 2, 0, 0),
		south: new THREE.Vector3(0, 0, roomDepth / 2),
		west: new THREE.Vector3(-roomWidth / 2, 0, 0),
	}[side];
}

function getWallNormal(side) {
	return {
		north: new THREE.Vector3(0, 0, 1),
		east: new THREE.Vector3(-1, 0, 0),
		south: new THREE.Vector3(0, 0, -1),
		west: new THREE.Vector3(1, 0, 0),
	}[side];
}

function getOutwardNormal(side) {
	return getWallNormal(side).multiplyScalar(-1);
}

function getRotationForNormal(normal) {
	return Math.atan2(normal.x, normal.z);
}

function getMuseumBounds() {
	const bounds = {
		minX: Infinity,
		maxX: -Infinity,
		minZ: Infinity,
		maxZ: -Infinity,
	};
	for (const center of roomLayout.values()) {
		bounds.minX = Math.min(bounds.minX, center.x - roomWidth / 2);
		bounds.maxX = Math.max(bounds.maxX, center.x + roomWidth / 2);
		bounds.minZ = Math.min(bounds.minZ, center.z - roomDepth / 2);
		bounds.maxZ = Math.max(bounds.maxZ, center.z + roomDepth / 2);
	}
	return bounds;
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
		button.style.setProperty('--release-color', eraColors.get(release.era));
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

function startAtMuseumCenter() {
	activeIndex = 0;
	camera.position.copy(atriumStartPosition);

	const view = getViewAngles(
		atriumStartPosition,
		getRoomLookPoint(releases[activeIndex].era)
	);
	yaw = view.yaw;
	pitch = 0;
	setCameraRotation();
	guidedTarget = null;

	updatePanel(releases[activeIndex]);
	updateRail();
	updateActiveExhibitMarker();
}

function getRoomLookPoint(era) {
	const center = roomLayout.get(era);
	return new THREE.Vector3(center.x, atriumStartPosition.y, center.z);
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
		`${activeIndex + 1} / ${releases.length}`;

	const blueprintUrl = new URL(release.blueprint, window.location.href);
	const playgroundUrl = new URL('https://playground.wordpress.net/');
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
	exhibitPositions.forEach((position, index) => {
		const distance = cameraPoint.distanceTo(position.stand);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearest = index;
		}
	});
	if (nearest !== activeIndex && nearestDistance < 5.2) {
		activeIndex = nearest;
		updatePanel(releases[activeIndex]);
		updateRail();
		updateActiveExhibitMarker();
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
