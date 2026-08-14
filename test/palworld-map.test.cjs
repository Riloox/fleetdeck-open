'use strict';

const assert = require('assert');
const map = require('../lib/palworld-map.cjs');

// Palworld's map is rotated a quarter turn away from the Unreal world the REST
// API reports: the map runs east along world Y and north along world X. A
// marker's horizontal position therefore comes from the player's Y and its
// vertical position from the player's X.
const calibration = { assetVersion: 'fixture-1', bounds: { minX: -100, maxX: 100, minY: -50, maxY: 50 } };
// North-west of the world (max X, min Y) is the top-left of the image.
assert.deepEqual(map.project({ x: 100, y: -50 }, calibration), { u: 0, v: 0, inBounds: true });
assert.deepEqual(map.project({ x: 0, y: 0 }, calibration), { u: 0.5, v: 0.5, inBounds: true });
// South-east (min X, max Y) is the bottom-right.
assert.deepEqual(map.project({ x: -100, y: 50 }, calibration), { u: 1, v: 1, inBounds: true });
assert.equal(map.project({ x: -101, y: 0 }, calibration).inBounds, false);
assert.equal(map.project({ x: 0, y: 51 }, calibration).inBounds, false);
assert.equal(map.project({ x: Number.NaN, y: 0 }, calibration), null);
assert.throws(() => map.project({ x: 0, y: 0 }, { bounds: { minX: 0, maxX: 0, minY: 0, maxY: 1 } }));
assert.notEqual(
  map.revisionOf({ asset: { version: 'fixture-1' }, calibration }),
  map.revisionOf({ asset: { version: 'fixture-2' }, calibration }),
);
// A server that has never been calibrated still gets a usable map: the bundled
// asset plus default bounds, flagged so the UI can offer "reset to default".
const fresh = { id: 'server-1', dir: '/tmp/fleetdeck-map-fixture' };
const state = map.publicState(fresh);
assert.equal(state.asset.builtin, true);
assert.match(state.asset.checksum, /^sha256:[0-9a-f]{64}$/);
assert.equal(state.calibration.assetVersion, 'fleetdeck-palpagos-3');
assert.deepEqual(state.calibration.bounds, map.DEFAULT_BOUNDS);
assert.equal(state.isDefault, true);
assert.equal(state.previousRevision, null);
assert.ok(map.project({ x: 0, y: 0 }, state.calibration).inBounds);
assert.equal(map.assetFile(fresh).builtin, true);
assert.ok(require('fs').existsSync(map.assetFile(fresh).file));

// Bounds can be saved without supplying any provenance, and the built-in asset
// survives a bounds-only save.
const bounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
const previewed = map.preview(fresh, { revision: state.revision, bounds });
assert.equal(previewed.asset.builtin, true);
const saved = map.apply(fresh, { revision: state.revision, bounds, previewToken: previewed.previewToken });
assert.equal(saved.asset.builtin, true);
assert.deepEqual(saved.calibration.bounds, bounds);
assert.equal(saved.isDefault, false);
assert.equal(fresh.palworldMap.asset.file, undefined, 'built-in asset path must not be persisted');

// Reset returns to the bundled defaults and stays reversible.
const reset = map.resetToDefault(fresh);
assert.deepEqual(reset.calibration.bounds, map.DEFAULT_BOUNDS);
assert.ok(reset.previousRevision);
assert.deepEqual(map.restore(fresh, reset.previousRevision).calibration.bounds, bounds);

// -- the Palpagos world grid --------------------------------------------------

// The defaults are the real extents of the Palpagos world, which is what makes
// a raw REST coordinate land where the game's own map would put it. The two
// samples below are palworld-coord's published conversions between save-file
// and Paldex coordinates; projecting the save-file point must reproduce the
// same fraction of the +/-1000 Paldex grid.
// Those grid references are whole numbers, so the tolerance is half a grid
// step (0.5 / 2000) - any wider and a wrong scale or offset would slip through.
const paldex = ([x, y]) => ({ u: (x + 1000) / 2000, v: 1 - (y + 1000) / 2000 });
for (const [world, grid] of [[[-167230, 96430], [-134, -94]], [[-288669, 329207], [373, -359]]]) {
  const projected = map.project({ x: world[0], y: world[1] }, state.calibration);
  const expected = paldex(grid);
  assert.ok(Math.abs(projected.u - expected.u) <= 0.00025, `u ${projected.u} != ${expected.u}`);
  assert.ok(Math.abs(projected.v - expected.v) <= 0.00025, `v ${projected.v} != ${expected.v}`);
  assert.equal(projected.inBounds, true);
}

