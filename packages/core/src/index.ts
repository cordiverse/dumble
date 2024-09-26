import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { isBuiltin } from 'node:module'
import { TsConfig } from 'tsconfig-utils'
import { build, BuildFailure, BuildOptions, Message, Platform, Plugin } from 'esbuild'
import * as fs from 'node:fs/promises'
import * as yaml from 'js-yaml'
import kleur from 'kleur'
import globby from 'globby'

export const DependencyType = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const
export type DependencyType = typeof DependencyType[number]

export interface PackageJson extends Partial<Record<DependencyType, Record<string, string>>> {
  name: string
  type?: 'module' | 'commonjs'
  main?: string
  module?: string
  bin?: string | Record<string, string>
  exports?: PackageJson.Exports
  description?: string
  private?: boolean
  version: string
  workspaces?: string[]
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

export namespace PackageJson {
  export type Exports = string | { [key: string]: Exports }
}

const ignored = [
  'This call to "require" will not be bundled because the argument is not a string literal',
  'Indirect calls to "require" will not be bundled',
  'should be marked as external for use with "require.resolve"',
]

function display(prefix: string) {
  return ({ location, text }: Message) => {
    if (ignored.some(message => text.includes(message))) return
    if (!location) return console.log(prefix, text)
    const { file, line, column } = location
    console.log(kleur.cyan(`${file}:${line}:${column}:`), prefix, text)
  }
}

const displayError = display(kleur.red('error:'))
const displayWarning = display(kleur.yellow('warning:'))

function bundle(options: BuildOptions, base: string) {
  // show entry list
  for (const [key, value] of Object.entries(options.entryPoints!)) {
    const source = relative(base, value)
    const target = relative(base, resolve(options.outdir!, key + options.outExtension!['.js']))
    console.log('esbuild:', source, '->', target)
  }

  return build(options).then(({ warnings }) => {
    warnings.forEach(displayWarning)
  }, ({ warnings, errors }: BuildFailure) => {
    errors.forEach(displayError)
    warnings.forEach(displayWarning)
  })
}

const externalPlugin = ({ cwd, manifest, exports }: dumble.Data): Plugin => ({
  name: 'external library',
  setup(build) {
    const { entryPoints, platform, format } = build.initialOptions
    const currentEntry = Object.values(entryPoints!)[0]

    build.onResolve({ filter: /^[@\w].+$/ }, (args) => {
      if (isAbsolute(args.path)) return null
      if (isBuiltin(args.path)) return { external: true }
      const name = args.path.startsWith('@')
        ? args.path.split('/', 2).join('/')
        : args.path.split('/', 1)[0]
      if (name === manifest.name) return { external: true }
      const types = new Set(DependencyType.filter((type) => manifest[type]?.[name]))
      if (types.size === 0) {
        throw new Error(`Missing dependency: ${name} from ${args.importer}`)
      }
      // devDependencies are bundled
      types.delete('devDependencies')
      return { external: types.size > 0 }
    })

    build.onResolve({ filter: /^\./, namespace: 'file' }, async (args) => {
      const { path } = await build.resolve(args.path, {
        namespace: 'internal',
        importer: args.importer,
        resolveDir: args.resolveDir,
        kind: args.kind,
      })

      // type reflection
      const ext = extname(args.path)
      if (!path && ext.endsWith('js')) {
        const base = join(args.resolveDir, args.path.slice(0, -ext.length))
        const entry = exports[base + '.d' + ext.replace(/js$/, 'ts')]
        if (entry) return { path: entry.types, external: true }
      }

      if (currentEntry === path || !exports[path]) return null
      if (format === 'cjs') return { external: true }
      // native ESM import should preserve extensions
      const outFile = exports[path][platform!] || exports[path].default
      if (!outFile) return null
      const outDir = dirname(exports[currentEntry][platform!])
      let relpath = relative(outDir, outFile).replace(/\\/g, '/')
      if (!relpath.startsWith('.')) relpath = './' + relpath
      return { path: relpath, external: true }
    })

    build.onLoad({ filter: /\.d\.ts$/ }, async (args) => {
      const contents = await fs.readFile(args.path)
      return { loader: 'copy', contents }
    })
  },
})

const yamlPlugin = (options: yaml.LoadOptions = {}): Plugin => ({
  name: 'yaml',
  setup(build) {
    build.initialOptions.resolveExtensions!.push('.yml', '.yaml')

    build.onLoad({ filter: /\.ya?ml$/ }, async ({ path }) => {
      const source = await fs.readFile(path, 'utf8')
      return {
        loader: 'json',
        contents: JSON.stringify(yaml.load(source, options)),
      }
    })
  },
})

const hashbangPlugin = (binaries: string[]): Plugin => ({
  name: 'hashbang',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      if (!binaries.includes(path)) return null
      let contents = await fs.readFile(path, 'utf8')
      if (!contents.startsWith('#!')) {
        contents = '#!/usr/bin/env node\n' + contents
      }
      return { contents, loader: 'ts' }
    })
  },
})

namespace dumble {
  export interface Options {
    minify?: boolean
    env?: Record<string, string>
  }

  export interface Data {
    cwd: string
    manifest: PackageJson
    tsconfig: TsConfig
    exports: Record<string, Record<string, string>>
  }
}

