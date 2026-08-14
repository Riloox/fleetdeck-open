'use strict';

/*
 * /api/portability/minecraft — Minecraft server adoption preview.
 *
 *   POST   /adopt/preview   detect an existing server directory
 *
 * The actual adoption uses the existing POST /api/servers registration API.
 * This route exists solely for the detection step that the frontend cannot
 * run (Node.js filesystem access is needed).
 *
 * Follows the shape of lib/routes/worlds.cjs.
 */

const express = require('express');
const minecraftPortability = require('../minecraft-portability.cjs');

function minecraftPortabilityRouter(deps) {
  const { requireAdmin, getConfig, sendError } = deps;
  const router = express.Router();

  /*
   * POST /api/portability/minecraft/adopt/preview
   * Body: { dir: string }
   * Returns the detection descriptor from minecraft-portability.cjs.
   */
  router.post('/adopt/preview', requireAdmin, (req, res) => {
    try {
      const config = getConfig();
      res.json(minecraftPortability.detectServer({
        dir: req.body?.dir,
        servers: config.servers || [],
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

module.exports = minecraftPortabilityRouter;