// The same two samples read back as the whole-number grid the game puts on
// screen. This is the game's own grid, so it never depends on calibration.
assert.deepEqual(map.grid({ x: -167230, y: 96430 }), { x: -134, y: -94 });
assert.deepEqual(map.grid({ x: -288669, y: 329207 }), { x: 373, y: -359 });
assert.deepEqual(map.grid({ x: map.GRID_ORIGIN.x, y: map.GRID_ORIGIN.y }), { x: 0, y: 0 });
// A missing vertical coordinate is normal in the live REST payload and must not
// cost the pair; a missing horizontal one has no grid position at all.
assert.deepEqual(map.grid({ x: -123888, y: 158000, z: null }), { x: 0, y: 0 });
assert.equal(map.grid({ x: Number.NaN, y: 0 }), null);
assert.equal(map.grid(null), null);

// The bundled artwork is a square canvas, so the world square covers all of it
// and the world centre is the image centre. No content rect is involved.
assert.equal(state.calibration.contentRect, undefined);
assert.equal(map.DEFAULT_BOUNDS.maxX - map.DEFAULT_BOUNDS.minX, 918000);
assert.equal(map.DEFAULT_BOUNDS.maxY - map.DEFAULT_BOUNDS.minY, 918000);
const centre = map.project({ x: -123888, y: 158000 }, state.calibration);
assert.ok(Math.abs(centre.u - 0.5) < 1e-12);
assert.ok(Math.abs(centre.v - 0.5) < 1e-12);
const north = map.project({ x: map.DEFAULT_BOUNDS.maxX, y: 158000 }, state.calibration);
assert.equal(north.v, 0);
assert.ok(Math.abs(north.u - 0.5) < 1e-12);
const east = map.project({ x: -123888, y: map.DEFAULT_BOUNDS.maxY }, state.calibration);
assert.equal(east.u, 1);
assert.equal(map.project({ x: map.DEFAULT_BOUNDS.maxX + 1, y: 0 }, state.calibration).inBounds, false);

// Uploading an asset with a content rect stores it; bounds-only saves carry
// the current rect forward; malformed rects are rejected.
const custom = { id: 'server-2', dir: '/tmp/fleetdeck-map-fixture-2' };
const customState = map.publicState(custom);
const png = 'data:image/png;base64,' + 'a'.repeat(64);
const customRect = { u0: 0, v0: 0.25, u1: 1, v1: 0.75 };
const previewedUpload = map.preview(custom, {
  revision: customState.revision, bounds,
  assetData: png, asset: { source: 'fixture' }, contentRect: customRect,
});
assert.deepEqual(previewedUpload.calibration.contentRect, customRect);
const appliedUpload = map.apply(custom, {
  revision: customState.revision, bounds,
  assetData: png, asset: { source: 'fixture' }, contentRect: customRect,
  previewToken: previewedUpload.previewToken,
});
assert.deepEqual(appliedUpload.calibration.contentRect, customRect);
const afterUpload = map.publicState(custom);
assert.deepEqual(afterUpload.calibration.contentRect, customRect);
const boundsOnly = map.preview(custom, { revision: afterUpload.revision, bounds: { ...bounds, minX: -2000 } });
assert.deepEqual(boundsOnly.calibration.contentRect, customRect);
assert.throws(() => map.preview(custom, {
  revision: afterUpload.revision, bounds, assetData: png, asset: { source: 'x' },
  contentRect: { u0: 0, v0: 0.9, u1: 1, v1: 0.5 },
}));
assert.throws(() => map.preview(custom, {
  revision: afterUpload.revision, bounds, assetData: png, asset: { source: 'x' },
  contentRect: { u0: -0.1, v0: 0, u1: 1, v1: 1 },
}));

// A stored calibration that names an older bundled asset is stale: every bump
// changed either the artwork or what the bounds mean, so it falls back to the
// current defaults instead of projecting against the wrong grid.
const stale = {
  id: 'server-3', dir: '/tmp/fleetdeck-map-fixture-3',
  palworldMap: { calibration: { assetVersion: 'fleetdeck-palpagos-2', bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 } } },
};
const staleState = map.publicState(stale);
assert.equal(staleState.calibration.assetVersion, 'fleetdeck-palpagos-3');
assert.deepEqual(staleState.calibration.bounds, map.DEFAULT_BOUNDS);
assert.equal(staleState.calibration.contentRect, undefined);
// A calibration that matches the served asset version is kept.
const matching = {
  id: 'server-4', dir: '/tmp/fleetdeck-map-fixture-4',
  palworldMap: { asset: { builtin: true }, calibration: { assetVersion: 'fleetdeck-palpagos-3', bounds } },
};
assert.deepEqual(map.publicState(matching).calibration.bounds, bounds);

console.log('PASS  palworld-map');
