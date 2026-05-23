import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.min.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.171.0/examples/jsm/loaders/GLTFLoader.js';

const releases = [...window.WP_MUSEUM_RELEASES].sort(compareVersions);
const eras = window.WP_MUSEUM_ERAS;
const activeVariant = getActiveVariant();
const isCurrentVariant = activeVariant.isCurrent;
const shouldDecorateScene = !isCurrentVariant || activeVariant.decor === true;
const eraColors = new Map(
	eras.map((era, index) => [
		era,
		activeVariant.eraColors[index % activeVariant.eraColors.length],
	])
);

const canvas = document.querySelector('#museum-canvas');
const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true,
	powerPreference: 'low-power',
});
const textureCanvases = new Map();
const museumTextures = new Map();
const plaqueImageCache = new Map();
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
const modelDefinitions = {
	benchCushion: './assets/models/kenney/furniture/benchCushion.glb',
	bookcaseOpenLow: './assets/models/kenney/furniture/bookcaseOpenLow.glb',
	computerScreen: './assets/models/kenney/furniture/computerScreen.glb',
	laptop: './assets/models/kenney/furniture/laptop.glb',
	loungeDesignChair: './assets/models/kenney/furniture/loungeDesignChair.glb',
	loungeDesignSofa: './assets/models/kenney/furniture/loungeDesignSofa.glb',
	plantSmall2: './assets/models/kenney/furniture/plantSmall2.glb',
	pottedPlant: './assets/models/kenney/furniture/pottedPlant.glb',
	radio: './assets/models/kenney/furniture/radio.glb',
	speakerSmall: './assets/models/kenney/furniture/speakerSmall.glb',
	tableCoffee: './assets/models/kenney/furniture/tableCoffee.glb',
	televisionVintage: './assets/models/kenney/furniture/televisionVintage.glb',
	detailAwningWide: './assets/models/kenney/retro-urban/detail-awning-wide.glb',
	detailBench: './assets/models/kenney/retro-urban/detail-bench.glb',
	detailLightSingle: './assets/models/kenney/retro-urban/detail-light-single.glb',
	detailLightTraffic: './assets/models/kenney/retro-urban/detail-light-traffic.glb',
	pallet: './assets/models/kenney/retro-urban/pallet.glb',
	scaffoldingStructure: './assets/models/kenney/retro-urban/scaffolding-structure.glb',
	treeParkLarge: './assets/models/kenney/retro-urban/tree-park-large.glb',
	treeSmall: './assets/models/kenney/retro-urban/tree-small.glb',
	truckGreen: './assets/models/kenney/retro-urban/truck-green.glb',
	borderHigh: './assets/models/kenney/building/border-high.glb',
	columnThin: './assets/models/kenney/building/column-thin.glb',
	doorRotateRoundA: './assets/models/kenney/building/door-rotate-round-a.glb',
	doorRotateSquareA: './assets/models/kenney/building/door-rotate-square-a.glb',
	platingDetailed: './assets/models/kenney/building/plating-detailed.glb',
	stairsOpenShort: './assets/models/kenney/building/stairs-open-short.glb',
	wallDoorwayRound: './assets/models/kenney/building/wall-doorway-round.glb',
};
const museumTextureSources = {
	...(isCurrentVariant
		? {
				atriumFloor: './assets/textures/floor-paving-stones.jpg',
				ceiling: './assets/textures/ceiling-tiles.jpg',
				roomFloor: './assets/textures/floor-paving-stones.jpg',
				roomWall: './assets/textures/wall-marble.jpg',
				shellWall: './assets/textures/wall-marble.jpg',
			}
		: {}),
};
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 420);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickables = [];
const exhibitPositions = [];
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

const hubApothem = 15.5;
const hubCircumradius = hubApothem / Math.cos(Math.PI / 8);
const hubSideLength = 2 * hubApothem * Math.tan(Math.PI / 8);
const roomWidth = hubSideLength;
const roomDepth = 13;
const wallHeight = 5.2;
const wallThickness = 0.26;
const roomDoorHalfWidth = 2.9;
const exhibitMountOffset = wallThickness / 2 + 0.035;
const exhibitFrameDepth = 0.13;
const exhibitPlaqueRecess = 0.065;
const exhibitOuterWidth = 3.38;
const exhibitOuterHeight = 2.48;
const exhibitPlaqueWidth = 3.02;
const exhibitPlaqueHeight = 2.16;
const exhibitWallMargin = 0.75;
const exhibitPreferredSpacing = exhibitOuterWidth + 0.65;
const sideExhibitMinZ = -roomDepth / 2 + exhibitOuterWidth / 2 + 1.65;
const sideExhibitMaxZ = roomDepth / 2 - exhibitOuterWidth / 2 - exhibitWallMargin;
const entryDistanceFromCenter = 5.2;
const shellPadding = 1.4;
const shellHeight = 5.45;
const walkSpeed = 7.2;
const arrowWalkSpeed = 9.2;
const mobileWalkSpeed = 8.8;
const sprintSpeed = 12;
const keyboardTurnSpeed = 520;
const mobileTurnSpeed = 320;
const maxMovementStep = 0.16;
const activeFrameInterval = 1000 / 60;
const idleFrameInterval = 1000 / 15;
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
let renderedFrameCount = 0;

camera.rotation.order = 'YXZ';
camera.position.copy(atriumStartPosition);
setCameraRotation();

initRenderer();
buildScene();
buildRail();
bindControls();
startAtMuseumCenter();
initDebugApi();
animate();

function initRenderer() {
	applyVariantUi();
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	scene.background = new THREE.Color(activeVariant.scene.background);
	scene.fog = new THREE.Fog(activeVariant.scene.fog, 42, 95);

	scene.add(
		new THREE.HemisphereLight(
			activeVariant.scene.hemiSky,
			activeVariant.scene.hemiGround,
			activeVariant.scene.hemiIntensity
		)
	);
	scene.add(new THREE.AmbientLight(0xe8edff, isCurrentVariant ? 0.9 : 0.72));
	const keyLight = new THREE.DirectionalLight(0xffe2b0, 2.8);
	keyLight.intensity = activeVariant.scene.keyIntensity;
	keyLight.position.set(2, 8, -6);
	scene.add(keyLight);

	window.addEventListener('resize', resizeRenderer);
	resizeRenderer();
}

function getActiveVariant() {
	const variants = window.WP_MUSEUM_VARIANTS || [];
	const current = variants.find((variant) => variant.slug === 'current') || {
		slug: 'current',
		name: 'Current Museum',
		kicker: 'Plain Three.js prototype',
		isCurrent: true,
		uiStyle: 'glass',
		textureStyle: 'current',
		frameStyle: 'classic',
		props: [],
		scene: {
			background: '#151a2a',
			fog: '#151a2a',
			hemiSky: '#fff7df',
			hemiGround: '#2d3a58',
			hemiIntensity: 3.1,
			keyIntensity: 2.8,
		},
		eraColors: [
			'#ffd166',
			'#ff4f64',
			'#2bb7ff',
			'#50d890',
			'#b37cff',
			'#ff9b54',
			'#78e0dc',
		],
		wall: ['#cbd7e7', '#9fb1c9', '#f3f0dd'],
		floor: ['#2f3f5f', '#1f2b44', '#ffcf6a'],
		ceiling: ['#d5dde8', '#97a8bf', '#ffffff'],
	};
	const slug = new URLSearchParams(window.location.search).get('variant');
	return variants.find((variant) => variant.slug === slug) || current;
}

function applyVariantUi() {
	document.body.dataset.variant = activeVariant.slug;
	document.body.dataset.ui = activeVariant.uiStyle || 'glass';
	document.documentElement.style.setProperty(
		'--accent',
		activeVariant.eraColors[0]
	);
	document.documentElement.style.setProperty(
		'--danger',
		activeVariant.eraColors[1]
	);
	document.documentElement.style.setProperty(
		'--variant-panel',
		getPanelBackground()
	);
	document.querySelector('.kicker').textContent = activeVariant.kicker;
	document.title = isCurrentVariant
		? 'WordPress Museum - Three.js Gallery'
		: `${activeVariant.name} - WordPress Museum`;
}

function getPanelBackground() {
	if (isCurrentVariant) {
		return 'rgba(17, 24, 39, 0.74)';
	}
	return activeVariant.uiStyle === 'paper'
		? 'rgba(245, 232, 199, 0.9)'
		: activeVariant.uiStyle === 'terminal'
			? 'rgba(0, 24, 18, 0.86)'
			: activeVariant.uiStyle === 'brutalist'
				? 'rgba(28, 28, 26, 0.88)'
				: 'rgba(17, 24, 39, 0.72)';
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
	const cacheKey = `${name}:${repeatX}:${repeatY}`;
	if (museumTextures.has(cacheKey)) {
		return museumTextures.get(cacheKey);
	}

	const source = museumTextureSources[name];
	const texture = source
		? textureLoader.load(source)
		: new THREE.CanvasTexture(getTextureCanvas(name));
	configureMuseumTexture(texture, repeatX, repeatY);
	museumTextures.set(cacheKey, texture);
	return texture;
}

function configureMuseumTexture(texture, repeatX, repeatY) {
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeatX, repeatY);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
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
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.floor, 'floor');
		return;
	}
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
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.floor, 'atrium');
		drawAtriumRings(ctx, width, height, activeVariant.eraColors[0]);
		return;
	}
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
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.wall, 'wall');
		return;
	}
	drawPlasterTexture(ctx, width, height, '#b9c7da', '#8fa3bd', '#dce6f2');
	drawWallPanels(ctx, width, height, 128, 96, '#7d91ad');
}

function drawRoomWallTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.wall, 'wall');
		return;
	}
	drawPlasterTexture(ctx, width, height, '#cbd7e7', '#9fb1c9', '#f3f0dd');
	drawWallPanels(ctx, width, height, 96, 128, '#879bb7');
}

function drawCeilingTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.ceiling, 'ceiling');
		return;
	}
	ctx.fillStyle = '#d5dde8';
	ctx.fillRect(0, 0, width, height);
	drawTileGrid(ctx, width, height, 128, '#97a8bf', '#e7edf4');
	drawSpeckles(ctx, width, height, 160, ['#ffffff', '#b6c2d3', '#8393aa']);
}

function drawVariantTexture(ctx, width, height, palette, surface) {
	const [base, lowlight, highlight] = palette;
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, width, height);

	const style = activeVariant.textureStyle;
	if (style === 'pixel') {
		drawPixelTexture(ctx, width, height, base, lowlight, highlight);
	} else if (style === 'memphis') {
		drawMemphisTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'terminal') {
		drawTerminalTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'botanical') {
		drawBotanicalTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'paper') {
		drawPaperTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'space') {
		drawSpaceTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'brutalist') {
		drawBrutalistTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'lab') {
		drawLabTexture(ctx, width, height, lowlight, highlight);
	} else if (style === 'velvet') {
		drawVelvetTexture(ctx, width, height, lowlight, highlight);
	} else {
		drawNoirTexture(ctx, width, height, lowlight, highlight);
	}

	if (surface !== 'wall') {
		drawTileGrid(
			ctx,
			width,
			height,
			surface === 'ceiling' ? 128 : 64,
			lowlight,
			highlight
		);
	}
	drawSpeckles(ctx, width, height, surface === 'wall' ? 240 : 160, [
		lowlight,
		highlight,
		'#fff5df',
	]);
}

