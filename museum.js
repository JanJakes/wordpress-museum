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
	preserveDrawingBuffer: new URLSearchParams(window.location.search).has('debug'),
});
const textureCanvases = new Map();
const museumTextures = new Map();
const plaqueImageCache = new Map();
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
let wapuuTexture = null;
let wapuuWordmarkTexture = null;
const deviceScreenTextures = new Map();
let deferredAssetTaskIndex = 0;
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
				// Floors are drawn procedurally as large warm marble slabs.
				ceiling: './assets/textures/ceiling-tiles.jpg',
				roomWall: './assets/textures/wall-marble.jpg',
				shellWall: './assets/textures/wall-marble.jpg',
			}
		: {}),
};
// Each procedural floor canvas holds a 2x2 block of slabs; this span sets
// the real-world size of that block so individual slabs read ~2.6m.
const floorTileSpan = 5.2;
// Bright warm tint multiplied over the cool marble photo so the walls read
// as light, airy limestone — lighter than the columns, to contrast the
// dark polished floor.
const wallWarmTint = 0xf4eede;
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
const animatedObjects = [];
const openSourceProjectItems = [
	{ title: 'PHP', note: 'runtime', color: '#7f8cff' },
	{ title: 'MYSQL', note: 'content store', color: '#f29111' },
	{ title: 'MARIADB', note: 'content store', color: '#1f8aa6' },
	{ title: 'APACHE', note: 'http server', color: '#d84f57' },
	{ title: 'NGINX', note: 'http server', color: '#28b463' },
	{ title: 'SQLITE', note: 'playground db', color: '#58a6d6' },
	{ title: 'WASM', note: 'browser php', color: '#8062ff' },
	{ title: 'GUTENBERG', note: 'block editor', color: '#2bb7ff' },
	{ title: 'PLAYGROUND', note: 'wp in browser', color: '#50d890' },
];

const hubApothem = 15.5;
const hubCircumradius = hubApothem / Math.cos(Math.PI / 8);
const hubSideLength = 2 * hubApothem * Math.tan(Math.PI / 8);
const roomWidth = hubSideLength;
const roomDepth = 13;
const wallHeight = 7.35;
const wallThickness = 0.26;
const roomDoorHalfWidth = 2.9;
const exhibitMountOffset = wallThickness / 2 + 0.035;
const exhibitFrameDepth = 0.13;
const exhibitPlaqueRecess = 0.065;
const exhibitOuterWidth = 2.72;
const exhibitOuterHeight = 2.2;
const exhibitPlaqueWidth = 2.42;
const exhibitPlaqueHeight = 1.9;
const exhibitWallMargin = 0.7;
const exhibitPreferredSpacing = exhibitOuterWidth + 0.62;
// Side-wall art uses most of the wall length but leaves the entrance bay
// clear; three frames now fit with even gaps.
const sideExhibitMinZ = -roomDepth / 2 + 2.9;
const sideExhibitMaxZ = roomDepth / 2 - exhibitOuterWidth / 2 - exhibitWallMargin;
const entryDistanceFromCenter = 5.2;
const shellPadding = 1.4;
const shellHeight = 12.4;
const portalDoorHeight = 4.45;
const portalDoorHalfWidth = 1.55;
const portalCenterOffset = 2.5;
const portalAlcoveHalfWidth = 1.55;
const portalAlcoveDepth = 4.4;
const mercantileUrl = 'https://mercantile.wordpress.org/';
const wordpressOrgUrl = 'https://wordpress.org/';
// Two doorways flank the central pier on the mural wall: enter from
// wordpress.org on the left, exit through the Mercantile gift shop on the
// right. Each opens a short themed alcove with a clickable door.
const muralPortals = [
	{
		offset: -portalCenterOffset,
		kind: 'entrance',
		title: 'ENTRANCE',
		sub: 'wordpress.org',
		url: wordpressOrgUrl,
		runner: 0x2c6fae,
		door: 0x1f6fb0,
		accent: 0x8fd0ff,
	},
	{
		offset: portalCenterOffset,
		kind: 'exit',
		title: 'EXIT',
		sub: 'Mercantile · Gift Shop',
		url: mercantileUrl,
		runner: 0xc24a2c,
		door: 0xd45a39,
		accent: 0xffd166,
	},
];
const walkSpeed = 7.2;
const arrowWalkSpeed = 9.2;
const mobileWalkSpeed = 8.8;
const sprintSpeed = 12;
const keyboardTurnSpeed = 520;
const mobileTurnSpeed = 320;
const maxMovementStep = 0.16;
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
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = isCurrentVariant ? 0.86 : 1;
	scene.background = new THREE.Color(activeVariant.scene.background);
	scene.fog = new THREE.Fog(
		activeVariant.scene.fog,
		isCurrentVariant ? 38 : 52,
		isCurrentVariant ? 105 : 118
	);

	scene.add(
		new THREE.HemisphereLight(
			activeVariant.scene.hemiSky,
			activeVariant.scene.hemiGround,
			activeVariant.scene.hemiIntensity
		)
	);
	scene.add(new THREE.AmbientLight(0xe8edff, isCurrentVariant ? 0.49 : 0.72));
	const keyLight = new THREE.DirectionalLight(0xffe2b0, 2.8);
	keyLight.intensity = activeVariant.scene.keyIntensity * (isCurrentVariant ? 0.92 : 1);
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
	group.add(createCeilingDetails(bounds));
	if (isCurrentVariant) {
		group.add(createMuralPortals());
	}
	return group;
}

function createMuralPortals() {
	const group = new THREE.Group();
	for (const portal of muralPortals) {
		group.add(createPortalAlcove(portal));
	}
	return group;
}

function createPortalAlcove(portal) {
	const group = new THREE.Group();
	const zStart = hubApothem;
	const zEnd = hubApothem + portalAlcoveDepth;
	const centerZ = (zStart + zEnd) / 2;
	const cx = portal.offset;
	const width = portalAlcoveHalfWidth * 2;
	const height = portalDoorHeight + 0.42;

	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(width, portalAlcoveDepth),
		createMuseumMaterial('roomFloor', {
			repeatX: width / floorTileSpan,
			repeatY: portalAlcoveDepth / floorTileSpan,
			roughness: 0.26,
			metalness: 0.3,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(cx, 0.015, centerZ);
	group.add(floor);

	const runner = new THREE.Mesh(
		new THREE.PlaneGeometry(width * 0.5, portalAlcoveDepth - 0.4),
		new THREE.MeshBasicMaterial({ color: portal.runner, transparent: true, opacity: 0.85, depthWrite: false })
	);
	runner.rotation.x = -Math.PI / 2;
	runner.position.set(cx, 0.06, centerZ);
	group.add(runner);

	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: portalAlcoveDepth / 4.6,
		repeatY: height / 2.4,
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
	});
	for (const sideSign of [-1, 1]) {
		const wall = new THREE.Mesh(
			new THREE.BoxGeometry(wallThickness, height, portalAlcoveDepth),
			wallMaterial
		);
		wall.position.set(cx + sideSign * (portalAlcoveHalfWidth + wallThickness / 2), height / 2, centerZ);
		group.add(wall);
	}

	const ceiling = new THREE.Mesh(
		new THREE.PlaneGeometry(width + wallThickness * 2, portalAlcoveDepth),
		new THREE.MeshStandardMaterial({ color: 0x18223a, roughness: 0.6, metalness: 0.16, side: THREE.DoubleSide })
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.set(cx, height, centerZ);
	group.add(ceiling);

	const beam = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.16, 0.13, 0.16),
		new THREE.MeshStandardMaterial({ color: 0xf2cf86, emissive: 0x3a2710, emissiveIntensity: 0.12, roughness: 0.3, metalness: 0.5 })
	);
	beam.position.set(cx, height - 0.07, centerZ);
	group.add(beam);
	const bulb = new THREE.Mesh(
		new THREE.SphereGeometry(0.12, 16, 12),
		new THREE.MeshBasicMaterial({ color: 0xffefb4 })
	);
	bulb.position.set(cx, height - 0.3, centerZ);
	group.add(bulb);
	const lamp = new THREE.PointLight(0xffe6b0, 0.95, 8.5);
	lamp.position.set(cx, height - 0.4, centerZ);
	registerAnimation(lamp, (object, elapsed) => {
		object.intensity = 0.82 + Math.sin(elapsed * 1.5) * 0.1;
	});
	group.add(lamp);

	group.add(createPortalEndWall(portal, cx, zEnd, height));
	group.add(createPortalContent(portal, cx, zStart, zEnd));
	return group;
}

function createPortalEndWall(portal, cx, zEnd, height) {
	const group = new THREE.Group();
	const wallMaterial = createMuseumMaterial('roomWall', {
		repeatX: portalAlcoveHalfWidth,
		repeatY: height / 2.4,
		color: wallWarmTint,
	});
	const wall = new THREE.Mesh(
		new THREE.BoxGeometry(portalAlcoveHalfWidth * 2 + wallThickness * 2, height, wallThickness),
		wallMaterial
	);
	wall.position.set(cx, height / 2, zEnd + wallThickness / 2);
	group.add(wall);

	const archMaterial = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x4a2810,
		emissiveIntensity: 0.32,
		roughness: 0.32,
		metalness: 0.46,
	});
	const archWidth = portalAlcoveHalfWidth * 1.74;
	const archHeight = height * 0.84;
	const archFrame = new THREE.Mesh(new THREE.BoxGeometry(archWidth + 0.3, 0.2, 0.46), archMaterial);
	archFrame.position.set(cx, archHeight + 0.18, zEnd - 0.08);
	group.add(archFrame);
	for (const xSign of [-1, 1]) {
		const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, archHeight + 0.38, 0.4), archMaterial);
		post.position.set(cx + xSign * (archWidth / 2 + 0.1), (archHeight + 0.38) / 2, zEnd - 0.08);
		group.add(post);
	}

	const door = new THREE.Mesh(
		new THREE.BoxGeometry(archWidth, archHeight, 0.18),
		new THREE.MeshStandardMaterial({ color: portal.door, emissive: new THREE.Color(portal.door).multiplyScalar(0.3), emissiveIntensity: 0.3, roughness: 0.38, metalness: 0.18 })
	);
	door.position.set(cx, archHeight / 2 + 0.05, zEnd - 0.14);
	door.userData.portalUrl = portal.url;
	group.add(door);
	pickables.push(door);

	const doorOverlay = new THREE.Mesh(
		new THREE.PlaneGeometry(archWidth - 0.16, archHeight - 0.18),
		new THREE.MeshBasicMaterial({ map: createPortalDoorTexture(portal), transparent: true, side: THREE.DoubleSide, depthWrite: false })
	);
	doorOverlay.position.set(cx, archHeight / 2 + 0.05, zEnd - 0.26);
	doorOverlay.rotation.y = Math.PI;
	group.add(doorOverlay);

	const knob = new THREE.Mesh(
		new THREE.SphereGeometry(0.09, 16, 12),
		new THREE.MeshStandardMaterial({ color: 0xfff5df, roughness: 0.3, metalness: 0.7 })
	);
	knob.position.set(cx + archWidth * 0.34, archHeight / 2 + 0.05, zEnd - 0.25);
	group.add(knob);

	const halo = new THREE.Mesh(
		new THREE.PlaneGeometry(archWidth + 1.0, archHeight + 1.2),
		new THREE.MeshBasicMaterial({ color: portal.accent, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })
	);
	halo.position.set(cx, archHeight / 2 + 0.05, zEnd - 0.4);
	registerAnimation(halo, (object, elapsed) => {
		object.material.opacity = 0.1 + (Math.sin(elapsed * 1.2) * 0.5 + 0.5) * 0.16;
	});
	group.add(halo);

	const doorLight = new THREE.PointLight(portal.accent, 1.1, 8);
	doorLight.position.set(cx, archHeight / 2 + 0.3, zEnd - 1.1);
	registerAnimation(doorLight, (object, elapsed) => {
		object.intensity = 0.9 + Math.sin(elapsed * 1.05) * 0.15;
	});
	group.add(doorLight);

	const cta = portal.kind === 'exit' ? 'CLICK TO EXIT  →' : 'CLICK TO ENTER  →';
	const ctaSign = createReadableLabel(createSimpleTextTexture(cta, '#fff5df', '#10182a'), 2.0, 0.42);
	ctaSign.position.set(cx, archHeight / 2 - archHeight * 0.42, zEnd - 0.32);
	registerAnimation(ctaSign, (object, elapsed) => {
		object.position.y = archHeight / 2 - archHeight * 0.42 + Math.sin(elapsed * 1.5) * 0.04;
	});
	group.add(ctaSign);
	return group;
}

function createPortalContent(portal, cx, zStart, zEnd) {
	const group = new THREE.Group();
	// Poster on the outer side wall of the alcove.
	const sideSign = portal.kind === 'exit' ? 1 : -1;
	const poster = new THREE.Mesh(
		new THREE.PlaneGeometry(portalAlcoveDepth - 1.6, 1.5),
		new THREE.MeshBasicMaterial({ map: createPortalPosterTexture(portal), transparent: true })
	);
	poster.position.set(cx + sideSign * (portalAlcoveHalfWidth - 0.03), 2.4, (zStart + zEnd) / 2);
	poster.rotation.y = sideSign === 1 ? -Math.PI / 2 : Math.PI / 2;
	group.add(poster);

	if (portal.kind === 'exit') {
		group.add(createGiftShopShelf(cx, zStart, zEnd));
	} else {
		group.add(createDownloadPlinth(cx, zStart + 1.8));
	}
	return group;
}

function createGiftShopShelf(cx, zStart, zEnd) {
	const group = new THREE.Group();
	const shelfMat = new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.64 });
	const items = [
		{ z: zStart + 1.5, color: 0xffd166, label: 'TEE' },
		{ z: zStart + 2.85, color: 0x2bb7ff, label: 'PIN' },
	];
	const x = cx - (portalAlcoveHalfWidth - 0.34);
	for (const item of items) {
		const support = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.94, 0.5), shelfMat);
		support.position.set(x, 0.47, item.z);
		group.add(support);
		const merch = new THREE.Mesh(
			new THREE.BoxGeometry(0.34, 0.32, 0.4),
			new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.55 })
		);
		merch.position.set(x, 1.12, item.z);
		merch.rotation.y = 0.2;
		group.add(merch);
		const tag = createReadableLabel(createSmallSignTexture(item.label, '#0e1c2e'), 0.34, 0.12);
		tag.position.set(x + 0.2, 1.14, item.z);
		tag.rotation.y = Math.PI / 2;
		group.add(tag);
	}
	// Wapuu plushie display on a small plinth.
	const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), shelfMat);
	plinth.position.set(cx + (portalAlcoveHalfWidth - 0.4), 0.25, zStart + 2.2);
	group.add(plinth);
	const plushie = createWapuu3D({ height: 0.55, accent: 0xffd166 });
	plushie.position.set(cx + (portalAlcoveHalfWidth - 0.4), 0.5, zStart + 2.2);
	plushie.rotation.y = -Math.PI / 2 - 0.2;
	group.add(plushie);
	const tag = createReadableLabel(createSmallSignTexture('WAPUU', '#0e1c2e'), 0.5, 0.14);
	tag.position.set(cx + (portalAlcoveHalfWidth - 0.62), 0.62, zStart + 2.2);
	tag.rotation.y = Math.PI / 2;
	group.add(tag);
	return group;
}

function createDownloadPlinth(cx, z) {
	const group = new THREE.Group();
	group.add(createPedestal(0.9, 0.5, 0x2bb7ff));
	const base = group.children[0];
	base.position.set(cx, 0, z);
	// Glowing WordPress download orb.
	const orb = new THREE.Mesh(
		new THREE.SphereGeometry(0.26, 24, 18),
		new THREE.MeshStandardMaterial({ color: 0x1e6a93, emissive: 0x1e6a93, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.2 })
	);
	orb.position.set(cx, 0.82, z);
	registerAnimation(orb, (object, elapsed) => {
		object.position.y = 0.82 + Math.sin(elapsed * 1.4) * 0.05;
		object.rotation.y = elapsed * 0.5;
	});
	group.add(orb);
	const mark = new THREE.Mesh(
		new THREE.PlaneGeometry(0.34, 0.34),
		new THREE.MeshBasicMaterial({ map: createWapuuWordmarkTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide })
	);
	mark.position.set(cx, 0.82, z + 0.27);
	registerAnimation(mark, (object, elapsed) => {
		object.position.y = 0.82 + Math.sin(elapsed * 1.4) * 0.05;
	});
	group.add(mark);
	const tag = createReadableLabel(createSimpleTextTexture('GET WORDPRESS · FREE', '#0e1c2e', '#ffd166'), 1.2, 0.26);
	tag.position.set(cx, 0.58, z - 0.46);
	group.add(tag);
	return group;
}

function createPortalDoorTexture(portal) {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 1024;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	for (let y = 0; y < canvas.height; y += 8) {
		ctx.fillStyle = `rgba(255, 245, 223, ${y % 16 === 0 ? 0.06 : 0.02})`;
		ctx.fillRect(0, y, canvas.width, 2);
	}
	ctx.globalAlpha = 0.16;
	ctx.strokeStyle = '#fff5df';
	ctx.lineWidth = 6;
	for (let i = 0; i < 2; i++) {
		ctx.strokeRect(60 + i * 40, 120 + i * 80, canvas.width - 120 - i * 80, canvas.height - 320 - i * 160);
	}
	ctx.globalAlpha = 1;
	const accent = '#' + new THREE.Color(portal.accent).getHexString();
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 110px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(portal.kind === 'exit' ? 'EXIT' : 'ENTER', canvas.width / 2, 230);
	ctx.fillStyle = accent;
	ctx.font = '900 220px Arial Black, Impact, sans-serif';
	ctx.fillText('→', canvas.width / 2, 600);
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 52px Arial Black, Impact, sans-serif';
	ctx.fillText(portal.kind === 'exit' ? 'MERCANTILE' : 'WORDPRESS.ORG', canvas.width / 2, 800);
	ctx.font = '500 28px ui-monospace, Menlo, monospace';
	ctx.fillText(portal.url.replace('https://', '').replace(/\/$/, ''), canvas.width / 2, 870);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createPortalPosterTexture(portal) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 320;
	const ctx = canvas.getContext('2d');
	const accent = '#' + new THREE.Color(portal.accent).getHexString();
	const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
	grad.addColorStop(0, '#0e1c2e');
	grad.addColorStop(1, '#0a1422');
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	for (let index = 0; index < 9; index++) {
		ctx.fillStyle = accent;
		ctx.globalAlpha = 0.12;
		ctx.beginPath();
		ctx.arc(100 + index * 110, 160, 40 + (index % 3) * 16, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
	ctx.textAlign = 'center';
	if (portal.kind === 'exit') {
		ctx.fillStyle = accent;
		ctx.font = '900 104px Arial Black, Impact, sans-serif';
		ctx.fillText('GIFT SHOP', 512, 130);
		ctx.fillStyle = '#fff5df';
		ctx.font = '700 40px system-ui, sans-serif';
		ctx.fillText('tees · stickers · tote bags · wapuu plushies', 512, 210);
		ctx.fillStyle = accent;
		ctx.font = '600 26px ui-monospace, Menlo, monospace';
		ctx.fillText('mercantile.wordpress.org', 512, 268);
	} else {
		ctx.fillStyle = accent;
		ctx.font = '900 96px Arial Black, Impact, sans-serif';
		ctx.fillText('WELCOME', 512, 124);
		ctx.fillStyle = '#fff5df';
		ctx.font = '700 38px system-ui, sans-serif';
		ctx.fillText('Free & open-source · the five-minute install', 512, 204);
		ctx.fillStyle = accent;
		ctx.font = '600 26px ui-monospace, Menlo, monospace';
		ctx.fillText('“Code is poetry.”', 512, 264);
	}
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createSimpleTextTexture(text, color, bg) {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 160;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = bg || '#0e1c2e';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color || '#fff5df';
	ctx.font = '900 76px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, canvas.width / 2, canvas.height / 2);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
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

function getWapuuTexture() {
	if (!wapuuTexture) {
		const canvas = document.createElement('canvas');
		canvas.width = 1024;
		canvas.height = Math.round(canvas.width * (66 / 60));
		const texture = new THREE.CanvasTexture(canvas);
		const image = new Image();
		image.decoding = 'async';
		image.addEventListener(
			'load',
			() => {
				const ctx = canvas.getContext('2d');
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
				texture.needsUpdate = true;
			},
			{ once: true }
		);
		image.src = './assets/wapuu/wapuu-original.svg';
		wapuuTexture = texture;
		wapuuTexture.colorSpace = THREE.SRGBColorSpace;
		wapuuTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
	}
	return wapuuTexture;
}

function getTextureCanvas(name) {
	if (textureCanvases.has(name)) {
		return textureCanvases.get(name);
	}

	const canvas = document.createElement('canvas');
	const isFloor = name === 'atriumFloor' || name === 'roomFloor';
	canvas.width = isFloor ? 1024 : 512;
	canvas.height = isFloor ? 1024 : 512;
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
	drawMonumentalFloor(ctx, width, height);
}

function drawAtriumFloorTexture(ctx, width, height) {
	if (!isCurrentVariant) {
		drawVariantTexture(ctx, width, height, activeVariant.floor, 'atrium');
		drawAtriumRings(ctx, width, height, activeVariant.eraColors[0]);
		return;
	}
	drawMonumentalFloor(ctx, width, height);
}

// Large polished DARK marble slabs in two near-black tones, laid as a 2x2
// checkerboard that tiles seamlessly. Brass grout separates the slabs;
// gold/white veining and a glossy sheen evoke a grand black-marble lobby
// that contrasts the light limestone walls.
function drawMonumentalFloor(ctx, width, height) {
	const grout = '#0c0d12';
	const tones = ['#24262e', '#1b1d24'];
	ctx.fillStyle = grout;
	ctx.fillRect(0, 0, width, height);

	const cell = width / 2;
	const gap = Math.max(4, width * 0.008);
	for (let row = 0; row < 2; row++) {
		for (let col = 0; col < 2; col++) {
			const tone = tones[(row + col) % 2];
			const x = col * cell + gap / 2;
			const y = row * cell + gap / 2;
			const size = cell - gap;
			drawMarbleSlab(ctx, x, y, size, tone);
		}
	}
}

function drawMarbleSlab(ctx, x, y, size, tone) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, size, size);
	ctx.clip();

	const base = new THREE.Color(tone);
	ctx.fillStyle = `#${base.getHexString()}`;
	ctx.fillRect(x, y, size, size);

	// Glossy diagonal sheen — a bright streak fading to deep shadow.
	const sheen = ctx.createLinearGradient(x, y, x + size, y + size);
	sheen.addColorStop(0, 'rgba(150, 170, 200, 0.22)');
	sheen.addColorStop(0.42, 'rgba(120, 140, 170, 0.05)');
	sheen.addColorStop(0.6, 'rgba(0, 0, 0, 0.18)');
	sheen.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
	ctx.fillStyle = sheen;
	ctx.fillRect(x, y, size, size);

	// Gold and pale veins.
	const veinCount = 6;
	for (let index = 0; index < veinCount; index++) {
		const seed = x * 0.013 + y * 0.017 + index * 1.7;
		const startX = x + (pseudoRandom(seed) * 0.9 + 0.05) * size;
		const startY = y + (index / veinCount) * size;
		ctx.beginPath();
		ctx.moveTo(startX, startY);
		let cx = startX;
		let cy = startY;
		for (let step = 0; step < 5; step++) {
			cx += (pseudoRandom(seed + step) - 0.5) * size * 0.55;
			cy += size * 0.18;
			ctx.lineTo(cx, cy);
		}
		ctx.strokeStyle = index % 3 === 0
			? 'rgba(201, 169, 97, 0.34)'
			: 'rgba(206, 214, 226, 0.16)';
		ctx.lineWidth = index % 3 === 0 ? 1.6 : 1.0;
		ctx.stroke();
	}

	// Subtle inner bevel highlight + shadow for a cut-stone edge.
	ctx.strokeStyle = 'rgba(180, 195, 215, 0.2)';
	ctx.lineWidth = 2;
	ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
	ctx.strokeStyle = 'rgba(120, 104, 74, 0.18)';
	ctx.strokeRect(x + 5, y + 5, size - 10, size - 10);
	ctx.restore();
}

function drawAtriumFloorTextureLegacy(ctx, width, height) {
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
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
	});
}

