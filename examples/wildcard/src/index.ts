const map = {
  foo: () => import('./components/foo.js'),
  bar: () => import('./components/bar.js'),
}

export default function load(name: string) {
  return map[name]()
}