function drawAtriumRings(ctx, width, height, color) {
	const center = width / 2;
	ctx.strokeStyle = color;
	ctx.globalAlpha = 0.42;
	ctx.lineWidth = 5;
	for (let radius = 48; radius < 360; radius += 56) {
		ctx.beginPath();
		ctx.arc(center, center, radius, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawPixelTexture(ctx, width, height, base, lowlight, highlight) {
	for (let y = 0; y < height; y += 32) {
		for (let x = 0; x < width; x += 32) {
			ctx.fillStyle = (x / 32 + y / 32) % 3 === 0 ? lowlight : base;
			ctx.globalAlpha = 0.18;
			ctx.fillRect(x, y, 32, 32);
		}
	}
	ctx.globalAlpha = 1;
	ctx.strokeStyle = highlight;
	ctx.lineWidth = 2;
	drawLooseGrid(ctx, width, height, 64);
}

function drawMemphisTexture(ctx, width, height, lowlight, highlight) {
	for (let index = 0; index < 44; index++) {
		const x = pseudoRandom(index * 11) * width;
		const y = pseudoRandom(index * 13) * height;
		ctx.fillStyle = index % 2 ? lowlight : highlight;
		ctx.globalAlpha = 0.18;
		if (index % 3 === 0) {
			ctx.fillRect(x, y, 42, 11);
		} else {
			ctx.beginPath();
			ctx.arc(x, y, 10 + pseudoRandom(index) * 20, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.globalAlpha = 1;
}

function drawTerminalTexture(ctx, width, height, lowlight, highlight) {
	ctx.strokeStyle = highlight;
	ctx.lineWidth = 1;
	ctx.globalAlpha = 0.2;
	for (let y = 0; y < height; y += 14) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	ctx.globalAlpha = 0.22;
	drawLooseGrid(ctx, width, height, 96);
	ctx.globalAlpha = 1;
	ctx.fillStyle = lowlight;
	for (let index = 0; index < 26; index++) {
		ctx.fillRect(
			pseudoRandom(index * 5) * width,
			pseudoRandom(index * 7) * height,
			40 + pseudoRandom(index) * 70,
			4
		);
	}
}

function drawBotanicalTexture(ctx, width, height, lowlight, highlight) {
	ctx.strokeStyle = lowlight;
	ctx.lineWidth = 5;
	ctx.globalAlpha = 0.22;
	for (let index = 0; index < 18; index++) {
		const x = pseudoRandom(index * 17) * width;
		const y = pseudoRandom(index * 19) * height;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.bezierCurveTo(x + 80, y - 30, x + 120, y + 80, x + 190, y + 20);
		ctx.stroke();
		ctx.fillStyle = highlight;
		ctx.beginPath();
		ctx.ellipse(x + 60, y - 12, 18, 8, 0.4, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function drawPaperTexture(ctx, width, height, lowlight, highlight) {
	ctx.globalAlpha = 0.2;
	ctx.strokeStyle = lowlight;
	for (let y = 24; y < height; y += 38) {
		ctx.beginPath();
		ctx.moveTo(0, y + pseudoRandom(y) * 4);
		ctx.lineTo(width, y + pseudoRandom(y + 1) * 4);
		ctx.stroke();
	}
	ctx.globalAlpha = 0.14;
	ctx.fillStyle = highlight;
	for (let index = 0; index < 18; index++) {
		ctx.fillRect(
			pseudoRandom(index * 29) * width,
			pseudoRandom(index * 31) * height,
			100,
			22
		);
	}
	ctx.globalAlpha = 1;
}

function drawSpaceTexture(ctx, width, height, lowlight, highlight) {
	ctx.fillStyle = lowlight;
	ctx.globalAlpha = 0.2;
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = highlight;
	for (let index = 0; index < 90; index++) {
		ctx.globalAlpha = 0.2 + pseudoRandom(index) * 0.5;
		ctx.fillRect(
			pseudoRandom(index * 3) * width,
			pseudoRandom(index * 5) * height,
			2,
			2
		);
	}
	ctx.globalAlpha = 1;
}

function drawBrutalistTexture(ctx, width, height, lowlight, highlight) {
	ctx.globalAlpha = 0.22;
	ctx.strokeStyle = lowlight;
	ctx.lineWidth = 12;
	for (let index = 0; index < 12; index++) {
		ctx.beginPath();
		ctx.moveTo(0, pseudoRandom(index * 8) * height);
		ctx.lineTo(width, pseudoRandom(index * 9) * height);
		ctx.stroke();
	}
	ctx.globalAlpha = 0.12;
	ctx.fillStyle = highlight;
	ctx.fillRect(width * 0.14, 0, width * 0.08, height);
	ctx.fillRect(width * 0.58, 0, width * 0.05, height);
	ctx.globalAlpha = 1;
}

function drawLabTexture(ctx, width, height, lowlight, highlight) {
	ctx.strokeStyle = lowlight;
	ctx.globalAlpha = 0.38;
	ctx.lineWidth = 2;
	drawLooseGrid(ctx, width, height, 72);
	ctx.globalAlpha = 0.18;
	ctx.fillStyle = highlight;
	for (let index = 0; index < 16; index++) {
		ctx.beginPath();
		ctx.arc(
			pseudoRandom(index * 37) * width,
			pseudoRandom(index * 41) * height,
			18 + pseudoRandom(index) * 24,
			0,
			Math.PI * 2
		);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function drawVelvetTexture(ctx, width, height, lowlight, highlight) {
	const gradient = ctx.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, lowlight);
	gradient.addColorStop(0.48, 'rgba(255,255,255,0.08)');
	gradient.addColorStop(1, highlight);
	ctx.globalAlpha = 0.18;
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
	ctx.globalAlpha = 1;
}

function drawNoirTexture(ctx, width, height, lowlight, highlight) {
	ctx.globalAlpha = 0.2;
	ctx.fillStyle = lowlight;
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = highlight;
	for (let index = 0; index < 16; index++) {
		ctx.beginPath();
		ctx.arc(width / 2, height / 2, 44 + index * 28, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawLooseGrid(ctx, width, height, size) {
	for (let x = 0; x <= width; x += size) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	for (let y = 0; y <= height; y += size) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
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
	group.add(createAtriumDecor());
	return group;
}

function createHubFloor() {
	const floor = new THREE.Mesh(
		new THREE.CircleGeometry(hubCircumradius, 8, Math.PI / 8),
		createMuseumMaterial('atriumFloor', {
			repeatX: hubCircumradius / 3,
			repeatY: hubCircumradius / 3,
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
	if (activeVariant.muralStyle === 'ultimate') {
		drawUltimateMural(ctx, canvas);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
		return texture;
	}
	if (!isCurrentVariant) {
		drawVariantMural(ctx, canvas);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
		return texture;
	}
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

function drawUltimateMural(ctx, canvas) {
	const color = activeVariant.eraColors[0];
	const blue = activeVariant.eraColors[2];
	const green = activeVariant.eraColors[3];
	ctx.fillStyle = '#101827';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 28);
	ctx.fillRect(0, canvas.height - 28, canvas.width, 28);

	ctx.globalAlpha = 0.18;
	ctx.strokeStyle = '#fff5df';
	ctx.lineWidth = 5;
	for (let radius = 74; radius < 390; radius += 42) {
		ctx.beginPath();
		ctx.arc(512, 320, radius, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;

	drawMuralTimeline(ctx, canvas, color, blue, green);
	drawMascotOnMural(ctx, 780, 318, 0.92, color, green);

	ctx.fillStyle = '#fff5df';
	ctx.textAlign = 'center';
	fillFittedCanvasText(
		ctx,
		'WORDPRESS MUSEUM',
		430,
		235,
		620,
		96,
		'900',
		'Arial Black, Impact, sans-serif'
	);
	ctx.fillStyle = blue;
	ctx.font = '900 42px system-ui, sans-serif';
	ctx.fillText('2004 -> BLOCKS -> PLAYGROUND', 430, 308);
	ctx.fillStyle = 'rgba(255, 245, 223, 0.78)';
	ctx.font = '800 25px system-ui, sans-serif';
	ctx.fillText('Permalinks, plugins, REST, blocks, and one tiny Hello Dolly record', 430, 358);
	ctx.fillStyle = color;
	ctx.font = '900 21px ui-monospace, SFMono-Regular, Menlo, monospace';
	ctx.fillText('mind the $wpdb gap / the loop loops forever', 430, 408);
}

function drawMuralTimeline(ctx, canvas, color, blue, green) {
	const y = 506;
	const stops = [
		['1.0', color],
		['2.x', activeVariant.eraColors[1]],
		['3.0', blue],
		['4.x', green],
		['5.0', activeVariant.eraColors[4]],
		['6.x', activeVariant.eraColors[5]],
	];
	ctx.strokeStyle = 'rgba(255, 245, 223, 0.46)';
	ctx.lineWidth = 9;
	ctx.beginPath();
	ctx.moveTo(130, y);
	ctx.lineTo(876, y);
	ctx.stroke();
	stops.forEach(([label, stopColor], index) => {
		const x = 150 + index * 142;
		ctx.fillStyle = stopColor;
		ctx.beginPath();
		ctx.arc(x, y, 22, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#101827';
		ctx.font = '900 18px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(label, x, y + 6);
	});
}

function drawMascotOnMural(ctx, x, y, scale, color, secondary) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(scale, scale);
	ctx.fillStyle = secondary;
	ctx.beginPath();
	ctx.ellipse(0, 24, 88, 120, -0.08, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(-58, -42, 34, 0, Math.PI * 2);
	ctx.arc(58, -42, 34, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#fff5df';
	ctx.beginPath();
	ctx.ellipse(0, 12, 50, 58, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#101827';
	ctx.beginPath();
	ctx.arc(-20, -6, 6, 0, Math.PI * 2);
	ctx.arc(20, -6, 6, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = '#101827';
	ctx.lineWidth = 5;
	ctx.beginPath();
	ctx.arc(0, 4, 24, 0.2, Math.PI - 0.2);
	ctx.stroke();
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 24px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText('WAPUU', 0, 172);
	ctx.restore();
}

function drawVariantMural(ctx, canvas) {
	const color = activeVariant.eraColors[0];
	const second = activeVariant.eraColors[2];
	ctx.fillStyle = activeVariant.scene.background;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 30);
	ctx.fillRect(0, canvas.height - 30, canvas.width, 30);

	drawMuralMotif(ctx, canvas, color, second);

	ctx.fillStyle = '#fff5df';
	if (activeVariant.uiStyle === 'paper') {
		ctx.fillStyle = '#111827';
	}
	ctx.textAlign = 'center';
	ctx.font = '900 88px Arial Black, Impact, sans-serif';
	fillFittedCanvasText(
		ctx,
		activeVariant.muralTitle || 'WORDPRESS MUSEUM',
		canvas.width / 2,
		250,
		900,
		88,
		'900',
		'Arial Black, Impact, sans-serif'
	);
	ctx.font = '900 78px Arial Black, Impact, sans-serif';
	fillFittedCanvasText(
		ctx,
		activeVariant.name.split(':')[0].toUpperCase(),
		canvas.width / 2,
		352,
		900,
		78,
		'900',
		'Arial Black, Impact, sans-serif'
	);

	ctx.fillStyle = color;
	ctx.font = '800 31px system-ui, sans-serif';
	wrapCenteredText(ctx, activeVariant.muralSubtitle, canvas.width / 2, 438, 760, 38, 2);

	ctx.fillStyle = 'rgba(255, 245, 223, 0.72)';
	if (activeVariant.uiStyle === 'paper') {
		ctx.fillStyle = 'rgba(17, 24, 39, 0.72)';
	}
	ctx.font = '700 23px system-ui, sans-serif';
	ctx.fillText('Variant ' + String(activeVariant.number).padStart(3, '0'), canvas.width / 2, 540);
}

function drawMuralMotif(ctx, canvas, color, second) {
	ctx.strokeStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.lineWidth = 6;
	for (let index = 0; index < 9; index++) {
		ctx.beginPath();
		ctx.arc(512, 320, 76 + index * 48, 0, Math.PI * 2);
		ctx.stroke();
	}
	const motif = activeVariant.muralStyle;
	ctx.globalAlpha = 0.78;
	ctx.fillStyle = second;
	if (motif === 'records') {
		for (let index = 0; index < 10; index++) {
			const x = 110 + (index % 5) * 200;
			const y = index < 5 ? 126 : 486;
			ctx.beginPath();
			ctx.arc(x, y, 54, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = activeVariant.scene.background;
			ctx.beginPath();
			ctx.arc(x, y, 18, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = second;
		}
	} else if (motif === 'pinball') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 18;
		ctx.beginPath();
		ctx.moveTo(180, 520);
		ctx.quadraticCurveTo(512, 80, 844, 520);
		ctx.stroke();
		for (let index = 0; index < 7; index++) {
			ctx.beginPath();
			ctx.arc(220 + index * 96, 180 + (index % 2) * 260, 24, 0, Math.PI * 2);
			ctx.fill();
		}
	} else if (motif === 'bazaar') {
		for (let index = 0; index < 9; index++) {
			const x = 110 + (index % 3) * 290;
			const y = 110 + Math.floor(index / 3) * 155;
			ctx.fillRect(x, y, 160, 80);
			ctx.clearRect(x + 18, y + 18, 124, 44);
		}
	} else if (motif === 'botanical') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 9;
		for (let index = 0; index < 12; index++) {
			const x = 80 + index * 78;
			ctx.beginPath();
			ctx.moveTo(x, 560);
			ctx.bezierCurveTo(x - 30, 420, x + 70, 300, x + 4, 110);
			ctx.stroke();
			ctx.beginPath();
			ctx.ellipse(x + 26, 300, 42, 16, 0.55, 0, Math.PI * 2);
			ctx.fill();
		}
	} else if (motif === 'terminal') {
		ctx.font = '800 28px ui-monospace, SFMono-Regular, Menlo, monospace';
		ctx.textAlign = 'left';
		for (let index = 0; index < 10; index++) {
			ctx.fillText(`wp museum scan --era=${index + 1}`, 120, 110 + index * 48);
		}
		ctx.textAlign = 'center';
	} else if (motif === 'fauxgo') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 14;
		ctx.beginPath();
		ctx.arc(512, 320, 142, 0, Math.PI * 2);
		ctx.stroke();
		ctx.font = '900 158px Georgia, serif';
		ctx.textAlign = 'center';
		ctx.fillText('W', 512, 378);
		ctx.fillRect(202, 476, 620, 18);
	} else if (motif === 'blocks') {
		for (let index = 0; index < 14; index++) {
			ctx.fillRect(120 + (index % 7) * 112, 110 + Math.floor(index / 7) * 360, 62, 62);
		}
	} else if (motif === 'api' || motif === 'portal') {
		ctx.strokeStyle = second;
		ctx.lineWidth = 14;
		for (let index = 0; index < 5; index++) {
			ctx.strokeRect(120 + index * 160, 100 + index * 16, 110, 110);
		}
	} else if (motif === 'comments') {
		for (let index = 0; index < 8; index++) {
			ctx.beginPath();
			ctx.roundRect(90 + index * 110, 105 + (index % 2) * 370, 86, 46, 14);
			ctx.fill();
		}
	} else if (motif === 'train') {
		ctx.fillRect(72, 470, 880, 18);
		for (let index = 0; index < 6; index++) {
			ctx.fillRect(130 + index * 130, 430, 96, 54);
		}
	} else if (motif === 'capsule') {
		ctx.beginPath();
		ctx.roundRect(326, 88, 372, 118, 58);
		ctx.fill();
		ctx.beginPath();
		ctx.roundRect(326, 434, 372, 118, 58);
		ctx.fill();
	} else {
		for (let index = 0; index < 24; index++) {
			ctx.beginPath();
			ctx.arc(
				80 + pseudoRandom(index * 3) * 860,
				80 + pseudoRandom(index * 5) * 480,
				8 + pseudoRandom(index) * 28,
				0,
				Math.PI * 2
			);
			ctx.fill();
		}
	}
	ctx.fillStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.font = '900 30px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(activeVariant.accentWord || 'history with corners', 512, 606);
	ctx.globalAlpha = 1;
}

function wrapCenteredText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
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
	if (shouldDecorateScene) {
		group.add(createRoomMural(room));
	}
	group.add(createFloorTrim('front', room.color));
	group.add(createFloorTrim('back', room.color));
	group.add(createFloorTrim('left', room.color));
	group.add(createFloorTrim('right', room.color));
	group.add(createDoorFrame(room));
	group.add(createRoomLight(room.color));
	group.add(createRoomDecor(room));
	return group;
}

function createRoomMural(room) {
	const mural = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth - 1.65, 0.68),
		new THREE.MeshBasicMaterial({
			map: createRoomMuralTexture(room),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	mural.position.set(0, 4.1, roomDepth / 2 - wallThickness / 2 - 0.055);
	mural.rotation.y = Math.PI;
	return mural;
}

function createRoomMuralTexture(room) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 160;
	const ctx = canvas.getContext('2d');
	const copy = getEraMuralCopy(room.era);
	ctx.fillStyle = 'rgba(12, 19, 32, 0.92)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = room.color;
	ctx.fillRect(0, 0, canvas.width, 12);
	ctx.fillRect(0, canvas.height - 12, canvas.width, 12);
	ctx.globalAlpha = 0.18;
	ctx.fillStyle = '#fff5df';
	for (let index = 0; index < 24; index++) {
		ctx.fillRect(42 + index * 42, 38 + (index % 2) * 72, 18, 18);
	}
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#fff5df';
	ctx.textAlign = 'left';
	ctx.font = '900 24px Arial Black, Impact, sans-serif';
	ctx.fillText(room.yearRange, 42, 45);
	ctx.font = '900 38px Arial Black, Impact, sans-serif';
	fillFittedCanvasText(ctx, room.era.toUpperCase(), 42, 86, 680, 38, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = room.color;
	ctx.font = '900 23px system-ui, sans-serif';
	fillFittedCanvasText(ctx, copy.title, 42, 119, 560, 23, '900', 'system-ui, sans-serif');
	ctx.fillStyle = 'rgba(255, 245, 223, 0.74)';
	ctx.font = '700 18px system-ui, sans-serif';
	fillFittedCanvasText(ctx, copy.note, 42, 145, 760, 18, '700', 'system-ui, sans-serif');
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function getEraMuralCopy(era) {
	return {
		'Blogging Roots': {
			title: 'The Loop starts here',
			note: 'Permalinks, comments, categories, and one very proud setup wizard.',
		},
		'Dashboard Foundations': {
			title: 'The dashboard grows up',
			note: 'Themes, widgets, media, trash, thumbnails, and fewer dramatic deletes.',
		},
		'CMS Toolkit': {
			title: 'WordPress becomes a CMS toolkit',
			note: 'Custom post types, taxonomies, multisite, menus, and the Customizer.',
		},
		'Modern Admin': {
			title: 'The admin learns to breathe',
			note: 'Responsive MP6, autosave, updates, media grids, and calmer writing.',
		},
		'API and Customizer': {
			title: 'JSON finds the side door',
			note: 'REST endpoints, responsive images, media widgets, and Customizer drafts.',
		},
		'Block Editor': {
			title: 'Everything becomes movable',
			note: 'Gutenberg lands; blocks, groups, Site Health, and bigger images follow.',
		},
		'Blocks Everywhere': {
			title: 'The whole site turns into blocks',
			note: 'Block themes, site editing, style variations, and the Style Book cabinet.',
		},
	}[era];
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
			: roomDepth,
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

function createAtriumDecor() {
	const group = new THREE.Group();
	if (!shouldDecorateScene) {
		return group;
	}

	const color = activeVariant.eraColors[0];
	const secondary = activeVariant.eraColors[3];
	group.add(createAtriumFloorMedallion(color, secondary));
	addAtriumFeature(group, activeVariant.atriumFeature, color, secondary);
	addAtriumBenches(group);
	return group;
}

function createAtriumFloorMedallion(color, secondary) {
	const group = new THREE.Group();
	const ring = new THREE.Mesh(
		new THREE.RingGeometry(2.35, 2.65, 64),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.55,
			side: THREE.DoubleSide,
		})
	);
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = 0.055;
	group.add(ring);

	const lineMaterial = new THREE.MeshBasicMaterial({
		color: secondary,
		transparent: true,
		opacity: 0.36,
	});
	for (let index = 0; index < 8; index++) {
		const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 3.9), lineMaterial);
		spoke.rotation.y = (Math.PI * 2 * index) / 8;
		spoke.position.y = 0.065;
		group.add(spoke);
	}
	return group;
}

function addAtriumFeature(group, feature, color, secondary) {
	if (feature === 'ultimate-museum') {
		addUltimateAtriumFeature(group, color, secondary);
		return;
	}
	if (feature === 'listening-booth') {
		addPlaced(group, createRecordBooth(color, secondary), 0, 4.1, Math.PI);
		addPlaced(group, createLoadedModel('radio', { targetHeight: 0.62, fallback: 'radio' }), -1.05, 3.12, -0.35);
		addPlaced(group, createLoadedModel('speakerSmall', { targetHeight: 0.72, fallback: 'speaker' }), 1.15, 3.18, 0.4);
		addPlaced(group, createLoadedModel('loungeDesignSofa', { targetHeight: 0.64, fallback: 'bench' }), 0, -3.9, 0);
		return;
	}
	if (feature === 'pinball-machine') {
		addPlaced(group, createArcadeCabinet(color, secondary), 0, 4.05, Math.PI);
		addPlaced(group, createLoadedModel('televisionVintage', { targetHeight: 0.95, fallback: 'screen' }), -2.15, 2.85, 0.45);
		addPlaced(group, createBlockFountain(color), 0, -3.55, 0);
		return;
	}
	if (feature === 'plugin-bazaar') {
		addPlaced(group, createPluginMarket(color, secondary), 0, 3.65, Math.PI);
		addPlaced(group, createLoadedModel('detailAwningWide', { targetHeight: 0.72, fallback: 'awning' }), 0, 2.55, Math.PI);
		addPlaced(group, createLoadedModel('truckGreen', { targetHeight: 0.74, fallback: 'crate' }), 3.2, -3.2, -0.8);
		return;
	}
	if (feature === 'greenhouse') {
		addPlaced(group, createPlant(color, 1.55), 0, 3.85, 0);
		addPlaced(group, createPlant(color, 1.35), -2.2, 3.1, 0.45);
		addPlaced(group, createLoadedModel('pottedPlant', { targetHeight: 1.05, fallback: 'plant' }), 2.25, 3.15, -0.45);
		addPlaced(group, createLoadedModel('detailBench', { targetHeight: 0.55, fallback: 'bench' }), 0, -4.0, 0);
		return;
	}
	if (feature === 'server-oracle') {
		addPlaced(group, createServerOracle(color, secondary), 0, 3.75, Math.PI);
		addPlaced(group, createLoadedModel('laptop', { targetHeight: 0.54, fallback: 'screen' }), -1.45, -3.5, 0.25);
		addPlaced(group, createOrbitalSculpture(activeVariant.eraColors[4]), 1.55, -3.4, -0.25);
		return;
	}
	if (feature === 'api-portal') {
		addPlaced(group, createApiPortal(color, secondary), 0, 3.85, Math.PI);
		addPlaced(group, createLoadedModel('doorRotateRoundA', { targetHeight: 1.85, fallback: 'portal' }), 0, 2.85, Math.PI);
		const orbital = createOrbitalSculpture(activeVariant.eraColors[4]);
		orbital.scale.setScalar(0.72);
		addPlaced(group, orbital, 0, -2.65, 0);
		return;
	}
	if (feature === 'block-fountain') {
		addPlaced(group, createBlockFountain(color), 0, 3.75, Math.PI);
		addPlaced(group, createLoadedModel('platingDetailed', { targetHeight: 0.28, fallback: 'block' }), -2.6, -3.2, 0.4);
		addPlaced(group, createLoadedModel('loungeDesignSofa', { targetHeight: 0.64, fallback: 'bench' }), 2.7, -3.1, -0.4);
		return;
	}
	if (feature === 'time-capsule') {
		addPlaced(group, createTimeCapsule(color), 0, 3.9, Math.PI / 2);
		addPlaced(group, createLoadedModel('bookcaseOpenLow', { targetHeight: 1.18, fallback: 'bookcase' }), -2.5, 2.85, 0.45);
		addPlaced(group, createLoadedModel('stairsOpenShort', { targetHeight: 0.75, fallback: 'stairs' }), 2.4, 2.85, -0.55);
		return;
	}
	if (feature === 'comment-aquarium') {
		addPlaced(group, createCommentAquarium(color, secondary), 0, 3.85, Math.PI);
		addPlaced(group, createLoadedModel('detailLightTraffic', { targetHeight: 1.45, fallback: 'light' }), -2.6, -3.15, 0.55);
		addPlaced(group, createLoadedModel('detailBench', { targetHeight: 0.55, fallback: 'bench' }), 2.55, -3.2, -0.55);
		return;
	}
	addPlaced(group, createMascotMonument(color, secondary), 0, 3.85, Math.PI);
	addPlaced(group, createLoadedModel('columnThin', { targetHeight: 1.85, fallback: 'column' }), -2.2, 2.95, 0);
	addPlaced(group, createLoadedModel('columnThin', { targetHeight: 1.85, fallback: 'column' }), 2.2, 2.95, 0);
}

function addUltimateAtriumFeature(group, color, secondary) {
	addPlaced(group, createMascotMonument(color, secondary), 0, 4.28, 0);
	addPlaced(group, createBlockFountain(activeVariant.eraColors[5], 0.58), -3.25, 2.7, 0.28);
	addPlaced(group, createApiPortal(activeVariant.eraColors[4], activeVariant.eraColors[6], 0.54), 3.25, 2.72, -0.28);
	addPlaced(group, createRecordBooth(activeVariant.eraColors[0], activeVariant.eraColors[1]), -3.35, -3.35, 0.35);
	addPlaced(group, createLoadedModel('radio', { targetHeight: 0.44, fallback: 'radio' }), -2.28, -3.15, -0.45);
	addPlaced(group, createTerminalDesk(activeVariant.eraColors[3]), 3.18, -3.38, -0.35);
	addPlaced(group, createLoadedModel('pottedPlant', { targetHeight: 1.05, fallback: 'plant' }), -5.1, -1.75, 0.35);
	addPlaced(group, createLoadedModel('pottedPlant', { targetHeight: 1.05, fallback: 'plant' }), 5.1, -1.75, -0.35);
	addPlaced(group, createSignpost(secondary, 'WP 1.0'), -1.85, 3.05, -0.32);
	addPlaced(group, createSignpost(activeVariant.eraColors[6], 'WP 6.x'), 1.85, 3.05, 0.32);
}

function addAtriumBenches(group) {
	const first = createLoadedModel('benchCushion', { targetHeight: 0.55, fallback: 'bench' });
	addPlaced(group, first, -4.8, 1.2, Math.PI / 2);
	const second = createLoadedModel('benchCushion', { targetHeight: 0.55, fallback: 'bench' });
	addPlaced(group, second, 4.8, 1.2, -Math.PI / 2);
}

function createRoomDecor(room) {
	const group = new THREE.Group();
	if (!shouldDecorateScene) {
		return group;
	}

	const roomIndex = eras.indexOf(room.era);
	if (activeVariant.roomFeature === 'era-vignettes') {
		addRoomFeature(group, room, roomIndex);
		group.add(createRoomFloorLabel(room, roomIndex));
		return group;
	}

	const primaryProp = activeVariant.props[roomIndex % activeVariant.props.length];
	const secondaryProp = activeVariant.props[(roomIndex + 3) % activeVariant.props.length];
	const left = createMuseumProp(primaryProp, room.color);
	left.position.set(-roomWidth / 2 + 1.2, 0, -roomDepth / 2 + 1.4);
	left.rotation.y = Math.PI / 4;
	group.add(left);

	const right = createMuseumProp(secondaryProp, activeVariant.eraColors[(roomIndex + 2) % 7]);
	right.position.set(roomWidth / 2 - 1.2, 0, -roomDepth / 2 + 1.4);
	right.rotation.y = -Math.PI / 4;
	group.add(right);

	addRoomFeature(group, room, roomIndex);
	group.add(createRoomFloorLabel(room, roomIndex));
	return group;
}

function addRoomFeature(group, room, roomIndex) {
	const feature = activeVariant.roomFeature;
	const color = room.color;
	const z = -roomDepth / 2 + 1.08;
	if (feature === 'era-vignettes') {
		addEraVignette(group, room, roomIndex);
		return;
	}
	if (feature === 'record-crates') {
		addLocal(group, createRecordStack(color), 0, z, 0);
		addLocal(group, createLoadedModel('speakerSmall', { targetHeight: 0.58, fallback: 'speaker' }), -2.6, z + 0.3, 0.25);
		addLocal(group, createLoadedModel('radio', { targetHeight: 0.46, fallback: 'radio' }), 2.5, z + 0.3, -0.25);
		return;
	}
	if (feature === 'arcade-corners') {
		addLocal(group, createArcadeCabinet(color, activeVariant.eraColors[(roomIndex + 2) % 7]), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'crate-market') {
		addLocal(group, createLoadedModel('pallet', { targetHeight: 0.28, fallback: 'crate' }), 0, z + 0.1, 0);
		addLocal(group, createPluginCrates(color), 0.4, z + 0.1, -0.18);
		return;
	}
	if (feature === 'plant-lab') {
		addLocal(group, createPlant(color, 1.15), 0, z + 0.15, 0);
		addLocal(group, createPlant(color, 0.9), -2.1, z + 0.1, 0);
		addLocal(group, createLoadedModel('plantSmall2', { targetHeight: 0.72, fallback: 'plant' }), 2.1, z + 0.1, 0);
		return;
	}
	if (feature === 'terminal-desks') {
		addLocal(group, createTerminalDesk(color), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'portal-kiosks') {
		addLocal(group, createApiPortal(color, activeVariant.eraColors[(roomIndex + 1) % 7], 0.58), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'block-stacks') {
		addLocal(group, createBlockFountain(color, 0.64), 0, z + 0.2, 0);
		return;
	}
	if (feature === 'archive-cases') {
		addLocal(group, createDisplayCase(color, 'archive'), 0, z + 0.2, 0);
		addLocal(group, createLoadedModel('bookcaseOpenLow', { targetHeight: 0.88, fallback: 'bookcase' }), 2.5, z + 0.15, -0.22);
		return;
	}
	if (feature === 'moderation-tanks') {
		addLocal(group, createCommentAquarium(color, activeVariant.eraColors[(roomIndex + 4) % 7], 0.58), 0, z + 0.2, 0);
		return;
	}
	addLocal(group, createDisplayCase(color, 'monument'), 0, z + 0.2, 0);
}

function addEraVignette(group, room, roomIndex) {
	const color = room.color;
	const secondary = activeVariant.eraColors[(roomIndex + 2) % activeVariant.eraColors.length];
	const frontZ = -roomDepth / 2 + 1.18;
	const leftX = -roomWidth / 2 + 1.28;
	const rightX = roomWidth / 2 - 1.28;
	const centerZ = -roomDepth / 2 + 1.55;
	const lamp = createMuseumLamp(color);
	addLocal(group, lamp, 0, frontZ - 0.02, 0);

	if (room.era === 'Blogging Roots') {
		addLocal(group, createRecordStack(color), leftX + 0.3, frontZ + 0.24, Math.PI / 5);
		addLocal(group, createCommentSculpture(secondary), rightX - 0.26, frontZ + 0.18, -Math.PI / 4);
		addLocal(group, createSignpost(color, 'THE LOOP'), 0.05, centerZ + 0.3, 0);
		return;
	}
	if (room.era === 'Dashboard Foundations') {
		addLocal(group, createLoadedModel('computerScreen', { targetHeight: 0.58, fallback: 'screen' }), leftX + 0.42, frontZ + 0.2, Math.PI / 5);
		addLocal(group, createPluginCrates(color), rightX - 0.42, frontZ + 0.2, -Math.PI / 5);
		addLocal(group, createSignpost(secondary, '/wp-admin'), 0.05, centerZ + 0.26, 0);
		return;
	}
	if (room.era === 'CMS Toolkit') {
		addLocal(group, createLoadedModel('bookcaseOpenLow', { targetHeight: 0.78, fallback: 'bookcase' }), leftX + 0.42, frontZ + 0.2, Math.PI / 5);
		addLocal(group, createKnobConsole(color), rightX - 0.38, frontZ + 0.2, -Math.PI / 5);
		addLocal(group, createDisplayCase(secondary, 'CPT'), 0, centerZ + 0.36, 0);
		return;
	}
	if (room.era === 'Modern Admin') {
		addLocal(group, createTerminalDesk(color), leftX + 0.48, frontZ + 0.18, Math.PI / 5);
		addLocal(group, createDisplayCase(secondary, 'MP6'), rightX - 0.42, frontZ + 0.22, -Math.PI / 5);
		addLocal(group, createLoadedModel('detailBench', { targetHeight: 0.48, fallback: 'bench' }), 0, centerZ + 0.36, 0);
		return;
	}
	if (room.era === 'API and Customizer') {
		addLocal(group, createApiPortal(color, secondary, 0.62), leftX + 0.5, frontZ + 0.2, Math.PI / 6);
		addLocal(group, createCommentAquarium(secondary, color, 0.54), rightX - 0.42, frontZ + 0.2, -Math.PI / 6);
		addLocal(group, createSignpost(secondary, 'wp/v2'), 0.05, centerZ + 0.34, 0);
		return;
	}
	if (room.era === 'Block Editor') {
		addLocal(group, createBlockFountain(color, 0.62), leftX + 0.4, frontZ + 0.2, Math.PI / 5);
		addLocal(group, createDisplayCase(secondary, 'GROUP'), rightX - 0.42, frontZ + 0.2, -Math.PI / 5);
		addLocal(group, createDisplayCase(secondary, '5.0'), 0.05, centerZ + 0.34, 0);
		return;
	}
	addLocal(group, createBlockFountain(color, 0.58), leftX + 0.4, frontZ + 0.2, Math.PI / 5);
	addLocal(group, createLoadedModel('loungeDesignChair', { targetHeight: 0.58, fallback: 'bench' }), rightX - 0.45, frontZ + 0.2, -Math.PI / 5);
	addLocal(group, createDisplayCase(secondary, 'FSE'), 0.05, centerZ + 0.34, 0);
}

function createRoomFloorLabel(room, roomIndex) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = 'rgba(0, 0, 0, 0)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = room.color;
	ctx.globalAlpha = 0.28;
	ctx.fillRect(0, 36, canvas.width, 30);
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 34px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	const labelText = activeVariant.roomFeature === 'era-vignettes'
		? room.era.toUpperCase()
		: activeVariant.shortName.replace(/^\d+\.\s*/, '').toUpperCase();
	fillFittedCanvasText(ctx, labelText, 256, 64, 430, 34, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = 'rgba(255, 245, 223, 0.66)';
	ctx.font = '700 16px system-ui, sans-serif';
	ctx.fillText(`${room.yearRange} / gallery ${roomIndex + 1}`, 256, 92);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const label = new THREE.Mesh(
		new THREE.PlaneGeometry(4.9, 1.2),
		new THREE.MeshBasicMaterial({
			map: texture,
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	label.position.set(0, 0.075, -roomDepth / 2 + 2.45);
	label.rotation.x = -Math.PI / 2;
	return label;
}

function createMuseumProp(type, color) {
	const modelKey = getModelKeyForProp(type);
	if (modelKey) {
		return createLoadedModel(modelKey, {
			targetHeight: getModelHeightForProp(type),
			fallback: type,
		});
	}
	if (type.includes('logoClinic')) {
		return createLogoClinic(color);
	}
	if (type.includes('pluginCrates')) {
		return createPluginCrates(color);
	}
	if (type.includes('recordStack')) {
		return createRecordStack(color);
	}
	if (type.includes('jazzLamp') || type.includes('spotlight')) {
		return createMuseumLamp(color);
	}
	if (type.includes('signpost')) {
		return createSignpost(color);
	}
	if (type.includes('paperPile')) {
		return createPaperPile(color);
	}
	if (type.includes('displayCase')) {
		return createDisplayCase(color, 'block');
	}
	if (type.includes('terminalBench') || type.includes('concreteBench')) {
		return createBench(color);
	}
	if (type.includes('plant')) {
		return createPlant(color, type.includes('big') ? 1.25 : 0.9);
	}
	if (type.includes('bench')) {
		return createBench(color);
	}
	if (type.includes('server') || type.includes('console') || type.includes('code')) {
		return createServerStack(color);
	}
	if (type.includes('comment')) {
		return createCommentSculpture(color);
	}
	if (type.includes('orbital') || type.includes('apiPortal')) {
		return createOrbitalSculpture(color);
	}
	if (type.includes('train')) {
		return createReleaseTrain(color);
	}
	if (type.includes('capsule')) {
		return createTimeCapsule(color);
	}
	if (type.includes('tea') || type.includes('knob')) {
		return createKnobConsole(color);
	}
	return createBlockStack(color);
}

function getModelKeyForProp(type) {
	return {
		modelAwning: 'detailAwningWide',
		modelBench: 'detailBench',
		modelBookcase: 'bookcaseOpenLow',
		modelColumn: 'columnThin',
		modelComputer: 'computerScreen',
		modelDoorRound: 'doorRotateRoundA',
		modelLaptop: 'laptop',
		modelLight: 'detailLightSingle',
		modelPallet: 'pallet',
		modelPlant: 'pottedPlant',
		modelPlating: 'platingDetailed',
		modelRadio: 'radio',
		modelScreen: 'computerScreen',
		modelSofa: 'loungeDesignSofa',
		modelSpeaker: 'speakerSmall',
		modelStairs: 'stairsOpenShort',
		modelTelevision: 'televisionVintage',
		modelTrafficLight: 'detailLightTraffic',
		modelTree: 'pottedPlant',
	}[type];
}

function getModelHeightForProp(type) {
	return {
		modelAwning: 0.62,
		modelBench: 0.55,
		modelBookcase: 0.92,
		modelColumn: 1.42,
		modelComputer: 0.62,
		modelDoorRound: 1.25,
		modelLaptop: 0.48,
		modelLight: 1.35,
		modelPallet: 0.24,
		modelPlant: 0.72,
		modelPlating: 0.24,
		modelRadio: 0.46,
		modelScreen: 0.6,
		modelSofa: 0.58,
		modelSpeaker: 0.56,
		modelStairs: 0.55,
		modelTelevision: 0.74,
		modelTrafficLight: 1.35,
		modelTree: 0.88,
	}[type] || 0.78;
}

function addPlaced(group, object, x, z, rotationY = 0) {
	object.position.set(x, 0, z);
	object.rotation.y = rotationY;
	group.add(object);
	return object;
}

function addLocal(group, object, x, z, rotationY = 0) {
	object.position.set(x, 0, z);
	object.rotation.y = rotationY;
	group.add(object);
	return object;
}

function createLoadedModel(modelKey, options = {}) {
	const anchor = new THREE.Group();
	anchor.add(createModelPlaceholder(options.fallback || modelKey, options.targetHeight || 0.7));
	loadModel(modelKey)
		.then((template) => {
			const instance = template.clone(true);
			instance.traverse((child) => {
				if (child.isMesh) {
					child.frustumCulled = true;
					if (child.material?.isMeshStandardMaterial) {
						child.material.roughness = Math.max(child.material.roughness, 0.52);
					}
				}
			});
			normalizeModel(instance, options.targetHeight || 0.7);
			anchor.clear();
			anchor.add(instance);
		})
		.catch(() => {});
	return anchor;
}

function loadModel(modelKey) {
	if (!modelDefinitions[modelKey]) {
		return Promise.reject(new Error(`Unknown model: ${modelKey}`));
	}
	if (!modelCache.has(modelKey)) {
		modelCache.set(
			modelKey,
			new Promise((resolve, reject) => {
				gltfLoader.load(
					modelDefinitions[modelKey],
					(gltf) => resolve(gltf.scene),
					undefined,
					reject
				);
			})
		);
	}
	return modelCache.get(modelKey);
}

function createModelPlaceholder(type, targetHeight) {
	if (type.includes('plant') || type.includes('tree')) {
		return createPlant(activeVariant.eraColors[3], targetHeight > 1 ? 1 : 0.7);
	}
	if (type.includes('bench') || type.includes('Sofa')) {
		return createBench(activeVariant.eraColors[5]);
	}
	if (type.includes('radio') || type.includes('screen') || type.includes('Computer') || type.includes('Television')) {
		return createKnobConsole(activeVariant.eraColors[2]);
	}
	if (type.includes('light')) {
		return createMuseumLamp(activeVariant.eraColors[0]);
	}
	if (type.includes('column')) {
		const column = new THREE.Mesh(
			new THREE.CylinderGeometry(0.14, 0.18, targetHeight, 14),
			new THREE.MeshStandardMaterial({ color: 0xd7d0c4, roughness: 0.76 })
		);
		column.position.y = targetHeight / 2;
		return column;
	}
	return createBlockStack(activeVariant.eraColors[0]);
}

function normalizeModel(object, targetHeight) {
	const box = new THREE.Box3().setFromObject(object);
	const size = box.getSize(new THREE.Vector3());
	const scale = targetHeight / Math.max(size.y, 0.001);
	object.scale.multiplyScalar(scale);
	const scaledBox = new THREE.Box3().setFromObject(object);
	const center = scaledBox.getCenter(new THREE.Vector3());
	object.position.sub(new THREE.Vector3(center.x, scaledBox.min.y, center.z));
}

function createRecordBooth(color, secondary) {
	const group = new THREE.Group();
	group.add(createPedestal(1.4, 0.28, color));
	const discMaterial = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.38 });
	for (let index = 0; index < 4; index++) {
		const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 32), discMaterial);
		disc.position.set(-0.45 + index * 0.3, 0.56 + index * 0.03, 0);
		disc.rotation.z = Math.PI / 2;
		group.add(disc);
		const label = new THREE.Mesh(
			new THREE.CylinderGeometry(0.1, 0.1, 0.046, 18),
			new THREE.MeshBasicMaterial({ color: index % 2 ? color : secondary })
		);
		label.position.copy(disc.position);
		label.rotation.z = disc.rotation.z;
		group.add(label);
	}
	group.add(createPropLabel('HELLO DOLLY', secondary, 1.18));
	return group;
}

function createArcadeCabinet(color, secondary) {
	const group = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(0.88, 1.42, 0.52),
		new THREE.MeshStandardMaterial({ color, roughness: 0.48 })
	);
	body.position.y = 0.82;
	group.add(body);
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.58, 0.34),
		new THREE.MeshBasicMaterial({ color: 0x07101d })
	);
	screen.position.set(0, 1.04, -0.265);
	group.add(screen);
	const glow = new THREE.Mesh(
		new THREE.PlaneGeometry(0.48, 0.05),
		new THREE.MeshBasicMaterial({ color: secondary })
	);
	glow.position.set(0, 1.08, -0.271);
	group.add(glow);
	for (const x of [-0.18, 0.04, 0.26]) {
		const button = new THREE.Mesh(
			new THREE.SphereGeometry(0.045, 12, 8),
			new THREE.MeshBasicMaterial({ color: activeVariant.eraColors[Math.abs(Math.round(x * 100)) % 7] })
		);
		button.position.set(x, 0.61, -0.28);
		group.add(button);
	}
	return group;
}

function createPluginMarket(color, secondary) {
	const group = new THREE.Group();
	addLocal(group, createPluginCrates(color), -0.62, 0, -0.1);
	addLocal(group, createSignpost(secondary, 'ZIP'), 0.76, 0.05, 0.12);
	addLocal(group, createLoadedModel('pallet', { targetHeight: 0.24, fallback: 'crate' }), 0.04, 0.32, 0);
	return group;
}

function createServerOracle(color, secondary) {
	const group = new THREE.Group();
	for (let index = 0; index < 3; index++) {
		const server = createServerStack(index % 2 ? color : secondary);
		server.position.set(-0.74 + index * 0.74, 0, 0);
		group.add(server);
	}
	const halo = new THREE.Mesh(
		new THREE.TorusGeometry(1.08, 0.035, 8, 54),
		new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.26 })
	);
	halo.position.y = 1.72;
	halo.rotation.x = Math.PI / 2;
	group.add(halo);
	return group;
}

function createApiPortal(color, secondary, scale = 1) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({
		color,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.14,
		roughness: 0.32,
		metalness: 0.2,
	});
	const left = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.55, 0.16), material);
	const right = left.clone();
	const top = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 0.16), material);
	left.position.set(-0.55, 0.82, 0);
	right.position.set(0.55, 0.82, 0);
	top.position.set(0, 1.52, 0);
	group.add(left, right, top);
	const core = new THREE.Mesh(
		new THREE.RingGeometry(0.34, 0.46, 32),
		new THREE.MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.86, side: THREE.DoubleSide })
	);
	core.position.y = 0.8;
	group.add(core);
	group.scale.setScalar(scale);
	return group;
}

function createBlockFountain(color, scale = 1) {
	const group = new THREE.Group();
	group.add(createPedestal(1.1, 0.24, color));
	for (let index = 0; index < 8; index++) {
		const block = new THREE.Mesh(
			new THREE.BoxGeometry(0.34, 0.34, 0.34),
			new THREE.MeshStandardMaterial({
				color: activeVariant.eraColors[index % activeVariant.eraColors.length],
				roughness: 0.45,
			})
		);
		const angle = index * 0.78;
		block.position.set(Math.cos(angle) * 0.48, 0.44 + index * 0.12, Math.sin(angle) * 0.48);
		block.rotation.y = angle;
		group.add(block);
	}
	group.scale.setScalar(scale);
	return group;
}

function createCommentAquarium(color, secondary, scale = 1) {
	const group = new THREE.Group();
	const glass = new THREE.Mesh(
		new THREE.BoxGeometry(1.45, 0.86, 0.5),
		new THREE.MeshStandardMaterial({
			color: 0xbbe8ff,
			transparent: true,
			opacity: 0.24,
			roughness: 0.05,
			metalness: 0.05,
		})
	);
	glass.position.y = 0.8;
	group.add(glass);
	for (let index = 0; index < 6; index++) {
		const bubble = new THREE.Mesh(
			new THREE.SphereGeometry(0.045 + (index % 3) * 0.012, 10, 8),
			new THREE.MeshBasicMaterial({ color: index % 2 ? color : secondary })
		);
		bubble.position.set(-0.5 + index * 0.2, 0.45 + (index % 4) * 0.17, -0.1 + (index % 2) * 0.2);
		group.add(bubble);
	}
	group.add(createPedestal(1.6, 0.2, color));
	group.scale.setScalar(scale);
	return group;
}

function createMascotMonument(color, secondary) {
	const group = new THREE.Group();
	group.add(createMascotStatue(color, secondary));
	group.add(createPropLabel('OPEN SOURCE', secondary, 1.46));
	return group;
}

function createTerminalDesk(color) {
	const group = new THREE.Group();
	group.add(createKnobConsole(color));
	addLocal(group, createLoadedModel('computerScreen', { targetHeight: 0.52, fallback: 'screen' }), 0.1, -0.08, 0);
	addLocal(group, createLoadedModel('laptop', { targetHeight: 0.38, fallback: 'screen' }), -0.52, 0.14, 0.12);
	return group;
}

function createLogoClinic(color) {
	const group = new THREE.Group();
	group.add(createDisplayCase(color, 'W'));
	group.add(createPropLabel('FAUXGO FIX', color, 1.34));
	return group;
}

function createPluginCrates(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color: 0x9a6536, roughness: 0.72 });
	for (let index = 0; index < 5; index++) {
		const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), material);
		crate.position.set(-0.44 + (index % 3) * 0.42, 0.18 + Math.floor(index / 3) * 0.3, 0);
		crate.rotation.y = index * 0.13;
		group.add(crate);
		const label = new THREE.Mesh(
			new THREE.PlaneGeometry(0.26, 0.1),
			new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
		);
		label.position.set(crate.position.x, crate.position.y + 0.02, -0.215);
		group.add(label);
	}
	return group;
}

function createRecordStack(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.42 });
	for (let index = 0; index < 6; index++) {
		const record = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 28), material);
		record.position.set(-0.45 + index * 0.18, 0.32 + index * 0.035, 0);
		record.rotation.z = Math.PI / 2;
		group.add(record);
	}
	group.add(createPropLabel('JAZZ', color, 0.72));
	return group;
}