function createCeiling(bounds) {
	const group = new THREE.Group();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;

	if (!isCurrentVariant) {
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

	// Flat glazed roof over the room wings, with an octagonal opening over
	// the rotunda so visitors look up into a glass cathedral dome.
	const shape = new THREE.Shape();
	shape.moveTo(bounds.minX, bounds.minZ);
	shape.lineTo(bounds.maxX, bounds.minZ);
	shape.lineTo(bounds.maxX, bounds.maxZ);
	shape.lineTo(bounds.minX, bounds.maxZ);
	shape.closePath();
	const hole = new THREE.Path();
	const holeRadius = hubCircumradius + 0.35;
	for (let index = 0; index <= 8; index++) {
		const angle = Math.PI / 8 + (index * Math.PI) / 4;
		const px = centerX + Math.cos(angle) * holeRadius;
		const pz = centerZ + Math.sin(angle) * holeRadius;
		if (index === 0) {
			hole.moveTo(px, pz);
		} else {
			hole.lineTo(px, pz);
		}
	}
	shape.holes.push(hole);
	const roof = new THREE.Mesh(
		new THREE.ShapeGeometry(shape),
		new THREE.MeshBasicMaterial({
			color: 0xdfeeff,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	roof.rotation.x = Math.PI / 2;
	roof.position.set(0, shellHeight, 0);
	group.add(roof);

	group.add(createAtriumGlassDome(centerX, centerZ));
	return group;
}

// A faceted octagonal glass cupola that rises above the rotunda opening,
// echoing the brass rib structure below and crowned by a glowing lantern.
function createAtriumGlassDome(centerX, centerZ) {
	const group = new THREE.Group();
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.12,
		roughness: 0.3,
		metalness: 0.55,
	});
	const baseY = shellHeight - 0.25;
	const rings = [
		{ y: baseY, r: hubCircumradius + 0.1 },
		{ y: baseY + 1.8, r: (hubCircumradius + 0.1) * 0.72 },
		{ y: baseY + 3.2, r: (hubCircumradius + 0.1) * 0.42 },
		{ y: baseY + 4.2, r: 1.5 },
	];

	// Glass facets between successive rings (8-sided open frusta).
	for (let i = 0; i < rings.length - 1; i++) {
		const lower = rings[i];
		const upper = rings[i + 1];
		const height = upper.y - lower.y;
		const facets = new THREE.Mesh(
			new THREE.CylinderGeometry(upper.r, lower.r, height, 8, 1, true, Math.PI / 8),
			new THREE.MeshBasicMaterial({
				color: 0xd6ecff,
				transparent: true,
				opacity: 0.34,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		facets.position.set(centerX, (lower.y + upper.y) / 2, centerZ);
		group.add(facets);
	}

	// Brass glazing bars: vertical ribs at the 8 corners + horizontal rings.
	for (let k = 0; k < 8; k++) {
		const angle = Math.PI / 8 + (k * Math.PI) / 4;
		for (let i = 0; i < rings.length - 1; i++) {
			const lower = rings[i];
			const upper = rings[i + 1];
			const p0 = new THREE.Vector3(centerX + Math.cos(angle) * lower.r, lower.y, centerZ + Math.sin(angle) * lower.r);
			const p1 = new THREE.Vector3(centerX + Math.cos(angle) * upper.r, upper.y, centerZ + Math.sin(angle) * upper.r);
			group.add(createCylinderBetween(p0, p1, 0.05, brass, 6));
		}
	}
	for (const ring of rings) {
		for (let k = 0; k < 8; k++) {
			const a0 = Math.PI / 8 + (k * Math.PI) / 4;
			const a1 = Math.PI / 8 + ((k + 1) * Math.PI) / 4;
			const p0 = new THREE.Vector3(centerX + Math.cos(a0) * ring.r, ring.y, centerZ + Math.sin(a0) * ring.r);
			const p1 = new THREE.Vector3(centerX + Math.cos(a1) * ring.r, ring.y, centerZ + Math.sin(a1) * ring.r);
			group.add(createCylinderBetween(p0, p1, 0.04, brass, 6));
		}
	}

	// Glowing lantern at the crown.
	const crown = rings[rings.length - 1];
	const skyCap = new THREE.Mesh(
		new THREE.CircleGeometry(crown.r * 1.25, 24),
		new THREE.MeshBasicMaterial({ color: 0xfff3da, side: THREE.DoubleSide })
	);
	skyCap.rotation.x = Math.PI / 2;
	skyCap.position.set(centerX, crown.y + 0.25, centerZ);
	group.add(skyCap);
	const finial = new THREE.Mesh(
		new THREE.SphereGeometry(0.22, 18, 12),
		new THREE.MeshStandardMaterial({ color: 0xf2cf86, emissive: 0xffd166, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.5 })
	);
	finial.position.set(centerX, crown.y + 0.5, centerZ);
	group.add(finial);
	const lantern = new THREE.PointLight(0xfff0d0, 0.85, 34);
	lantern.position.set(centerX, crown.y - 0.8, centerZ);
	registerAnimation(lantern, (object, elapsed) => {
		object.intensity = 0.74 + Math.sin(elapsed * 0.7) * 0.1;
	});
	group.add(lantern);
	return group;
}

function createCeilingDetails(bounds) {
	const group = new THREE.Group();
	const width = bounds.maxX - bounds.minX;
	const depth = bounds.maxZ - bounds.minZ;
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const beamMaterial = new THREE.MeshStandardMaterial({
		color: isCurrentVariant ? 0xd8d2c4 : 0x273247,
		roughness: 0.38,
		metalness: isCurrentVariant ? 0.34 : 0.18,
	});
	const skylightMaterial = new THREE.MeshBasicMaterial({
		color: isCurrentVariant ? 0xbfeaff : activeVariant.eraColors[2],
		transparent: true,
		opacity: isCurrentVariant ? 0.24 : 0.13,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const railY = shellHeight - 0.12;

	if (isCurrentVariant) {
		group.add(createGrandCeilingOculus(bounds));
		group.add(createCathedralVaultSystem(bounds));
		group.add(createCathedralRoseWindow(bounds));
		group.add(createCathedralLightShafts(bounds));
		group.add(createCathedralEraBanners(bounds));
		group.add(createCathedralDustMotes(bounds));
		group.add(createOpenSourceConstellation());
	}

	[-width * 0.28, 0, width * 0.28].forEach((xOffset) => {
		const skylight = new THREE.Mesh(
			new THREE.PlaneGeometry(Math.min(width * 0.18, 9), depth * 0.72),
			skylightMaterial
		);
		skylight.rotation.x = Math.PI / 2;
		skylight.position.set(centerX + xOffset, shellHeight - 0.035, centerZ);
		group.add(skylight);
	});

	for (let index = -3; index <= 3; index++) {
		const z = centerZ + (index * depth) / 7;
		const crossBeam = new THREE.Mesh(
			new THREE.BoxGeometry(width * 0.92, 0.16, 0.2),
			beamMaterial
		);
		crossBeam.position.set(centerX, railY, z);
		group.add(crossBeam);
		if (isCurrentVariant) {
			const brassLine = new THREE.Mesh(
				new THREE.BoxGeometry(width * 0.88, 0.028, 0.045),
				new THREE.MeshBasicMaterial({ color: 0xf6d48b, transparent: true, opacity: 0.72 })
			);
			brassLine.position.set(centerX, railY - 0.11, z);
			group.add(brassLine);
		}
	}
	for (let index = -2; index <= 2; index++) {
		const x = centerX + (index * width) / 6;
		const longBeam = new THREE.Mesh(
			new THREE.BoxGeometry(0.2, 0.14, depth * 0.88),
			beamMaterial
		);
		longBeam.position.set(x, railY + 0.02, centerZ);
		group.add(longBeam);
		if (isCurrentVariant) {
			const brassLine = new THREE.Mesh(
				new THREE.BoxGeometry(0.045, 0.028, depth * 0.84),
				new THREE.MeshBasicMaterial({ color: 0xf6d48b, transparent: true, opacity: 0.68 })
			);
			brassLine.position.set(x, railY - 0.09, centerZ);
			group.add(brassLine);
		}
	}

	if (isCurrentVariant) {
		const warmLight = new THREE.PointLight(0xfff1cc, 1.35, 36);
		warmLight.position.set(centerX, shellHeight - 1.1, centerZ);
		group.add(warmLight);
		registerAnimation(warmLight, (light, elapsed) => {
			light.intensity = 1.18 + Math.sin(elapsed * 0.8) * 0.12;
		});
	}
	return group;
}

function createGrandCeilingOculus(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const y = shellHeight - 0.34;
	const glassMaterial = new THREE.MeshBasicMaterial({
		color: 0xbfeaff,
		transparent: true,
		opacity: 0.24,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2cf86,
		emissive: 0x35220a,
		emissiveIntensity: 0.1,
		roughness: 0.28,
		metalness: 0.55,
	});
	const blueMaterial = new THREE.MeshBasicMaterial({
		color: activeVariant.eraColors[2],
		transparent: true,
		opacity: 0.45,
		side: THREE.DoubleSide,
		depthWrite: false,
	});

	const glass = new THREE.Mesh(new THREE.CircleGeometry(5.8, 96), glassMaterial);
	glass.rotation.x = Math.PI / 2;
	glass.position.set(centerX, y + 0.015, centerZ);
	group.add(glass);

	const domeRings = [
		{ radius: 1.55, yOffset: -1.04 },
		{ radius: 2.7, yOffset: -0.78 },
		{ radius: 3.85, yOffset: -0.5 },
		{ radius: 5.0, yOffset: -0.23 },
	];
	domeRings.forEach((spec, index) => {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(spec.radius, 0.028, 8, 90),
			brassMaterial
		);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(centerX, y + spec.yOffset, centerZ);
		group.add(ring);

		if (index > 0) {
			const previous = domeRings[index - 1];
			for (let spokeIndex = 0; spokeIndex < 12; spokeIndex++) {
				const angle = (Math.PI * 2 * spokeIndex) / 12 + index * 0.08;
				const start = new THREE.Vector3(
					centerX + Math.cos(angle) * previous.radius,
					y + previous.yOffset,
					centerZ + Math.sin(angle) * previous.radius
				);
				const end = new THREE.Vector3(
					centerX + Math.cos(angle) * spec.radius,
					y + spec.yOffset,
					centerZ + Math.sin(angle) * spec.radius
				);
				group.add(createCylinderBetween(start, end, 0.012, brassMaterial, 8));
			}
		}
	});

	[3.15, 4.35, 5.75].forEach((radius, index) => {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035 + index * 0.008, 10, 96), brassMaterial);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(centerX, y - index * 0.045, centerZ);
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = elapsed * (0.035 + index * 0.012) * (index % 2 ? -1 : 1);
		});
		group.add(ring);
	});

	for (let index = 0; index < 16; index++) {
		const angle = (Math.PI * 2 * index) / 16;
		const rib = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 5.55), brassMaterial);
		rib.position.set(centerX + Math.cos(angle) * 1.42, y - 0.08, centerZ + Math.sin(angle) * 1.42);
		rib.rotation.y = -angle;
		group.add(rib);
	}

	for (let index = 0; index < 10; index++) {
		const angle = (Math.PI * 2 * index) / 10 + Math.PI / 10;
		const pane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 1.2), blueMaterial.clone());
		pane.position.set(centerX + Math.cos(angle) * 4.72, y - 0.03, centerZ + Math.sin(angle) * 4.72);
		pane.rotation.y = -angle;
		registerAnimation(pane, (object, elapsed) => {
			object.material.opacity = 0.3 + Math.sin(elapsed * 1.1 + index) * 0.1;
		});
		group.add(pane);
	}

	[
		[activeVariant.eraColors[0], -3.4, -2.6],
		[activeVariant.eraColors[2], 3.5, -2.4],
		[activeVariant.eraColors[4], -3.3, 2.8],
		[activeVariant.eraColors[6], 3.4, 2.7],
	].forEach(([color, x, z], index) => {
		const beam = createCeilingBeamCone(color, 1.55, 5.65, 0.045, centerX + x, centerZ + z);
		registerAnimation(beam, (object, elapsed) => {
			object.material.opacity = 0.035 + Math.sin(elapsed * 1.25 + index) * 0.012;
			object.rotation.y = elapsed * 0.045 + index;
		});
		group.add(beam);
	});

	const coreLight = new THREE.PointLight(0xfff0c8, 0.95, 20);
	coreLight.position.set(centerX, shellHeight - 1.7, centerZ);
	registerAnimation(coreLight, (object, elapsed) => {
		object.intensity = 0.8 + Math.sin(elapsed * 0.85) * 0.1;
	});
	group.add(coreLight);
	return group;
}

function createCathedralVaultSystem(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const springY = wallHeight + 0.42;
	const crownY = shellHeight - 0.78;
	const vaultRadius = hubApothem - 1.05;
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2cf86,
		emissive: 0x2a1806,
		emissiveIntensity: 0.08,
		roughness: 0.28,
		metalness: 0.56,
	});
	const limestoneMaterial = new THREE.MeshStandardMaterial({
		color: 0xf3ead8,
		roughness: 0.78,
		metalness: 0.03,
	});
	const shadowMaterial = new THREE.MeshBasicMaterial({
		color: 0x182237,
		transparent: true,
		opacity: 0.13,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const glassMaterial = new THREE.MeshBasicMaterial({
		color: 0xbfeaff,
		transparent: true,
		opacity: 0.115,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const coloredGlassMaterial = new THREE.MeshBasicMaterial({
		color: activeVariant.eraColors[2],
		transparent: true,
		opacity: 0.24,
		side: THREE.DoubleSide,
		depthWrite: false,
	});

	const vaultSkin = new THREE.Mesh(
		new THREE.ConeGeometry(vaultRadius, crownY - springY, 8, 1, true, Math.PI / 8),
		shadowMaterial
	);
	vaultSkin.position.set(centerX, (crownY + springY) / 2, centerZ);
	vaultSkin.rotation.y = Math.PI / 8;
	group.add(vaultSkin);

	group.add(createAtriumCorniceRing(limestoneMaterial, brassMaterial));
	hubSides.forEach((side, index) => {
		group.add(createAtriumPointedArch(side, index, coloredGlassMaterial, brassMaterial, limestoneMaterial));
	});

	const crown = new THREE.Vector3(centerX, crownY, centerZ);
	for (let index = 0; index < 16; index++) {
		const angle = Math.PI / 8 + (Math.PI * 2 * index) / 16;
		const start = new THREE.Vector3(
			centerX + Math.cos(angle) * vaultRadius,
			springY,
			centerZ + Math.sin(angle) * vaultRadius
		);
		const control = new THREE.Vector3(
			centerX + Math.cos(angle) * vaultRadius * 0.48,
			crownY + 0.16,
			centerZ + Math.sin(angle) * vaultRadius * 0.48
		);
		const rib = createVaultRib(start, control, crown, index % 2 ? 0.042 : 0.055, brassMaterial, 52);
		group.add(rib);
	}

	for (let index = 0; index < 8; index++) {
		const angle = Math.PI / 8 + (Math.PI * 2 * index) / 8;
		const start = new THREE.Vector3(
			centerX + Math.cos(angle) * vaultRadius,
			springY + 0.04,
			centerZ + Math.sin(angle) * vaultRadius
		);
		const end = new THREE.Vector3(
			centerX - Math.cos(angle) * vaultRadius,
			springY + 0.04,
			centerZ - Math.sin(angle) * vaultRadius
		);
		const control = new THREE.Vector3(centerX, crownY - 0.08 + (index % 2) * 0.22, centerZ);
		group.add(createVaultRib(start, control, end, 0.035, brassMaterial, 64));
	}

	for (let index = 0; index < 8; index++) {
		const angle = Math.PI / 8 + (Math.PI * 2 * index) / 8;
		const pane = createVaultGlowPane(angle, vaultRadius, springY, crownY, activeVariant.eraColors[index % activeVariant.eraColors.length]);
		registerAnimation(pane, (object, elapsed) => {
			object.material.opacity = 0.045 + Math.sin(elapsed * 0.9 + index) * 0.016;
		});
		group.add(pane);
	}

	group.add(createCathedralKeystoneChandelier(centerX, centerZ, springY, crownY, brassMaterial, glassMaterial));
	return group;
}

function createAtriumCorniceRing(limestoneMaterial, brassMaterial) {
	const group = new THREE.Group();
	for (const side of hubSides) {
		for (const spec of [
			{ y: wallHeight + 0.12, height: 0.28, depth: 0.34, material: limestoneMaterial },
			{ y: wallHeight + 0.42, height: 0.055, depth: 0.42, material: brassMaterial },
			{ y: shellHeight - 2.74, height: 0.18, depth: 0.28, material: limestoneMaterial },
			{ y: shellHeight - 2.52, height: 0.05, depth: 0.36, material: brassMaterial },
		]) {
			const cornice = new THREE.Mesh(
				new THREE.BoxGeometry(hubSideLength * 0.94, spec.height, spec.depth),
				spec.material
			);
			cornice.position
				.copy(side.midpoint)
				.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.16));
			cornice.position.y = spec.y;
			cornice.rotation.y = getRotationForNormal(side.normal);
			group.add(cornice);
		}
	}
	return group;
}

function createAtriumPointedArch(side, index, glassMaterial, brassMaterial, limestoneMaterial) {
	const group = new THREE.Group();
	const isMural = side.kind === 'mural';
	const width = isMural ? hubSideLength * 0.74 : roomDoorHalfWidth * 1.82;
	const baseY = wallHeight + 0.36;
	const archHeight = shellHeight - baseY - 2.0;
	const inset = side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.22);
	const midpoint = side.midpoint.clone().add(inset);
	const archMaterial = glassMaterial.clone();
	archMaterial.color.set(activeVariant.eraColors[index % activeVariant.eraColors.length]);
	archMaterial.opacity = isMural ? 0.19 : 0.15;

	const panel = new THREE.Mesh(createPointedArchGeometry(width, archHeight, 0.88), archMaterial);
	panel.position.copy(midpoint);
	panel.position.y = baseY;
	panel.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	group.add(panel);

	const start = midpoint.clone().add(side.tangent.clone().multiplyScalar(-width / 2));
	start.y = baseY;
	const end = midpoint.clone().add(side.tangent.clone().multiplyScalar(width / 2));
	end.y = baseY;
	const control = midpoint.clone().add(side.normal.clone().multiplyScalar(-0.16));
	control.y = baseY + archHeight + 0.15;
	group.add(createVaultRib(start, control, end, 0.046, brassMaterial, 48));

	for (const offset of [-width * 0.24, 0, width * 0.24]) {
		const mullionStart = midpoint.clone().add(side.tangent.clone().multiplyScalar(offset));
		mullionStart.y = baseY - 0.78;
		const mullionEnd = midpoint.clone().add(side.tangent.clone().multiplyScalar(offset * 0.52));
		mullionEnd.y = baseY + archHeight * (offset === 0 ? 0.95 : 0.66);
		group.add(createCylinderBetween(mullionStart, mullionEnd, offset === 0 ? 0.026 : 0.018, brassMaterial, 8));
	}

	if (!isMural) {
		const threshold = new THREE.Mesh(
			new THREE.BoxGeometry(width + 0.5, 0.14, 0.34),
			limestoneMaterial
		);
		threshold.position.copy(midpoint);
		threshold.position.y = wallHeight + 0.02;
		threshold.rotation.y = getRotationForNormal(side.normal);
		group.add(threshold);
	}
	return group;
}

function createPointedArchGeometry(width, height, baseDrop) {
	const halfWidth = width / 2;
	const shape = new THREE.Shape();
	shape.moveTo(-halfWidth, -baseDrop);
	shape.lineTo(-halfWidth, 0);
	shape.quadraticCurveTo(-halfWidth * 0.9, height * 0.7, 0, height);
	shape.quadraticCurveTo(halfWidth * 0.9, height * 0.7, halfWidth, 0);
	shape.lineTo(halfWidth, -baseDrop);
	shape.lineTo(-halfWidth, -baseDrop);
	return new THREE.ShapeGeometry(shape, 18);
}

function createVaultGlowPane(angle, radius, springY, crownY, color) {
	const pane = new THREE.Mesh(
		new THREE.PlaneGeometry(2.1, crownY - springY - 0.9),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.045,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	pane.position.set(
		Math.cos(angle) * radius * 0.56,
		(springY + crownY) / 2 - 0.18,
		Math.sin(angle) * radius * 0.56
	);
	pane.rotation.y = -angle + Math.PI / 2;
	pane.rotation.z = Math.sin(angle) * 0.34;
	return pane;
}

function createCathedralKeystoneChandelier(centerX, centerZ, springY, crownY, brassMaterial, glassMaterial) {
	const group = new THREE.Group();
	const chainMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.58,
	});
	const crystalMaterial = new THREE.MeshBasicMaterial({
		color: 0xbfeaff,
		transparent: true,
		opacity: 0.64,
		depthWrite: false,
	});
	const top = new THREE.Vector3(centerX, crownY + 0.02, centerZ);
	const hanger = new THREE.Vector3(centerX, springY + 1.25, centerZ);
	group.add(createCylinderBetween(top, hanger, 0.016, chainMaterial, 8));

	[0.68, 1.12, 1.72].forEach((radius, ringIndex) => {
		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(radius, 0.026 + ringIndex * 0.004, 8, 80),
			brassMaterial
		);
		ring.rotation.x = Math.PI / 2;
		ring.position.set(centerX, hanger.y - ringIndex * 0.32, centerZ);
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = elapsed * (0.11 + ringIndex * 0.045) * (ringIndex % 2 ? -1 : 1);
		});
		group.add(ring);

		for (let index = 0; index < 10 + ringIndex * 4; index++) {
			const angle = (Math.PI * 2 * index) / (10 + ringIndex * 4) + ringIndex * 0.14;
			const anchor = new THREE.Vector3(
				centerX + Math.cos(angle) * radius,
				ring.position.y,
				centerZ + Math.sin(angle) * radius
			);
			const crystal = new THREE.Mesh(
				new THREE.OctahedronGeometry(0.055 + ringIndex * 0.018, 0),
				crystalMaterial.clone()
			);
			crystal.material.color.set(activeVariant.eraColors[(index + ringIndex) % activeVariant.eraColors.length]);
			crystal.position.copy(anchor);
			crystal.position.y -= 0.28 + (index % 3) * 0.08;
			group.add(createCylinderBetween(anchor, crystal.position, 0.006, chainMaterial, 6));
			registerAnimation(crystal, (object, elapsed) => {
				object.rotation.y = elapsed * (0.7 + ringIndex * 0.18) + index;
				object.position.y = anchor.y - 0.28 - (index % 3) * 0.08 + Math.sin(elapsed * 1.4 + index) * 0.035;
				object.material.opacity = 0.52 + Math.sin(elapsed * 1.8 + index) * 0.12;
			});
			group.add(crystal);
		}
	});

	const core = new THREE.Mesh(
		new THREE.IcosahedronGeometry(0.28, 1),
		new THREE.MeshStandardMaterial({
			color: 0xfff5df,
			emissive: 0xffd166,
			emissiveIntensity: 0.35,
			roughness: 0.22,
			metalness: 0.18,
		})
	);
	core.position.copy(hanger);
	core.position.y += 0.08;
	registerAnimation(core, (object, elapsed) => {
		object.rotation.x = elapsed * 0.4;
		object.rotation.y = elapsed * 0.62;
		object.scale.setScalar(1 + Math.sin(elapsed * 1.3) * 0.04);
	});
	group.add(core);

	const halo = new THREE.Mesh(new THREE.TorusGeometry(2.18, 0.018, 8, 96), glassMaterial.clone());
	halo.rotation.x = Math.PI / 2;
	halo.position.set(centerX, hanger.y + 0.24, centerZ);
	registerAnimation(halo, (object, elapsed) => {
		object.rotation.z = elapsed * -0.08;
		object.material.opacity = 0.13 + Math.sin(elapsed * 0.8) * 0.035;
	});
	group.add(halo);

	const light = new THREE.PointLight(0xffe5a8, 1.6, 20);
	light.position.copy(hanger);
	registerAnimation(light, (object, elapsed) => {
		object.intensity = 1.38 + Math.sin(elapsed * 1.2) * 0.16;
	});
	group.add(light);
	return group;
}

