# dumble

[![npm](https://img.shields.io/npm/v/dumble?style=flat-square)](https://www.npmjs.com/package/dumble)
[![GitHub](https://img.shields.io/github/license/shigma/dumble?style=flat-square)](https://github.com/shigma/dumble/blob/master/LICENSE)

Dumble is a zero-configuration bundler for your TypeScript project.

It automatically reads `tsconfig.json` and `package.json` to determine what files to bundle, which is the desired format, where to output the files, and more.

Inspired by [pkgroll](https://github.com/privatenumber/pkgroll).

Use [esbuild](https://esbuild.github.io/) under the hood.

## Quick Setup

1. Install:

```sh
npm install --save-dev dumble
```

2. Add a `build` script:

```json
{
    "scripts": {
        "build": "tsc -b && dumble"
    }
}
```

Note: `dumble` is intended to be used together with `tsc` (TypeScript compiler). `tsc` is useful for type checking and generating `.d.ts` files, while `dumble` is used for bundling and tree-shaking `.js` files.

3. Start building:

```sh
npm run build
```

## Configuration

For most scenarios, you don't need to configure anything. Below are some properties you can set in `tsconfig.json` and `package.json` to customize the build process.

```json5
// tsconfig.json
{
    "compilerOptions": {
        // the input and output directories
        "rootDir": "src",
        "outDir": "lib",

        // if you want .d.ts files,
        // set "declaration" and "emitDeclarationOnly" to true
        "declaration": true,
        "emitDeclarationOnly": true,

        // if you don't want .d.ts files,
        // simply set "noEmit" to true
        "noEmit": true,

        // target and sourcemaps are also respected
        "target": "esnext",
        "sourceMap": true,
    },
}
```

```json5
// package.json
{
    "name": "my-package",

    // module system (https://nodejs.org/api/packages.html#type)
    "type": "module",

    // output files
    "main": "./dist/index.cjs",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.cts",

    // export map (https://nodejs.org/api/packages.html#exports)
    "exports": {
        "require": {
            "types": "./dist/index.d.cts",
            "default": "./dist/index.cjs"
        },
        "import": {
            "types": "./dist/index.d.mts",
            "default": "./dist/index.mjs"
        }
    },

    // bin files will be compiled to be executable with the Node.js hashbang
    "bin": "./dist/cli.js",
}
```

## Basic Usage

### Entry Points and Exports

| `package.json` property | Output Format |
| --- | --- |
| main | auto-detected |
| module | esmodule |
| types | declaration |
| exports.* | auto-detected |
| exports.*.require | commonjs |
| exports.*.import | esmodule |
| bin | auto-detected |

Auto-detection is based on the extension and the [`type`](https://nodejs.org/api/packages.html#type) field in `package.json`:

| Extension | Type |
| --- | --- |
| `.cjs` | commonjs |
| `.mjs` | esmodule |
| `.js` | esmodule if `type` is `"module"`, <br>commonjs otherwise |

### Dependency bundling

Packages to externalize are detected by reading dependency types in package.json. Only dependencies listed in devDependencies are bundled in.

When generating type declarations (.d.ts files), this also bundles and tree-shakes type dependencies declared in devDependencies as well.

## Advanced Usage

## Other Features

### Target

### Source Maps

### Minification

## Credits

[pkgroll](https://github.com/privatenumber/pkgroll) is a similar project with more features, such as `--watch` and rollup minification (which can generate smaller files than esbuild in some cases). If you find dumble not satisfying your needs, consider using pkgroll instead (better yet, open an issue or pull request to improve dumble).

Compared to pkgroll, dumble is simpler and more focused on zero-configuration. Also, dumble can be easily integrated into a monorepo with multiple packages, and can be further customized with esbuild options.