function createMuseumLamp(color) {
	const group = new THREE.Group();
	const pole = new THREE.Mesh(
		new THREE.CylinderGeometry(0.035, 0.05, 1.1, 12),
		new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.38, metalness: 0.25 })
	);
	pole.position.y = 0.55;
	group.add(pole);
	const shade = new THREE.Mesh(
		new THREE.ConeGeometry(0.22, 0.22, 16),
		new THREE.MeshBasicMaterial({ color })
	);
	shade.position.y = 1.16;
	shade.rotation.x = Math.PI;
	group.add(shade);
	const light = new THREE.PointLight(new THREE.Color(color), 0.9, 5);
	light.position.y = 1.05;
	group.add(light);
	return group;
}

function createSignpost(color, text = '404') {
	const group = new THREE.Group();
	const post = new THREE.Mesh(
		new THREE.BoxGeometry(0.08, 0.9, 0.08),
		new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 0.7 })
	);
	post.position.y = 0.45;
	group.add(post);
	const sign = createReadableLabel(createSmallSignTexture(text, color), 0.82, 0.3);
	sign.position.y = 0.82;
	group.add(sign);
	return group;
}

function createPaperPile(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshBasicMaterial({ color: 0xf8efd9 });
	for (let index = 0; index < 7; index++) {
		const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.018, 0.48), material);
		sheet.position.y = 0.18 + index * 0.022;
		sheet.rotation.y = -0.18 + index * 0.06;
		group.add(sheet);
	}
	group.add(createPropLabel('README', color, 0.54));
	return group;
}