function createVaultRib(start, control, end, radius, material, segments = 56) {
	const curve = new THREE.QuadraticBezierCurve3(start, control, end);
	return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 10, false), material);
}

function createCeilingBeamCone(color, radius, height, opacity, x, z) {
	const cone = new THREE.Mesh(
		new THREE.ConeGeometry(radius, height, 36, 1, true),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	cone.position.set(x, shellHeight - height / 2 - 0.58, z);
	return cone;
}

function createCathedralRoseWindow(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const y = shellHeight - 0.42;

	const rose = new THREE.Mesh(
		new THREE.CircleGeometry(5.4, 96),
		new THREE.MeshBasicMaterial({
			map: createRoseWindowTexture(),
			transparent: true,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	rose.rotation.x = Math.PI / 2;
	rose.position.set(centerX, y, centerZ);
	registerAnimation(rose, (object, elapsed) => {
		object.rotation.z = elapsed * 0.04;
	});
	group.add(rose);

	const counterRose = new THREE.Mesh(
		new THREE.CircleGeometry(4.6, 80),
		new THREE.MeshBasicMaterial({
			map: createRoseWindowTexture(true),
			transparent: true,
			side: THREE.DoubleSide,
			opacity: 0.78,
			depthWrite: false,
		})
	);
	counterRose.rotation.x = Math.PI / 2;
	counterRose.position.set(centerX, y - 0.04, centerZ);
	registerAnimation(counterRose, (object, elapsed) => {
		object.rotation.z = -elapsed * 0.07;
	});
	group.add(counterRose);

	const brass = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x402208,
		emissiveIntensity: 0.18,
		roughness: 0.28,
		metalness: 0.6,
	});
	const outer = new THREE.Mesh(
		new THREE.TorusGeometry(5.4, 0.092, 14, 96),
		brass
	);
	outer.rotation.x = Math.PI / 2;
	outer.position.set(centerX, y, centerZ);
	group.add(outer);
	const inner = new THREE.Mesh(
		new THREE.TorusGeometry(2.1, 0.046, 12, 72),
		brass
	);
	inner.rotation.x = Math.PI / 2;
	inner.position.set(centerX, y - 0.03, centerZ);
	group.add(inner);

	for (let index = 0; index < 12; index++) {
		const angle = (Math.PI * 2 * index) / 12;
		const spoke = new THREE.Mesh(
			new THREE.BoxGeometry(0.054, 0.04, 3.2),
			brass
		);
		spoke.position.set(centerX, y - 0.045, centerZ);
		spoke.rotation.y = -angle;
		spoke.position.x = centerX + Math.cos(angle) * 3.65;
		spoke.position.z = centerZ + Math.sin(angle) * 3.65;
		group.add(spoke);
	}

	return group;
}

function createRoseWindowTexture(inverted = false) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 1024;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const cx = canvas.width / 2;
	const cy = canvas.height / 2;

	const baseGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 512);
	baseGrad.addColorStop(0, 'rgba(255, 245, 200, 0.95)');
	baseGrad.addColorStop(0.4, 'rgba(255, 209, 102, 0.45)');
	baseGrad.addColorStop(1, 'rgba(43, 183, 255, 0.18)');
	ctx.fillStyle = baseGrad;
	ctx.beginPath();
	ctx.arc(cx, cy, 510, 0, Math.PI * 2);
	ctx.fill();

	const colors = ['#ff4f64', '#ffd166', '#50d890', '#2bb7ff', '#b37cff', '#ff9b54', '#78e0dc'];

	const petals = inverted ? 8 : 12;
	for (let index = 0; index < petals; index++) {
		const angle = (Math.PI * 2 * index) / petals + (inverted ? Math.PI / petals : 0);
		const radius = inverted ? 280 : 380;
		const petalSize = inverted ? 130 : 165;
		const color = colors[index % colors.length];
		ctx.save();
		ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
		ctx.rotate(angle + Math.PI / 2);
		ctx.fillStyle = color;
		ctx.globalAlpha = 0.74;
		ctx.beginPath();
		ctx.ellipse(0, 0, petalSize * 0.55, petalSize, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 0.36;
		ctx.fillStyle = '#fff5df';
		ctx.beginPath();
		ctx.ellipse(0, -petalSize * 0.4, petalSize * 0.32, petalSize * 0.5, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	const inner = inverted ? 4 : 6;
	for (let index = 0; index < inner; index++) {
		const angle = (Math.PI * 2 * index) / inner;
		ctx.save();
		ctx.translate(cx + Math.cos(angle) * 130, cy + Math.sin(angle) * 130);
		ctx.fillStyle = colors[index % colors.length];
		ctx.globalAlpha = 0.82;
		ctx.beginPath();
		ctx.arc(0, 0, 70, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	ctx.globalAlpha = 0.95;
	ctx.fillStyle = '#fff5df';
	ctx.beginPath();
	ctx.arc(cx, cy, 64, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = '#0a4660';
	ctx.font = '900 88px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('W', cx, cy + 6);

	ctx.strokeStyle = 'rgba(15, 30, 50, 0.55)';
	ctx.lineWidth = 6;
	for (let index = 0; index < petals; index++) {
		const angle = (Math.PI * 2 * index) / petals;
		ctx.beginPath();
		ctx.moveTo(cx + Math.cos(angle) * 70, cy + Math.sin(angle) * 70);
		ctx.lineTo(cx + Math.cos(angle) * 500, cy + Math.sin(angle) * 500);
		ctx.stroke();
	}

	ctx.lineWidth = 4;
	[180, 260, 360, 460].forEach((r) => {
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();
	});

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createCathedralLightShafts(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const sourceY = shellHeight - 0.6;
	const baseY = 0.05;
	const colors = activeVariant.eraColors;

	for (let index = 0; index < 8; index++) {
		const angle = (Math.PI * 2 * index) / 8 + Math.PI / 8;
		const radius = 2.4 + (index % 2) * 0.7;
		const targetX = centerX + Math.cos(angle) * (hubApothem - 2.6 + (index % 3) * 0.4);
		const targetZ = centerZ + Math.sin(angle) * (hubApothem - 2.6 + (index % 3) * 0.4);
		const color = colors[index % colors.length];

		const height = sourceY - baseY;
		const geometry = new THREE.ConeGeometry(radius, height, 18, 1, true);
		const material = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.06,
			side: THREE.DoubleSide,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		const cone = new THREE.Mesh(geometry, material);
		cone.position.set(
			(centerX + targetX) / 2,
			(sourceY + baseY) / 2,
			(centerZ + targetZ) / 2
		);
		const dirX = targetX - centerX;
		const dirZ = targetZ - centerZ;
		cone.rotation.set(0, Math.atan2(dirX, dirZ), 0);
		cone.rotation.x = Math.PI;
		registerAnimation(cone, (object, elapsed) => {
			object.material.opacity = 0.04 + (Math.sin(elapsed * 0.6 + index * 0.7) * 0.5 + 0.5) * 0.06;
		});
		group.add(cone);
	}
	return group;
}

function createCathedralEraBanners(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const eraList = window.WP_MUSEUM_ERAS;
	roomSides.forEach((side, index) => {
		const eraName = side.era;
		const eraIndex = eraList.indexOf(eraName);
		const color = activeVariant.eraColors[eraIndex % activeVariant.eraColors.length];
		const radius = hubApothem - 1.5;
		const x = centerX + Math.sin(side.angle) * radius;
		const z = centerZ - Math.cos(side.angle) * radius;
		const banner = new THREE.Mesh(
			new THREE.PlaneGeometry(1.2, 3.4),
			new THREE.MeshBasicMaterial({
				map: createEraBannerTexture(eraName, color),
				transparent: true,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		banner.position.set(x, wallHeight + 1.7, z);
		banner.rotation.y = side.angle;
		registerAnimation(banner, (object, elapsed) => {
			object.rotation.z = Math.sin(elapsed * 0.85 + index) * 0.045;
			object.position.y = wallHeight + 1.7 + Math.sin(elapsed * 0.65 + index) * 0.06;
		});
		group.add(banner);

		const rod = new THREE.Mesh(
			new THREE.CylinderGeometry(0.045, 0.045, 1.42, 12),
			new THREE.MeshStandardMaterial({ color: 0xf2cf86, roughness: 0.35, metalness: 0.62 })
		);
		rod.rotation.z = Math.PI / 2;
		rod.position.set(x, wallHeight + 3.42, z);
		rod.rotation.y = side.angle;
		group.add(rod);

		const cap = new THREE.Mesh(
			new THREE.SphereGeometry(0.085, 14, 10),
			new THREE.MeshStandardMaterial({
				color: 0xfff5df,
				emissive: new THREE.Color(color),
				emissiveIntensity: 0.22,
				roughness: 0.3,
				metalness: 0.4,
			})
		);
		cap.position.set(x, wallHeight + 1.05, z);
		group.add(cap);
	});
	return group;
}

function createEraBannerTexture(era, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 768;
	const ctx = canvas.getContext('2d');
	const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
	grad.addColorStop(0, color);
	grad.addColorStop(0.5, 'rgba(20, 26, 42, 0.92)');
	grad.addColorStop(1, color);
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = 'rgba(20, 26, 42, 0.55)';
	ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28);

	ctx.strokeStyle = color;
	ctx.lineWidth = 6;
	ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);

	ctx.save();
	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate(-Math.PI / 2);
	ctx.fillStyle = '#fff5df';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '900 64px Arial Black, Impact, sans-serif';
	ctx.fillText(era.toUpperCase(), 0, 0);
	ctx.restore();

	const trim = 70;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(28, canvas.height - 28);
	ctx.lineTo(canvas.width / 2, canvas.height - 28 + trim);
	ctx.lineTo(canvas.width - 28, canvas.height - 28);
	ctx.fill();

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createCathedralDustMotes(bounds) {
	const group = new THREE.Group();
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;
	const material = new THREE.MeshBasicMaterial({
		color: 0xfff2c8,
		transparent: true,
		opacity: 0.68,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	const motes = 18;
	for (let index = 0; index < motes; index++) {
		const angle = (Math.PI * 2 * index) / motes + Math.random();
		const radius = 3 + (index % 4) * 1.8;
		const mote = new THREE.Mesh(
			new THREE.SphereGeometry(0.04 + (index % 3) * 0.012, 6, 6),
			material.clone()
		);
		mote.userData.base = {
			x: centerX + Math.cos(angle) * radius,
			z: centerZ + Math.sin(angle) * radius,
			y: 2 + Math.random() * (shellHeight - 4),
			speed: 0.25 + Math.random() * 0.35,
			phase: Math.random() * Math.PI * 2,
		};
		mote.position.set(mote.userData.base.x, mote.userData.base.y, mote.userData.base.z);
		registerAnimation(mote, (object, elapsed) => {
			const base = object.userData.base;
			object.position.y = base.y + Math.sin(elapsed * base.speed + base.phase) * 0.8;
			object.position.x = base.x + Math.sin(elapsed * 0.32 + base.phase) * 0.3;
			object.material.opacity = 0.32 + (Math.sin(elapsed * 0.7 + index) * 0.5 + 0.5) * 0.3;
		});
		group.add(mote);
	}
	return group;
}

function createOpenSourceConstellation() {
	const group = new THREE.Group();
	const center = new THREE.Vector3(0, shellHeight - 2.05, 0);
	const nodeMaterial = new THREE.MeshStandardMaterial({
		color: 0xfff5df,
		emissive: 0x253bff,
		emissiveIntensity: 0.08,
		roughness: 0.32,
		metalness: 0.22,
	});
	const linkMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.22,
	});
	const cableMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.36,
	});
	const nodes = [];

	openSourceProjectItems.forEach((item, index) => {
		const angle = -Math.PI / 2 + (Math.PI * 2 * index) / openSourceProjectItems.length;
		const radius = 3.2 + (index % 3) * 0.52;
		const y = shellHeight - 2.08 + Math.sin(index * 1.7) * 0.34;
		const position = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
		nodes.push(position);

		const node = new THREE.Mesh(
			new THREE.SphereGeometry(0.09 + (index % 2) * 0.025, 16, 10),
			nodeMaterial.clone()
		);
		node.material.color.set(item.color);
		node.material.emissive = new THREE.Color(item.color);
		node.position.copy(position);
		registerAnimation(node, (object, elapsed) => {
			const pulse = 1 + Math.sin(elapsed * 1.6 + index) * 0.12;
			object.scale.setScalar(pulse);
			object.material.emissiveIntensity = 0.08 + Math.sin(elapsed * 1.2 + index) * 0.035;
		});
		group.add(node);

		const cableTop = new THREE.Vector3(position.x, shellHeight - 0.56, position.z);
		group.add(createCylinderBetween(cableTop, position, 0.008, cableMaterial, 8));

		const label = createReadableLabel(createOpenSourceSignTexture(item.title, item.note, item.color), 0.82, 0.32);
		label.position.copy(position).add(new THREE.Vector3(0, -0.42, 0));
		label.rotation.y = getRotationForNormal(new THREE.Vector3(-position.x, 0, -position.z).normalize());
		registerAnimation(label, (object, elapsed) => {
			object.position.y = position.y - 0.42 + Math.sin(elapsed * 0.9 + index) * 0.035;
		});
		group.add(label);
	});

	nodes.forEach((position, index) => {
		group.add(createCylinderBetween(position, nodes[(index + 1) % nodes.length], 0.01, linkMaterial, 8));
		if (index % 3 === 0) {
			group.add(createCylinderBetween(position, center, 0.008, linkMaterial, 8));
		}
	});

	const core = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.22, 1),
		new THREE.MeshStandardMaterial({
			color: activeVariant.eraColors[0],
			emissive: new THREE.Color(activeVariant.eraColors[0]),
			emissiveIntensity: 0.2,
			roughness: 0.28,
			metalness: 0.28,
		})
	);
	core.position.copy(center);
	registerAnimation(core, (object, elapsed) => {
		object.rotation.x = elapsed * 0.22;
		object.rotation.y = elapsed * 0.34;
	});
	group.add(core);
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
			repeatX: (hubCircumradius * 2) / floorTileSpan,
			repeatY: (hubCircumradius * 2) / floorTileSpan,
			roughness: 0.22,
			metalness: 0.34,
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
			group.add(createMuralWall(side));
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

function createMuralWall(side) {
	const group = new THREE.Group();
	const half = hubSideLength / 2;
	const dHW = portalDoorHalfWidth;
	const dC = portalCenterOffset;
	// Three full-height wall segments: left wall, central pier, right wall.
	const segments = [
		[-half, -(dC + dHW)],
		[-(dC - dHW), dC - dHW],
		[dC + dHW, half],
	];
	for (const [a, b] of segments) {
		group.add(createHubWallSegment(side, b - a, (a + b) / 2));
	}

	// Wall + lintel above each doorway, and the mural spanning above both.
	for (const portal of muralPortals) {
		group.add(createPortalTransom(side, portal.offset));
	}
	group.add(createWordPressMural(side));

	if (isCurrentVariant) {
		group.add(createMuralWapuuGreeter(side));
		for (const portal of muralPortals) {
			group.add(createPortalSign(side, portal));
		}
	}
	return group;
}

function createWordPressMural(side) {
	const muralHeight = wallHeight - portalDoorHeight - 0.2;
	const mural = new THREE.Mesh(
		new THREE.PlaneGeometry(hubSideLength * 0.92, muralHeight),
		new THREE.MeshBasicMaterial({
			map: createWordPressMuralTexture(),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	mural.position
		.copy(side.midpoint)
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.08));
	mural.position.y = portalDoorHeight + muralHeight / 2 + 0.08;
	mural.rotation.y = getRotationForNormal(
		side.normal.clone().multiplyScalar(-1)
	);
	return mural;
}

function createPortalTransom(side, offset) {
	const group = new THREE.Group();
	const beamHeight = wallHeight - portalDoorHeight;
	const transom = new THREE.Mesh(
		new THREE.BoxGeometry(portalDoorHalfWidth * 2, beamHeight, wallThickness),
		createRoomWallMaterial(portalDoorHalfWidth * 2)
	);
	transom.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(offset));
	transom.position.y = portalDoorHeight + beamHeight / 2;
	transom.rotation.y = getRotationForNormal(side.normal);
	group.add(transom);

	const lintelMaterial = new THREE.MeshStandardMaterial({
		color: 0xf5d088,
		emissive: 0x2a1808,
		emissiveIntensity: 0.18,
		roughness: 0.28,
		metalness: 0.55,
	});
	const lintel = new THREE.Mesh(
		new THREE.BoxGeometry(portalDoorHalfWidth * 2 + 0.2, 0.16, 0.36),
		lintelMaterial
	);
	lintel.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(offset))
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.18));
	lintel.position.y = portalDoorHeight + 0.05;
	lintel.rotation.y = getRotationForNormal(side.normal);
	group.add(lintel);
	return group;
}

function createMuralWapuuGreeter(side) {
	// A flat Wapuu cutout on the central pier, greeting visitors between
	// the entrance and exit doors.
	const wapuu = createWapuuCutout(2.6, {
		accent: activeVariant.eraColors[0],
		glow: activeVariant.eraColors[3],
		shadow: true,
	});
	wapuu.position
		.copy(side.midpoint)
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.13));
	wapuu.position.y = 0.55;
	wapuu.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	return wapuu;
}

function createPortalSign(side, portal) {
	const group = new THREE.Group();
	const sign = createReadableLabel(
		createPortalSignTexture(portal),
		2.5,
		0.66
	);
	sign.position
		.copy(side.midpoint)
		.add(side.tangent.clone().multiplyScalar(portal.offset))
		.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.42));
	sign.position.y = portalDoorHeight + 0.05;
	sign.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	group.add(sign);

	const arrowMaterial = new THREE.MeshBasicMaterial({
		color: portal.accent,
		transparent: true,
		opacity: 0.9,
	});
	const arrowDir = portal.kind === 'entrance' ? -1 : 1;
	for (let index = 0; index < 3; index++) {
		const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), arrowMaterial.clone());
		arrow.position
			.copy(side.midpoint)
			.add(side.tangent.clone().multiplyScalar(portal.offset + (-1.0 + index * 1.0) * arrowDir))
			.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.34));
		arrow.position.y = 0.5;
		arrow.rotation.x = Math.PI / 2;
		arrow.rotation.y = getRotationForNormal(side.normal) + (arrowDir < 0 ? Math.PI : 0);
		registerAnimation(arrow, (object, elapsed) => {
			object.material.opacity = 0.5 + (Math.sin(elapsed * 2.2 + index * 0.9) * 0.5 + 0.5) * 0.5;
		});
		group.add(arrow);
	}
	return group;
}

