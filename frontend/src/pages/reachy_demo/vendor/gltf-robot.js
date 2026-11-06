// @ts-check
/**
 * Vanilla three.js port of the desktop app's GLTFRobot.tsx (branch
 * try-glb-model): renders the rigged Reachy Mini GLB and poses it from a
 * robot-frame target — a 4x4 head pose (metres), a body yaw and two antenna
 * angles. The head drives one rigid bone; the six neck legs are re-solved
 * every frame with a small CCD pass so the Stewart platform follows.
 *
 * The math, constants and calibration are copied verbatim from the TSX —
 * only the React/drei wrapper is replaced by a plain class owning its
 * renderer and rAF loop. Keep both in sync when recalibrating.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Paths resolve against the page URL, so the folder keeps working when copied
// under any subpath of another site.
const GLB_URL = "/reachy-demo/assets/reachy_mini_viz.glb";
const DRACO_PATH = "/reachy-demo/draco/";

// ============================================================================
// The glb is exported Z-up (export_yup=False), i.e. the robot's native frame.
// headPose applies directly: no Z-up->Y-up basis change. The display
// orientation is a wrapper (group yaw + X rotation), same as the URDF path.
// ============================================================================
const MODEL_SCALE = 0.5; // the exported GLB is approximately 2x real size
const DISPLAY_YAW = -Math.PI; // align glb forward with the robot's
// The pose is applied inside MODEL_SCALE, so 2 model units per metre produces
// one displayed metre without attenuating the physical library's translations.
const UNITS_PER_M = 2;
// Platform head-Z reach measured from the rig (model units, relative to rest).
const HEAD_Z_MAX = 0.052; // +26 mm after MODEL_SCALE
const HEAD_Z_MIN = -0.1; // -50 mm after MODEL_SCALE
// Robot frame (X-fwd, Y-left, Z-up) -> glb model frame: Rz(+90), applied as a
// conjugation R_model = M·R·M⁻¹ (det +1, no reflection).
const HEAD_FRAME_YAW_OFFSET = Math.PI / 2;
const HEAD_FIX = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  HEAD_FRAME_YAW_OFFSET
);
const HEAD_FIX_INV = HEAD_FIX.clone().invert();
const YAW_SIGN = 1;
const ANT_AXIS = new THREE.Vector3(0, 0, 1); // antenna hinge axis in glb space
const ANT_SIGN = -1; // URDF path used -antennas[i]

// Loading progress. The GLB is ~3 MB against ~70 KB of room textures, so a bar
// driven by item counts would sit at a third for the entire download; weight by
// what the bytes actually are instead.
const TEXTURE_SHARE = 0.05;
// A blocked or missing texture must not strand the bar: the room appears
// untextured rather than never appearing at all.
const TEXTURE_TIMEOUT_MS = 8000;

// Exponential smoothing rate (1/s) toward the latest target: the motion layer
// may update slower than the render loop. Higher = snappier, lower = smoother.
const SMOOTH_K = 15;

// Bone node names (present in the exported glb).
const BONE = { body: "Core", head: "Core.001", antL: "Antenna.L.002", antR: "Antenna.R.002" };

// Scene look, adapted from the desktop app's Scene.tsx (camera pulled back so
// the whole robot + antennas fit a roughly square stage).
// A dusk interior: the room is dim and the window is the bright thing in it.
// That is both what the golden-hour plate implies and what keeps the app's dark
// canvas intact now that the set runs edge to edge.
const LIGHTING = { ambient: 0.36, keyIntensity: 1.7, fillIntensity: 0.78, bounce: 0.38, lamp: 1.5 };
// Keep the same downward viewing angle, but pull back and drop the orbit
// target now that the stage owns the whole viewport rather than a ~620px card:
// at the old distance Reachy filled the frame and his antennas ran off the top.
// The lower target also lifts him above centre, leaving the bottom third of the
// frame to the table and the floating control dock.
// Leave room for a physically scaled Microduck walking beside Reachy.
const CAMERA = { fov: 55, position: [0, 0.35, 1.0], target: [0, 0.14, 0] };
// Aspect at or above which CAMERA.fov is used as-is; below it the frame widens
// to hold the horizontal extent (see _resize).
const FRAME_REF_ASPECT = 1.15;
const FRAME_MAX_FOV = 64;

/** @param {number[] | null | undefined} p @returns {THREE.Matrix4 | null} */
function toMatrix(p) {
  if (!p || p.length !== 16) return null;
  // row-major (robot) -> three is column-major, so transpose.
  return new THREE.Matrix4().fromArray(p).transpose();
}

