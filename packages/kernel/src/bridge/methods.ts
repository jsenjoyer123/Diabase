// Names that can never be exposed or proxied, even in an explicit `methods` list: they would
// shadow `Object.prototype` members or make a proxy look like a thenable.
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype', 'then'])
const SERVICE_FIELDS = new Set(['ctx', 'name'])

export function isMethodName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && !FORBIDDEN.has(name)
}

/**
 * Function-valued string keys of `target` and its prototype chain, up to (excluding)
 * `Object.prototype`/`Function.prototype`. Accessors are never invoked; `_`-prefixed names and
 * Cordis' own `ctx`/`name` fields are skipped.
 */
export function discoverMethods(target: object): string[] {
  const seen = new Set<string>()
  const methods: string[] = []
  for (
    let object: object | null = target;
    object && object !== Object.prototype && object !== Function.prototype;
    object = Object.getPrototypeOf(object)
  ) {
    for (const key of Object.getOwnPropertyNames(object)) {
      if (seen.has(key)) continue
      seen.add(key)
      if (!isMethodName(key) || SERVICE_FIELDS.has(key) || key.startsWith('_')) continue
      if (typeof Object.getOwnPropertyDescriptor(object, key)?.value === 'function') methods.push(key)
    }
  }
  return methods
}