function createPortalSignTexture(portal) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 280;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#140d05';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const bulb = new THREE.Color(portal.accent).getHexString();
	for (let index = 0; index < 12; index++) {
		const x = 26 + index * 84;
		ctx.fillStyle = index % 2 ? `#${bulb}` : '#fff5df';
		ctx.beginPath();
		ctx.arc(x, 34, 8, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(x, canvas.height - 34, 8, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 128px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(portal.title, 512, 124);
	ctx.fillStyle = `#${bulb}`;
	ctx.font = '700 40px system-ui, sans-serif';
	ctx.fillText(portal.sub.toUpperCase(), 512, 216);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createWapuuCutout(height, options = {}) {
	const group = new THREE.Group();
	const width = height * (60 / 66);
	if (options.shadow) {
		const shadow = new THREE.Mesh(
			new THREE.PlaneGeometry(width * 1.08, height * 1.08),
			new THREE.MeshBasicMaterial({
				color: 0x08101d,
				transparent: true,
				opacity: 0.32,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		shadow.position.set(0.08, height / 2 - 0.06, -0.024);
		group.add(shadow);
	}

	const wapuu = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({
			map: getWapuuTexture(),
			transparent: true,
			alphaTest: 0.04,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	wapuu.position.y = height / 2;
	wapuu.position.z = 0.012;
	group.add(wapuu);

	if (options.crossBillboard) {
		const sideWapuu = new THREE.Mesh(
			new THREE.PlaneGeometry(width, height),
			wapuu.material.clone()
		);
		sideWapuu.position.y = height / 2;
		sideWapuu.rotation.y = Math.PI / 2;
		sideWapuu.material.opacity = 0.82;
		group.add(sideWapuu);
		const spine = new THREE.Mesh(
			new THREE.CylinderGeometry(0.018, 0.018, height * 0.82, 8),
			new THREE.MeshBasicMaterial({
				color: options.glow || 0xfff5df,
				transparent: true,
				opacity: 0.5,
			})
		);
		spine.position.y = height * 0.51;
		group.add(spine);
	}

	if (options.glow) {
		const halo = new THREE.Mesh(
			new THREE.RingGeometry(width * 0.52, width * 0.58, 48),
			new THREE.MeshBasicMaterial({
				color: options.glow,
				transparent: true,
				opacity: 0.38,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		halo.position.set(0, height * 0.48, -0.035);
		registerAnimation(halo, (object, elapsed) => {
			object.rotation.z = elapsed * 0.22;
			object.material.opacity = 0.25 + Math.sin(elapsed * 1.8) * 0.08;
		});
		group.add(halo);
	}
	return group;
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
			repeatX: roomWidth / floorTileSpan,
			repeatY: roomDepth / floorTileSpan,
			roughness: 0.24,
			metalness: 0.32,
		})
	);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = 0.01;
	group.add(floor);
	group.add(createRoomCeiling(room.color));

	group.add(createRoomWall('back'));
	group.add(createRoomWall('left'));
	group.add(createRoomWall('right'));
	if (isCurrentVariant) {
		group.add(createRoomMuseumArchitecture(room));
		group.add(createRoomStoryWall(room));
		group.add(createRoomFloorWayfinding(room));
		group.add(createSuspendedReleaseMobile(room));
	}
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
	mural.position.set(0, wallHeight - 1.15, roomDepth / 2 - wallThickness / 2 - 0.055);
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

function createRoomStoryWall(room) {
	const group = new THREE.Group();
	const panel = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth - 2.1, 1.32),
		new THREE.MeshBasicMaterial({
			map: createRoomStoryTexture(room),
			transparent: true,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	panel.position.set(0, 4.18, roomDepth / 2 - wallThickness / 2 - 0.08);
	panel.rotation.y = Math.PI;
	group.add(panel);

	const items = getEraReleaseItems(room.era);
	const tickMaterial = new THREE.MeshBasicMaterial({ color: room.color });
	const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xfff5df });
	const width = roomWidth - 3.4;
	const sweep = new THREE.Mesh(
		new THREE.BoxGeometry(0.055, 1.04, 0.035),
		new THREE.MeshBasicMaterial({
			color: room.color,
			transparent: true,
			opacity: 0.32,
			depthWrite: false,
		})
	);
	const roomOffset = eras.indexOf(room.era) * 0.11;
	sweep.position.set(-width / 2, 4.14, roomDepth / 2 - wallThickness / 2 - 0.17);
	registerAnimation(sweep, (object, elapsed) => {
		const progress = (elapsed * 0.055 + roomOffset) % 1;
		object.position.x = -width / 2 + width * progress;
		object.material.opacity = 0.18 + Math.sin(elapsed * 1.2 + roomOffset) * 0.06;
	});
	group.add(sweep);
	items.forEach(({ release }, index) => {
		const x = items.length === 1
			? 0
			: -width / 2 + (width * index) / (items.length - 1);
		const y = 3.72 + Math.sin(index * 1.7) * 0.12;
		const tick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.045), tickMaterial);
		tick.position.set(x, y, roomDepth / 2 - wallThickness / 2 - 0.13);
		group.add(tick);
		if (index === 0 || index === items.length - 1 || release.version.endsWith('.0')) {
			const dot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 8), dotMaterial);
			dot.position.set(x, y + 0.22, roomDepth / 2 - wallThickness / 2 - 0.16);
			group.add(dot);
		}
	});

	const first = items[0]?.release.version;
	const last = items[items.length - 1]?.release.version;
	if (first && last && first !== last) {
		const label = createReadableLabel(
			createSmallSignTexture(`WP ${first}-${last}`, room.color),
			1.42,
			0.28
		);
		label.position.set(-(roomWidth / 2) + 1.52, 3.52, roomDepth / 2 - wallThickness / 2 - 0.18);
		label.rotation.y = Math.PI;
		group.add(label);
	}
	return group;
}

function createRoomStoryTexture(room) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 320;
	const ctx = canvas.getContext('2d');
	const copy = getEraMuralCopy(room.era);
	const items = getEraReleaseItems(room.era);
	const first = items[0]?.release;
	const last = items[items.length - 1]?.release;
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
	gradient.addColorStop(0, 'rgba(17, 24, 39, 0.08)');
	gradient.addColorStop(0.18, 'rgba(17, 24, 39, 0.72)');
	gradient.addColorStop(0.82, 'rgba(17, 24, 39, 0.72)');
	gradient.addColorStop(1, 'rgba(17, 24, 39, 0.08)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.strokeStyle = room.color;
	ctx.lineWidth = 8;
	ctx.globalAlpha = 0.78;
	ctx.strokeRect(84, 34, canvas.width - 168, canvas.height - 68);
	ctx.globalAlpha = 1;

	ctx.fillStyle = 'rgba(255, 245, 223, 0.12)';
	for (let index = 0; index < 18; index++) {
		const x = 116 + index * 48;
		ctx.fillRect(x, 66 + (index % 3) * 56, 24, 10);
	}

	ctx.fillStyle = '#fff5df';
	ctx.textAlign = 'left';
	ctx.font = '900 28px Arial Black, Impact, sans-serif';
	ctx.fillText(`${room.yearRange} RELEASE LINE`, 118, 88);
	ctx.font = '900 42px Arial Black, Impact, sans-serif';
	fillFittedCanvasText(ctx, copy.title.toUpperCase(), 118, 144, 640, 42, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = room.color;
	ctx.font = '900 22px system-ui, sans-serif';
	fillFittedCanvasText(ctx, `${items.length} versions under glass`, 118, 184, 440, 22, '900', 'system-ui, sans-serif');
	ctx.fillStyle = 'rgba(255, 245, 223, 0.78)';
	ctx.font = '700 18px system-ui, sans-serif';
	wrapText(ctx, copy.note, 118, 222, 580, 25, 2);

	ctx.textAlign = 'right';
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 28px Arial Black, Impact, sans-serif';
	if (last && first) {
		ctx.fillText(`WP ${first.version}`, 896, 116);
		ctx.fillText(`WP ${last.version}`, 896, 172);
	}
	ctx.fillStyle = room.color;
	ctx.globalAlpha = 0.32;
	ctx.fillRect(726, 198, 170, 12);
	ctx.fillRect(726, 222, 116, 12);
	ctx.fillRect(726, 246, 148, 12);
	ctx.globalAlpha = 1;

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createRoomCeiling(color) {
	const group = new THREE.Group();
	const ceiling = new THREE.Mesh(
		new THREE.PlaneGeometry(roomWidth, roomDepth),
		new THREE.MeshBasicMaterial({
			map: createMuseumTexture('ceiling', roomWidth / 7, roomDepth / 7),
			side: THREE.DoubleSide,
		})
	);
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.y = wallHeight - 0.04;
	group.add(ceiling);

	if (isCurrentVariant) {
		const brassMaterial = new THREE.MeshStandardMaterial({
			color: 0xf2cf86,
			roughness: 0.34,
			metalness: 0.44,
		});
		for (const z of [-4.2, -1.4, 1.4, 4.2]) {
			const rib = new THREE.Mesh(new THREE.BoxGeometry(roomWidth - 1.2, 0.08, 0.08), brassMaterial);
			rib.position.set(0, wallHeight - 0.18, z);
			group.add(rib);
		}
		for (const x of [-4.2, 0, 4.2]) {
			const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, roomDepth - 1.1), brassMaterial);
			rib.position.set(x, wallHeight - 0.16, 0);
			group.add(rib);
		}
		for (const z of [-4.85, -2.35, 0.15, 2.65, 5.05]) {
			const start = new THREE.Vector3(-roomWidth / 2 + 0.95, wallHeight - 1.04, z);
			const control = new THREE.Vector3(0, wallHeight - 0.12, z);
			const end = new THREE.Vector3(roomWidth / 2 - 0.95, wallHeight - 1.04, z);
			group.add(createVaultRib(start, control, end, 0.024, brassMaterial, 30));
		}
		for (const x of [-roomWidth / 2 + 0.54, roomWidth / 2 - 0.54]) {
			const cove = new THREE.Mesh(
				new THREE.BoxGeometry(0.08, 0.48, roomDepth - 1.15),
				new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.16,
					depthWrite: false,
				})
			);
			cove.position.set(x, wallHeight - 0.76, 0);
			group.add(cove);
		}

		const oculusMaterial = new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.32,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		const oculus = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.28, 54), oculusMaterial);
		oculus.rotation.x = Math.PI / 2;
		oculus.position.set(0, wallHeight - 0.21, -0.18);
		registerAnimation(oculus, (object, elapsed) => {
			object.rotation.z = elapsed * 0.18;
			object.material.opacity = 0.24 + Math.sin(elapsed * 1.4) * 0.055;
		});
		group.add(oculus);

		const pendant = new THREE.Mesh(
			new THREE.OctahedronGeometry(0.18, 1),
			new THREE.MeshStandardMaterial({
				color,
				emissive: new THREE.Color(color),
				emissiveIntensity: 0.16,
				roughness: 0.3,
				metalness: 0.26,
			})
		);
		pendant.position.set(0, wallHeight - 1.08, -0.18);
		registerAnimation(pendant, (object, elapsed) => {
			object.rotation.y = elapsed * 0.5;
			object.position.y = wallHeight - 1.08 + Math.sin(elapsed * 1.1) * 0.045;
		});
		group.add(createCylinderBetween(
			new THREE.Vector3(0, wallHeight - 0.28, -0.18),
			new THREE.Vector3(0, wallHeight - 1.08, -0.18),
			0.012,
			new THREE.MeshBasicMaterial({ color: 0xfff5df, transparent: true, opacity: 0.5 }),
			8
		));
		group.add(pendant);
	}

	return group;
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
		color: wallWarmTint,
		roughness: 0.9,
		metalness: 0.03,
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
	const z = -roomDepth / 2;
	const gap = roomDoorHalfWidth;
	const jambMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2eadc,
		roughness: 0.7,
		metalness: 0.04,
	});
	const accentMaterial = new THREE.MeshStandardMaterial({
		color: room.color,
		emissive: new THREE.Color(room.color),
		emissiveIntensity: 0.16,
		roughness: 0.4,
		metalness: 0.1,
	});
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.5,
	});

	// Marble jambs with a thin coloured reveal facing the atrium.
	for (const sx of [-1, 1]) {
		const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.34, wallHeight, 0.42), jambMaterial);
		jamb.position.set(sx * gap, wallHeight / 2, z);
		group.add(jamb);
		const reveal = new THREE.Mesh(new THREE.BoxGeometry(0.1, wallHeight - 0.3, 0.46), accentMaterial);
		reveal.position.set(sx * (gap - 0.13), wallHeight / 2, z - 0.02);
		group.add(reveal);
	}

	const lintel = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + 0.34, 0.42, 0.42), jambMaterial);
	lintel.position.set(0, 4.45, z);
	group.add(lintel);
	const lintelBand = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + 0.1, 0.08, 0.48), brassMaterial);
	lintelBand.position.set(0, 4.2, z - 0.02);
	group.add(lintelBand);
	const accentBand = new THREE.Mesh(new THREE.BoxGeometry(gap * 2, 0.06, 0.5), accentMaterial);
	accentBand.position.set(0, 4.66, z - 0.02);
	group.add(accentBand);

	const signMaterial = new THREE.MeshBasicMaterial({
		map: createEraTexture(room.era, room.color, room.yearRange),
		transparent: true,
	});
	group.add(createDoorSign(signMaterial, z - 0.08, Math.PI));
	group.add(createDoorSign(signMaterial, z + 0.08, 0));
	return group;
}

function createDoorSign(material, z, rotationY) {
	const sign = new THREE.Mesh(
		new THREE.PlaneGeometry(5.6, 0.7),
		material
	);
	sign.position.set(0, 3.68, z);
	sign.rotation.y = rotationY;
	return sign;
}

function createRoomLight(color) {
	const group = new THREE.Group();
	// Warm-white fill keeps the marble reading as warm stone; the era
	// colour stays an accent rather than flooding the whole room.
	const fill = new THREE.PointLight(0xfff1d6, 1.18, 26);
	fill.position.set(0, wallHeight - 1.05, 0);
	registerAnimation(fill, (object, elapsed) => {
		object.intensity = 1.08 + Math.sin(elapsed * 1.2) * 0.08;
	});
	group.add(fill);

	const fixture = new THREE.Mesh(
		new THREE.BoxGeometry(4.4, 0.09, 0.36),
		new THREE.MeshStandardMaterial({
			color,
			emissive: new THREE.Color(color),
			emissiveIntensity: 0.45,
			roughness: 0.24,
			metalness: 0.22,
		})
	);
	fixture.position.set(0, wallHeight - 0.42, 0);
	group.add(fixture);
	for (const x of [-3.2, 3.2]) {
		group.add(createLightCone(color, 1.95, 4.6, 0.06, x, -0.55));
	}
	return group;
}

function createRoomFloorWayfinding(room) {
	const group = new THREE.Group();
	const color = room.color;
	const roomIndex = eras.indexOf(room.era);
	const stripeMaterial = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.34,
		depthWrite: false,
	});
	const softMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.2,
		depthWrite: false,
	});
	group.add(createFloorStripe(0, -1.1, 0.075, 8.8, 0, stripeMaterial));
	group.add(createFloorStripe(-2.25, -1.95, 0.055, 4.1, Math.PI / 4, stripeMaterial));
	group.add(createFloorStripe(2.25, -1.95, 0.055, 4.1, -Math.PI / 4, stripeMaterial));
	group.add(createFloorStripe(0, 3.65, 4.8, 0.055, 0, softMaterial));

	for (const station of getEraVignetteStations(roomIndex)) {
		const ring = new THREE.Mesh(
			new THREE.RingGeometry(0.38, 0.48, 40),
			new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.42,
				depthWrite: false,
				side: THREE.DoubleSide,
			})
		);
		ring.rotation.x = -Math.PI / 2;
		ring.position.set(station.x, 0.088, station.z);
		registerAnimation(ring, (object, elapsed) => {
			const pulse = 1 + Math.sin(elapsed * 1.8 + station.x) * 0.035;
			object.scale.set(pulse, pulse, pulse);
		});
		group.add(ring);
	}
	return group;
}

function createFloorStripe(x, z, width, length, rotation, material) {
	const stripe = new THREE.Mesh(
		new THREE.BoxGeometry(width, 0.012, length),
		material
	);
	stripe.position.set(x, 0.082, z);
	stripe.rotation.y = rotation;
	return stripe;
}

function createLightCone(color, radius, height, opacity, x, z) {
	const cone = new THREE.Mesh(
		new THREE.ConeGeometry(radius, height, 32, 1, true),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
	);
	cone.position.set(x, wallHeight - height / 2 - 0.55, z);
	cone.rotation.x = 0.1;
	registerAnimation(cone, (object, elapsed) => {
		object.material.opacity = opacity + Math.sin(elapsed * 1.6 + x) * 0.018;
	});
	return cone;
}

function createRoomMuseumArchitecture(room) {
	const group = new THREE.Group();
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		roughness: 0.31,
		metalness: 0.46,
	});
	const marble = new THREE.MeshStandardMaterial({
		color: 0xf4ecda,
		roughness: 0.68,
		metalness: 0.03,
	});
	['back', 'left', 'right'].forEach((side) => {
		group.add(createWallRail(side, 0.72, marble, 0.12));
		group.add(createWallRail(side, 3.04, brass, 0.045));
		group.add(createWallRail(side, wallHeight - 0.58, brass, 0.12));
	});
	group.add(createRoomPilasterGrid(room.color, marble, brass));
	group.add(createRoomAccentWashes(room));
	group.add(createRoomRopeBarriers(room.color));
	group.add(createRoomTrackLighting(room.color));
	for (const side of ['left', 'right']) {
		for (const z of [-2.8, 2.35]) {
			const sconce = createWallSconce(room.color);
			sconce.position.copy(getLocalWallPosition(side, z));
			sconce.position.y = 3.85;
			sconce.position.x += side === 'left' ? 0.09 : -0.09;
			sconce.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
			group.add(sconce);
		}
	}
	return group;
}

function createRoomAccentWashes(room) {
	const group = new THREE.Group();
	const washSpecs = [
		{
			width: roomWidth - 2.4,
			height: 2.65,
			position: [0, 2.48, roomDepth / 2 - wallThickness / 2 - 0.035],
			rotationY: Math.PI,
			opacity: 0.1,
		},
		{
			width: roomDepth - 3.2,
			height: 1.9,
			position: [-roomWidth / 2 + wallThickness / 2 + 0.035, 2.2, 0.28],
			rotationY: Math.PI / 2,
			opacity: 0.075,
		},
		{
			width: roomDepth - 3.2,
			height: 1.9,
			position: [roomWidth / 2 - wallThickness / 2 - 0.035, 2.2, 0.28],
			rotationY: -Math.PI / 2,
			opacity: 0.075,
		},
	];

	washSpecs.forEach((spec, index) => {
		const material = new THREE.MeshBasicMaterial({
			color: room.color,
			transparent: true,
			opacity: spec.opacity,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		const wash = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), material);
		wash.position.set(...spec.position);
		wash.rotation.y = spec.rotationY;
		registerAnimation(wash, (object, elapsed) => {
			object.material.opacity = spec.opacity + Math.sin(elapsed * 0.7 + index) * 0.018;
		});
		group.add(wash);
	});

	return group;
}

function createRoomRopeBarriers(color) {
	const group = new THREE.Group();
	group.add(createMuseumRopeLine([
		{ x: -roomWidth / 2 + 1.65, z: roomDepth / 2 - 2.35 },
		{ x: -2.1, z: roomDepth / 2 - 2.35 },
		{ x: 0, z: roomDepth / 2 - 2.35 },
		{ x: 2.1, z: roomDepth / 2 - 2.35 },
		{ x: roomWidth / 2 - 1.65, z: roomDepth / 2 - 2.35 },
	], color));
	group.add(createMuseumRopeLine([
		{ x: -roomWidth / 2 + 1.05, z: -2.62 },
		{ x: -roomWidth / 2 + 1.05, z: -0.5 },
		{ x: -roomWidth / 2 + 1.05, z: 1.62 },
		{ x: -roomWidth / 2 + 1.05, z: 3.72 },
	], color));
	group.add(createMuseumRopeLine([
		{ x: roomWidth / 2 - 1.05, z: -2.62 },
		{ x: roomWidth / 2 - 1.05, z: -0.5 },
		{ x: roomWidth / 2 - 1.05, z: 1.62 },
		{ x: roomWidth / 2 - 1.05, z: 3.72 },
	], color));
	return group;
}

function createMuseumRopeLine(points, color, options = {}) {
	const group = new THREE.Group();
	const postHeight = options.postHeight ?? 0.82;
	const postRadius = options.postRadius ?? 0.045;
	const capRadius = options.capRadius ?? 0.075;
	const ropeY = options.ropeY ?? 0.84;
	const ropeRadius = options.ropeRadius ?? 0.026;
	const postMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		roughness: 0.32,
		metalness: 0.52,
	});
	const capMaterial = new THREE.MeshStandardMaterial({
		color: 0xfff5df,
		roughness: 0.42,
		metalness: 0.22,
	});
	const ropeMaterial = new THREE.MeshStandardMaterial({
		color,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.04,
		roughness: 0.34,
		metalness: 0.18,
	});
	const ropeSegments = [];

	points.forEach((point, index) => {
		const post = new THREE.Mesh(
			new THREE.CylinderGeometry(postRadius, postRadius * 1.24, postHeight, 14),
			postMaterial
		);
		post.position.set(point.x, postHeight / 2, point.z);
		group.add(post);

		const cap = new THREE.Mesh(new THREE.SphereGeometry(capRadius, 14, 10), capMaterial);
		cap.position.set(point.x, postHeight + capRadius * 0.35, point.z);
		group.add(cap);

		if (index > 0) {
			const rope = createRopeSegment(points[index - 1], point, ropeY, ropeRadius, ropeMaterial);
			ropeSegments.push(rope);
			group.add(rope);
		}
	});

	registerAnimation(group, (object, elapsed) => {
		for (const [index, rope] of ropeSegments.entries()) {
			rope.position.y = ropeY + Math.sin(elapsed * 1.05 + index) * 0.018;
			rope.material.emissiveIntensity = 0.035 + Math.sin(elapsed * 1.3 + index) * 0.012;
		}
	});
	return group;
}

function createRopeSegment(start, end, y, radius, material) {
	return createCylinderBetween(
		new THREE.Vector3(start.x, y, start.z),
		new THREE.Vector3(end.x, y, end.z),
		radius,
		material,
		12
	);
}

function createCylinderBetween(start, end, radius, material, radialSegments = 12) {
	const direction = end.clone().sub(start);
	const length = direction.length();
	const cylinder = new THREE.Mesh(
		new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.001), radialSegments),
		material
	);
	cylinder.position.copy(start).add(end).multiplyScalar(0.5);
	if (length > 0.001) {
		cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
	}
	return cylinder;
}

function createSuspendedReleaseMobile(room) {
	const group = new THREE.Group();
	const items = getSuspendedReleaseItems(room);
	const cableMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.46,
	});

	items.forEach(({ release }, index) => {
		const x = -3.35 + index * (6.7 / Math.max(items.length - 1, 1));
		const z = -0.78 + (index % 2) * 1.22;
		const y = 4.64 + (index % 3) * 0.1;
		const cableLength = wallHeight - 0.85 - y;
		const cable = new THREE.Mesh(
			new THREE.CylinderGeometry(0.011, 0.011, cableLength, 8),
			cableMaterial
		);
		cable.position.set(x, y + cableLength / 2, z);
		group.add(cable);

		const chip = createHangingReleaseChip(release, room.color, index);
		chip.position.set(x, y, z);
		registerAnimation(chip, (object, elapsed) => {
			object.position.y = y + Math.sin(elapsed * 1.15 + index) * 0.055;
			object.rotation.y = Math.sin(elapsed * 0.8 + index) * 0.36;
			object.rotation.z = Math.sin(elapsed * 0.52 + index) * 0.045;
		});
		group.add(chip);
	});

	return group;
}

function getSuspendedReleaseItems(room) {
	const items = getEraReleaseItems(room.era);
	const important = items.filter(({ release }) => release.version.endsWith('.0'));
	const candidates = important.length >= 3
		? important
		: [
				items[0],
				items[Math.floor(items.length / 2)],
				items[items.length - 1],
			].filter(Boolean);
	return candidates.slice(0, 5);
}

function createHangingReleaseChip(release, color, index) {
	const group = new THREE.Group();
	const chipMaterial = new THREE.MeshStandardMaterial({
		color: index % 2 ? 0xf8efd9 : color,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.08,
		roughness: 0.42,
		metalness: 0.18,
	});
	const chip = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.055), chipMaterial);
	group.add(chip);

	const label = createReadableLabel(
		createSmallSignTexture(`WP ${release.version}`, color),
		0.58,
		0.17
	);
	label.position.z = -0.044;
	group.add(label);

	const rim = new THREE.Mesh(
		new THREE.BoxGeometry(0.76, 0.035, 0.065),
		new THREE.MeshBasicMaterial({ color: 0xfff5df, transparent: true, opacity: 0.62 })
	);
	rim.position.y = 0.245;
	group.add(rim);
	return group;
}

function createRoomTrackLighting(color) {
	const group = new THREE.Group();
	const trackMaterial = new THREE.MeshStandardMaterial({
		color: 0x1f2937,
		roughness: 0.38,
		metalness: 0.38,
	});
	const fixtureMaterial = new THREE.MeshStandardMaterial({
		color: 0xf8efd9,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.18,
		roughness: 0.34,
		metalness: 0.28,
	});
	[-2.25, 1.85].forEach((z, trackIndex) => {
		const track = new THREE.Mesh(
			new THREE.BoxGeometry(roomWidth * 0.66, 0.055, 0.08),
			trackMaterial
		);
		track.position.set(0, wallHeight - 0.72, z);
		group.add(track);
		[-3.6, 0, 3.6].forEach((x, fixtureIndex) => {
			const fixture = new THREE.Mesh(
				new THREE.CylinderGeometry(0.105, 0.14, 0.2, 16),
				fixtureMaterial
			);
			fixture.position.set(x, wallHeight - 0.88, z);
			group.add(fixture);

			const beam = new THREE.Mesh(
				new THREE.ConeGeometry(0.72, 2.75, 28, 1, true),
				new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.035,
					side: THREE.DoubleSide,
					depthWrite: false,
				})
			);
			beam.position.set(x, wallHeight - 2.18, z + (trackIndex ? 0.45 : -0.25));
			beam.rotation.x = trackIndex ? -0.08 : 0.08;
			registerAnimation(beam, (object, elapsed) => {
				object.material.opacity = 0.028 + Math.sin(elapsed * 1.4 + fixtureIndex) * 0.01;
			});
			group.add(beam);
		});
	});
	return group;
}

