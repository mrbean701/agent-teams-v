// Deprecated duplicate of ./css-module-plugin.mjs. `package.json` sets
// "type": "module", so this `.js` file was parsed as ESM while still using
// require()/module.exports — it could never be loaded, and it also carried the
// old absolute-module-id behaviour that leaked build-machine paths (audit F5).
// It now just re-exports the real plugin, so the two files cannot drift apart.
export { cssModulePlugin } from './css-module-plugin.mjs';
