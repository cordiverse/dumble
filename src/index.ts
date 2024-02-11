import * as esbuild from 'esbuild'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import * as fs from 'node:fs/promises'
import * as yaml from 'js-yaml'
import kleur from 'kleur'
import globby from 'globby'
import { load } from 'tsconfig-utils'

export type DependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

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
  return ({ location, text }: esbuild.Message) => {
    if (ignored.some(message => text.includes(message))) return
    if (!location) return console.log(prefix, text)
    const { file, line, column } = location
    console.log(kleur.cyan(`${file}:${line}:${column}:`), prefix, text)
  }
}

const displayError = display(kleur.red('error:'))
const displayWarning = display(kleur.yellow('warning:'))

let code = 0

function bundle(options: esbuild.BuildOptions) {
  // show entry list
  for (const [key, value] of Object.entries(options.entryPoints!)) {
    const source = relative(process.cwd(), value)
    const target = relative(process.cwd(), resolve(options.outdir!, key + options.outExtension!['.js']))
    console.log('esbuild:', source, '->', target)
  }

  return esbuild.build(options).then(({ warnings }) => {
    warnings.forEach(displayWarning)
  }, ({ warnings, errors }: esbuild.BuildFailure) => {
    errors.forEach(displayError)
    warnings.forEach(displayWarning)
    code += errors.length
  })
}

async function compile(cwd: string, meta: PackageJson) {
  // filter out private packages
  if (meta.private) return []

  const filter = /^[@\w].+$/
  const externalPlugin: esbuild.Plugin = {
    name: 'external library',
    setup(build) {
      const { entryPoints, platform, format } = build.initialOptions
      const currentEntry = Object.values(entryPoints!)[0]
      build.onResolve({ filter }, (args) => {
        if (isAbsolute(args.path)) return null
        return { external: true }
      })
      build.onResolve({ filter: /^\./, namespace: 'file' }, async (args) => {
        const { path } = await build.resolve(args.path, {
          namespace: 'internal',
          importer: args.importer,
          resolveDir: args.resolveDir,
          kind: args.kind,
        })
        if (currentEntry === path || !exports[path]) return null
        if (format === 'cjs') return { external: true }
        // native ESM import should preserve extensions
        const outFile = exports[path][platform!] || exports[path].default
        if (!outFile) return null
        const outDir = dirname(exports[currentEntry][platform!])
        let relpath = relative(outDir, outFile)
        if (!relpath.startsWith('.')) relpath = './' + relpath
        return { path: relpath, external: true }
      })
    },
  }

  const config = await load(cwd)
  const { rootDir = '', outFile, noEmit, emitDeclarationOnly, sourceMap } = config.compilerOptions
  if (!noEmit && !emitDeclarationOnly) return []
  const outDir = config.compilerOptions.outDir ?? dirname(outFile!)

  const presets: Record<'browser' | 'cjs' | 'esm', esbuild.BuildOptions> = {
    browser: {
      platform: 'browser',
      format: 'esm',
    },
    cjs: {
      platform: 'node',
      format: 'cjs',
    },
    esm: {
      platform: 'node',
      format: 'esm',
    },
  }

  const outdir = resolve(cwd, outDir)
  const outbase = resolve(cwd, rootDir)
  const matrix: esbuild.BuildOptions[] = []
  const exports: Record<string, Record<string, string>> = Object.create(null)
  const outFiles = new Set<string>()

  function addExport(pattern: string | undefined, preset: esbuild.BuildOptions) {
    if (!pattern) return
    if (pattern.startsWith('./')) pattern = pattern.slice(2)
    if (!pattern.startsWith(outDir + '/')) {
      // handle files like `package.json`
      pattern = pattern.replace('*', '**')
      const targets = globby.sync(pattern, { cwd })
      for (const target of targets) {
        // ignore exports in `rootDir`
        if (!relative(rootDir!, target).startsWith('../')) continue
        const filename = join(cwd, target)
        exports[filename] = { default: filename }
      }
      return
    }

    // transform options by extension
    const options = { ...preset }
    if (pattern.endsWith('.cjs')) {
      options.format = 'cjs'
    } else if (pattern.endsWith('.mjs')) {
      options.format = 'esm'
    }

    // https://nodejs.org/api/packages.html#subpath-patterns
    // `*` maps expose nested subpaths as it is a string replacement syntax only
    const outExt = extname(pattern)
    pattern = pattern.slice(outDir.length + 1, -outExt.length).replace('*', '**') + '.{ts,tsx}'
    const targets = globby.sync(pattern, { cwd: outbase })
    for (const target of targets) {
      const srcFile = join(cwd, rootDir, target)
      const srcExt = extname(target)
      const entry = target.slice(0, -srcExt.length)
      const outFile = join(outdir, entry + outExt)
      if (outFiles.has(outFile)) return

      outFiles.add(outFile)
      ;(exports[srcFile] ||= {})[options.platform!] = outFile
      matrix.push({
        outdir,
        outbase,
        outExtension: { '.js': outExt },
        entryPoints: { [entry]: srcFile },
        bundle: true,
        sourcemap: sourceMap,
        sourcesContent: false,
        keepNames: true,
        charset: 'utf8',
        logLevel: 'silent',
        plugins: [externalPlugin, yamlPlugin()],
        resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.css', '.json'],
        tsconfig: cwd + '/tsconfig.json',
        ...options,
      })
    }
  }

  // TODO: support null targets
  function addConditionalExport(pattern: PackageJson.Exports | undefined, options: esbuild.BuildOptions) {
    if (typeof pattern === 'string') {
      return addExport(pattern, options)
    }

    for (const key in pattern) {
      if (key === 'node' || key === 'require' || key.startsWith('.')) {
        addConditionalExport(pattern[key], options)
      } else {
        addConditionalExport(pattern[key], presets.browser)
      }
    }
  }

  const preset = meta.type === 'module' ? presets.esm : presets.cjs
  addExport(meta.main, preset)
  addExport(meta.module, presets.browser)
  addConditionalExport(meta.exports, preset)

  if (!meta.exports) {
    // do not bundle `package.json`
    addExport('package.json', preset)
  }

  if (typeof meta.bin === 'string') {
    addExport(meta.bin, preset)
  } else if (meta.bin) {
    for (const key in meta.bin) {
      addExport(meta.bin[key], preset)
    }
  }

  return matrix
}

const yamlPlugin = (options: yaml.LoadOptions = {}): esbuild.Plugin => ({
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

export async function build(cwd: string, args: string[] = []) {
  const meta = await fs.readFile(join(cwd, 'package.json'), 'utf8').then(JSON.parse)
  const matrix = await compile(cwd, meta)
  await Promise.all(matrix.map(async (options) => {
    try {
      await bundle(options)
    } catch (error) {
      console.error(error)
    }
  }))
  if (code) process.exit(code)
}
