# dumble

[![npm](https://img.shields.io/npm/v/dumble?style=flat-square)](https://www.npmjs.com/package/dumble)
[![GitHub](https://img.shields.io/github/license/cordiverse/dumble?style=flat-square)](https://github.com/cordiverse/dumble/blob/master/LICENSE)

Dumble is a zero-configuration bundler for your TypeScript project.

It automatically reads `tsconfig.json` and `package.json` to determine what files to bundle, which is the desired format, where to output the files, and more.

Inspired by [pkgroll](https://github.com/privatenumber/pkgroll).

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

Packages to externalize are detected by reading dependency types in `package.json`:

| Dependency Type | Behavior |
| --- | --- |
| `dependencies` | external |
| `peerDependencies` | external |
| `optionalDependencies` | external |
| `devDependencies` | bundle |
| not listed | error |

## More Options

Although dumble tries it best to infer the configuration you need, there are still some cases where you may want to manually customize your build. Basically, all the additional options are consistent with the [esbuild](https://esbuild.github.io) CLI.

### Target

`target` is automatically detected from `tsconfig.json`. If you want to override it, you can set `--target` option.

```sh
dumble --target=node14
```

### Source Maps

`sourceMap` is automatically detected from `tsconfig.json`, but it only supports a `boolean` value. If you want to further customize it, you can set `--sourcemap` option.

```sh
dumble --sourcemap=inline
```

### Minification

Dumble does not minify your code by default. If you want to minify your code, you can set `--minify` option.

```sh
dumble --minify
```

## Credits

[pkgroll](https://github.com/privatenumber/pkgroll) is a similar project that inspired this one. It actually provides more features, such as

- `--watch`
- `.d.ts` bundling
- rollup-based minification (which is slightly smaller than esbuild)

If you find dumble not satisfying your needs, consider using pkgroll instead (better yet, open an issue or pull request to improve dumble).

Compared to pkgroll, dumble is simpler and more focused on zero-configuration. Also, dumble can be easily integrated into a monorepo with multiple packages, and can be further customized with esbuild options.
