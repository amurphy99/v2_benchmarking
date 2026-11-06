/**
 * Download pinned Reachy sources and assets.
 *
 * Run from frontend/:
 *   node src/pages/reachy_demo/download-assets.mjs
 *
 * Generated vendor files retain their original comments. Local adaptations:
 * - Use this project's installed Three.js.
 * - Serve model, textures, decoder, and emotions from our own website.
 * - Omit the unrelated Microduck companion.
 * - Add cleanup methods for React unmounting.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const demoDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = fileURLToPath(new URL("../../../", import.meta.url));
const publicDir = join(frontendDir, "public/reachy-demo");

// Deployment supplies a persistent VM directory. Local runs use .cache,
// which is already excluded by the frontend's .dockerignore.
const cacheDir =
    process.env.REACHY_ASSET_CACHE_DIR ||
    join(frontendDir, ".cache", "reachy-downloads");

const spaceRevision = "bdcac3f73e9b7def1a71ee03d2ca7a858fd0004b";
const emotionRevision = "873ae49f0b89114b7e535eff0c1f7560d21d9357";

const spaceUrl =
    `https://huggingface.co/spaces/pollen-robotics/reachy-mini-3d-voice/resolve/${spaceRevision}`;

const emotionUrl =
    `https://huggingface.co/datasets/pollen-robotics/reachy-mini-emotions-library/resolve/${emotionRevision}`;

async function get(url) {
    // The URL includes the pinned upstream revision. Changing that revision
    // automatically selects a new cache entry.
    const key = createHash("sha256").update(url).digest("hex");
    const cachePath = join(cacheDir, `${key}.bin`);

    try {
        const cached = await readFile(cachePath);
        if (cached.length > 0) {
            return new Response(cached);
        }
    } catch (error) {
        // A missing entry needs downloading. Other filesystem errors should
        // stop preparation instead of silently bypassing the cache.
        if (error.code !== "ENOENT") throw error;
    }

    const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        throw new Error(`Download failed (${response.status}): ${url}`);
    }

    // Read the complete response before caching it. A failed or interrupted
    // download must not leave an entry that a later deployment will reuse.
    const content = Buffer.from(await response.arrayBuffer());

    if (content.length === 0) {
        throw new Error(`Empty download: ${url}`);
    }

    await mkdir(cacheDir, { recursive: true });

    // Rename only after writing finishes. Interrupted temporary files are
    // ignored by subsequent runs.
    const temporaryPath = `${cachePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, cachePath);

    return new Response(content);
}

async function save(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
}

// Stop if an expected adaptation no longer matches the upstream source.
function replaceOnce(source, pattern, replacement) {
    const result = source.replace(pattern, replacement);

    if (result === source) {
        throw new Error(`Upstream patch did not match: ${pattern}`);
    }

    return result;
}

// Download and adapt the existing renderer and motion code.
for (const name of ["gltf-robot.js", "motion.js", "head-wobbler.js"]) {
    let source = await (await get(`${spaceUrl}/robot/${name}`)).text();

    // Vite bundles our existing npm dependency instead of a separate CDN copy.
    source = source.replaceAll(
        "https://esm.sh/three@0.160.0",
        "three"
    );

    if (name === "gltf-robot.js") {
        source = source.replaceAll(
            '"assets/',
            '"/reachy-demo/assets/'
        );

        source = replaceOnce(
            source,
            '"draco/"',
            '"/reachy-demo/draco/"'
        );

        // Retain references needed to release observers and decoder workers.
        source = replaceOnce(
            source,
            /new ResizeObserver\(this\._resize\)\.observe\(container\);/,
            "this._resizeObserver = new ResizeObserver(this._resize);\n" +
            "    this._resizeObserver.observe(container);"
        );

        source = replaceOnce(
            source,
            /const draco = new DRACOLoader\(\);/,
            "const draco = this._draco = new DRACOLoader();"
        );

        // Keep the unrelated companion out of Vite's dependency graph.
        source = replaceOnce(
            source,
            /  async loadCompanion\(\) \{[\s\S]*?\n  \}/,
            "  async loadCompanion() { /* Companion intentionally omitted in this demo. */ }"
        );

        source += `

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
`;
    }

    if (name === "motion.js") {
        source = replaceOnce(
            source,
            /\.\/head-wobbler\.js\?[^"\s]+/,
            "./head-wobbler.js"
        );

        // Load static JSON files instead of the upstream application's API.
        source = replaceOnce(
            source,
            /\/api\/emotions\/\$\{encodeURIComponent\(resolved\)\}/,
            "/reachy-demo/emotions/${encodeURIComponent(resolved)}.json"
        );

        source += `

// Cancel animation and invalidate pending emotion loads on React unmount.
RobotMotion.prototype.dispose = function () {
    cancelAnimationFrame(this._frame);
    this._frame = 0;

    this.stopEmotion();
    this.stopDance();
    this.detachAssistantAudio();
};
`;
    }

    await save(join(demoDir, "vendor", name), source);
}

// These are the assets used by the upstream Reachy renderer.
const assets = [
    "assets/reachy_mini_viz.glb",
    "assets/alpine-window.webp",
    "assets/oak-table.webp",
    "draco/draco_decoder.js",
    "draco/draco_decoder.wasm",
    "draco/draco_wasm_wrapper.js",
];

// Read the file list at a fixed dataset revision.
const metadata = await (
    await get(
        "https://huggingface.co/api/datasets/" +
        "pollen-robotics/reachy-mini-emotions-library/" +
        `revision/${emotionRevision}`
    )
).json();

const emotions = metadata.siblings
    .map((file) => file.rfilename)
    .filter((name) => /^[a-zA-Z0-9_-]+\.json$/.test(name));

if (emotions.length === 0) {
    throw new Error("No recorded emotions found.");
}

const downloads = [
    ...assets.map((name) => [
        join(publicDir, name),
        `${spaceUrl}/${name}`,
    ]),
    ...emotions.map((name) => [
        join(publicDir, "emotions", name),
        `${emotionUrl}/${name}`,
    ]),
];

// Limit concurrent downloads. Audio sidecars are deliberately omitted:
// gestures stay silent so they will not overlap conversation speech.
let next = 0;

await Promise.all(
    Array.from({ length: 6 }, async () => {
        while (next < downloads.length) {
            const [path, url] = downloads[next++];
            const response = await get(url);
            await save(path, Buffer.from(await response.arrayBuffer()));
        }
    })
);

await save(
    join(demoDir, "UPSTREAM.txt"),
    `Viewer and motion source: ${spaceUrl}\n` +
    `Emotion source: ${emotionUrl}\n` +
    "Local adaptations are documented in download-assets.mjs.\n"
);

console.log(
    `Downloaded Reachy model, decoder, textures, and ${emotions.length} motions.`
);