function createRoomPilasterGrid(color, marbleMaterial, brassMaterial) {
	const group = new THREE.Group();
	const shadowMaterial = new THREE.MeshStandardMaterial({
		color: 0xcfc1a6,
		roughness: 0.76,
		metalness: 0.02,
	});
	const glowMaterial = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.2,
		depthWrite: false,
	});
	// Side-wall pilasters sit only in the front and back corners; the
	// middle of each side wall is reserved for the framed exhibits, so no
	// pilaster ever crosses a picture.
	for (const side of ['left', 'right']) {
		const x = side === 'left'
			? -roomWidth / 2 + wallThickness / 2 + 0.035
			: roomWidth / 2 - wallThickness / 2 - 0.035;
		for (const z of [-roomDepth / 2 + 0.62, roomDepth / 2 - 0.62]) {
			const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, wallHeight - 0.78, 0.2), marbleMaterial);
			shaft.position.set(x, wallHeight / 2 + 0.08, z);
			group.add(shaft);
			const innerLine = new THREE.Mesh(new THREE.BoxGeometry(0.034, wallHeight - 1.4, 0.22), shadowMaterial);
			innerLine.position.set(x + (side === 'left' ? 0.07 : -0.07), wallHeight / 2 + 0.16, z);
			group.add(innerLine);
			const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.28), brassMaterial);
			cap.position.set(x + (side === 'left' ? 0.04 : -0.04), wallHeight - 0.44, z);
			group.add(cap);
			const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.24), glowMaterial.clone());
			lamp.position.set(x + (side === 'left' ? 0.09 : -0.09), 4.9, z);
			group.add(lamp);
		}
	}
	for (const x of [-roomWidth / 2 + 0.78, roomWidth / 2 - 0.78]) {
		const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, wallHeight - 1.12, 0.12), marbleMaterial);
		shaft.position.set(x, wallHeight / 2 + 0.02, roomDepth / 2 - wallThickness / 2 - 0.035);
		group.add(shaft);
		const cap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.17), brassMaterial);
		cap.position.set(x, wallHeight - 0.36, roomDepth / 2 - wallThickness / 2 - 0.055);
		group.add(cap);
	}
	const upperLedger = new THREE.Mesh(
		new THREE.BoxGeometry(roomWidth - 2.1, 0.07, 0.12),
		brassMaterial
	);
	upperLedger.position.set(0, wallHeight - 0.94, roomDepth / 2 - wallThickness / 2 - 0.05);
	group.add(upperLedger);
	return group;
}

function createWallRail(side, y, material, thickness) {
	const isWidthWall = side === 'front' || side === 'back';
	const rail = new THREE.Mesh(
		new THREE.BoxGeometry(
			isWidthWall ? roomWidth : thickness,
			thickness,
			isWidthWall ? thickness : roomDepth
		),
		material
	);
	rail.position.copy(getLocalWallPosition(side, 0));
	rail.position.y = y;
	if (side === 'back') {
		rail.position.z -= wallThickness / 2 + 0.012;
	}
	if (side === 'left') {
		rail.position.x += wallThickness / 2 + 0.012;
	}
	if (side === 'right') {
		rail.position.x -= wallThickness / 2 + 0.012;
	}
	return rail;
}

function createWallSconce(color) {
	const group = new THREE.Group();
	const back = new THREE.Mesh(
		new THREE.BoxGeometry(0.16, 0.56, 0.08),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.32, metalness: 0.5 })
	);
	group.add(back);
	const lamp = new THREE.Mesh(
		new THREE.SphereGeometry(0.16, 16, 10),
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
	);
	lamp.position.z = -0.08;
	registerAnimation(lamp, (object, elapsed) => {
		object.material.opacity = 0.78 + Math.sin(elapsed * 1.7) * 0.1;
	});
	group.add(lamp);
	return group;
}

function createAtriumDecor() {
	const group = new THREE.Group();
	if (!shouldDecorateScene) {
		return group;
	}

	const color = activeVariant.eraColors[0];
	const secondary = activeVariant.eraColors[3];
	if (isCurrentVariant) {
		group.add(createAtriumMuseumArchitecture(color, secondary));
		group.add(createAtriumLightRig(color, secondary));
		group.add(createOpenSourceAtriumRing());
	}
	group.add(createAtriumFloorMedallion(color, secondary));
	if (isCurrentVariant) {
		group.add(createAtriumVersionOrbit());
		group.add(createAtriumRopeArcs(color, secondary));
	}
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

function createAtriumVersionOrbit() {
	const group = new THREE.Group();
	const orbitMaterial = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.16,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const orbit = new THREE.Mesh(new THREE.RingGeometry(6.8, 6.92, 96), orbitMaterial);
	orbit.rotation.x = -Math.PI / 2;
	orbit.position.y = 0.07;
	group.add(orbit);

	const items = releases.filter((release) => release.version.endsWith('.0') || release.version.endsWith('.5'));
	const radius = 6.86;
	items.forEach((release, index) => {
		const angle = Math.PI / 2 - (Math.PI * 2 * index) / items.length;
		const color = eraColors.get(release.era);
		const marker = new THREE.Mesh(
			new THREE.BoxGeometry(0.34, 0.065, 0.16),
			new THREE.MeshStandardMaterial({
				color,
				emissive: new THREE.Color(color),
				emissiveIntensity: 0.12,
				roughness: 0.46,
				metalness: 0.12,
			})
		);
		marker.position.set(Math.cos(angle) * radius, 0.12, Math.sin(angle) * radius);
		marker.rotation.y = -angle;
		registerAnimation(marker, (object, elapsed) => {
			object.position.y = 0.12 + Math.sin(elapsed * 1.25 + index) * 0.018;
		});
		group.add(marker);

		if (release.version.endsWith('.0')) {
			const label = createReadableLabel(
				createSmallSignTexture(`WP ${release.version}`, color),
				0.92,
				0.22
			);
			label.position.set(Math.cos(angle) * (radius + 0.44), 0.42, Math.sin(angle) * (radius + 0.44));
			label.rotation.y = getRotationForNormal(new THREE.Vector3(-label.position.x, 0, -label.position.z).normalize());
			registerAnimation(label, (object, elapsed) => {
				object.position.y = 0.42 + Math.sin(elapsed * 1.05 + index) * 0.025;
			});
			group.add(label);
		}
	});
	return group;
}

function createAtriumRopeArcs(color, secondary) {
	const group = new THREE.Group();
	group.add(createMuseumRopeArc(0, 0, 3.32, Math.PI * 0.12, Math.PI * 0.88, color));
	group.add(createMuseumRopeArc(0, 0, 3.32, Math.PI * 1.12, Math.PI * 1.88, secondary));
	group.add(createFloorGlowArc(0, 0, 3.95, Math.PI * 0.08, Math.PI * 0.92, color));
	group.add(createFloorGlowArc(0, 0, 3.95, Math.PI * 1.08, Math.PI * 1.92, secondary));
	return group;
}

function createOpenSourceAtriumRing() {
	const group = new THREE.Group();
	openSourceProjectItems.forEach((item, index) => {
		const angle = -Math.PI * 0.8 + (Math.PI * 1.6 * index) / (openSourceProjectItems.length - 1);
		const radius = 11.85;
		const pylon = createOpenSourcePylon(item, index);
		pylon.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
		pylon.rotation.y = getRotationForNormal(new THREE.Vector3(-pylon.position.x, 0, -pylon.position.z).normalize());
		pylon.scale.setScalar(0.76);
		group.add(pylon);
	});
	return group;
}

function createOpenSourcePylon(item, index) {
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.26, 0.36, 0.18, 20),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.68, metalness: 0.04 })
	);
	base.position.y = 0.1;
	group.add(base);

	const post = new THREE.Mesh(
		new THREE.CylinderGeometry(0.038, 0.052, 1.08, 14),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.32, metalness: 0.5 })
	);
	post.position.y = 0.64;
	group.add(post);

	const orb = new THREE.Mesh(
		new THREE.SphereGeometry(0.11, 18, 12),
		new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.9 })
	);
	orb.position.y = 1.24;
	registerAnimation(orb, (object, elapsed) => {
		object.scale.setScalar(1 + Math.sin(elapsed * 1.5 + index) * 0.08);
		object.material.opacity = 0.72 + Math.sin(elapsed * 1.8 + index) * 0.13;
	});
	group.add(orb);

	const label = createReadableLabel(createOpenSourceSignTexture(item.title, item.note, item.color), 0.84, 0.34);
	label.position.set(0, 0.76, -0.15);
	group.add(label);
	return group;
}

function createMuseumRopeArc(centerX, centerZ, radius, startAngle, endAngle, color) {
	const points = [];
	const segmentCount = 8;
	for (let index = 0; index <= segmentCount; index++) {
		const progress = index / segmentCount;
		const angle = startAngle + (endAngle - startAngle) * progress;
		points.push({
			x: centerX + Math.cos(angle) * radius,
			z: centerZ + Math.sin(angle) * radius,
		});
	}
	return createMuseumRopeLine(points, color, {
		postHeight: 0.74,
		ropeY: 0.77,
		postRadius: 0.04,
		capRadius: 0.07,
	});
}

function createFloorGlowArc(centerX, centerZ, radius, startAngle, endAngle, color) {
	const group = new THREE.Group();
	const material = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.22,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	const segmentCount = 18;
	for (let index = 0; index < segmentCount; index++) {
		const progress = (index + 0.5) / segmentCount;
		const angle = startAngle + (endAngle - startAngle) * progress;
		const tick = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.46), material.clone());
		tick.position.set(centerX + Math.cos(angle) * radius, 0.078, centerZ + Math.sin(angle) * radius);
		tick.rotation.y = -angle;
		group.add(tick);
	}
	registerAnimation(group, (object, elapsed) => {
		for (const [index, child] of object.children.entries()) {
			child.material.opacity = 0.16 + Math.sin(elapsed * 1.45 + index * 0.42) * 0.045;
		}
	});
	return group;
}

function createAtriumMuseumArchitecture(color, secondary) {
	const group = new THREE.Group();
	const crownMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		roughness: 0.32,
		metalness: 0.46,
	});
	const lintelMaterial = new THREE.MeshStandardMaterial({
		color: 0xf4ecda,
		roughness: 0.72,
		metalness: 0.04,
	});
	const structuralColumnHeight = shellHeight - 0.58;
	for (const [sideIndex, side] of hubSides.entries()) {
		const isMural = side.kind === 'mural';
		const columnOffset = isMural
			? hubSideLength / 2 - 0.58
			: roomDoorHalfWidth + 0.34;
		for (const [columnIndex, offset] of [-columnOffset, columnOffset].entries()) {
			const position = side.midpoint
				.clone()
				.add(side.tangent.clone().multiplyScalar(offset))
				.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.28));
			const column = createCathedralColumn(
				structuralColumnHeight,
				columnIndex ? secondary : color,
				activeVariant.eraColors[(sideIndex + columnIndex + 2) % activeVariant.eraColors.length]
			);
			column.position.set(position.x, 0, position.z);
			group.add(column);
		}
		const lintel = new THREE.Mesh(
			new THREE.BoxGeometry(isMural ? hubSideLength * 0.84 : roomDoorHalfWidth * 1.65, 0.18, 0.18),
			isMural ? crownMaterial : lintelMaterial
		);
		lintel.position
			.copy(side.midpoint)
			.add(side.normal.clone().multiplyScalar(-wallThickness / 2 - 0.22));
		lintel.position.y = isMural ? wallHeight - 0.36 : 5.08;
		lintel.rotation.y = getRotationForNormal(side.normal);
		group.add(lintel);
		if (!isMural && side.era) {
			group.add(createAtriumDoorBanner(side, eraColors.get(side.era)));
			group.add(createAtriumGalleryBeacon(side, eraColors.get(side.era)));
		}
	}

	group.add(createHubCornerPilasters());

	for (let index = 0; index < 8; index++) {
		const angle = (Math.PI * 2 * index) / 8 + Math.PI / 8;
		const radius = hubApothem - 1.15;
		const lamp = createLoadedModel('detailLightSingle', {
			targetHeight: 1.55,
			fallback: 'light',
		});
		lamp.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
		lamp.rotation.y = angle + Math.PI;
		group.add(lamp);

		if (index % 4 === 0) {
			const glow = new THREE.PointLight(index % 2 ? secondary : color, 0.5, 8.5);
			glow.position.set(lamp.position.x, 2.75, lamp.position.z);
			registerAnimation(glow, (object, elapsed) => {
				object.intensity = 0.42 + Math.sin(elapsed * 1.35 + index) * 0.06;
			});
			group.add(glow);
		}
	}
	return group;
}

function createHubCornerPilasters() {
	const group = new THREE.Group();
	const marble = new THREE.MeshStandardMaterial({ color: 0xf2eadc, roughness: 0.74, metalness: 0.03 });
	const shade = new THREE.MeshStandardMaterial({ color: 0xd9cdb4, roughness: 0.78 });
	const brass = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.1,
		roughness: 0.32,
		metalness: 0.52,
	});
	const innerVertexRadius = (hubApothem - wallThickness / 2) / Math.cos(Math.PI / 8) - 0.16;
	for (let k = 0; k < 8; k++) {
		const angle = Math.PI / 8 + (k * Math.PI) / 4;
		const outward = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
		const pos = outward.clone().multiplyScalar(innerVertexRadius);
		const rotY = getRotationForNormal(outward.clone().multiplyScalar(-1));

		const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.66, wallHeight, 0.46), marble);
		pilaster.position.set(pos.x, wallHeight / 2, pos.z);
		pilaster.rotation.y = rotY;
		group.add(pilaster);

		const reveal = new THREE.Mesh(new THREE.BoxGeometry(0.18, wallHeight - 0.4, 0.5), shade);
		reveal.position.set(pos.x, wallHeight / 2, pos.z);
		reveal.rotation.y = rotY;
		group.add(reveal);

		// Cornice corner blocks bridge the gap between adjacent wall cornices.
		for (const spec of [
			{ y: wallHeight + 0.12, h: 0.3, d: 0.56, material: marble },
			{ y: wallHeight + 0.42, h: 0.06, d: 0.62, material: brass },
			{ y: shellHeight - 2.74, h: 0.2, d: 0.5, material: marble },
			{ y: shellHeight - 2.52, h: 0.05, d: 0.56, material: brass },
		]) {
			const cap = new THREE.Mesh(new THREE.BoxGeometry(0.78, spec.h, spec.d), spec.material);
			cap.position.set(pos.x, spec.y, pos.z);
			cap.rotation.y = rotY;
			group.add(cap);
		}

		const capital = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 0.6), brass);
		capital.position.set(pos.x, wallHeight - 0.18, pos.z);
		capital.rotation.y = rotY;
		group.add(capital);
	}
	return group;
}

function createCathedralColumn(height, accentColor, secondaryColor) {
	const group = new THREE.Group();
	const marbleMaterial = new THREE.MeshStandardMaterial({
		color: 0xf2eadc,
		roughness: 0.72,
		metalness: 0.03,
	});
	const shadowMaterial = new THREE.MeshStandardMaterial({
		color: 0xcfc1a6,
		roughness: 0.78,
		metalness: 0.02,
	});
	const brassMaterial = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: new THREE.Color(accentColor),
		emissiveIntensity: 0.05,
		roughness: 0.32,
		metalness: 0.5,
	});
	const glowMaterial = new THREE.MeshBasicMaterial({
		color: secondaryColor,
		transparent: true,
		opacity: 0.62,
	});

	// Attic base: square plinth, torus, then the shaft rises directly off it
	// so there is no gap between base and column.
	const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.92), marbleMaterial);
	plinth.position.y = 0.1;
	group.add(plinth);
	const torus = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.22, 28), marbleMaterial);
	torus.position.y = 0.31;
	group.add(torus);
	const baseBand = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.07, 28), brassMaterial);
	baseBand.position.y = 0.45;
	group.add(baseBand);

	const shaftBottom = 0.48;
	const shaftTop = height - 0.62;
	const shaftHeight = shaftTop - shaftBottom;
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, shaftHeight, 32), marbleMaterial);
	shaft.position.y = shaftBottom + shaftHeight / 2;
	group.add(shaft);

	for (let index = 0; index < 16; index++) {
		const angle = (Math.PI * 2 * index) / 16;
		const flute = new THREE.Mesh(new THREE.BoxGeometry(0.026, shaftHeight * 0.9, 0.035), shadowMaterial);
		const radius = 0.3;
		flute.position.set(
			Math.cos(angle) * radius,
			shaftBottom + shaftHeight / 2,
			Math.sin(angle) * radius
		);
		flute.rotation.y = -angle;
		group.add(flute);
	}

	for (const y of [wallHeight + 0.12, height - 1.08]) {
		const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 28), brassMaterial);
		collar.position.y = y;
		group.add(collar);
		const halo = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.014, 8, 42), glowMaterial.clone());
		halo.rotation.x = Math.PI / 2;
		halo.position.y = y + 0.105;
		registerAnimation(halo, (object, elapsed) => {
			object.material.opacity = 0.38 + Math.sin(elapsed * 1.1 + y) * 0.1;
		});
		group.add(halo);
	}

	const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.42, 0.42, 28), marbleMaterial);
	capital.position.y = height - 0.52;
	group.add(capital);
	const capPlate = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 1.05), marbleMaterial);
	capPlate.position.y = height - 0.2;
	group.add(capPlate);
	return group;
}

function createAtriumGalleryBeacon(side, color) {
	const group = new THREE.Group();
	const sideIndex = roomSides.findIndex((roomSide) => roomSide.era === side.era);
	const offset = (sideIndex % 2 ? 1 : -1) * (roomDoorHalfWidth + 0.92);
	const position = side.midpoint
		.clone()
		.add(side.tangent.clone().multiplyScalar(offset))
		.add(side.normal.clone().multiplyScalar(-0.92));
	group.position.set(position.x, 0, position.z);
	group.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));

	const baseMaterial = new THREE.MeshStandardMaterial({
		color: 0xf4ecda,
		roughness: 0.68,
		metalness: 0.06,
	});
	const glassMaterial = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity: 0.36,
		depthWrite: false,
	});
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.2, 18), baseMaterial);
	base.position.y = 0.1;
	group.add(base);

	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.35, 14), glassMaterial);
	column.position.y = 0.88;
	registerAnimation(column, (object, elapsed) => {
		object.material.opacity = 0.28 + Math.sin(elapsed * 1.3 + sideIndex) * 0.08;
	});
	group.add(column);

	const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), new THREE.MeshBasicMaterial({ color }));
	cap.position.y = 1.62;
	group.add(cap);

	const label = createReadableLabel(createSmallSignTexture(side.era.split(' ')[0].toUpperCase(), color), 0.86, 0.2);
	label.position.set(0, 0.52, -0.17);
	group.add(label);
	return group;
}

function createAtriumDoorBanner(side, color) {
	const group = new THREE.Group();
	const banner = new THREE.Mesh(
		new THREE.PlaneGeometry(4.35, 0.58),
		new THREE.MeshBasicMaterial({
			map: createAtriumBannerTexture(side.era, color),
			transparent: true,
			side: THREE.DoubleSide,
		})
	);
	banner.position
		.copy(side.midpoint)
		.add(side.normal.clone().multiplyScalar(-0.42));
	banner.position.y = 5.26;
	banner.rotation.y = getRotationForNormal(side.normal.clone().multiplyScalar(-1));
	group.add(banner);

	for (const offset of [-1.85, 1.85]) {
		const hanger = new THREE.Mesh(
			new THREE.BoxGeometry(0.035, 0.72, 0.035),
			new THREE.MeshBasicMaterial({ color: 0xfff5df, transparent: true, opacity: 0.5 })
		);
		hanger.position
			.copy(side.midpoint)
			.add(side.tangent.clone().multiplyScalar(offset))
			.add(side.normal.clone().multiplyScalar(-0.43));
		hanger.position.y = 5.68;
		hanger.rotation.y = getRotationForNormal(side.normal);
		group.add(hanger);
	}
	return group;
}

function createAtriumBannerTexture(era, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 768;
	canvas.height = 140;
	const ctx = canvas.getContext('2d');
	const items = getEraReleaseItems(era);
	ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 12);
	ctx.fillRect(0, canvas.height - 12, canvas.width, 12);
	ctx.fillStyle = 'rgba(255, 245, 223, 0.18)';
	for (let index = 0; index < 10; index++) {
		ctx.fillRect(70 + index * 60, 35 + (index % 2) * 44, 28, 8);
	}
	ctx.fillStyle = '#fff5df';
	ctx.textAlign = 'center';
	ctx.font = '900 32px Arial Black, Impact, sans-serif';
	fillFittedCanvasText(ctx, era.toUpperCase(), canvas.width / 2, 58, 610, 32, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = color;
	ctx.font = '900 18px system-ui, sans-serif';
	ctx.fillText(`${getReleaseYearRange(items)} / ${items.length} releases`, canvas.width / 2, 96);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function createAtriumLightRig(color, secondary) {
	const group = new THREE.Group();
	group.add(createKineticChangelogMobile(color, secondary));
	for (let index = 0; index < 8; index++) {
		const angle = (Math.PI * 2 * index) / 8;
		const beamColor = index % 2 ? secondary : color;
		const beam = new THREE.Mesh(
			new THREE.ConeGeometry(1.45, 4.6, 36, 1, true),
			new THREE.MeshBasicMaterial({
				color: beamColor,
				transparent: true,
				opacity: 0.045,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
		);
		beam.position.set(Math.sin(angle) * 5.2, 4.0, -Math.cos(angle) * 5.2);
		beam.rotation.z = Math.sin(angle) * 0.18;
		beam.rotation.x = Math.cos(angle) * 0.18;
		registerAnimation(beam, (object, elapsed) => {
			object.rotation.y = elapsed * 0.16 + angle;
			object.material.opacity = 0.04 + Math.sin(elapsed * 1.4 + index) * 0.012;
		});
		group.add(beam);
	}
	return group;
}

function createKineticChangelogMobile(color, secondary) {
	const group = new THREE.Group();
	const ringMaterial = new THREE.MeshStandardMaterial({
		color: 0xf6d48b,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.08,
		roughness: 0.24,
		metalness: 0.55,
	});
	[2.1, 2.9, 3.7].forEach((radius, index) => {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.026, 8, 96), ringMaterial);
		ring.position.y = 5.42 + index * 0.28;
		ring.rotation.x = Math.PI / 2;
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = elapsed * (0.2 + index * 0.08) * (index % 2 ? -1 : 1);
		});
		group.add(ring);
	});

	for (let index = 0; index < 14; index++) {
		const chip = new THREE.Mesh(
			new THREE.BoxGeometry(0.38, 0.16, 0.38),
			new THREE.MeshStandardMaterial({
				color: activeVariant.eraColors[index % activeVariant.eraColors.length],
				emissive: new THREE.Color(activeVariant.eraColors[index % activeVariant.eraColors.length]),
				emissiveIntensity: 0.08,
				roughness: 0.42,
				metalness: 0.1,
			})
		);
		const radius = 2.15 + (index % 3) * 0.62;
		const baseAngle = (Math.PI * 2 * index) / 14;
		chip.userData.mobile = { radius, baseAngle, y: 5.58 + (index % 4) * 0.18 };
		registerAnimation(chip, (object, elapsed) => {
			const mobile = object.userData.mobile;
			const angle = mobile.baseAngle + elapsed * (0.34 + (index % 4) * 0.04);
			object.position.set(Math.cos(angle) * mobile.radius, mobile.y + Math.sin(elapsed * 1.5 + index) * 0.08, Math.sin(angle) * mobile.radius);
			object.rotation.x += 0.008;
			object.rotation.y += 0.012;
		});
		group.add(chip);
	}

	const core = new THREE.PointLight(0xfff4cf, 1.25, 18);
	core.position.y = 5.55;
	registerAnimation(core, (object, elapsed) => {
		object.intensity = 1.08 + Math.sin(elapsed * 0.9) * 0.12;
	});
	group.add(core);
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
	// Planters flank the Mercantile (gift-shop) doorway on the mural side.
	addPlaced(group, createAtriumPlanter(color, secondary), -6.7, 14.62, 0);
	addPlaced(group, createAtriumPlanter(secondary, color), 6.7, 14.62, 0);
	addPlaced(group, createWapuuDocent(color, secondary), -6.18, -2.72, 0.48);
	addPlaced(group, createMuseumInfoDesk(color, secondary), 0.2, -5.72, 0.03);
	const engineRoom = createOpenSourceEngineRoom(color, secondary);
	engineRoom.scale.setScalar(0.68);
	addPlaced(group, engineRoom, 11.35, 5.52, -1.1);

	// Tall potted trees stand symmetrically at the left/right of the rotunda.
	for (const treeX of [-10.6, 10.6]) {
		addPlaced(group, createPlantedTree(2.7), treeX, 1.6, 0);
	}

	// A tidy visitor lounge nook on the right-front: two chairs angled
	// around a coffee table with a small plant.
	const loungeX = 8.2;
	const loungeZ = -3.4;
	addPlaced(group, createLoadedModel('tableCoffee', { targetHeight: 0.4, fallback: 'block' }), loungeX, loungeZ, 0);
	addPlaced(group, createLoadedModel('loungeDesignChair', { targetHeight: 0.82, fallback: 'bench' }), loungeX - 1.05, loungeZ + 0.2, Math.PI / 2 + 0.3);
	addPlaced(group, createLoadedModel('loungeDesignChair', { targetHeight: 0.82, fallback: 'bench' }), loungeX + 1.05, loungeZ + 0.2, -Math.PI / 2 - 0.3);
	addPlaced(group, createPlant(secondary, 0.9), loungeX, loungeZ - 1.5, 0);
}