// GLTFLoader sanitizes '.' out of node names ("Core.001" -> "Core001"),
// so look bones up by a normalized key.
/** @param {string} s */
const norm = (s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();

// --- Neck leg IK -----------------------------------------------------------
// Each leg is a 4-bone chain that, in Blender, IK-solves so its tip reaches a
// target riding on the head. glTF can't carry that, so we re-solve it here
// with a small CCD pass. Bielles/motors are rigidly parented, so they follow.
const LEG_IDS = ["A", "B", "C", "D", "E", "F"];
const LEG_IK_ITERATIONS = 12;
// Per-chain-bone DOF: .001 fixed base, .002 hinge about local X, .003 rigid,
// .004 free ball joint (the IK-constrained bone).
const LEG_DOF = ["locked", "hingeX", "locked", "free"];
const HINGE_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * @typedef {{ chain: THREE.Object3D[], restQ: THREE.Quaternion[],
 *             effector: THREE.Object3D, target: THREE.Object3D }} LegChain
 */

/**
 * @param {string} id
 * @param {Record<string, THREE.Object3D>} byName
 * @param {THREE.Object3D} head
 * @returns {LegChain | null}
 */
function setupLeg(id, byName, head) {
  const chain = ["001", "002", "003", "004"].map((s) => byName[norm(`Neck.${id}.${s}`)]);
  const ikTarget = byName[norm(`Neck.loc.IK.${id}`)];
  if (chain.some((b) => !b) || !ikTarget) {
    console.warn(`[robot] leg ${id}: missing bones, IK skipped`);
    return null;
  }
  // Rest attach point = the leg's IK target position (where tip meets head).
  const attach = ikTarget.getWorldPosition(new THREE.Vector3());
  const effector = new THREE.Object3D();
  chain[3].add(effector);
  effector.position.copy(chain[3].worldToLocal(attach.clone()));
  const target = new THREE.Object3D();
  head.add(target);
  target.position.copy(head.worldToLocal(attach.clone()));
  const restQ = chain.map((b) => b.quaternion.clone());
  return { chain, restQ, effector, target };
}

// CCD scratch (module-level, no per-frame allocation).
const _jp = new THREE.Vector3();
const _ep = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _hw = new THREE.Vector3();
const _cx = new THREE.Vector3();
const _qr = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/** @param {LegChain} leg @param {number} iterations */
function solveLeg(leg, iterations) {
  // Start from the rest fold each frame so CCD converges in the correct branch.
  for (let i = 0; i < leg.chain.length; i++) leg.chain[i].quaternion.copy(leg.restQ[i]);
  leg.chain[0].updateWorldMatrix(false, true);
  leg.target.getWorldPosition(_tp);
  for (let it = 0; it < iterations; it++) {
    // Root-first: drive the reach DOF (.002 hinge) before the free tip ball.
    for (let i = 0; i < leg.chain.length; i++) {
      const dof = LEG_DOF[i];
      if (dof === "locked") continue;
      const joint = leg.chain[i];
      leg.effector.getWorldPosition(_ep);
      if (_ep.distanceToSquared(_tp) < 1e-8) return;
      joint.getWorldPosition(_jp);
      joint.getWorldQuaternion(_qw);
      if (dof === "free") {
        _v1.subVectors(_ep, _jp).normalize();
        _v2.subVectors(_tp, _jp).normalize();
        _qr.setFromUnitVectors(_v1, _v2); // free 3-DOF: point effector at target
      } else {
        // 1-DOF hinge: optimal angle ABOUT the hinge axis (project to its plane).
        _hw.copy(HINGE_AXIS).applyQuaternion(_qw).normalize();
        _v1.subVectors(_ep, _jp).projectOnPlane(_hw);
        _v2.subVectors(_tp, _jp).projectOnPlane(_hw);
        if (_v1.lengthSq() < 1e-12 || _v2.lengthSq() < 1e-12) continue;
        _v1.normalize();
        _v2.normalize();
        const ang = Math.atan2(_cx.crossVectors(_v1, _v2).dot(_hw), _v1.dot(_v2));
        _qr.setFromAxisAngle(_hw, ang);
      }
      _qr.multiply(_qw); // -> desired world quaternion
      joint.parent?.getWorldQuaternion(_qp);
      joint.quaternion.copy(_qp.invert().multiply(_qr)); // back to local
      joint.updateWorldMatrix(false, true); // refresh effector subtree
    }
  }
}

// --- Room set --------------------------------------------------------------
// The stage is full-bleed, so wall and table run well past the frustum at every
// aspect ratio and the CSS vignette dissolves the rest into the page.
//
// The window is built as a hole through a *thick* wall rather than a picture
// pasted on a flat one. That single change is what stops it reading as a framed
// painting: the opening gets a reveal (head, jambs, sill) whose inner faces
// catch light at grazing angles, the sash is recessed inside that reveal, and
// the view itself hangs far enough behind the wall to parallax when you orbit.
const ROOM = {
  wallW: 20,
  wallH: 12,
  wallZ: -0.44, // room-side face of the wall
  wallDepth: 0.08, // wall thickness -> the opening gets a real reveal
  winX: -0.02,
  winY: 0.315,
  // A wide picture window. The stage runs edge to edge now, so a narrow
  // opening would leave most of a 16:9 frame as blank wall.
  winW: 1.12,
  winH: 0.46,
  sashW: 0.024, // sash bar face width
  sashDepth: 0.03,
  sashInset: 0.015, // how far the sash sits back inside the opening
  viewZ: -0.92, // the view hangs well behind the wall, so it parallaxes
};

/**
 * A rectangular ring (outer rect with a rectangular hole) extruded along +Z.
 * One watertight mesh, so corners meet exactly instead of the lapped, stubbed
 * joints you get from four overlapping boxes.
 * @param {number} ow @param {number} oh @param {number} iw @param {number} ih
 * @param {number} depth
 */
function ringGeometry(ow, oh, iw, ih, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-ow / 2, -oh / 2);
  shape.lineTo(ow / 2, -oh / 2);
  shape.lineTo(ow / 2, oh / 2);
  shape.lineTo(-ow / 2, oh / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-iw / 2, -ih / 2);
  hole.lineTo(-iw / 2, ih / 2);
  hole.lineTo(iw / 2, ih / 2);
  hole.lineTo(iw / 2, -ih / 2);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.computeVertexNormals();
  return geo;
}

