// A small JSON Schema validator for the contract tests (U34) — the subset the spec/*.json files use:
// type (incl. arrays of types), properties, required, additionalProperties (schema), items, enum,
// pattern, minimum, maximum, minItems. No dependency: npm test must stay dependency-free.
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)
const isType = (v, t) => (t === 'number' ? typeof v === 'number' : t === 'integer' ? Number.isInteger(v) : typeOf(v) === t)

export function validate(schema, value, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') return errors
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => isType(value, t))) {
      errors.push(`${path}: expected ${types.join(' | ')}, got ${typeOf(value)}`)
      return errors
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`)
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: "${value}" does not match ${schema.pattern}`)
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than ${schema.minItems} items`)
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, errors))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${path}: missing required "${k}"`)
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in value) validate(sub, value[k], `${path}.${k}`, errors)
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [k, v] of Object.entries(value)) if (!(schema.properties && k in schema.properties)) validate(schema.additionalProperties, v, `${path}.${k}`, errors)
    } else if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(schema.properties && k in schema.properties)) errors.push(`${path}: unexpected "${k}"`)
    }
  }
  return errors
}
