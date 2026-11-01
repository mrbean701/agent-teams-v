import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { cssModulePlugin } from './css-module-plugin.mjs';

// V21-F4: the package root comes from THIS module, never from the caller's cwd. Two things depend on it:
// the paths below (so the build works when it is invoked from anywhere) and, less obviously, the css-module
// plugin, which derives the portable module ids -- and therefore the map `sources` array -- from
// process.cwd(). Anchoring the root and then chdir-ing to it keeps both correct: the output bytes are
// identical whether the command is run from the package, from the repo root or from any other directory.
const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(pkgDir);
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const outFile = path.join(pkgDir, 'build', 'client.js');
const buildMapFile = path.join(pkgDir, 'build', 'client.js.map');
const shippedFile = path.join(pkgDir, 'lib', 'client.js');
const shippedMapFile = path.join(pkgDir, 'lib', 'client.js.map');

// Everything the loader wrapper puts above the esbuild body. The sourcemap
// esbuild writes describes build/client.js, so the shipped map has to be shifted
// down by exactly this many lines to keep describing lib/client.js.
const wrapperHeader = [
  'window.__ModuleLoader__.load({',
  '  id: ' + JSON.stringify(pkg.name) + ',',
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
];
const wrapperFooter = [
  '    return module.exports;',
  '  }',
  '});',
  '//# sourceMappingURL=client.js.map',
];

async function main() {
  const result = await esbuild.build({
    // V21-F4: esbuild writes '// <path>' comments above every module and derives them from absWorkingDir,
    // which defaults to cwd. process.chdir() above is not enough (esbuild captured the original cwd when it
    // was imported), so the root is pinned explicitly here: the bundle bytes no longer depend on where the
    // command was started from.
    absWorkingDir: pkgDir,
    entryPoints: [path.join(pkgDir, 'lib', 'client', 'index.js')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    outfile: outFile,
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
    plugins: [cssModulePlugin],
    sourcemap: true,
    write: true,
  });
  console.log('esbuild errors:', result.errors.length);
  console.log('esbuild warnings:', result.warnings.length);

  // The body is embedded verbatim (no re-indentation) and only whole lines are
  // added around it, so the column positions in client.js.map stay valid.
  const body = fs
    .readFileSync(outFile, 'utf8')
    .replace(/\/\/# sourceMappingURL=.*/g, '');
  fs.writeFileSync(shippedFile, [...wrapperHeader, body, ...wrapperFooter].join('\n'));
  console.log('Wrote lib/client.js');

  // Manual audit F4: the shipped bundle ends with `//# sourceMappingURL=client.js.map`,
  // so the map beside it must be the one this build just produced. Copying it is
  // not enough on its own: the wrapper adds lines above the body, so the mappings
  // are shifted by the wrapper header, otherwise every frame is reported too early.
  if (!fs.existsSync(buildMapFile)) {
    throw new Error('esbuild did not write build/client.js.map');
  }
  const map = JSON.parse(fs.readFileSync(buildMapFile, 'utf8'));
  map.mappings = ';'.repeat(wrapperHeader.length) + map.mappings;
  fs.writeFileSync(shippedMapFile, JSON.stringify(map));
  console.log('Wrote lib/client.js.map');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