/**
 * Two soft diagonal streaks — the reflection that tells the eye a pane of glass
 * is there. Additive and very faint; without it the opening reads as a hole.
 */
function glassSheenTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createLinearGradient(0, 256, 256, 0);
  const stops = [
    [0.0, 0], [0.3, 0], [0.4, 0.5], [0.47, 0.06],
    [0.56, 0.34], [0.64, 0], [1.0, 0],
  ];
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.LoadingManager} manager tracks the room's textures so the
 *   loading bar can wait for them — an untextured wall and table would
 *   otherwise pop a moment after the room fades in.
 */
function addRoomEnvironment(scene, renderer, manager) {
  const room = new THREE.Group();
  room.name = "ReachyRoom";
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // A softly warm wall keeps the black antennas readable without introducing
  // a second saturated accent colour into the voice UI.
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xb2aea7,
    roughness: 0.92,
    metalness: 0,
  });
  // ExtrudeGeometry splits caps (group 0) from side walls (group 1), which lets
  // the reveal carry its own darker plaster. Without this the inner faces come
  // out brighter than the wall and the depth reads as a mat board instead of as
  // shade — the exact tell we are trying to remove.
  const revealMaterial = new THREE.MeshStandardMaterial({
    color: 0x807d78,
    roughness: 0.95,
    metalness: 0,
  });
  const wall = new THREE.Mesh(
    ringGeometry(ROOM.wallW, ROOM.wallH, ROOM.winW, ROOM.winH, ROOM.wallDepth),
    [wallMaterial, revealMaterial]
  );
  // Extrusion runs 0..depth along +Z, so seat the slab with its room-side face
  // on wallZ. The hole is centred on the shape, so offset the mesh instead of
  // the geometry to place the opening.
  wall.position.set(ROOM.winX, ROOM.winY, ROOM.wallZ - ROOM.wallDepth);
  wall.receiveShadow = true;
  room.add(wall);
  // The view. A real photographic plate carries the atmospheric and geological
  // detail no procedural silhouette can, and hanging it 0.6 m behind the wall
  // means orbiting slides it against the opening exactly as a real view slides
  // against a real window.
  const mountainTexture = new THREE.TextureLoader(manager).load("/reachy-demo/assets/alpine-window.webp");
  mountainTexture.colorSpace = THREE.SRGBColorSpace;
  mountainTexture.anisotropy = maxAniso;
  const view = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 1.63),
    new THREE.MeshBasicMaterial({ map: mountainTexture, toneMapped: false })
  );
  // Centred on the sight-line through the opening, so the crop stays framed.
  view.position.set(ROOM.winX - 0.01, ROOM.winY + 0.06, ROOM.viewZ);
  room.add(view);

  // Sash, recessed inside the reveal. One extruded ring: the corners are a
  // single surface, so there are no overshooting stub ends.
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x33383a,
    roughness: 0.5,
    metalness: 0.15,
  });
  const sash = new THREE.Mesh(
    ringGeometry(
      ROOM.winW,
      ROOM.winH,
      ROOM.winW - 2 * ROOM.sashW,
      ROOM.winH - 2 * ROOM.sashW,
      ROOM.sashDepth
    ),
    frameMaterial
  );
  sash.position.set(
    ROOM.winX,
    ROOM.winY,
    ROOM.wallZ - ROOM.sashInset - ROOM.sashDepth
  );
  sash.receiveShadow = true;
  room.add(sash);

  // Glass: nearly invisible on its own, plus a faint additive sheen so the
  // pane catches the room the way real glass does.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.winW - 2 * ROOM.sashW, ROOM.winH - 2 * ROOM.sashW),
    new THREE.MeshPhysicalMaterial({
      color: 0xdfeaef,
      transparent: true,
      opacity: 0.06,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      depthWrite: false,
    })
  );
  glass.position.set(ROOM.winX, ROOM.winY, ROOM.wallZ - ROOM.sashInset - ROOM.sashDepth / 2);
  glass.renderOrder = 2;
  room.add(glass);

  const sheenMap = glassSheenTexture();
  if (sheenMap) {
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.winW - 2 * ROOM.sashW, ROOM.winH - 2 * ROOM.sashW),
      new THREE.MeshBasicMaterial({
        map: sheenMap,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    sheen.position.copy(glass.position);
    sheen.position.z += 0.001;
    sheen.renderOrder = 3;
    room.add(sheen);
  }

  // The sill caps the reveal and projects into the room, so the opening reads as
  // cut through something with thickness. Kept to a fine line: a deep slab in
  // the sash's near-black turned into a blackboard ledge across the composition.
  const sillDepth = ROOM.wallDepth + 0.032;
  const sillTop = ROOM.winY - ROOM.winH / 2;
  const sill = new THREE.Mesh(
    new RoundedBoxGeometry(ROOM.winW + 0.05, 0.016, sillDepth, 3, 0.004),
    frameMaterial
  );
  sill.position.set(ROOM.winX, sillTop - 0.008, ROOM.wallZ + 0.032 - sillDepth / 2);
  sill.receiveShadow = true;
  room.add(sill);

  // A photographic oak texture adds fine grain without baking any directional
  // shadow into the surface. Reusing it as a very shallow bump source gives the
  // grazing highlights just enough material response to avoid a flat decal.
  const woodTexture = new THREE.TextureLoader(manager).load("/reachy-demo/assets/oak-table.webp");
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.anisotropy = maxAniso;
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.repeat.set(4.2, 3.9); // keep the grain at its original scale
  const tableMaterial = new THREE.MeshStandardMaterial({
    map: woodTexture,
    bumpMap: woodTexture,
    bumpScale: 0.0025,
    color: 0xffffff,
    roughness: 0.64,
    metalness: 0,
  });

  // The real-time shadow map grounds Reachy on the textured, beveled table.
  // Wide and deep enough that its edges never enter frame at any aspect, and
  // butted against the wall so no gap opens behind it.
  const tableDepth = 3;
  const table = new THREE.Mesh(
    new RoundedBoxGeometry(6, 0.06, tableDepth, 5, 0.018),
    tableMaterial
  );
  table.position.set(0, -0.035, ROOM.wallZ + tableDepth / 2);
  table.receiveShadow = true;
  room.add(table);

  scene.add(room);
}