async function dumble(cwd: string, manifest: PackageJson, tsconfig: TsConfig, options: dumble.Options = {}) {
  const { rootDir = '', outFile, noEmit, emitDeclarationOnly, sourceMap } = tsconfig.compilerOptions
  if (!noEmit && !emitDeclarationOnly) return
  const outDir = tsconfig.compilerOptions.outDir ?? dirname(outFile!)

  const define = Object.fromEntries(Object.entries(options.env ?? {}).map(([key, value]) => {
    return [`process.env.${key}`, JSON.stringify(value)]
  }))

  const outdir = resolve(cwd, outDir)
  const outbase = resolve(cwd, rootDir)
  const matrix: BuildOptions[] = []
  const exports: Record<string, Record<string, string>> = Object.create(null)
  const outFiles = new Set<string>()
  const binaries: string[] = []

  const resolveCache: Record<string, Promise<readonly [string, string[]] | undefined>> = Object.create(null)

  async function resolvePattern(pattern: string) {
    if (!pattern.startsWith(outDir + '/')) {
      // handle files like `package.json`
      pattern = pattern.replace('*', '**')
      const targets = await globby(pattern, { cwd })
      for (const target of targets) {
        // ignore exports in `rootDir`
        if (!relative(rootDir!, target).startsWith('../')) continue
        const filename = join(cwd, target)
        exports[filename] = { default: filename }
      }
      return
    }

    // https://nodejs.org/api/packages.html#subpath-patterns
    // `*` maps expose nested subpaths as it is a string replacement syntax only
    const outExt = extname(pattern)
    pattern = pattern.slice(outDir.length + 1, -outExt.length).replace('*', '**') + '.{ts,tsx}'
    return [outExt, await globby(pattern, { cwd: outbase })] as const
  }

  async function addExport(pattern: string | undefined, preset: BuildOptions, prefix: string | null = '', isBinary = false) {
    if (!pattern) return
    if (pattern.startsWith('./')) pattern = pattern.slice(2)
    const result = await (resolveCache[pattern] ??= resolvePattern(pattern))
    if (!result) return

    // transform options by extension
    const [outExt, targets] = result
    preset = { ...preset }
    if (outExt === '.cjs') {
      preset.format = 'cjs'
    } else if (outExt === '.mjs') {
      preset.format = 'esm'
    }

    for (const target of targets) {
      const srcFile = join(cwd, rootDir, target)
      if (isBinary) binaries.push(srcFile)
      const srcExt = extname(target)
      const entry = target.slice(0, -srcExt.length)
      const outFile = join(outdir, entry + outExt)
      if (outFiles.has(outFile)) return
      outFiles.add(outFile)
      if (!preset.platform) {
        ;(exports[srcFile] ||= {}).types = `${manifest.name}/${prefix!}`
      } else {
        ;(exports[srcFile] ||= {})[preset.platform] = outFile
      }

      matrix.push({
        absWorkingDir: cwd,
        outdir,
        outbase,
        target: tsconfig.compilerOptions?.target as any,
        outExtension: { '.js': outExt },
        entryPoints: { [entry]: srcFile },
        bundle: true,
        minify: options.minify,
        sourcemap: sourceMap,
        sourcesContent: false,
        keepNames: true,
        charset: 'utf8',
        logLevel: 'silent',
        resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'],
        tsconfig: cwd + '/tsconfig.json',
        plugins: [
          yamlPlugin(),
          externalPlugin({ cwd, manifest, tsconfig, exports }),
          hashbangPlugin(binaries),
        ],
        define,
        ...preset,
      })
    }
  }

  const tasks: Promise<void>[] = []

  // TODO: support null targets
  function addConditionalExport(pattern: PackageJson.Exports | undefined, preset: BuildOptions, prefix = '') {
    if (typeof pattern === 'string') {
      tasks.push(addExport(pattern, preset, prefix))
      return
    }

    for (const key in pattern) {
      if (key === 'require') {
        addConditionalExport(pattern[key], { ...preset, format: 'cjs' }, prefix)
      } else if (key === 'import') {
        addConditionalExport(pattern[key], { ...preset, format: 'esm' }, prefix)
      } else if (['browser', 'node'].includes(key)) {
        addConditionalExport(pattern[key], { ...preset, platform: key as Platform }, prefix)
      } else if (['types', 'typings'].includes(key)) {
        // use `undefined` to indicate `.d.ts` files
        addConditionalExport(pattern[key], { ...preset, platform: undefined }, prefix)
      } else {
        addConditionalExport(pattern[key], preset, key.startsWith('.') ? join(prefix, key) : prefix)
      }
    }
  }

  const preset: BuildOptions = {
    platform: 'node',
    format: manifest.type === 'module' ? 'esm' : 'cjs',
  }

  tasks.push(addExport(manifest.main, preset))
  tasks.push(addExport(manifest.module, { ...preset, format: 'esm' }))
  addConditionalExport(manifest.exports, preset)

  if (!manifest.exports) {
    // do not bundle `package.json`
    tasks.push(addExport('package.json', preset, null))
  }

  if (typeof manifest.bin === 'string') {
    tasks.push(addExport(manifest.bin, preset, null, true))
  } else if (manifest.bin) {
    for (const key in manifest.bin) {
      tasks.push(addExport(manifest.bin[key], preset, null, true))
    }
  }

  await Promise.all(tasks)

  await Promise.all(matrix.map(async (options) => {
    try {
      await bundle(options, process.cwd())
    } catch (error) {
      console.error(error)
    }
  }))
}

export default dumble
