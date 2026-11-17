/**
 * Named schema declaration resolution (top-level `schema` blocks → JSON Schema literals).
 */
export {
  type NamedSchemaResolution,
  resolveNamedSchemasFromDecls,
} from './named-schema-resolve'
export {
  inlineNamedSchemaRefs,
  type ValidateSchemaFieldRefsOptions,
  validateSchemaFieldRefs,
  webhookSecretRefs,
} from './schema-refs'