function createPlantedTree(targetHeight) {
	const group = new THREE.Group();
	const planter = new THREE.Mesh(
		new THREE.CylinderGeometry(0.46, 0.54, 0.46, 20),
		new THREE.MeshStandardMaterial({ color: 0xe9e0cb, roughness: 0.72 })
	);
	planter.position.y = 0.23;
	group.add(planter);
	const rim = new THREE.Mesh(
		new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20),
		new THREE.MeshStandardMaterial({ color: 0xc79b43, roughness: 0.34, metalness: 0.5 })
	);
	rim.position.y = 0.45;
	group.add(rim);
	const tree = createLoadedModel('treeParkLarge', { targetHeight, fallback: 'plant' });
	tree.position.y = 0.42;
	group.add(tree);
	return group;
}

function createOpenSourceEngineRoom(color, secondary) {
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.BoxGeometry(2.85, 0.26, 1.08),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.66, metalness: 0.04 })
	);
	base.position.y = 0.13;
	group.add(base);

	const sign = createReadableLabel(createOpenSourceSignTexture('OPEN SOURCE', 'engine room', color), 1.82, 0.48);
	sign.position.set(0, 1.75, -0.56);
	group.add(sign);

	const serverA = createServerStack(color);
	serverA.scale.setScalar(0.62);
	serverA.position.set(-0.78, 0.26, 0.05);
	group.add(serverA);
	const serverB = createServerStack(secondary);
	serverB.scale.setScalar(0.56);
	serverB.position.set(0.18, 0.26, 0.05);
	group.add(serverB);
	const laptop = createLoadedModel('laptop', { targetHeight: 0.42, fallback: 'screen' });
	laptop.position.set(0.98, 0.28, -0.08);
	laptop.rotation.y = -0.28;
	group.add(laptop);

	const projectStrip = openSourceProjectItems.slice(0, 6);
	projectStrip.forEach((item, index) => {
		const chip = createReadableLabel(createOpenSourceSignTexture(item.title, item.note, item.color), 0.68, 0.28);
		chip.position.set(-1.05 + index * 0.42, 0.58 + (index % 2) * 0.24, -0.6);
		chip.rotation.y = -0.02 + index * 0.012;
		group.add(chip);
	});

	const portal = createApiPortal(color, secondary, 0.42);
	portal.position.set(0.96, 0.3, 0.38);
	portal.rotation.y = Math.PI;
	group.add(portal);
	return group;
}

function createAtriumPlanter(color, secondary) {
	const group = new THREE.Group();
	const planter = new THREE.Mesh(
		new THREE.BoxGeometry(1.55, 0.34, 0.58),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.72 })
	);
	planter.position.y = 0.17;
	group.add(planter);

	const accent = new THREE.Mesh(
		new THREE.BoxGeometry(1.61, 0.06, 0.62),
		new THREE.MeshBasicMaterial({ color })
	);
	accent.position.y = 0.37;
	group.add(accent);

	for (const [index, x] of [-0.46, 0, 0.46].entries()) {
		const plant = createPlant(index === 1 ? secondary : color, 0.56);
		plant.position.set(x, 0.24, 0);
		group.add(plant);
	}
	return group;
}

function createWapuuDocent(color, secondary) {
	const group = new THREE.Group();
	const pedestal = createPedestal(1.36, 0.32, color);
	group.add(pedestal);

	const wapuu = createWapuu3D({ height: 2.1, accent: secondary });
	wapuu.position.y = 0.3;
	registerAnimation(wapuu, (object, elapsed) => {
		object.position.y = 0.3 + Math.sin(elapsed * 1.15) * 0.05;
		const parent = object.parent;
		if (parent) {
			const cameraLocal = camera.position.clone();
			parent.worldToLocal(cameraLocal);
			const direction = new THREE.Vector3(
				cameraLocal.x - object.position.x,
				0,
				cameraLocal.z - object.position.z
			);
			if (direction.lengthSq() > 0.001) {
				const targetAngle = getRotationForNormal(direction.normalize());
				object.rotation.y = lerpAngle(object.rotation.y, targetAngle, 0.08);
			}
		}
		object.rotation.z = Math.sin(elapsed * 0.75) * 0.018;
	});
	group.add(wapuu);

	const label = createReadableLabel(createSmallSignTexture('WAPUU', color), 1.12, 0.26);
	label.position.set(0, 0.48, -0.58);
	group.add(label);

	const docentSign = createReadableLabel(createSmallSignTexture('OPEN SOURCE', secondary), 1.38, 0.28);
	docentSign.position.set(0.68, 2.42, -0.42);
	docentSign.rotation.z = -0.05;
	group.add(docentSign);
	group.add(createWapuuSparkles(color, secondary));

	const glow = new THREE.PointLight(new THREE.Color(secondary), 0.82, 6.8);
	glow.position.set(0, 1.32, -0.34);
	registerAnimation(glow, (object, elapsed) => {
		object.intensity = 0.72 + Math.sin(elapsed * 1.8) * 0.11;
	});
	group.add(glow);
	return group;
}

function createWapuu3D(options = {}) {
	// Canonical Wapuu: a round, squat yellow body (wider at the bottom) with
	// the WordPress logo on its belly, two broad orange ears, big black
	// eyes, an orange tail and little yellow paws.
	const height = options.height ?? 2;
	const unit = height / 2.4;
	const group = new THREE.Group();

	const yellow = new THREE.MeshStandardMaterial({ color: 0xffcf3d, roughness: 0.5, metalness: 0.03 });
	const yellowShade = new THREE.MeshStandardMaterial({ color: 0xf0b518, roughness: 0.54 });
	const orange = new THREE.MeshStandardMaterial({ color: 0xff8a2b, roughness: 0.47 });
	const orangeShade = new THREE.MeshStandardMaterial({ color: 0xe8701a, roughness: 0.5 });
	const black = new THREE.MeshStandardMaterial({ color: 0x14101a, roughness: 0.3, metalness: 0.05 });
	const white = new THREE.MeshStandardMaterial({ color: 0xfdfdf4, roughness: 0.28 });
	const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff9bb0, transparent: true, opacity: 0.5, depthWrite: false });

	// Feet sit on the ground and do not bob with the body.
	const footGeom = new THREE.SphereGeometry(0.16, 22, 16);
	for (const sx of [-1, 1]) {
		const foot = new THREE.Mesh(footGeom, yellowShade);
		foot.scale.set(0.8 * unit, 0.5 * unit, 1.15 * unit);
		foot.position.set(sx * 0.22 * unit, 0.085 * unit, 0.16 * unit);
		group.add(foot);
	}

	// Everything above the feet gently bobs together.
	const bob = new THREE.Group();
	group.add(bob);

	// Egg-shaped body: round head-blob over a wider belly.
	const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 30), yellow);
	body.scale.set(1.06 * unit, 1.04 * unit, 1.0 * unit);
	body.position.y = 0.66 * unit;
	bob.add(body);
	const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 36, 26), yellow);
	belly.scale.set(1.16 * unit, 0.82 * unit, 1.08 * unit);
	belly.position.set(0, 0.4 * unit, 0.0 * unit);
	bob.add(belly);

	// WordPress logo emblem, prominent on the lower belly.
	const emblem = new THREE.Mesh(
		new THREE.CircleGeometry(0.25 * unit, 48),
		new THREE.MeshBasicMaterial({ map: createWapuuWordmarkTexture(), transparent: true })
	);
	emblem.position.set(0, 0.46 * unit, 0.52 * unit);
	bob.add(emblem);

	// Two broad orange ears at the top corners, pointing up and out.
	const earGeom = new THREE.ConeGeometry(0.26, 0.5, 22);
	const earInnerGeom = new THREE.ConeGeometry(0.14, 0.3, 18);
	const ears = [];
	for (const sx of [-1, 1]) {
		const ear = new THREE.Mesh(earGeom, orange);
		ear.scale.set(unit, unit, 0.38 * unit);
		ear.position.set(sx * 0.34 * unit, 1.08 * unit, -0.02 * unit);
		ear.rotation.z = sx * -0.5;
		ear.rotation.x = -0.12;
		bob.add(ear);
		ears.push(ear);
		const inner = new THREE.Mesh(earInnerGeom, orangeShade);
		inner.scale.set(unit, unit, 0.38 * unit);
		inner.position.set(sx * 0.34 * unit, 1.04 * unit, 0.05 * unit);
		inner.rotation.z = sx * -0.5;
		inner.rotation.x = -0.12;
		bob.add(inner);
	}

	// Big round black eyes with highlights, subtle cheeks, tiny nose.
	const eyeGeom = new THREE.SphereGeometry(0.1, 22, 18);
	for (const sx of [-1, 1]) {
		const eye = new THREE.Mesh(eyeGeom, black);
		eye.scale.set(0.92 * unit, 1.12 * unit, 0.66 * unit);
		eye.position.set(sx * 0.19 * unit, 0.82 * unit, 0.44 * unit);
		bob.add(eye);
		const hl = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), white);
		hl.position.set(sx * 0.19 * unit + 0.04 * unit, 0.88 * unit, 0.5 * unit);
		hl.scale.setScalar(unit);
		bob.add(hl);
		const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.075 * unit, 20), cheekMat);
		cheek.position.set(sx * 0.36 * unit, 0.68 * unit, 0.4 * unit);
		cheek.rotation.y = sx * -0.55;
		bob.add(cheek);
	}
	const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), black);
	nose.scale.set(1.3 * unit, 0.9 * unit, unit);
	nose.position.set(0, 0.69 * unit, 0.52 * unit);
	bob.add(nose);

	// Orange tail with a curled tip.
	const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), orange);
	tail.scale.set(0.72 * unit, 0.95 * unit, 0.72 * unit);
	tail.position.set(0.04 * unit, 0.36 * unit, -0.54 * unit);
	bob.add(tail);
	const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), orangeShade);
	tailTip.scale.setScalar(unit);
	tailTip.position.set(0.17 * unit, 0.54 * unit, -0.6 * unit);
	bob.add(tailTip);

	// Little yellow paws.
	for (const sx of [-1, 1]) {
		const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), yellowShade);
		hand.scale.set(unit, 1.05 * unit, unit);
		hand.position.set(sx * 0.5 * unit, 0.4 * unit, 0.12 * unit);
		bob.add(hand);
	}

	if (options.idle !== false) {
		registerAnimation(bob, (object, elapsed) => {
			object.position.y = Math.sin(elapsed * 1.5) * 0.02 * unit;
			object.rotation.z = Math.sin(elapsed * 0.8) * 0.02;
			ears[0].rotation.z = -0.5 + Math.sin(elapsed * 1.9) * 0.08;
			ears[1].rotation.z = 0.5 - Math.sin(elapsed * 1.9) * 0.08;
		});
	}
	return group;
}

function createWapuuWordmarkTexture() {
	if (wapuuWordmarkTexture) {
		return wapuuWordmarkTexture;
	}
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	// WordPress logo: white "W" inside a blue disc.
	ctx.fillStyle = '#1e6a93';
	ctx.beginPath();
	ctx.arc(128, 128, 96, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#0d4f72';
	ctx.beginPath();
	ctx.arc(128, 128, 96, 0, Math.PI * 2);
	ctx.lineWidth = 10;
	ctx.strokeStyle = '#0d4f72';
	ctx.stroke();
	ctx.fillStyle = '#fdfdf4';
	ctx.font = '900 150px Georgia, "Times New Roman", serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('W', 128, 150);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	wapuuWordmarkTexture = texture;
	return texture;
}

function createWapuuSparkles(color, secondary) {
	const group = new THREE.Group();
	const colors = [color, secondary, 0xfff5df];
	for (let index = 0; index < 7; index++) {
		const sparkle = new THREE.Mesh(
			new THREE.OctahedronGeometry(0.055 + (index % 3) * 0.014, 0),
			new THREE.MeshBasicMaterial({
				color: colors[index % colors.length],
				transparent: true,
				opacity: 0.88,
				depthWrite: false,
			})
		);
		const angle = -0.8 + index * 0.32;
		const radius = 0.82 + (index % 2) * 0.18;
		sparkle.userData.base = {
			x: Math.cos(angle) * radius,
			y: 1.34 + (index % 4) * 0.34,
			z: -0.36 - (index % 2) * 0.1,
		};
		sparkle.position.set(sparkle.userData.base.x, sparkle.userData.base.y, sparkle.userData.base.z);
		registerAnimation(sparkle, (object, elapsed) => {
			const base = object.userData.base;
			const pulse = 0.76 + Math.sin(elapsed * 2.1 + index) * 0.18;
			object.position.y = base.y + Math.sin(elapsed * 1.2 + index) * 0.035;
			object.rotation.y += 0.018 + index * 0.001;
			object.scale.setScalar(pulse);
			object.material.opacity = 0.66 + Math.sin(elapsed * 2.3 + index) * 0.16;
		});
		group.add(sparkle);
	}
	return group;
}

function createMuseumInfoDesk(color, secondary) {
	const group = new THREE.Group();
	const desk = new THREE.Mesh(
		new THREE.BoxGeometry(1.92, 0.46, 0.66),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.62, metalness: 0.04 })
	);
	desk.position.y = 0.23;
	group.add(desk);
	const stripe = new THREE.Mesh(
		new THREE.BoxGeometry(1.98, 0.07, 0.7),
		new THREE.MeshBasicMaterial({ color })
	);
	stripe.position.y = 0.5;
	group.add(stripe);
	const screen = createAdminScreenPanel(color, secondary, 0.72, 0.42);
	screen.position.set(-0.47, 0.8, -0.35);
	screen.rotation.x = -0.06;
	group.add(screen);
	const laptop = createLoadedModel('laptop', {
		targetHeight: 0.34,
		fallback: 'screen',
	});
	laptop.position.set(0.47, 0.52, -0.14);
	laptop.rotation.y = -0.24;
	group.add(laptop);
	const sign = createReadableLabel(createSmallSignTexture('PLAYGROUND', secondary), 1.3, 0.25);
	sign.position.set(0, 0.66, -0.39);
	group.add(sign);

	const miniWapuu = createWapuu3D({ height: 0.5, accent: 0xffd166 });
	miniWapuu.position.set(0.73, 0.46, 0.16);
	miniWapuu.rotation.y = -0.45;
	group.add(miniWapuu);

	const counter = createVisitorCounter();
	counter.position.set(-1.42, 0, 0.18);
	counter.rotation.y = 0.18;
	group.add(counter);
	return group;
}

function createVisitorCounter() {
	// A Web 1.0 "hit counter" odometer on a stand — a wink at 2004-era
	// homepages. Stands on the floor beside the info desk, facing visitors.
	const group = new THREE.Group();
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.16, 0.2, 0.08, 18),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.68 })
	);
	base.position.y = 0.04;
	group.add(base);
	const post = new THREE.Mesh(
		new THREE.CylinderGeometry(0.035, 0.045, 0.86, 12),
		new THREE.MeshStandardMaterial({ color: 0x6b6b78, roughness: 0.4, metalness: 0.5 })
	);
	post.position.y = 0.5;
	group.add(post);
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(0.6, 0.28, 0.12),
		new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.42, metalness: 0.12 })
	);
	body.position.y = 1.04;
	group.add(body);
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.54, 0.2),
		new THREE.MeshBasicMaterial({ map: createVisitorCounterTexture(), transparent: true })
	);
	screen.position.set(0, 1.04, 0.062);
	group.add(screen);
	return group;
}

function createVisitorCounterTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 180;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#05060a';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#39ff6a';
	ctx.font = '700 26px ui-monospace, Menlo, monospace';
	ctx.textAlign = 'center';
	ctx.fillText('YOU ARE VISITOR', 256, 40);
	// odometer digits on little dark cells
	const digits = '00424242';
	const cellW = 50;
	const startX = 256 - (digits.length * cellW) / 2;
	for (let i = 0; i < digits.length; i++) {
		const x = startX + i * cellW;
		ctx.fillStyle = '#0c1530';
		ctx.fillRect(x + 4, 70, cellW - 8, 86);
		ctx.fillStyle = '#ffd23f';
		ctx.font = '900 64px ui-monospace, Menlo, monospace';
		ctx.fillText(digits[i], x + cellW / 2, 138);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function addAtriumBenches(group) {
	// Proper-scale benches flanking the entrance/Playground desk, facing the
	// mural so visitors can sit and take in the rotunda.
	for (const benchX of [-3.6, 3.6]) {
		addPlaced(group, createLoadedModel('detailBench', {
			targetHeight: 0.86,
			fallback: 'bench',
		}), benchX, -4.7, 0);
	}
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
	const stations = getEraVignetteStations(roomIndex);
	getEraVignetteItems(room, color, secondary).forEach((item, index) => {
		const station = stations[index];
		addLocal(
			group,
			createVignetteStation(color, item.label, item.object, {
				...item,
				objectScale: index === 2 ? 0.72 : 1,
			}),
			station.x,
			station.z,
			station.rotation
		);
	});
	if (isCurrentVariant) {
		addEraModelProps(group, room, roomIndex, color, secondary);
		group.add(createEraCatchphraseSign(room, color, secondary));
		group.add(createRoomDustMotes(color));
		const fact = getEraHistoryFact(room.era);
		if (fact) {
			const flyer = createFloorFlyer(fact, color);
			addLocal(group, flyer, -1.7, -roomDepth / 2 + 2.1, 0.5 + roomIndex * 0.3);
		}
		group.add(createWebEraPoster(room));
	}
	addRoomVignetteLights(group, color);
}

// A framed "what the web looked like then" poster — a period-styled
// browser mock-up — on each room's front side-wall bay near the entrance.
function createWebEraPoster(room) {
	const group = new THREE.Group();
	const posterW = 1.24;
	const posterH = 1.62;
	const x = -roomWidth / 2 + wallThickness / 2 + 0.06;
	const z = -roomDepth / 2 + 1.6;
	const frameMat = new THREE.MeshStandardMaterial({
		color: 0xc79b43,
		emissive: 0x2a1c06,
		emissiveIntensity: 0.08,
		roughness: 0.34,
		metalness: 0.46,
	});
	const frame = new THREE.Mesh(new THREE.BoxGeometry(posterW + 0.16, posterH + 0.16, 0.08), frameMat);
	frame.position.set(x, 2.35, z);
	frame.rotation.y = Math.PI / 2;
	group.add(frame);
	const art = new THREE.Mesh(
		new THREE.PlaneGeometry(posterW, posterH),
		new THREE.MeshBasicMaterial({ map: createWebEraPosterTexture(room.era), side: THREE.DoubleSide })
	);
	art.position.set(x + 0.05, 2.35, z);
	art.rotation.y = Math.PI / 2;
	group.add(art);
	return group;
}

function createWebEraPosterTexture(era) {
	const canvas = document.createElement('canvas');
	canvas.width = 540;
	canvas.height = 680;
	const ctx = canvas.getContext('2d');
	const spec = {
		'Blogging Roots': { year: '2004', heading: 'THE WEB IN 2004', chrome: 'ie', bg: '#5b7fb4', note: 'tables, visitor counters & “Web 1.5”' },
		'Dashboard Foundations': { year: '2007', heading: 'THE WEB IN 2007', chrome: 'firefox', bg: 'web2', note: 'Web 2.0 — gloss, reflections & beta badges' },
		'CMS Toolkit': { year: '2011', heading: 'THE WEB IN 2011', chrome: 'safari', bg: 'skeuo', note: 'skeuomorphism & the responsive turn' },
		'Modern Admin': { year: '2014', heading: 'THE WEB IN 2014', chrome: 'chrome', bg: 'flat', note: 'flat design & bold colour' },
		'API and Customizer': { year: '2016', heading: 'THE WEB IN 2016', chrome: 'chrome', bg: 'material', note: 'cards, Material & the mobile-first web' },
		'Block Editor': { year: '2018', heading: 'THE WEB IN 2018', chrome: 'chrome', bg: 'minimal', note: 'big type, whitespace & block layouts' },
		'Blocks Everywhere': { year: '2022', heading: 'THE WEB IN 2022', chrome: 'modern', bg: 'darkmode', note: 'system fonts, dark mode & full-site editing' },
	}[era] || { year: '20XX', heading: 'THE WEB', chrome: 'chrome', bg: '#444', note: '' };

	// Paper backing.
	ctx.fillStyle = '#10131c';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);

	ctx.fillStyle = '#241a0c';
	ctx.font = '900 38px Georgia, serif';
	ctx.textAlign = 'center';
	ctx.fillText(spec.heading, canvas.width / 2, 76);

	// Browser window.
	const bx = 48;
	const by = 110;
	const bw = canvas.width - 96;
	const bh = 420;
	drawBrowserChrome(ctx, bx, by, bw, bh, spec.chrome);
	const cy = by + 46;
	const ch = bh - 46;
	drawEraPage(ctx, bx, cy, bw, ch, spec.bg);

	ctx.fillStyle = '#3a2c14';
	ctx.font = 'italic 24px Georgia, serif';
	ctx.fillText(spec.note, canvas.width / 2, by + bh + 56);
	ctx.fillStyle = '#9a7a3a';
	ctx.font = '700 20px ui-monospace, Menlo, monospace';
	ctx.fillText('webdesignmuseum.org', canvas.width / 2, canvas.height - 48);

	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function drawBrowserChrome(ctx, x, y, w, h, kind) {
	const barH = 46;
	// Window body.
	ctx.fillStyle = '#dfe3ea';
	ctx.fillRect(x, y, w, h);
	// Title/tool bar.
	ctx.fillStyle = kind === 'modern' || kind === 'chrome' ? '#2b2f36' : '#c7d0dc';
	ctx.fillRect(x, y, w, barH);
	if (kind === 'ie') {
		ctx.fillStyle = '#1f50a8';
		ctx.fillRect(x, y, w, barH);
		ctx.fillStyle = '#fff';
		ctx.font = '700 18px Tahoma, sans-serif';
		ctx.textAlign = 'left';
		ctx.fillText('Internet Explorer', x + 12, y + 28);
	} else {
		// Traffic dots / nav.
		const dot = (cx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, y + barH / 2, 7, 0, Math.PI * 2); ctx.fill(); };
		if (kind === 'safari' || kind === 'firefox') { dot(x + 18, '#ff5f57'); dot(x + 40, '#febc2e'); dot(x + 62, '#28c840'); }
		// URL pill.
		ctx.fillStyle = kind === 'modern' || kind === 'chrome' ? '#3c4250' : '#eef2f7';
		const ux = x + 92;
		ctx.fillRect(ux, y + 11, w - 110, 24);
		ctx.fillStyle = kind === 'modern' || kind === 'chrome' ? '#aab3c2' : '#5a6472';
		ctx.font = '15px ui-monospace, Menlo, monospace';
		ctx.textAlign = 'left';
		ctx.fillText('https://example.com', ux + 12, y + 28);
	}
	ctx.textAlign = 'center';
}

