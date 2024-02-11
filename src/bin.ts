#!/usr/bin/env node

import { esbuild } from './index.js'

const cwd = process.cwd()
const args = process.argv.slice(2)

esbuild(cwd, args)
