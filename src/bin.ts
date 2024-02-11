#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cac } from 'cac'
import { load } from 'tsconfig-utils'
import dunble from './index.js'

const cwd = process.cwd()
// const args = process.argv.slice(2)

const cli = cac('dunble')
  .option('-m, --minify', 'Minify output')
  .option('--env <env>', 'Compile-time environment variables')
  .help()

const argv = cli.parse()

if (!argv.options.help) {
  const manifest = await readFile(join(cwd, 'package.json'), 'utf8').then(JSON.parse)
  const tsconfig = await load(cwd)
  await dunble(cwd, manifest, tsconfig, argv.options)
}