function drawEraPage(ctx, x, y, w, h, bg) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	if (bg === 'web2') {
		const g = ctx.createLinearGradient(x, y, x, y + h);
		g.addColorStop(0, '#eaf4ff'); g.addColorStop(1, '#bcdcff');
		ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
		// glossy header
		ctx.fillStyle = '#2a8fd8'; roundRectPath(ctx, x + 20, y + 20, w - 40, 70, 12); ctx.fill();
		ctx.fillStyle = 'rgba(255,255,255,0.35)'; roundRectPath(ctx, x + 24, y + 24, w - 48, 28, 10); ctx.fill();
		// beta starburst
		drawStarburst(ctx, x + w - 60, y + 60, 38, '#ff5b4a', 'BETA');
		ctx.fillStyle = '#3a6ea5'; ctx.font = '900 30px Helvetica, Arial, sans-serif'; ctx.textAlign = 'left';
		ctx.fillText('Web 2.0', x + 40, y + 66);
		for (let i = 0; i < 3; i++) { ctx.fillStyle = '#ffffff'; roundRectPath(ctx, x + 24 + i * (w / 3 - 8), y + 110, w / 3 - 24, h - 150, 12); ctx.fill(); ctx.strokeStyle = '#9cc4ec'; ctx.stroke(); }
	} else if (bg === 'flat') {
		const cols = ['#1abc9c', '#3498db', '#e74c3c', '#f1c40f'];
		ctx.fillStyle = '#ecf0f1'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#2c3e50'; ctx.fillRect(x, y, w, 64);
		for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(x + 20 + i * (w / 4), y + 88, w / 4 - 26, h - 120); }
	} else if (bg === 'skeuo') {
		const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#cfd6dd'); g.addColorStop(1, '#9aa6b2');
		ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
		for (let i = 0; i < 6; i++) { const gx = x + 30 + (i % 3) * (w / 3); const gy = y + 30 + Math.floor(i / 3) * (h / 2 - 10); const gg = ctx.createLinearGradient(gx, gy, gx, gy + 90); gg.addColorStop(0, '#fefefe'); gg.addColorStop(1, '#c4ccd4'); ctx.fillStyle = gg; roundRectPath(ctx, gx, gy, w / 3 - 50, 90, 16); ctx.fill(); ctx.strokeStyle = '#7d8893'; ctx.stroke(); }
	} else if (bg === 'material') {
		ctx.fillStyle = '#fafafa'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#6200ee'; ctx.fillRect(x, y, w, 70);
		for (let i = 0; i < 4; i++) { ctx.fillStyle = '#fff'; const cyy = y + 90 + i * 78; roundRectPath(ctx, x + 24, cyy, w - 48, 64, 8); ctx.fill(); ctx.fillStyle = '#03dac6'; ctx.beginPath(); ctx.arc(x + 56, cyy + 32, 18, 0, Math.PI * 2); ctx.fill(); }
		ctx.fillStyle = '#ff4081'; ctx.beginPath(); ctx.arc(x + w - 50, y + h - 50, 28, 0, Math.PI * 2); ctx.fill();
	} else if (bg === 'minimal') {
		ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#111'; ctx.font = '900 46px Helvetica, Arial, sans-serif'; ctx.textAlign = 'left';
		ctx.fillText('Big type.', x + 30, y + 90); ctx.fillText('More space.', x + 30, y + 140);
		ctx.fillStyle = '#eee'; ctx.fillRect(x + 30, y + 180, w - 60, 2);
		for (let i = 0; i < 2; i++) { ctx.fillStyle = '#f3f3f3'; roundRectPath(ctx, x + 30 + i * (w / 2 - 10), y + 210, w / 2 - 50, h - 250, 10); ctx.fill(); }
	} else if (bg === 'darkmode') {
		ctx.fillStyle = '#0f1420'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#1b2333'; roundRectPath(ctx, x + 24, y + 24, w - 48, 60, 10); ctx.fill();
		ctx.fillStyle = '#2bb7ff'; ctx.font = '900 28px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('● dark mode', x + 40, y + 62);
		for (let i = 0; i < 3; i++) { ctx.fillStyle = '#1b2333'; roundRectPath(ctx, x + 24, y + 104 + i * ((h - 130) / 3), w - 48, (h - 130) / 3 - 14, 10); ctx.fill(); }
	} else {
		// IE-era 2004 page: gray bg, blue header, table layout, hit counter.
		ctx.fillStyle = '#dfe6ef'; ctx.fillRect(x, y, w, h);
		ctx.fillStyle = bg.startsWith('#') ? bg : '#5b7fb4'; ctx.fillRect(x + 16, y + 16, w - 32, 56);
		ctx.fillStyle = '#fff'; ctx.font = '900 26px "Times New Roman", serif'; ctx.textAlign = 'left'; ctx.fillText('My Home Page', x + 30, y + 52);
		ctx.fillStyle = '#cdd7e2'; ctx.fillRect(x + 16, y + 84, 120, h - 110);
		ctx.fillStyle = '#fff'; ctx.fillRect(x + 148, y + 84, w - 168, h - 110);
		ctx.fillStyle = '#000'; ctx.font = '14px "Times New Roman", serif';
		ctx.fillText('Welcome to my website!', x + 160, y + 112);
		ctx.fillStyle = '#111'; ctx.fillRect(x + 160, y + h - 80, 130, 28);
		ctx.fillStyle = '#39ff6a'; ctx.font = '700 18px ui-monospace, monospace'; ctx.fillText('00042', x + 172, y + h - 60);
		ctx.fillStyle = '#000'; ctx.font = '11px Arial'; ctx.fillText('visitors', x + 300, y + h - 60);
	}
	ctx.restore();
}

function drawStarburst(ctx, cx, cy, r, color, text) {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.fillStyle = color;
	ctx.beginPath();
	const points = 12;
	for (let i = 0; i < points * 2; i++) {
		const rad = i % 2 === 0 ? r : r * 0.72;
		const a = (Math.PI * i) / points;
		ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
	}
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#fff';
	ctx.font = '900 16px Arial, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 0, 0);
	ctx.restore();
	ctx.textBaseline = 'alphabetic';
}

function getEraHistoryFact(era) {
	return {
		'Blogging Roots': {
			tag: 'FROM THE ARCHIVE',
			title: 'Forked from b2/cafelog',
			lines: ['27 May 2003 · released under the GPL', 'First post: “Hello world!”', '— Matt Mullenweg & Mike Little'],
		},
		'Dashboard Foundations': {
			tag: 'COMMUNITY',
			title: 'The first WordCamp',
			lines: ['San Francisco · 5 August 2006', 'Plugin Directory 2007 · Themes 2008', 'Akismet keeps the spam out'],
		},
		'CMS Toolkit': {
			tag: 'MASCOT',
			title: 'Wapuu says hello',
			lines: ['Unveiled at WordCamp Fukuoka, 2011', 'Twenty Ten: first yearly default theme', 'Now a full content-management toolkit'],
		},
		'Modern Admin': {
			tag: 'DESIGN',
			title: 'MP6 → the flat admin',
			lines: ['Responsive dashboard · Open Sans · 2013', 'Background auto-updates since 3.7', 'Emoji land in 4.2 🎉'],
		},
		'API and Customizer': {
			tag: 'OPEN PROJECT',
			title: 'Five for the Future',
			lines: ['Pledge 5% of resources back · 2014', 'The REST API opens the side door', 'Customize, preview, then publish'],
		},
		'Block Editor': {
			tag: 'MILESTONE',
			title: 'Gutenberg ships',
			lines: ['WordPress 5.0 · 6 December 2018', 'Content becomes movable blocks', 'Type “/” to add a block'],
		},
		'Blocks Everywhere': {
			tag: 'TODAY',
			title: 'Full Site Editing',
			lines: ['WP 5.9 “Joséphine” · 2022', 'Block themes & the Style Book', 'The whole site is blocks now'],
		},
	}[era];
}

function createFloorFlyer(fact, color) {
	const group = new THREE.Group();
	const width = 0.66;
	const height = 0.88;
	const shadow = new THREE.Mesh(
		new THREE.PlaneGeometry(width * 1.12, height * 1.1),
		new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
	);
	shadow.rotation.x = -Math.PI / 2;
	shadow.position.set(0.04, 0.012, 0.05);
	group.add(shadow);
	const card = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({ map: createFlyerTexture(fact, color), side: THREE.DoubleSide })
	);
	card.rotation.x = -Math.PI / 2;
	card.position.y = 0.022;
	group.add(card);
	return group;
}

function createFlyerTexture(fact, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 680;
	const ctx = canvas.getContext('2d');
	// Aged paper.
	ctx.fillStyle = '#f4ead0';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'rgba(120, 95, 50, 0.06)';
	for (let i = 0; i < 60; i++) {
		const x = pseudoRandom(i * 2.1) * canvas.width;
		const y = pseudoRandom(i * 3.7) * canvas.height;
		ctx.fillRect(x, y, 2 + pseudoRandom(i) * 5, 2);
	}
	const accent = '#' + new THREE.Color(color).getHexString();
	ctx.fillStyle = accent;
	ctx.fillRect(0, 0, canvas.width, 18);
	ctx.fillRect(0, canvas.height - 18, canvas.width, 18);

	ctx.fillStyle = accent;
	ctx.font = '700 30px ui-monospace, Menlo, monospace';
	ctx.textAlign = 'center';
	ctx.fillText(fact.tag, canvas.width / 2, 78);

	ctx.fillStyle = '#241a0c';
	ctx.font = '900 50px Georgia, "Times New Roman", serif';
	wrapText(ctx, fact.title, canvas.width / 2, 150, canvas.width - 60, 54, 2);

	ctx.fillStyle = '#3a2c14';
	ctx.font = '400 30px Georgia, serif';
	let y = 300;
	for (const line of fact.lines) {
		wrapText(ctx, line, canvas.width / 2, y, canvas.width - 70, 36, 2);
		y += 64;
	}

	// WP stamp.
	ctx.strokeStyle = accent;
	ctx.lineWidth = 5;
	ctx.beginPath();
	ctx.arc(canvas.width / 2, 580, 52, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = accent;
	ctx.font = '900 60px Georgia, serif';
	ctx.fillText('W', canvas.width / 2, 602);

	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function createEraCatchphraseSign(room, color, secondary) {
	const group = new THREE.Group();
	const phrase = getEraCatchphrase(room.era);
	const board = new THREE.Mesh(
		new THREE.PlaneGeometry(4.8, 1.05),
		new THREE.MeshBasicMaterial({
			map: createNeonSignTexture(phrase, color, secondary),
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
		})
	);
	const baseY = wallHeight - 1.85;
	const signZ = 0.6;
	board.position.set(0, baseY, signZ);
	board.rotation.y = Math.PI;
	registerAnimation(board, (object, elapsed) => {
		object.position.y = baseY + Math.sin(elapsed * 0.95) * 0.045;
	});
	group.add(board);

	const halo = new THREE.Mesh(
		new THREE.PlaneGeometry(5.4, 1.6),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.12,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
		})
	);
	halo.position.set(0, baseY, signZ + 0.06);
	halo.rotation.y = Math.PI;
	registerAnimation(halo, (object, elapsed) => {
		object.material.opacity = 0.08 + (Math.sin(elapsed * 2.4) * 0.5 + 0.5) * 0.18;
	});
	group.add(halo);

	const lineMat = new THREE.MeshBasicMaterial({
		color: 0xfff5df,
		transparent: true,
		opacity: 0.5,
	});
	for (const xSign of [-1, 1]) {
		const cable = new THREE.Mesh(
			new THREE.CylinderGeometry(0.018, 0.018, 0.95, 6),
			lineMat
		);
		cable.position.set(xSign * 1.95, wallHeight - 0.9, signZ);
		group.add(cable);
	}
	return group;
}

function createNeonSignTexture(text, color, secondary) {
	const canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 224;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = 'rgba(8, 12, 24, 0.94)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.22;
	ctx.fillRect(12, 12, canvas.width - 24, canvas.height - 24);
	ctx.globalAlpha = 1;
	ctx.strokeStyle = color;
	ctx.lineWidth = 4;
	ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
	ctx.strokeStyle = secondary;
	ctx.lineWidth = 1.5;
	ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

	const phraseColor = color;
	ctx.fillStyle = phraseColor;
	ctx.font = '900 92px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.shadowColor = phraseColor;
	ctx.shadowBlur = 22;
	ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
	ctx.shadowBlur = 0;
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 92px Arial Black, Impact, sans-serif';
	ctx.fillText(text, canvas.width / 2, canvas.height / 2);

	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return tex;
}

function getEraCatchphrase(era) {
	return {
		'Blogging Roots': 'Hello, world.',
		'Dashboard Foundations': 'Just write.',
		'CMS Toolkit': 'Not just a blog.',
		'Modern Admin': 'MP6 is here.',
		'API and Customizer': '/wp-json',
		'Block Editor': '/ to add a block',
		'Blocks Everywhere': 'Everything is a block.',
	}[era] || 'Code is poetry.';
}

function createRoomDustMotes(color) {
	const group = new THREE.Group();
	const material = new THREE.MeshBasicMaterial({
		color: 0xfff2c8,
		transparent: true,
		opacity: 0.5,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	for (let index = 0; index < 7; index++) {
		const mote = new THREE.Mesh(
			new THREE.SphereGeometry(0.035 + (index % 3) * 0.01, 6, 6),
			material.clone()
		);
		const baseX = -roomWidth / 2 + 0.6 + Math.random() * (roomWidth - 1.2);
		const baseZ = -roomDepth / 2 + 0.6 + Math.random() * (roomDepth - 1.2);
		const baseY = 1.4 + Math.random() * (wallHeight - 2.4);
		mote.userData.base = {
			x: baseX, y: baseY, z: baseZ,
			speed: 0.18 + Math.random() * 0.3,
			phase: Math.random() * Math.PI * 2,
		};
		mote.position.set(baseX, baseY, baseZ);
		registerAnimation(mote, (object, elapsed) => {
			const b = object.userData.base;
			object.position.y = b.y + Math.sin(elapsed * b.speed + b.phase) * 0.4;
			object.material.opacity = 0.26 + (Math.sin(elapsed * 0.9 + index) * 0.5 + 0.5) * 0.26;
		});
		group.add(mote);
	}
	return group;
}

function addEraModelProps(group, room, roomIndex, color, secondary) {
	// Two grounded ambient props tucked into the entrance corners of each
	// room. Era-appropriate: early rooms get a beige CRT, later rooms get
	// laptops, TVs, and lounge furniture. No free-floating door/arch models.
	const model = (key, height, fallback) =>
		createLoadedModel(key, { targetHeight: height, fallback });
	const propSets = {
		'Blogging Roots': [
			{ obj: model('radio', 0.46, 'radio'), x: -4.6, z: -4.2, rot: 0.5 },
			{ obj: createIMacG4Exhibit(color), x: 4.55, z: -4.3, rot: -0.62 },
		],
		'Dashboard Foundations': [
			{ obj: createIPhoneExhibit(color), x: -4.55, z: -4.3, rot: 0.62 },
			{ obj: model('loungeDesignChair', 0.62, 'bench'), x: 4.65, z: -4.2, rot: -0.5 },
		],
		'CMS Toolkit': [
			{ obj: createIPadEaselExhibit(color), x: -4.55, z: -4.3, rot: 0.62 },
			{ obj: model('bookcaseOpenLow', 0.86, 'bookcase'), x: 4.65, z: -4.2, rot: -0.5 },
		],
		'Modern Admin': [
			{ obj: model('laptop', 0.46, 'screen'), x: -4.6, z: -3.66, rot: 0.5 },
			{ obj: model('televisionVintage', 0.72, 'screen'), x: 4.7, z: -3.78, rot: -0.5 },
		],
		'API and Customizer': [
			{ obj: createRetroCRT(color, secondary), x: -4.55, z: -3.7, rot: 0.5 },
			{ obj: model('loungeDesignSofa', 0.6, 'bench'), x: 4.7, z: -3.82, rot: -0.5 },
		],
		'Block Editor': [
			{ obj: model('laptop', 0.46, 'screen'), x: -4.6, z: -3.66, rot: 0.5 },
			{ obj: model('loungeDesignSofa', 0.58, 'bench'), x: 4.68, z: -3.82, rot: -0.5 },
		],
		'Blocks Everywhere': [
			{ obj: model('tableCoffee', 0.34, 'block'), x: -4.62, z: -3.74, rot: 0.42 },
			{ obj: model('pottedPlant', 0.88, 'plant'), x: 4.62, z: -3.78, rot: -0.42 },
		],
	};
	(propSets[room.era] || []).forEach(({ obj, x, z, rot }) => {
		addLocal(group, obj, x, z, rot);
	});
	const floorLight = createMuseumLamp(roomIndex % 2 ? color : secondary);
	floorLight.scale.setScalar(0.8);
	addLocal(group, floorLight, roomIndex % 2 ? -5.1 : 5.1, -4.05, 0);
}

function getEraVignetteStations(roomIndex = 0) {
	const sideStationZ = -roomDepth / 2 + 3.86;
	const centerOffset = roomIndex % 2 ? -2.05 : 2.05;
	return [
		{ x: -4.85, z: sideStationZ, rotation: -Math.PI / 2 },
		{ x: 4.85, z: sideStationZ, rotation: Math.PI / 2 },
		{
			x: centerOffset,
			z: -0.78,
			rotation: roomIndex % 2 ? -Math.PI / 5 : Math.PI / 5,
		},
	];
}

function getEraVignetteItems(room, color, secondary) {
	return {
		'Blogging Roots': [
			{ label: 'HELLO DOLLY', object: createRecordStack(color, { showLabel: false }), width: 1.6 },
			{ label: 'THE LOOP', object: createLoopSculpture(color, secondary), width: 1.5 },
			{ label: 'COMMENTS', object: createCommentSculpture(secondary), width: 1.45 },
		],
		'Dashboard Foundations': [
			{ label: 'DASHBOARD', object: createDashboardDisplay(color, secondary), width: 1.55 },
			{ label: '/WP-ADMIN', object: createKnobConsole(color), width: 1.55 },
			{ label: 'PLUGINS', object: createPluginCrates(color), width: 1.55 },
		],
		'CMS Toolkit': [
			{ label: 'MENUS', object: createMenuShelf(color, secondary), width: 1.6 },
			{ label: 'POST TYPES', object: createDisplayCase(secondary, 'CPT', { showLabel: false }), width: 1.5 },
			{ label: 'CUSTOMIZER', object: createKnobConsole(color), width: 1.55 },
		],
		'Modern Admin': [
			{ label: 'MP6 DESK', object: createTerminalDesk(color), width: 1.7 },
			{ label: 'AUTOSAVE', object: createDisplayCase(secondary, 'SAVE', { showLabel: false }), width: 1.5 },
			{ label: 'RESPONSIVE', object: createResponsivePreview(color, secondary), width: 1.6 },
		],
		'API and Customizer': [
			{ label: 'REST API', object: createApiPortal(color, secondary, 0.62), width: 1.55 },
			{ label: 'JSON', object: createOrbitalSculpture(secondary), width: 1.45 },
			{ label: 'MEDIA', object: createCommentAquarium(secondary, color, 0.54), width: 1.65 },
		],
		'Block Editor': [
			{ label: 'BLOCKS', object: createBlockFountain(color, 0.62), width: 1.55 },
			{ label: 'GUTENBERG', object: createDisplayCase(secondary, '5.0', { showLabel: false }), width: 1.55 },
			{ label: 'GROUPS', object: createDisplayCase(secondary, 'GROUP', { showLabel: false }), width: 1.55 },
		],
		'Blocks Everywhere': [
			{ label: 'PATTERNS', object: createBlockFountain(color, 0.58), width: 1.55 },
			{ label: 'SITE EDITOR', object: createDisplayCase(secondary, 'FSE', { showLabel: false }), width: 1.55 },
			{ label: 'STYLE BOOK', object: createStyleBookDisplay(color, secondary), width: 1.7 },
		],
	}[room.era];
}

function createVignetteStation(color, labelText, object, options = {}) {
	const group = new THREE.Group();
	const width = (options.width || 1.5) * 0.96;
	const depth = (options.depth || 1.02) * 0.96;
	const baseHeight = 0.28;
	const base = new THREE.Mesh(
		new THREE.BoxGeometry(width, baseHeight, depth),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.66 })
	);
	base.position.y = baseHeight / 2;
	group.add(base);

	const plinth = new THREE.Mesh(
		new THREE.BoxGeometry(width * 0.82, 0.12, depth * 0.78),
		new THREE.MeshStandardMaterial({ color: 0xe5dbc6, roughness: 0.7 })
	);
	plinth.position.y = baseHeight + 0.05;
	group.add(plinth);

	const accent = new THREE.Mesh(
		new THREE.BoxGeometry(width + 0.04, 0.035, 0.09),
		new THREE.MeshBasicMaterial({ color })
	);
	accent.position.set(0, baseHeight + 0.082, -depth / 2 + 0.045);
	group.add(accent);

	const objectAnchor = new THREE.Group();
	object.position.y += baseHeight + 0.08;
	object.scale.multiplyScalar(options.objectScale || 1);
	objectAnchor.add(object);
	group.add(objectAnchor);

	const label = createReadableLabel(createSmallSignTexture(labelText, color), Math.min(width * 0.82, 1.14), 0.23);
	label.position.set(0, baseHeight + 0.16, -depth / 2 - 0.14);
	group.add(label);
	return group;
}

