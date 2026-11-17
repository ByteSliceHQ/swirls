import type { GraphQLOutputType } from 'graphql'
import {
  type FieldNode,
  type GraphQLError,
  GraphQLNonNull,
  type GraphQLSchema,
  getNamedType,
  isEnumType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  type SelectionSetNode,
} from 'graphql'
import { getVariableValues } from 'graphql/execution/values.js'

import { parseGraphqlActionOperation } from './operation'

function formatGraphqlErrors(label: string, errors: readonly GraphQLError[]): string {
  const detail = errors.map((error) => error.message).join('; ')
  return `${label}: ${detail}`
}

export function validateGraphqlActionVariables(
  schema: GraphQLSchema,
  documentSource: string,
  variables: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const parsed = parseGraphqlActionOperation(schema, documentSource)

  if (!parsed) {
    return { ok: true, value: coerceVariablesObject(variables) }
  }

  const coerced = coerceVariablesObject(variables)

  const result = getVariableValues(schema, parsed.operation.variableDefinitions ?? [], coerced, {
    maxErrors: 5,
  })

  if (result.errors && result.errors.length > 0) {
    return {
      ok: false,
      message: formatGraphqlErrors('GraphQL variables validation failed', result.errors),
    }
  }

  return { ok: true, value: result.coerced as Record<string, unknown> }
}

function coerceVariablesObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {}
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

function isValidOutputValue(
  type: GraphQLOutputType,
  value: unknown,
  selectionSet?: SelectionSetNode,
): boolean {
  if (value === null || value === undefined) {
    return !(type instanceof GraphQLNonNull)
  }

  if (isNonNullType(type)) {
    return isValidOutputValue(type.ofType, value, selectionSet)
  }

  if (isListType(type)) {
    if (!Array.isArray(value)) {
      return false
    }

    return value.every((item) => isValidOutputValue(type.ofType, item, undefined))
  }

  const named = getNamedType(type)

  if (!named) {
    return true
  }

  if (isScalarType(named)) {
    if (named.name === 'String' || named.name === 'ID' || named.name === 'DateTime') {
      return typeof value === 'string'
    }

    if (named.name === 'Int' || named.name === 'Float') {
      return typeof value === 'number' && Number.isFinite(value)
    }

    if (named.name === 'Boolean') {
      return typeof value === 'boolean'
    }

    return true
  }

  if (isEnumType(named)) {
    return typeof value === 'string' && named.getValues().some((entry) => entry.name === value)
  }

  if (isObjectType(named)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false
    }

    const record = value as Record<string, unknown>

    if (!selectionSet) {
      return true
    }

    for (const selection of selectionSet.selections) {
      if (selection.kind !== 'Field') {
        continue
      }

      const fieldNode = selection as FieldNode
      const field = named.getFields()[fieldNode.name.value]

      if (!field) {
        continue
      }

      const fieldValue = record[fieldNode.name.value]

      if (!isValidOutputValue(field.type, fieldValue, fieldNode.selectionSet)) {
        return false
      }
    }

    return true
  }

  return true
}

export function validateGraphqlActionOutput(
  schema: GraphQLSchema,
  documentSource: string,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const parsed = parseGraphqlActionOperation(schema, documentSource)

  if (!parsed) {
    return { ok: true, value }
  }

  const rootSelection = parsed.operation.selectionSet.selections[0]

  const selectionSet =
    rootSelection && rootSelection.kind === 'Field' ? rootSelection.selectionSet : undefined

  if (!isValidOutputValue(parsed.returnType, value, selectionSet)) {
    return {
      ok: false,
      message: `GraphQL response validation failed for field "${parsed.rootFieldName}"`,
    }
  }

  return { ok: true, value }
}