export class RobotViewer {
  /**
   * @param {HTMLElement} container
   * @param {{ onTap?: () => void, onProgress?: (fraction: number) => void }} [opts]
   *   onTap fires on a genuine tap (press + release without dragging) — the
   *   container swallows pointer events for orbiting, so taps are forwarded to
   *   the start control. onProgress reports this viewer's asset load as a
   *   monotonic 0..1.
   */
  constructor(container, opts = {}) {
    this._container = container;
    /** @type {{ headPose: number[] | null, bodyYaw: number, antennas: [number, number], primaryMotion?: boolean }} */
    this._target = { headPose: null, bodyYaw: 0, antennas: [0, 0], primaryMotion: false };
    /** @type {Record<string, THREE.Object3D | undefined>} */
    this._bones = {};
    /** @type {Record<string, THREE.Quaternion>} */
    this._rest = {};
    /** @type {{ parentInv: THREE.Matrix4, q: THREE.Quaternion, p: THREE.Vector3, s: THREE.Vector3 } | null} */
    this._headRest = null;
    /** @type {LegChain[]} */
    this._legs = [];
    this._bodyYawAxis = new THREE.Vector3(0, 0, 1);
    this._frame = 0;
    /** @type {import('./microduck.js').Microduck | null} */
    this._microduck = null;
    this._microduckLoading = false;
    this._clock = new THREE.Clock();
    this._onProgress = opts.onProgress ?? null;
    this._loaded = { textures: 0, model: 0, reported: 0 };
    /** @type {(() => void)[]} resolvers waiting on the next rendered frame */
    this._frameWaiters = [];

    // scratch + smoothing state (no per-frame allocation)
    this._tmp = {
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      worldQ: new THREE.Quaternion(),
      worldP: new THREE.Vector3(),
      mat: new THREE.Matrix4(),
    };
    this._sm = {
      headInit: false,
      yawInit: false,
      antInit: false,
      smP: new THREE.Vector3(),
      smQ: new THREE.Quaternion(),
      tgtP: new THREE.Vector3(),
      tgtQ: new THREE.Quaternion(),
      smYaw: 0,
      smAnt: [0, 0],
    };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this._renderer = renderer;

    const scene = new THREE.Scene();
    // Matches the wall, so any sliver past the set at an extreme orbit angle is
    // seamless rather than a visible edge.
    scene.background = new THREE.Color(0xb2aea7);

    // Handlers are attached before addRoomEnvironment queues anything, so no
    // texture can start (or finish) unobserved.
    const textures = new THREE.LoadingManager();
    /** @type {Promise<void>} */
    this._texturesReady = new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._loaded.textures = 1;
        this._report();
        resolve();
      };
      const timer = setTimeout(finish, TEXTURE_TIMEOUT_MS);
      textures.onProgress = (_url, loaded, total) => {
        this._loaded.textures = total ? loaded / total : 0;
        this._report();
      };
      textures.onLoad = finish;
    });
    addRoomEnvironment(scene, renderer, textures);
    scene.add(new THREE.AmbientLight(0xffffff, LIGHTING.ambient));

    // The window is the brightest thing in the room, so it is also the key. It
    // is the only caster: Reachy's shadow falls toward the viewer, which is
    // what a backlit subject actually does, and the previous front-right key
    // no longer contradicts the view behind him.
    const key = new THREE.DirectionalLight(0xeaf2f6, LIGHTING.keyIntensity);
    key.position.set(ROOM.winX - 0.55, ROOM.winY + 0.8, ROOM.viewZ);
    key.target.position.set(0.06, -0.02, 0.3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    // Wide enough that the long forward shadow never meets the frustum edge —
    // a clipped shadow leaves a straight seam across the table.
    key.shadow.camera.left = -1.4;
    key.shadow.camera.right = 1.4;
    key.shadow.camera.top = 1.4;
    key.shadow.camera.bottom = -1.4;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 5;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 7;
    scene.add(key, key.target);

    // Soft interior fill from the front so a backlit Reachy still reads.
    const fill = new THREE.DirectionalLight(0xfff4e8, LIGHTING.fillIntensity);
    fill.position.set(-1.6, 1.5, 2.2);
    scene.add(fill);

    // Sky above, oak bounce below — the warm underside lift comes from the
    // table rather than from a light we would otherwise have to fake.
    scene.add(new THREE.HemisphereLight(0xdbe7ee, 0xb0864f, LIGHTING.bounce));

    // A lamp's worth of falloff, so the large wall has tone instead of reading
    // as one flat field once the stage runs edge to edge.
    const lamp = new THREE.PointLight(0xfff0dd, LIGHTING.lamp, 3.6, 2);
    lamp.position.set(-0.95, 0.95, 0.7);
    scene.add(lamp);
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.01, 50);
    camera.position.fromArray(CAMERA.position);
    this._camera = camera;

    // Mouse/touch orbit on the stage itself (CSS turns its pointer-events on
    // once ready). Drags rotate; a tap (little movement) is forwarded so the
    // stage can still act as the start button it visually replaces.
    const controls = new OrbitControls(camera, container);
    controls.target.fromArray(CAMERA.target);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 0.25;
    controls.maxDistance = 1.2;
    controls.minPolarAngle = 0.15 * Math.PI;
    controls.maxPolarAngle = 0.62 * Math.PI;
    // A room has a front: retain enough orbit to inspect the robot while
    // preventing the camera from swinging behind the wall set.
    controls.minAzimuthAngle = -0.24 * Math.PI;
    controls.maxAzimuthAngle = 0.24 * Math.PI;
    controls.update();
    this._controls = controls;
    /** @type {{ x: number, y: number } | null} */
    let downAt = null;
    container.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
    container.addEventListener("click", (e) => {
      const tap = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) <= 8;
      downAt = null;
      if (tap) opts.onTap?.();
    });

    this._resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      // The set is framed for a roughly square frame. Anything narrower (a
      // phone held upright) frames by *width* instead, so the window keeps
      // wall on both sides rather than growing past both edges and leaving
      // Reachy against bare sky. Clamped so a very tall viewport widens into a
      // portrait crop rather than a fisheye.
      const halfV = Math.tan((CAMERA.fov * Math.PI) / 360);
      camera.fov =
        aspect >= FRAME_REF_ASPECT
          ? CAMERA.fov
          : Math.min(
              FRAME_MAX_FOV,
              (2 * Math.atan((halfV * FRAME_REF_ASPECT) / aspect) * 180) / Math.PI
            );
      camera.aspect = aspect;
      // In portrait, hold enough horizontal room for the companion's route.
      // A capped vertical FOV alone crops the duck out at either side.
      camera.zoom = Math.min(1, aspect / 0.95);
      camera.updateProjectionMatrix();
    };
    this._resize();
    this._resizeObserver = new ResizeObserver(this._resize);
    this._resizeObserver.observe(container);
  }

  /** Push the current weighted asset progress out, never backwards. */
  _report() {
    if (!this._onProgress) return;
    const f =
      this._loaded.textures * TEXTURE_SHARE +
      this._loaded.model * (1 - TEXTURE_SHARE);
    // A bar that slips back reads as a bug, and the two sources settle out of
    // order, so only ever move forward.
    if (f <= this._loaded.reported) return;
    this._loaded.reported = f;
    this._onProgress(f);
  }

  /** Resolves once the room's textures are in (or gave up). */
  texturesReady() {
    return this._texturesReady;
  }

  /** Resolves after the next frame this viewer actually renders. */
  nextFrame() {
    return /** @type {Promise<void>} */ (
      new Promise((resolve) => {
        this._frameWaiters.push(() => resolve(undefined));
      })
    );
  }

  /** Load the GLB and capture bones + rest pose. Resolves when ready to render. */
  async load() {
    const draco = this._draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(GLB_URL, (event) => {
      // Draco decoding after the download has no progress of its own, so the
      // bar holds at whatever the bytes reached until the parse resolves.
      if (!event.lengthComputable || !event.total) return;
      this._loaded.model = Math.min(1, event.loaded / event.total) * 0.92;
      this._report();
    });
    this._loaded.model = 1;
    this._report();
    const model = gltf.scene;

    // Same Z-up -> display wrapper as the TSX render(): outer yaw+scale group,
    // inner -PI/2 X rotation on the model itself.
    const outer = new THREE.Group();
    outer.rotation.y = DISPLAY_YAW;
    outer.scale.setScalar(MODEL_SCALE);
    model.rotation.x = -Math.PI / 2;
    outer.add(model);
    this._scene.add(outer);
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this._scene.updateMatrixWorld(true);

    const modelInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    /** @type {Record<string, THREE.Object3D>} */
    const byName = {};
    model.traverse((o) => {
      if (o.name) byName[norm(o.name)] = o;
    });
    for (const [key, name] of Object.entries(BONE)) {
      const node = byName[norm(name)];
      this._bones[key] = node;
      if (node) this._rest[key] = node.quaternion.clone();
      else console.warn(`[robot] bone node not found: ${name}`);
    }
    // Map the model's up axis (Z) into the Core bone's parent frame so a
    // pre-multiplied yaw spins the body about the true vertical (Blender bones
    // roll about local Y, so the bone's local Z is NOT vertical).
    const bodyNode = this._bones.body;
    if (bodyNode?.parent) {
      const parentModel = new THREE.Matrix4().multiplyMatrices(modelInv, bodyNode.parent.matrixWorld);
      const pq = new THREE.Quaternion();
      parentModel.decompose(new THREE.Vector3(), pq, new THREE.Vector3());
      this._bodyYawAxis.set(0, 0, 1).applyQuaternion(pq.invert()).normalize();
    }
    // Head rest captured in MODEL space: the head bone has a large rest
    // rotation and a rotated parent chain, so head_pose is applied in the
    // model (robot) frame and converted back to bone-local each frame.
    const head = this._bones.head;
    if (head?.parent) {
      const headModel = new THREE.Matrix4().multiplyMatrices(modelInv, head.matrixWorld);
      const parentModel = new THREE.Matrix4().multiplyMatrices(modelInv, head.parent.matrixWorld);
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3();
      headModel.decompose(p, q, s);
      this._headRest = { parentInv: parentModel.invert(), q, p, s };
      this._legs = LEG_IDS.map((id) => setupLeg(id, byName, head)).filter(
        (/** @type {LegChain | null} */ l) => l !== null
      );
    }
  }

  /**
   * Latest robot-frame target; the render loop eases toward it.
   * @param {{ headPose: number[] | null, bodyYaw: number, antennas: [number, number], primaryMotion?: boolean }} t
   */
  setTarget(t) {
    this._target = t;
  }

  /** Load the companion before revealing the scene; an asset failure remains non-fatal. */
  async loadCompanion() { /* Companion intentionally omitted in this demo. */ }

  /** Begin the rAF render loop (idempotent). */
  start() {
    if (this._frame) return;
    this._clock.start();
    const tick = () => {
      this._frame = requestAnimationFrame(tick);
      const delta = Math.min(this._clock.getDelta(), 0.05);
      // Hidden tabs do no scene work and accumulate no animation catch-up.
      if (document.hidden) return;
      this._update(delta);
      this._controls.update();
      this._microduck?.update(delta, this._camera.position);
      this._renderer.render(this._scene, this._camera);
      if (this._frameWaiters.length) {
        const waiters = this._frameWaiters;
        this._frameWaiters = [];
        for (const resolve of waiters) resolve();
      }
    };
    this._frame = requestAnimationFrame(tick);
  }

  /** Port of the TSX useFrame body. @param {number} delta */
  _update(delta) {
    const { body, head, antL, antR } = this._bones;
    const { headPose, bodyYaw, antennas, primaryMotion } = this._target;
    const sm = this._sm;
    const tmp = this._tmp;
    // Recorded emotions and official dances are already smooth trajectories;
    // render their sampled targets directly so fast peaks are not attenuated.
    // Keep the visual low-pass only for ordinary procedural state motion.
    const a = primaryMotion ? 1 : 1 - Math.exp(-SMOOTH_K * delta);

    // Body yaw: pre-multiply so the spin is about the vertical (parent-frame)
    // axis, then the rest pose.
    if (body && this._rest.body) {
      if (!sm.yawInit) {
        sm.smYaw = bodyYaw;
        sm.yawInit = true;
      } else {
        sm.smYaw += (bodyYaw - sm.smYaw) * a;
      }
      tmp.q.setFromAxisAngle(this._bodyYawAxis, YAW_SIGN * sm.smYaw);
      body.quaternion.copy(tmp.q).multiply(this._rest.body);
    }

    // Head 6-DOF from the cartesian pose matrix (the whole head is rigidly
    // parented to this one bone). Smooth in the robot frame, then convert.
    const m = toMatrix(headPose);
    const hr = this._headRest;
    if (head && hr && m) {
      m.decompose(sm.tgtP, sm.tgtQ, tmp.s);
      if (!sm.headInit) {
        sm.smP.copy(sm.tgtP);
        sm.smQ.copy(sm.tgtQ);
        sm.headInit = true;
      } else {
        sm.smP.lerp(sm.tgtP, a);
        sm.smQ.slerp(sm.tgtQ, a);
      }
      tmp.p.copy(sm.smP);
      tmp.q.copy(sm.smQ);
      // Change of basis robot -> model frame: R_model = M·R·M⁻¹, t_model = M·t.
      tmp.q.premultiply(HEAD_FIX).multiply(HEAD_FIX_INV);
      tmp.p.applyQuaternion(HEAD_FIX);
      tmp.worldQ.copy(tmp.q).multiply(hr.q);
      // Head pivot + translation, Z clamped to the platform's reach so the
      // legs can always follow.
      tmp.worldP.copy(hr.p).addScaledVector(tmp.p, UNITS_PER_M);
      tmp.worldP.z = Math.min(hr.p.z + HEAD_Z_MAX, Math.max(hr.p.z + HEAD_Z_MIN, tmp.worldP.z));
      tmp.mat.compose(tmp.worldP, tmp.worldQ, hr.s);
      tmp.mat.premultiply(hr.parentInv);
      tmp.mat.decompose(head.position, head.quaternion, head.scale);
    }

    // Neck leg IK: re-solve each leg so its tip tracks the head-mounted target.
    for (const leg of this._legs) solveLeg(leg, LEG_IK_ITERATIONS);

    // Antennas
    if (antennas) {
      if (!sm.antInit) {
        sm.smAnt[0] = antennas[0];
        sm.smAnt[1] = antennas[1];
        sm.antInit = true;
      } else {
        sm.smAnt[0] += (antennas[0] - sm.smAnt[0]) * a;
        sm.smAnt[1] += (antennas[1] - sm.smAnt[1]) * a;
      }
      if (antL && this._rest.antL) {
        tmp.q.setFromAxisAngle(ANT_AXIS, ANT_SIGN * sm.smAnt[1]);
        antL.quaternion.copy(this._rest.antL).multiply(tmp.q);
      }
      if (antR && this._rest.antR) {
        tmp.q.setFromAxisAngle(ANT_AXIS, ANT_SIGN * sm.smAnt[0]);
        antR.quaternion.copy(this._rest.antR).multiply(tmp.q);
      }
    }
  }
}


// Local lifecycle adapter for the pinned upstream renderer.
RobotViewer.prototype.dispose = function () {
    if (this._disposed) return;
    this._disposed = true;

    cancelAnimationFrame(this._frame);
    this._frame = 0;

    this._resizeObserver?.disconnect();
    this._controls.dispose();
    this._draco?.dispose();

    // Several meshes can share a resource. Dispose each resource once.
    const released = new Set();

    const release = (resource) => {
        if (!resource || released.has(resource)) return;
        released.add(resource);
        resource.dispose?.();
    };

    this._scene.traverse((object) => {
        release(object.geometry);
        release(object.skeleton);
        object.shadow?.dispose();

        const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

        for (const material of materials) {
            if (!material) continue;

            for (const value of Object.values(material)) {
                if (value?.isTexture) release(value);
            }

            release(material);
        }
    });

    this._renderer.dispose();
    this._renderer.forceContextLoss();
    this._renderer.domElement.remove();
};