function createDisplayCase(color, label) {
	const group = new THREE.Group();
	group.add(createPedestal(1.15, 0.32, color));
	const glass = new THREE.Mesh(
		new THREE.BoxGeometry(0.9, 0.62, 0.52),
		new THREE.MeshStandardMaterial({
			color: 0xdff8ff,
			transparent: true,
			opacity: 0.24,
			roughness: 0.04,
		})
	);
	glass.position.y = 0.74;
	group.add(glass);
	const artifact = new THREE.Mesh(
		new THREE.TorusGeometry(0.18, 0.04, 8, 24),
		new THREE.MeshStandardMaterial({ color: 0x101827, roughness: 0.35, metalness: 0.22 })
	);
	artifact.position.y = 0.72;
	group.add(artifact);
	group.add(createPropLabel(label.toUpperCase(), color, 1.18));
	return group;
}

function createPedestal(width, height, color) {
	const pedestal = new THREE.Mesh(
		new THREE.CylinderGeometry(width / 2, width / 2 + 0.08, height, 18),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.74 })
	);
	pedestal.position.y = height / 2;
	const band = new THREE.Mesh(
		new THREE.CylinderGeometry(width / 2 + 0.09, width / 2 + 0.09, 0.035, 18),
		new THREE.MeshBasicMaterial({ color })
	);
	band.position.y = height + 0.02;
	const group = new THREE.Group();
	group.add(pedestal, band);
	return group;
}

