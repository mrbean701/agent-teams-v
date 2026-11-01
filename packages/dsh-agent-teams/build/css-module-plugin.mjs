import fs from 'fs';
import path from 'path';

// The id returned by onResolve for a `.module.css` file must never be an
// absolute path: esbuild writes that id into the bundle as a
// `// <namespace>:<id>` comment and into the sourcemap `sources` array, so an
// absolute id leaks the build machine layout (drive letter, user folders) into
// the published artefact. Ids are therefore relative to process.cwd(), using
// forward slashes only.
const toPosix = (value) => value.split(path.sep).join('/');

const moduleIdFor = (absolutePath) => {
  const relative = toPosix(path.relative(process.cwd(), absolutePath));
  const escapesCwd = !relative || relative.startsWith('..') || /^[A-Za-z]:/.test(relative) || path.isAbsolute(relative);
  // Outside the package root there is no portable relative id; fall back to a
  // bare basename rather than exposing where the file really lives.
  return escapesCwd ? 'vendor/' + path.basename(absolutePath) : relative;
};

export const cssModulePlugin = {
  name: 'css-module',
  setup(build) {
    // id -> absolute path, so onLoad never has to reconstruct the real location.
    const absoluteById = new Map();

    build.onResolve({ filter: /\.module\.css$/ }, (args) => {
      const absolute = path.resolve(path.dirname(args.importer), args.path);
      const id = moduleIdFor(absolute);
      absoluteById.set(id, absolute);
      return { path: id, namespace: 'css-module' };
    });
    build.onLoad({ filter: /.*/, namespace: 'css-module' }, async (args) => {
      const absolute = absoluteById.get(args.path) || path.resolve(process.cwd(), args.path);
      const source = await fs.promises.readFile(absolute, 'utf8');
      const classNames = [...source.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
      const mapping = {};
      for (const name of classNames) {
        if (name.includes('_')) {
          const local = name.split('_').pop();
          mapping[local] = name;
        } else {
          mapping[name] = name;
        }
      }
      const escaped = source
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
      const mappingJson = JSON.stringify(mapping);
      const contents = 'const css = `' + escaped + '`;\n' +
        'if (typeof document !== \'undefined\') {\n' +
        '  const style = document.createElement(\'style\');\n' +
        '  style.textContent = css;\n' +
        '  document.head.appendChild(style);\n' +
        '}\n' +
        'export default ' + mappingJson + ';';
      return { contents, loader: 'js' };
    });
  }
};