function createDashboardDisplay(color, secondary) {
	const group = new THREE.Group();
	group.add(createPedestal(1.08, 0.18, color));
	const screen = createAdminScreenPanel(color, secondary, 0.88, 0.5);
	screen.position.y = 0.74;
	group.add(screen);
	const stand = new THREE.Mesh(
		new THREE.BoxGeometry(0.16, 0.3, 0.1),
		new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 })
	);
	stand.position.y = 0.46;
	group.add(stand);
	return group;
}

function createMenuShelf(color, secondary) {
	const group = new THREE.Group();
	group.add(createPedestal(1.06, 0.18, color));
	const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.6 });
	const accentMaterial = new THREE.MeshBasicMaterial({ color: secondary });
	for (const x of [-0.42, 0.42]) {
		const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), frameMaterial);
		side.position.set(x, 0.64, 0);
		group.add(side);
	}
	for (let index = 0; index < 4; index++) {
		const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.055, 0.18), frameMaterial);
		shelf.position.set(0, 0.34 + index * 0.16, 0);
		group.add(shelf);
	}
	['POSTS', 'PAGES', 'TAGS'].forEach((_, index) => {
		const tab = new THREE.Mesh(new THREE.BoxGeometry(0.52 - index * 0.06, 0.055, 0.08), accentMaterial);
		tab.position.set(-0.12 + index * 0.08, 0.42 + index * 0.16, -0.12);
		group.add(tab);
	});
	return group;
}

function addRoomVignetteLights(group, color) {
	const leftLamp = createMuseumLamp(color);
	leftLamp.scale.setScalar(0.72);
	addLocal(group, leftLamp, -roomWidth / 2 + 0.75, -roomDepth / 2 + 1.2, 0);
	const rightLamp = createMuseumLamp(color);
	rightLamp.scale.setScalar(0.72);
	addLocal(group, rightLamp, roomWidth / 2 - 0.75, -roomDepth / 2 + 1.2, 0);
}

function createLoopSculpture(color, secondary) {
	const group = new THREE.Group();
	group.add(createPedestal(1.05, 0.22, color));
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(0.34, 0.055, 12, 48),
		new THREE.MeshStandardMaterial({ color: secondary, metalness: 0.28, roughness: 0.32 })
	);
	ring.position.y = 0.72;
	ring.rotation.x = Math.PI / 2;
	group.add(ring);
	const post = new THREE.Mesh(
		new THREE.CylinderGeometry(0.035, 0.05, 0.58, 12),
		new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.48 })
	);
	post.position.y = 0.48;
	group.add(post);
	const dot = new THREE.Mesh(
		new THREE.SphereGeometry(0.08, 14, 10),
		new THREE.MeshBasicMaterial({ color })
	);
	dot.position.set(0.34, 0.72, 0);
	group.add(dot);
	return group;
}

function createResponsivePreview(color, secondary) {
	const group = new THREE.Group();
	group.add(createPedestal(1.05, 0.2, color));
	const material = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.42, metalness: 0.14 });
	const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xdceeff });
	[
		{ x: -0.33, y: 0.67, width: 0.26, height: 0.46 },
		{ x: 0.02, y: 0.72, width: 0.44, height: 0.32 },
		{ x: 0.43, y: 0.62, width: 0.18, height: 0.28 },
	].forEach(({ x, y, width, height }) => {
		const screen = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), material);
		screen.position.set(x, y, 0);
		group.add(screen);
		const face = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.78, height * 0.68), screenMaterial);
		face.position.set(x, y, -0.034);
		group.add(face);
	});
	const dot = new THREE.Mesh(
		new THREE.SphereGeometry(0.045, 12, 8),
		new THREE.MeshBasicMaterial({ color: secondary })
	);
	dot.position.set(0.43, 0.82, -0.05);
	group.add(dot);
	return group;
}

function createStyleBookDisplay(color, secondary) {
	const group = new THREE.Group();
	group.add(createPedestal(1.1, 0.2, color));
	for (let index = 0; index < 6; index++) {
		const swatch = new THREE.Mesh(
			new THREE.BoxGeometry(0.24, 0.045, 0.34),
			new THREE.MeshStandardMaterial({
				color: activeVariant.eraColors[index % activeVariant.eraColors.length],
				roughness: 0.46,
			})
		);
		swatch.position.set(-0.42 + (index % 3) * 0.42, 0.42 + Math.floor(index / 3) * 0.13, -0.1);
		swatch.rotation.y = -0.22 + index * 0.08;
		group.add(swatch);
	}
	const book = new THREE.Mesh(
		new THREE.BoxGeometry(0.76, 0.08, 0.48),
		new THREE.MeshStandardMaterial({ color: 0xf8efd9, roughness: 0.56 })
	);
	book.position.set(0, 0.34, 0.08);
	group.add(book);
	const stripe = new THREE.Mesh(
		new THREE.BoxGeometry(0.08, 0.085, 0.5),
		new THREE.MeshBasicMaterial({ color: secondary })
	);
	stripe.position.set(0, 0.35, 0.08);
	group.add(stripe);
	return group;
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
	label.position.set(0, 0.075, -roomDepth / 2 + 2.35);
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
	scheduleDeferredAssetTask(() => {
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
	});
	return anchor;
}

function scheduleDeferredAssetTask(task) {
	const delay = 5000 + Math.min(deferredAssetTaskIndex * 85, 9000);
	deferredAssetTaskIndex += 1;
	window.setTimeout(task, delay);
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
	registerAnimation(core, (object, elapsed) => {
		object.rotation.z = elapsed * 0.8;
		object.material.opacity = 0.68 + Math.sin(elapsed * 2.2) * 0.16;
	});
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
		block.userData.baseY = block.position.y;
		registerAnimation(block, (object, elapsed, delta) => {
			object.rotation.x += delta * 0.42;
			object.rotation.y += delta * 0.62;
			object.position.y = object.userData.baseY + Math.sin(elapsed * 1.45 + index) * 0.045;
		});
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
		bubble.userData.baseX = bubble.position.x;
		bubble.userData.baseY = bubble.position.y;
		registerAnimation(bubble, (object, elapsed) => {
			object.position.y = object.userData.baseY + Math.sin(elapsed * 1.8 + index) * 0.055;
			object.position.x = object.userData.baseX + Math.sin(elapsed * 0.7 + index) * 0.035;
		});
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

function createRetroCRT(accent, secondary) {
	const group = new THREE.Group();
	const beige = new THREE.MeshStandardMaterial({ color: 0xe9e1c8, roughness: 0.72, metalness: 0.03 });
	const beigeShade = new THREE.MeshStandardMaterial({ color: 0xd5c9a6, roughness: 0.74 });

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.07, 18), beigeShade);
	base.position.y = 0.035;
	group.add(base);
	const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), beigeShade);
	neck.position.y = 0.12;
	group.add(neck);

	// Boxy CRT monitor body, slightly tapered toward the back.
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.56, 4), beige);
	body.rotation.y = Math.PI / 4;
	body.scale.set(1.0, 1.0, 0.92);
	body.position.y = 0.46;
	group.add(body);

	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.06), beige);
	bezel.position.set(0, 0.46, 0.27);
	group.add(bezel);
	const screen = createAdminScreenPanel(accent, secondary, 0.42, 0.32);
	screen.rotation.y = Math.PI;
	screen.position.set(0, 0.46, 0.3);
	group.add(screen);

	// Power LED.
	const led = new THREE.Mesh(
		new THREE.SphereGeometry(0.018, 10, 8),
		new THREE.MeshBasicMaterial({ color: 0x6cff9c })
	);
	led.position.set(0.18, 0.27, 0.3);
	group.add(led);

	// Chunky keyboard in front.
	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), beige);
	keyboard.position.set(0, 0.025, 0.46);
	keyboard.rotation.x = -0.04;
	group.add(keyboard);

	return group;
}

// --- Iconic era hardware, presented as spotlit museum artifacts. ---

function createArtifactStand(color, label, height) {
	const group = new THREE.Group();
	group.add(createPedestal(0.86, height, color));
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(0.47, 0.012, 8, 40),
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
	);
	ring.rotation.x = Math.PI / 2;
	ring.position.y = height + 0.02;
	registerAnimation(ring, (object, elapsed) => {
		object.material.opacity = 0.32 + Math.sin(elapsed * 1.6) * 0.12;
	});
	group.add(ring);
	const tag = createReadableLabel(createSmallSignTexture(label, color), 0.86, 0.2);
	tag.position.set(0, height * 0.5, -0.46);
	group.add(tag);
	return group;
}

function createIMacG4Exhibit(color) {
	const group = new THREE.Group();
	const standH = 0.34;
	group.add(createArtifactStand(color, 'IMAC G4', standH));

	const imac = new THREE.Group();
	imac.position.y = standH;
	group.add(imac);

	const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.32, metalness: 0.06 });
	const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.24, metalness: 0.7 });

	// Hemispherical dome base.
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(0.2, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
		white
	);
	dome.position.y = 0.02;
	dome.scale.set(1, 0.7, 1);
	imac.add(dome);

	// Chrome gooseneck arm.
	const armBottom = new THREE.Vector3(0, 0.12, 0.02);
	const armTop = new THREE.Vector3(0, 0.4, 0.12);
	imac.add(createCylinderBetween(armBottom, armTop, 0.022, chrome, 10));

	// Flat-panel screen on a swivel.
	const screen = new THREE.Group();
	screen.position.set(0, 0.5, 0.16);
	screen.rotation.x = -0.12;
	imac.add(screen);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.03), white);
	screen.add(bezel);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.34, 0.26),
		new THREE.MeshBasicMaterial({ map: createDeviceScreenTexture('aqua'), side: THREE.DoubleSide })
	);
	face.position.z = 0.017;
	screen.add(face);
	const chin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), white);
	chin.position.y = -0.2;
	screen.add(chin);

	return group;
}

function createIPhoneExhibit(color) {
	const group = new THREE.Group();
	const standH = 0.62;
	group.add(createArtifactStand(color, 'IPHONE 2007', standH));

	const phone = new THREE.Group();
	phone.position.set(0, standH + 0.22, 0.04);
	phone.rotation.x = -0.32;
	group.add(phone);

	const metal = new THREE.MeshStandardMaterial({ color: 0xd7dade, roughness: 0.3, metalness: 0.66 });
	const black = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.3, metalness: 0.2 });
	const bodyBack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.026), metal);
	phone.add(bodyBack);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.39, 0.03), black);
	bezel.position.z = 0.004;
	phone.add(bezel);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.16, 0.27),
		new THREE.MeshBasicMaterial({ map: createDeviceScreenTexture('home'), side: THREE.DoubleSide })
	);
	face.position.set(0, 0.04, 0.021);
	phone.add(face);
	const homeButton = new THREE.Mesh(
		new THREE.CylinderGeometry(0.022, 0.022, 0.006, 18),
		new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.4 })
	);
	homeButton.rotation.x = Math.PI / 2;
	homeButton.position.set(0, -0.16, 0.021);
	phone.add(homeButton);

	return group;
}

function createIPadEaselExhibit(color) {
	const group = new THREE.Group();
	const standH = 0.5;
	group.add(createArtifactStand(color, 'IPAD 2010', standH));

	const wood = new THREE.MeshStandardMaterial({ color: 0xb07a3c, roughness: 0.56, metalness: 0.04 });
	const easel = new THREE.Group();
	easel.position.y = standH;
	group.add(easel);
	for (const sx of [-1, 1]) {
		const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.6, 10), wood);
		leg.position.set(sx * 0.14, 0.3, -0.02);
		leg.rotation.x = 0.16;
		easel.add(leg);
	}
	const restBar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.05), wood);
	restBar.position.set(0, 0.22, 0.08);
	easel.add(restBar);

	const tablet = new THREE.Group();
	tablet.position.set(0, 0.34, 0.06);
	tablet.rotation.x = -0.28;
	easel.add(tablet);
	const metal = new THREE.MeshStandardMaterial({ color: 0xd7dade, roughness: 0.3, metalness: 0.66 });
	const black = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.3, metalness: 0.2 });
	const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.022), metal);
	tablet.add(back);
	const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.026), black);
	bezel.position.z = 0.004;
	tablet.add(bezel);
	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(0.34, 0.24),
		new THREE.MeshBasicMaterial({ map: createDeviceScreenTexture('home'), side: THREE.DoubleSide })
	);
	face.position.set(0, 0, 0.019);
	tablet.add(face);
	const homeButton = new THREE.Mesh(
		new THREE.CylinderGeometry(0.018, 0.018, 0.006, 16),
		new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.4 })
	);
	homeButton.rotation.x = Math.PI / 2;
	homeButton.position.set(0, -0.13, 0.019);
	tablet.add(homeButton);

	return group;
}

function createDeviceScreenTexture(kind) {
	if (deviceScreenTextures.has(kind)) {
		return deviceScreenTextures.get(kind);
	}
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');
	if (kind === 'aqua') {
		const grad = ctx.createLinearGradient(0, 0, 0, 256);
		grad.addColorStop(0, '#9fd4ff');
		grad.addColorStop(1, '#2f7fd6');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 256, 256);
		// pinstripe
		ctx.fillStyle = 'rgba(255,255,255,0.08)';
		for (let y = 0; y < 256; y += 6) ctx.fillRect(0, y, 256, 2);
		// menu bar
		ctx.fillStyle = 'rgba(255,255,255,0.78)';
		ctx.fillRect(0, 0, 256, 22);
		// dock
		ctx.fillStyle = 'rgba(255,255,255,0.45)';
		ctx.fillRect(34, 210, 188, 34);
		const dockColors = ['#5b8def', '#2bb7ff', '#50d890', '#ffd166', '#ff6b6b', '#b37cff'];
		dockColors.forEach((c, i) => {
			ctx.fillStyle = c;
			roundRectPath(ctx, 44 + i * 30, 214, 24, 24, 6);
			ctx.fill();
		});
	} else {
		// iOS-style home grid.
		const grad = ctx.createLinearGradient(0, 0, 0, 256);
		grad.addColorStop(0, '#1b2740');
		grad.addColorStop(1, '#0c1320');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, 256, 256);
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		ctx.font = '700 12px ui-monospace, monospace';
		ctx.textAlign = 'center';
		ctx.fillText('●●●●●  WordPress  ▲', 128, 16);
		const colors = ['#5b8def', '#2bb7ff', '#50d890', '#ffd166', '#ff6b6b', '#b37cff', '#ff9b54', '#78e0dc', '#f29111'];
		let i = 0;
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 4; col++) {
				ctx.fillStyle = colors[i % colors.length];
				roundRectPath(ctx, 26 + col * 54, 40 + row * 58, 40, 40, 9);
				ctx.fill();
				i++;
			}
		}
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	deviceScreenTextures.set(kind, texture);
	return texture;
}

function roundRectPath(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function createTerminalDesk(color) {
	const group = new THREE.Group();
	group.add(createKnobConsole(color));
	const screen = createAdminScreenPanel(color, 0xdceeff, 0.62, 0.36);
	screen.position.set(0.16, 0.72, -0.13);
	group.add(screen);

	const laptopBase = new THREE.Mesh(
		new THREE.BoxGeometry(0.42, 0.045, 0.28),
		new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.46 })
	);
	laptopBase.position.set(-0.45, 0.48, -0.02);
	group.add(laptopBase);
	const laptopLid = createAdminScreenPanel(color, 0xeaf6ff, 0.36, 0.24);
	laptopLid.position.set(-0.45, 0.66, -0.16);
	laptopLid.rotation.x = -0.18;
	group.add(laptopLid);
	return group;
}

function createAdminScreenPanel(color, secondary, width, height) {
	const group = new THREE.Group();
	const casing = new THREE.Mesh(
		new THREE.BoxGeometry(width, height, 0.055),
		new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.42, metalness: 0.08 })
	);
	group.add(casing);

	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(width * 0.82, height * 0.72),
		new THREE.MeshBasicMaterial({
			map: createAdminScreenTexture(color, secondary),
			side: THREE.DoubleSide,
		})
	);
	face.position.z = -0.031;
	group.add(face);
	return group;
}

function createAdminScreenTexture(color, secondary) {
	const canvas = document.createElement('canvas');
	canvas.width = 320;
	canvas.height = 200;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#f5f7fb';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#172033';
	ctx.fillRect(0, 0, 58, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 16);
	ctx.fillStyle = '#d8e0ea';
	for (let index = 0; index < 6; index++) {
		ctx.fillRect(72, 34 + index * 24, 92 + index * 12, 9);
	}
	ctx.fillStyle = `#${new THREE.Color(secondary).getHexString()}`;
	ctx.fillRect(194, 42, 74, 44);
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(204, 53, 54, 8);
	ctx.fillRect(204, 69, 38, 6);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
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

function createRecordStack(color, options = {}) {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.42 });
	const labelMaterial = new THREE.MeshBasicMaterial({ color });
	for (let index = 0; index < 6; index++) {
		const record = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 28), material);
		record.position.set(-0.45 + index * 0.18, 0.32 + index * 0.035, 0);
		record.rotation.x = Math.PI / 2;
		group.add(record);
		const label = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 18), labelMaterial);
		label.position.copy(record.position);
		label.position.z -= 0.004;
		label.rotation.x = record.rotation.x;
		group.add(label);
	}
	if (options.showLabel !== false) {
		group.add(createPropLabel('JAZZ', color, 0.72));
	}
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
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
	);
	shade.position.y = 1.16;
	shade.rotation.x = Math.PI;
	registerAnimation(shade, (object, elapsed) => {
		object.material.opacity = 0.84 + Math.sin(elapsed * 1.4) * 0.08;
	});
	group.add(shade);
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

function createDisplayCase(color, label, options = {}) {
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
	if (options.showLabel !== false) {
		group.add(createPropLabel(label.toUpperCase(), color, 1.18));
	}
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
	canvas.width = 512;
	canvas.height = 160;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, 16);
	ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
	ctx.fillStyle = '#111827';
	ctx.font = '900 52px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(ctx, text, 256, 84, 436, 52, '900', 'Arial Black, Impact, sans-serif');
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function createOpenSourceSignTexture(title, note, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 220;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff5df';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = '#111827';
	ctx.fillRect(18, 18, canvas.width - 36, canvas.height - 36);
	ctx.fillStyle = color;
	ctx.fillRect(18, 18, canvas.width - 36, 18);
	ctx.fillRect(18, canvas.height - 36, canvas.width - 36, 18);
	ctx.fillStyle = '#fff5df';
	ctx.font = '900 52px Arial Black, Impact, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fillFittedCanvasText(ctx, title, canvas.width / 2, 92, 410, 52, '900', 'Arial Black, Impact, sans-serif');
	ctx.fillStyle = color;
	ctx.font = '900 25px system-ui, sans-serif';
	fillFittedCanvasText(ctx, note.toUpperCase(), canvas.width / 2, 146, 360, 25, '900', 'system-ui, sans-serif');
	ctx.fillStyle = 'rgba(255, 245, 223, 0.18)';
	for (let index = 0; index < 8; index++) {
		ctx.fillRect(72 + index * 48, 172, 24, 8);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
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
		ring.userData.spinBase = rotation;
		registerAnimation(ring, (object, elapsed) => {
			object.rotation.z = object.userData.spinBase + elapsed * 0.42;
			object.rotation.y = Math.sin(elapsed * 0.55 + object.userData.spinBase) * 0.18;
		});
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
	registerAnimation(wallGlow, (object, elapsed) => {
		object.material.opacity = 0.13 + Math.sin(elapsed * 2.4) * 0.035;
	});
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
	registerAnimation(floorRing, (object, elapsed) => {
		const scale = 1 + Math.sin(elapsed * 3) * 0.045;
		object.scale.set(scale, scale, scale);
		object.rotation.z = elapsed * 0.9;
		object.material.opacity = 0.64 + Math.sin(elapsed * 2.1) * 0.14;
	});
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

	scheduleDeferredAssetTask(() => {
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

	const panelToggle = document.querySelector('#panel-toggle');
	if (panelToggle) {
		panelToggle.addEventListener('click', () => {
			document.querySelector('.release-panel').classList.toggle('is-collapsed');
		});
	}

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

	canvas.addEventListener('click', () => {
		// Clicking the scene enters walk mode; once walking, a click inspects
		// whatever the centre reticle is pointed at.
		if (document.pointerLockElement === canvas) {
			pickFromScreen(0, 0);
		} else {
			canvas.requestPointerLock();
		}
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
			camera.lookAt(new THREE.Vector3(target.x, target.y, target.z));
			yaw = camera.rotation.y;
			pitch = camera.rotation.x;
		},
		getRendererInfo() {
			return {
				render: { ...renderer.info.render },
				memory: { ...renderer.info.memory },
				pixelRatio: renderer.getPixelRatio(),
				renderedFrameCount,
			};
		},
		scene,
		camera,
		THREE,
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
	// The scene always has ambient motion, so render every frame for a
	// fluid feel; rAF already caps to the display refresh rate.
	const delta = Math.min(clock.getDelta(), 0.05);
	updateCamera(delta);
	updateSceneAnimations(delta, clock.elapsedTime);
	renderer.render(scene, camera);
	renderedFrameCount += 1;
}

function registerAnimation(object, update) {
	object.userData.museumAnimation = update;
	animatedObjects.push(object);
	return object;
}

function updateSceneAnimations(delta, elapsed) {
	for (const object of animatedObjects) {
		if (object.parent || object.isLight) {
			object.userData.museumAnimation?.(object, elapsed, delta);
		}
	}
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
		// When crossing between galleries, glide through a raised waypoint in
		// the rotunda so the camera arcs out of one room and into the next
		// instead of slicing through marble walls.
		const aimPos = guidedTarget.via || guidedTarget.position;
		camera.position.lerp(aimPos, 1 - Math.pow(0.055, delta));
		yaw = lerpAngle(yaw, guidedTarget.yaw, 1 - Math.pow(0.02, delta));
		pitch = THREE.MathUtils.lerp(
			pitch,
			guidedTarget.pitch,
			1 - Math.pow(0.02, delta)
		);
		setCameraRotation();
		if (guidedTarget.via && camera.position.distanceTo(guidedTarget.via) < 1.3) {
			guidedTarget.via = null;
		}
		if (!guidedTarget.via && camera.position.distanceTo(guidedTarget.position) < 0.06) {
			guidedTarget = null;
			tourHoldUntil = performance.now() + 3000;
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
	const previousEra = releases[activeIndex]?.era;
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
		if (previousEra && previousEra !== release.era) {
			guidedTarget.via = atriumCenterPosition.clone().setY(2.4);
		}
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
	if (!hit) {
		return;
	}
	const obj = hit.object;
	if (obj.userData.portalUrl) {
		window.open(obj.userData.portalUrl, '_blank', 'noopener,noreferrer');
		return;
	}
	if (Number.isFinite(obj.userData.releaseIndex)) {
		focusRelease(obj.userData.releaseIndex);
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
		isPointInsideMuralPortals(position) ||
		movementZones.some(
			(room) =>
				isPointInsideRoom(position, room) ||
				isPointInsideDoorway(position, room)
		)
	);
}

function isPointInsideMuralPortals(position) {
	if (!isCurrentVariant) {
		return false;
	}
	const padding = 0.45;
	if (position.z < hubApothem - 1.2 || position.z > hubApothem + portalAlcoveDepth - 0.4) {
		return false;
	}
	return muralPortals.some(
		(portal) => Math.abs(position.x - portal.offset) <= portalAlcoveHalfWidth - padding
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