function createPropLabel(text, color, y) {
	const label = createReadableLabel(createSmallSignTexture(text, color), 1.18, 0.28);
	label.position.y = y;
	label.position.z = -0.34;
	return label;
}

function createReadableLabel(texture, width, height) {
	const group = new THREE.Group();
	const geometry = new THREE.PlaneGeometry(width, height);
	const front = new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({ map: texture, transparent: true })
	);
	front.position.z = 0.012;
	group.add(front);

	const back = new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({ map: texture.clone(), transparent: true })
	);
	back.position.z = -0.012;
	back.rotation.y = Math.PI;
	group.add(back);
	return group;
}

function createSmallSignTexture(text, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 80;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 8);
	ctx.fillRect(0, canvas.height - 8, canvas.width, 8);
	ctx.fillStyle = '#111827';
	ctx.font = '900 26px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(ctx, text, 128, 42, 218, 26, '900', 'Arial Black, Impact, sans-serif');
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function createMascotStatue(color, secondary) {
	const group = new THREE.Group();
	const pedestal = new THREE.Mesh(
		new THREE.CylinderGeometry(0.72, 0.84, 0.42, 18),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.7 })
	);
	pedestal.position.y = 0.21;
	group.add(pedestal);

	const body = new THREE.Mesh(
		new THREE.SphereGeometry(0.48, 24, 16),
		new THREE.MeshStandardMaterial({ color, roughness: 0.42 })
	);
	body.position.y = 0.9;
	group.add(body);

	const earMaterial = new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.5 });
	for (const x of [-1, 1]) {
		const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 16), earMaterial);
		ear.position.set(x * 0.35, 1.25, 0);
		ear.rotation.z = -x * 0.55;
		group.add(ear);
	}

	const faceMaterial = new THREE.MeshBasicMaterial({ color: 0x111827 });
	for (const x of [-1, 1]) {
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), faceMaterial);
		eye.position.set(x * 0.14, 0.98, -0.45);
		group.add(eye);
	}
	group.scale.setScalar(1.12);
	return group;
}

