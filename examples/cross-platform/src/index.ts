import { platform } from './adapter/index.js'

export function foo() {
  return console.log(platform())
}
