# dumble

[![npm](https://img.shields.io/npm/v/dumble?style=flat-square)](https://www.npmjs.com/package/dumble)
[![GitHub](https://img.shields.io/github/license/shigma/dumble?style=flat-square)](https://github.com/shigma/dumble/blob/master/LICENSE)

Dumble is a zero-configuration bundler for your TypeScript project.

It automatically reads `tsconfig.json` and `package.json` to determine what files to bundle, which is the desired format, where to output the files, and more.

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

3. Start building:

```sh
npm run build
```

## Configuration

For most scenarios, you don't need to configure anything. Below are some properties you can set in `tsconfig.json` and `package.json` to customize the build process.

```json
// tsconfig.json
{
    "compilerOptions": {
        // the input and output directories
        "rootDir": "src",
        "outDir": "lib",

        // if you want declaration files
        "declaration": true,
        "emitDeclarationOnly": true,

        // otherwise
        "noEmit": true,
    },
}
```

```json
// package.json
{
    "name": "my-package",

    // Set "module" or "commonjs" (https://nodejs.org/api/packages.html#type)
    "type": "module",

    // Define the output files
    "main": "./dist/index.cjs",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.cts",

    // Define output files for Node.js export maps (https://nodejs.org/api/packages.html#exports)
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