function createPlant(color, scale = 1) {
	const group = new THREE.Group();
	const pot = new THREE.Mesh(
		new THREE.CylinderGeometry(0.22, 0.3, 0.42, 12),
		new THREE.MeshStandardMaterial({ color: 0x8f5a2d, roughness: 0.76 })
	);
	pot.position.y = 0.21;
	group.add(pot);
	const leafMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
	for (let index = 0; index < 7; index++) {
		const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 10), leafMaterial);
		const angle = (Math.PI * 2 * index) / 7;
		leaf.position.set(Math.cos(angle) * 0.14, 0.74, Math.sin(angle) * 0.14);
		leaf.rotation.z = Math.cos(angle) * 0.55;
		leaf.rotation.x = Math.sin(angle) * 0.55;
		group.add(leaf);
	}
	group.scale.setScalar(scale);
	return group;
}

function createBench(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
	const dark = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.5 });
	const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.42), material);
	seat.position.y = 0.52;
	group.add(seat);
	const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.52, 0.12), material);
	back.position.set(0, 0.84, 0.22);
	group.add(back);
	for (const x of [-0.68, 0.68]) {
		for (const z of [-0.12, 0.18]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), dark);
			leg.position.set(x, 0.25, z);
			group.add(leg);
		}
	}
	return group;
}

function createBlockStack(color) {
	const group = new THREE.Group();
	for (let index = 0; index < 5; index++) {
		const block = new THREE.Mesh(
			new THREE.BoxGeometry(0.52, 0.32, 0.52),
			new THREE.MeshStandardMaterial({
				color: activeVariant.eraColors[index % activeVariant.eraColors.length],
				roughness: 0.5,
			})
		);
		block.position.set((index % 2) * 0.34 - 0.17, 0.18 + index * 0.32, 0);
		block.rotation.y = index * 0.18;
		group.add(block);
	}
	return group;
}

function createServerStack(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color: 0x101827, roughness: 0.36, metalness: 0.28 });
	for (let index = 0; index < 4; index++) {
		const unit = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.28, 0.46), material);
		unit.position.y = 0.16 + index * 0.31;
		group.add(unit);
		const light = new THREE.Mesh(
			new THREE.BoxGeometry(0.08, 0.04, 0.03),
			new THREE.MeshBasicMaterial({ color })
		);
		light.position.set(0.3, unit.position.y, -0.25);
		group.add(light);
	}
	return group;
}

function createCommentSculpture(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
	for (let index = 0; index < 3; index++) {
		const bubble = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.38, 0.08), material);
		bubble.position.set(0, 0.42 + index * 0.42, index * 0.08);
		group.add(bubble);
	}
	return group;
}

function createOrbitalSculpture(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0.55 });
	const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), material);
	core.position.y = 0.9;
	group.add(core);
	for (const rotation of [0, Math.PI / 3, -Math.PI / 3]) {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.025, 8, 48), material);
		ring.position.y = 0.9;
		ring.rotation.x = Math.PI / 2;
		ring.rotation.z = rotation;
		group.add(ring);
	}
	return group;
}

function createReleaseTrain(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.46 });
	for (let index = 0; index < 3; index++) {
		const car = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.34), material);
		car.position.set(-0.5 + index * 0.5, 0.38, 0);
		group.add(car);
	}
	return group;
}

function createTimeCapsule(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.35 });
	const capsule = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 18), material);
	capsule.position.y = 0.7;
	capsule.rotation.z = Math.PI / 2;
	group.add(capsule);
	return group;
}

function createKnobConsole(color) {
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.BoxGeometry(0.9, 0.24, 0.5),
		new THREE.MeshStandardMaterial({ color: 0x151a2a, roughness: 0.48 })
	);
	base.position.y = 0.34;
	group.add(base);
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.32 });
	for (let index = 0; index < 4; index++) {
		const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 16), material);
		knob.position.set(-0.3 + index * 0.2, 0.51, -0.12);
		knob.rotation.x = Math.PI / 2;
		group.add(knob);
	}
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
	group.position
		.copy(slot.position)
		.add(slot.normal.clone().multiplyScalar(exhibitMountOffset));
	group.rotation.y = slot.rotationY;

	const frame = createExhibitFrame(color);
	group.add(frame);

	const plaque = new THREE.Mesh(
		new THREE.PlaneGeometry(exhibitPlaqueWidth, exhibitPlaqueHeight),
		new THREE.MeshBasicMaterial({
			map: createPlaqueTexture(release, color),
			side: THREE.DoubleSide,
		})
	);
	plaque.position.z = exhibitPlaqueRecess;
	plaque.renderOrder = 2;
	plaque.userData.releaseIndex = index;
	group.add(plaque);
	pickables.push(plaque);

	return group;
}

function createExhibitFrame(color) {
	const group = new THREE.Group();
	const rail = (exhibitOuterWidth - exhibitPlaqueWidth) / 2;
	const innerWidth = exhibitOuterWidth - rail * 2;
	const innerHeight = exhibitOuterHeight - rail * 2;
	const railMaterial = createFrameMaterial(color);
	const shadowMaterial = new THREE.MeshBasicMaterial({
		color: 0x080d16,
		transparent: true,
		opacity: 0.62,
	});

	const shadow = new THREE.Mesh(
		new THREE.BoxGeometry(
			exhibitOuterWidth + 0.08,
			exhibitOuterHeight + 0.08,
			0.05
		),
		shadowMaterial
	);
	shadow.position.z = 0.025;
	group.add(shadow);

	const shape = new THREE.Shape();
	shape.moveTo(-exhibitOuterWidth / 2, -exhibitOuterHeight / 2);
	shape.lineTo(exhibitOuterWidth / 2, -exhibitOuterHeight / 2);
	shape.lineTo(exhibitOuterWidth / 2, exhibitOuterHeight / 2);
	shape.lineTo(-exhibitOuterWidth / 2, exhibitOuterHeight / 2);
	shape.lineTo(-exhibitOuterWidth / 2, -exhibitOuterHeight / 2);

	const hole = new THREE.Path();
	hole.moveTo(-innerWidth / 2, -innerHeight / 2);
	hole.lineTo(-innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, innerHeight / 2);
	hole.lineTo(innerWidth / 2, -innerHeight / 2);
	hole.lineTo(-innerWidth / 2, -innerHeight / 2);
	shape.holes.push(hole);

	const frame = new THREE.Mesh(
		new THREE.ExtrudeGeometry(shape, {
			depth: exhibitFrameDepth,
			bevelEnabled: true,
			bevelSegments: 1,
			bevelSize: 0.018,
			bevelThickness: 0.018,
		}),
		railMaterial
	);
	group.add(frame);
	addFrameAccents(group, color);

	const inset = new THREE.Mesh(
		new THREE.PlaneGeometry(
			exhibitPlaqueWidth + 0.08,
			exhibitPlaqueHeight + 0.08
		),
		new THREE.MeshBasicMaterial({
			color: 0x0c1320,
			side: THREE.DoubleSide,
		})
	);
	inset.position.z = exhibitPlaqueRecess - 0.025;
	group.add(inset);
	return group;
}

function createFrameMaterial(color) {
	const style = activeVariant.frameStyle || 'classic';
	const material = new THREE.MeshStandardMaterial({
		color,
		roughness: 0.46,
		metalness: 0.16,
	});
	if (style === 'chrome' || style === 'portal') {
		material.color.set(0xd8ecff);
		material.metalness = 0.78;
		material.roughness = 0.22;
	}
	if (style === 'wood' || style === 'market' || style === 'crate' || style === 'record') {
		material.color.set(0x8f5a2d);
		material.metalness = 0.04;
		material.roughness = 0.7;
	}
	if (style === 'museum-brass') {
		material.color.set(0xc79b43);
		material.metalness = 0.36;
		material.roughness = 0.34;
	}
	if (style === 'neon' || style === 'bubble' || style === 'terminal-bezel' || style === 'arcade-cabinet') {
		material.emissive = new THREE.Color(color);
		material.emissiveIntensity = 0.18;
		material.roughness = 0.3;
	}
	if (style === 'concrete' || style === 'monument') {
		material.color.set(0x9b9b91);
		material.metalness = 0.02;
		material.roughness = 0.92;
	}
	if (style === 'vine') {
		material.color.set(0x5d7d4d);
		material.roughness = 0.78;
	}
	return material;
}

function addFrameAccents(group, color) {
	if (!shouldDecorateScene) {
		return;
	}
	const style = activeVariant.frameStyle || activeVariant.frameBase;
	if (['badge', 'knob', 'rail', 'capsule', 'bubble', 'record', 'monument', 'museum-brass'].includes(style)) {
		addFrameCornerDots(group, color, style);
	}
	if (['block', 'maze', 'portal', 'arcade-cabinet', 'terminal-bezel'].includes(style)) {
		addFrameEdgeBlocks(group, color);
	}
	if (style === 'tape' || style === 'porcelain') {
		addFrameTape(group);
	}
	if (style === 'crate') {
		addFrameWoodSlats(group);
	}
	if (style === 'vine') {
		addFrameVines(group, color);
	}
	if (style === 'record') {
		addFrameRecords(group);
	}
	if (style === 'museum-brass') {
		addFrameNameplate(group, color);
	}
}

function addFrameNameplate(group, color) {
	const plate = new THREE.Mesh(
		new THREE.BoxGeometry(0.76, 0.13, 0.045),
		new THREE.MeshStandardMaterial({ color: 0xf2d48a, roughness: 0.28, metalness: 0.44 })
	);
	plate.position.set(0, -exhibitOuterHeight / 2 - 0.1, exhibitFrameDepth + 0.055);
	group.add(plate);
	const line = new THREE.Mesh(
		new THREE.BoxGeometry(0.58, 0.018, 0.052),
		new THREE.MeshBasicMaterial({ color })
	);
	line.position.set(0, plate.position.y, exhibitFrameDepth + 0.083);
	group.add(line);
}

function addFrameCornerDots(group, color, style) {
	const radius = style === 'bubble' ? 0.055 : 0.04;
	const geometry = new THREE.SphereGeometry(radius, 12, 8);
	const material = new THREE.MeshStandardMaterial({
		color: style === 'capsule' ? 0xf8efd9 : color,
		metalness: style === 'rail' || style === 'museum-brass' ? 0.55 : 0.08,
		roughness: 0.38,
	});
	for (const x of [-1, 1]) {
		for (const y of [-1, 1]) {
			const dot = new THREE.Mesh(geometry, material);
			dot.position.set(
				x * (exhibitOuterWidth / 2 - 0.18),
				y * (exhibitOuterHeight / 2 - 0.18),
				exhibitFrameDepth + 0.04
			);
			group.add(dot);
		}
	}
}

function addFrameEdgeBlocks(group, color) {
	const material = new THREE.MeshBasicMaterial({ color });
	const geometry = new THREE.BoxGeometry(0.22, 0.1, 0.08);
	for (let index = 0; index < 5; index++) {
		const top = new THREE.Mesh(geometry, material);
		top.position.set(-1.1 + index * 0.55, exhibitOuterHeight / 2 + 0.08, 0.1);
		group.add(top);
	}
}

function addFrameTape(group) {
	const material = new THREE.MeshBasicMaterial({
		color: 0xf8e6b0,
		transparent: true,
		opacity: 0.72,
	});
	for (const x of [-1, 1]) {
		const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.18), material);
		tape.position.set(x * 1.25, exhibitOuterHeight / 2 + 0.04, exhibitFrameDepth + 0.055);
		tape.rotation.z = x * 0.18;
		group.add(tape);
	}
}

function addFrameWoodSlats(group) {
	const material = new THREE.MeshBasicMaterial({ color: 0x5d321a });
	for (const y of [-1, 1]) {
		const slat = new THREE.Mesh(new THREE.BoxGeometry(exhibitOuterWidth + 0.14, 0.045, 0.08), material);
		slat.position.set(0, y * (exhibitOuterHeight / 2 - 0.28), exhibitFrameDepth + 0.07);
		group.add(slat);
	}
}

function addFrameVines(group, color) {
	const material = new THREE.MeshBasicMaterial({ color });
	for (let index = 0; index < 6; index++) {
		const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), material);
		leaf.position.set(-exhibitOuterWidth / 2 - 0.03, -0.78 + index * 0.32, exhibitFrameDepth + 0.075);
		leaf.rotation.z = index % 2 ? 0.5 : -0.5;
		group.add(leaf);
	}
}

function addFrameRecords(group) {
	const material = new THREE.MeshBasicMaterial({ color: 0x101014 });
	for (const x of [-1, 1]) {
		const record = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.16, 28), material);
		record.position.set(x * (exhibitOuterWidth / 2 - 0.2), exhibitOuterHeight / 2 - 0.24, exhibitFrameDepth + 0.08);
		group.add(record);
	}
}

function createExhibitSlots(room, releaseCount) {
	// Room-local x points toward the visitor's left when entering from the hub.
	const walls = [
		{ side: 'right', reverse: false },
		{ side: 'back', reverse: true },
		{ side: 'left', reverse: true },
	];
	const wallCounts = distributeWallCounts(releaseCount);
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
		const value = getSlotAxisValue(
			slotIndex,
			slotCount,
			-roomWidth / 2 + exhibitOuterWidth / 2 + exhibitWallMargin,
			roomWidth / 2 - exhibitOuterWidth / 2 - exhibitWallMargin
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
	const center = (min + max) / 2;
	if (slotCount === 1) {
		return center;
	}

	const spacing = Math.min(
		exhibitPreferredSpacing,
		(max - min) / (slotCount - 1)
	);
	return center - (spacing * (slotCount - 1)) / 2 + spacing * slotIndex;
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

function distributeWallCounts(count) {
	if (count === 1) {
		return [0, 1, 0];
	}
	if (count === 2) {
		return [1, 0, 1];
	}
	if (count === 3) {
		return [1, 1, 1];
	}
	if (count === 4) {
		return [1, 2, 1];
	}
	if (count === 5) {
		return [2, 1, 2];
	}
	if (count === 6) {
		return [2, 2, 2];
	}
	if (count === 7) {
		return [2, 3, 2];
	}
	return [3, count - 6, 3];
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

function createPlaqueTexture(release, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 736;
	const ctx = canvas.getContext('2d');
	drawPlaqueTexture(ctx, canvas, release, color, {});
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;

	Promise.all([
		loadPlaqueImage(getMusicianImagePath(release)),
		loadPlaqueImage(getScreenshotImagePath(release)),
	]).then(([musicianImage, screenshotImage]) => {
		drawPlaqueTexture(ctx, canvas, release, color, {
			musicianImage,
			screenshotImage,
		});
		texture.needsUpdate = true;
	});

	return texture;
}

function drawPlaqueTexture(ctx, canvas, release, color, images) {
	const plaquePaper = isCurrentVariant
		? '#f8efd9'
		: activeVariant.uiStyle === 'paper'
			? '#f1dfb8'
			: activeVariant.uiStyle === 'terminal'
				? '#9effd0'
				: '#f8efd9';
	const plaqueInk = isCurrentVariant
		? '#0f1726'
		: activeVariant.uiStyle === 'paper'
			? '#24170d'
			: activeVariant.uiStyle === 'terminal'
				? '#00150f'
				: '#0f1726';
	const mutedInk = isCurrentVariant
		? 'rgba(255, 245, 223, 0.84)'
		: activeVariant.uiStyle === 'paper'
			? 'rgba(36, 23, 13, 0.78)'
			: 'rgba(255, 245, 223, 0.84)';
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = plaquePaper;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = plaqueInk;
	ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
	ctx.fillStyle = color;
	ctx.fillRect(24, 24, canvas.width - 48, 18);
	ctx.globalAlpha = 0.16;
	ctx.fillRect(24, canvas.height - 46, canvas.width - 48, 22);
	ctx.globalAlpha = 1;

	drawMediaPanel(ctx, images.musicianImage, 56, 76, 286, 356, {
		fit: 'cover',
		label: release.musician,
		placeholder: 'Jazz portrait',
	});
	drawMediaPanel(ctx, images.screenshotImage, 376, 76, 592, 356, {
		fit: 'contain',
		label: 'WordPress ' + release.version,
		placeholder: 'WordPress screenshot',
	});

	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = plaquePaper;
	ctx.font = '900 88px Arial Black, Impact, sans-serif';
	ctx.fillText(release.version, 60, 548);
	ctx.fillStyle = activeVariant.uiStyle === 'paper' ? '#f8efd9' : 'rgba(255, 245, 223, 0.92)';
	ctx.font = '800 32px system-ui, sans-serif';
	wrapText(ctx, release.name, 62, 598, 260, 34, 2);
	ctx.fillStyle = isCurrentVariant ? 'rgba(255, 245, 223, 0.62)' : mutedInk;
	ctx.font = '700 22px system-ui, sans-serif';
	ctx.fillText(release.released, 62, 682);

	ctx.fillStyle = color;
	ctx.font = '900 32px system-ui, sans-serif';
	wrapText(ctx, release.knownFor, 376, 528, 560, 40, 2);
	ctx.fillStyle = mutedInk;
	ctx.font = '500 25px system-ui, sans-serif';
	wrapText(ctx, release.detail, 376, 620, 560, 34, 2);
	ctx.fillStyle = 'rgba(255, 245, 223, 0.52)';
	ctx.font = '800 18px system-ui, sans-serif';
	ctx.fillText(release.artifact, 376, 694);
}

function drawMediaPanel(ctx, image, x, y, width, height, options) {
	ctx.fillStyle = '#f8efd9';
	ctx.fillRect(x, y, width, height);
	ctx.fillStyle = '#111827';
	ctx.fillRect(x + 10, y + 10, width - 20, height - 20);

	if (image) {
		const draw =
			options.fit === 'contain' ? drawImageContain : drawImageCover;
		draw(ctx, image, x + 14, y + 14, width - 28, height - 28);
	} else {
		drawMediaPlaceholder(
			ctx,
			x + 14,
			y + 14,
			width - 28,
			height - 28,
			options.placeholder
		);
	}

	ctx.fillStyle = 'rgba(15, 23, 38, 0.76)';
	ctx.fillRect(x + 14, y + height - 54, width - 28, 40);
	ctx.fillStyle = '#fff5df';
	ctx.font = '800 20px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(
		ctx,
		options.label.toUpperCase(),
		x + width / 2,
		y + height - 34,
		width - 52,
		20,
		'800',
		'system-ui, sans-serif'
	);

	ctx.strokeStyle = 'rgba(255, 245, 223, 0.46)';
	ctx.lineWidth = 4;
	ctx.strokeRect(x + 12, y + 12, width - 24, height - 24);
}

function drawMediaPlaceholder(ctx, x, y, width, height, label) {
	ctx.fillStyle = '#162033';
	ctx.fillRect(x, y, width, height);
	ctx.strokeStyle = 'rgba(255, 245, 223, 0.18)';
	ctx.lineWidth = 6;
	for (let offset = -height; offset < width; offset += 48) {
		ctx.beginPath();
		ctx.moveTo(x + offset, y + height);
		ctx.lineTo(x + offset + height, y);
		ctx.stroke();
	}
	ctx.fillStyle = 'rgba(255, 245, 223, 0.56)';
	ctx.font = '800 24px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x + width / 2, y + height / 2);
}

function drawImageCover(ctx, image, x, y, width, height) {
	const sourceRatio = image.naturalWidth / image.naturalHeight;
	const targetRatio = width / height;
	const sourceWidth =
		sourceRatio > targetRatio
			? image.naturalHeight * targetRatio
			: image.naturalWidth;
	const sourceHeight =
		sourceRatio > targetRatio
			? image.naturalHeight
			: image.naturalWidth / targetRatio;
	const sourceX = (image.naturalWidth - sourceWidth) / 2;
	const sourceY = (image.naturalHeight - sourceHeight) / 2;
	ctx.drawImage(
		image,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		x,
		y,
		width,
		height
	);
}

function drawImageContain(ctx, image, x, y, width, height) {
	const scale = Math.min(
		width / image.naturalWidth,
		height / image.naturalHeight
	);
	const drawWidth = image.naturalWidth * scale;
	const drawHeight = image.naturalHeight * scale;
	const drawX = x + (width - drawWidth) / 2;
	const drawY = y + (height - drawHeight) / 2;
	ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function loadPlaqueImage(path) {
	if (!plaqueImageCache.has(path)) {
		plaqueImageCache.set(
			path,
			new Promise((resolve) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => resolve(null);
				image.src = path;
			})
		);
	}
	return plaqueImageCache.get(path);
}

function getMusicianImagePath(release) {
	return `./assets/musicians/wp-${getVersionSlug(release)}.jpg`;
}

function getScreenshotImagePath(release) {
	return `./assets/wp-screenshots/wp-${getVersionSlug(release)}.png`;
}

function getVersionSlug(release) {
	return release.version.replaceAll('.', '-');
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
	const minFontSize = Math.min(34, maxFontSize);
	while (true) {
		ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
		if (ctx.measureText(text).width <= maxWidth || fontSize <= minFontSize) {
			break;
		}
		fontSize -= 2;
	}
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

function initDebugApi() {
	if (!new URLSearchParams(window.location.search).has('debug')) {
		return;
	}

	window.wpMuseumDebug = {
		rooms: roomSides.map((side) => ({
			era: side.era,
			center: vectorToPlainObject(side.center),
			normal: vectorToPlainObject(side.normal),
			tangent: vectorToPlainObject(side.tangent),
		})),
		setCameraView(position, target) {
			stopGuidedTour();
			guidedTarget = null;
			camera.position.set(position.x, position.y, position.z);
			const angles = getViewAngles(
				camera.position,
				new THREE.Vector3(target.x, target.y, target.z)
			);
			yaw = angles.yaw;
			pitch = angles.pitch;
			setCameraRotation();
		},
		getRendererInfo() {
			return {
				render: { ...renderer.info.render },
				memory: { ...renderer.info.memory },
				pixelRatio: renderer.getPixelRatio(),
				renderedFrameCount,
			};
		},
	};
}

function vectorToPlainObject(vector) {
	return {
		x: vector.x,
		y: vector.y,
		z: vector.z,
	};
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
	renderer.render(scene, camera);
	renderedFrameCount += 1;
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
		turnCamera(-keyboardTurnSpeed * delta, 0);
	}
	if (keys.has('ArrowRight')) {
		turnCamera(keyboardTurnSpeed * delta, 0);
	}
	if (mobileMotion.left) {
		turnCamera(-mobileTurnSpeed * delta, 0);
	}
	if (mobileMotion.right) {
		turnCamera(mobileTurnSpeed * delta, 0);
	}
	if (forward || side) {
		stopGuidedTour();
		const speed =
			keys.has('ShiftLeft') || keys.has('ShiftRight')
				? sprintSpeed
				: getWalkSpeed();
		const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
		const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
		const movement = fwd
			.multiplyScalar(forward * speed * delta)
			.add(right.multiplyScalar(side * speed * delta));
		moveCamera(movement);
		updateNearestRelease();
	}
}

function getWalkSpeed() {
	if (keys.has('ArrowUp') || keys.has('ArrowDown')) {
		return arrowWalkSpeed;
	}
	return mobileMotion.forward || mobileMotion.back ? mobileWalkSpeed : walkSpeed;
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
