import {
  type FieldNode,
  type GraphQLInputObjectType,
  GraphQLNonNull,
  type GraphQLOutputType,
  type GraphQLSchema,
  type GraphQLType,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  type SelectionSetNode,
  typeFromAST,
  type VariableDefinitionNode,
} from 'graphql'
import { parseGraphqlActionOperation } from './operation'

function scalarTsType(name: string): string {
  if (name === 'String' || name === 'ID' || name === 'DateTime') {
    return 'string'
  }
  if (name === 'Int' || name === 'Float') {
    return 'number'
  }
  if (name === 'Boolean') {
    return 'boolean'
  }
  return 'unknown'
}

function outputTypeToTs(type: GraphQLOutputType, nullable: boolean): string {
  if (isNonNullType(type)) {
    return outputTypeToTs(type.ofType, false)
  }
  if (isListType(type)) {
    const inner = outputTypeToTs(type.ofType, !isNonNullType(type.ofType))
    return nullable ? `(${inner})[] | null` : `(${inner})[]`
  }
  const named = getNamedType(type)
  if (!named) {
    return nullable ? 'unknown | null' : 'unknown'
  }
  if (isScalarType(named)) {
    const base = scalarTsType(named.name)
    return nullable ? `${base} | null` : base
  }
  if (isEnumType(named)) {
    const members = named
      .getValues()
      .map((value) => JSON.stringify(value.name))
      .join(' | ')
    const base = members.length > 0 ? members : 'string'
    return nullable ? `(${base}) | null` : base
  }
  return nullable ? 'Record<string, unknown> | null' : 'Record<string, unknown>'
}

function collectReferencedInputObjectTypes(
  schema: GraphQLSchema,
  variableDefinitions: readonly VariableDefinitionNode[],
): Map<string, GraphQLInputObjectType> {
  const types = new Map<string, GraphQLInputObjectType>()

  const visit = (type: GraphQLType, visiting: Set<string>) => {
    const named = getNamedType(type)
    if (!named || !isInputObjectType(named)) {
      return
    }
    if (types.has(named.name)) {
      return
    }
    if (visiting.has(named.name)) {
      return
    }
    visiting.add(named.name)
    types.set(named.name, named)
    for (const field of Object.values(named.getFields())) {
      visit(field.type, visiting)
    }
    visiting.delete(named.name)
  }

  for (const varDef of variableDefinitions) {
    const gqlType = typeFromAST(schema, varDef.type)
    if (gqlType) {
      visit(gqlType, new Set())
    }
  }

  return types
}

function inputTypeToTs(
  type: GraphQLType,
  nullable: boolean,
  aliasTypes: Map<string, GraphQLInputObjectType>,
  expanding: Set<string>,
): string {
  if (isNonNullType(type)) {
    return inputTypeToTs(type.ofType, false, aliasTypes, expanding)
  }
  if (isListType(type)) {
    const inner = inputTypeToTs(
      type.ofType,
      !isNonNullType(type.ofType),
      aliasTypes,
      expanding,
    )
    return nullable ? `(${inner})[] | null | undefined` : `(${inner})[]`
  }
  const named = getNamedType(type)
  if (!named) {
    return nullable ? 'unknown | null | undefined' : 'unknown'
  }
  if (isScalarType(named)) {
    const base = scalarTsType(named.name)
    return nullable ? `${base} | null | undefined` : base
  }
  if (isEnumType(named)) {
    const members = named
      .getValues()
      .map((value) => JSON.stringify(value.name))
      .join(' | ')
    const base = members.length > 0 ? members : 'string'
    return nullable ? `(${base}) | null | undefined` : base
  }
  if (isInputObjectType(named)) {
    if (aliasTypes.has(named.name)) {
      const base = named.name
      return nullable ? `${base} | null | undefined` : base
    }
    if (expanding.has(named.name)) {
      return nullable
        ? 'Record<string, unknown> | null | undefined'
        : 'Record<string, unknown>'
    }
    expanding.add(named.name)
    const props = Object.entries(named.getFields())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, field]) => {
        const optional = !isNonNullType(field.type) ? '?' : ''
        return `${JSON.stringify(name)}${optional}: ${inputTypeToTs(
          field.type,
          !isNonNullType(field.type),
          aliasTypes,
          expanding,
        )}`
      })
    expanding.delete(named.name)
    const base = `{ ${props.join('; ')} }`
    return nullable ? `${base} | null | undefined` : base
  }
  return nullable
    ? 'Record<string, unknown> | null | undefined'
    : 'Record<string, unknown>'
}

function inputObjectAliasToTs(
  inputType: GraphQLInputObjectType,
  aliasTypes: Map<string, GraphQLInputObjectType>,
): string {
  const expanding = new Set<string>([inputType.name])
  const props = Object.entries(inputType.getFields())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, field]) => {
      const optional = !isNonNullType(field.type) ? '?' : ''
      return `${JSON.stringify(name)}${optional}: ${inputTypeToTs(
        field.type,
        !isNonNullType(field.type),
        aliasTypes,
        expanding,
      )}`
    })
  return `{ ${props.join('; ')} }`
}

function variableDefinitionsToTs(
  schema: GraphQLSchema,
  variableDefinitions: readonly VariableDefinitionNode[],
  aliasTypes: Map<string, GraphQLInputObjectType>,
): string {
  if (variableDefinitions.length === 0) {
    return 'Record<string, never>'
  }

  const props = [...variableDefinitions]
    .sort((a, b) => a.variable.name.value.localeCompare(b.variable.name.value))
    .map((varDef) => {
      const gqlType = typeFromAST(schema, varDef.type)
      if (!gqlType) {
        return undefined
      }
      const optional = varDef.type.kind !== 'NonNullType' ? '?' : ''
      const ts = inputTypeToTs(
        gqlType,
        varDef.type.kind !== 'NonNullType',
        aliasTypes,
        new Set(),
      )
      return `${JSON.stringify(varDef.variable.name.value)}${optional}: ${ts}`
    })
    .filter((prop): prop is string => prop !== undefined)

  return `{ ${props.join('; ')} }`
}

function selectionSetToTs(
  schema: GraphQLSchema,
  parentType: GraphQLOutputType,
  selectionSet: SelectionSetNode,
  nullable: boolean,
): string {
  if (isNonNullType(parentType)) {
    return selectionSetToTs(schema, parentType.ofType, selectionSet, false)
  }
  if (isListType(parentType)) {
    const inner = selectionSetToTs(
      schema,
      parentType.ofType,
      selectionSet,
      !isNonNullType(parentType.ofType),
    )
    return nullable ? `(${inner})[] | null` : `(${inner})[]`
  }

  const named = getNamedType(parentType)
  if (!named || !isObjectType(named)) {
    return outputTypeToTs(parentType, nullable)
  }

  const props: string[] = []
  for (const selection of selectionSet.selections) {
    if (selection.kind !== 'Field') {
      continue
    }
    const fieldNode = selection as FieldNode
    const field = named.getFields()[fieldNode.name.value]
    if (!field) {
      continue
    }
    const fieldNullable = !isNonNullType(field.type)
    let ts: string
    if (fieldNode.selectionSet) {
      ts = selectionSetToTs(
        schema,
        field.type,
        fieldNode.selectionSet,
        fieldNullable,
      )
    } else {
      ts = outputTypeToTs(field.type, fieldNullable)
    }
    props.push(`${JSON.stringify(fieldNode.name.value)}: ${ts}`)
  }

  if (props.length === 0) {
    return outputTypeToTs(parentType, nullable)
  }

  const base = `{ ${props.join('; ')} }`
  return nullable ? `${base} | null` : base
}

export interface GraphqlActionParamsTypeParts {
  aliasDeclarations: string[]
  paramsType: string
}

export function graphqlActionParamsTypeParts(
  schema: GraphQLSchema,
  documentSource: string,
): GraphqlActionParamsTypeParts | undefined {
  const parsed = parseGraphqlActionOperation(schema, documentSource)
  if (!parsed) {
    return undefined
  }

  const variableDefinitions = parsed.operation.variableDefinitions ?? []
  const aliasTypes = collectReferencedInputObjectTypes(
    schema,
    variableDefinitions,
  )
  const aliasDeclarations = [...aliasTypes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, inputType]) =>
        `type ${name} = ${inputObjectAliasToTs(inputType, aliasTypes)}`,
    )
  const paramsType = variableDefinitionsToTs(
    schema,
    variableDefinitions,
    aliasTypes,
  )

  return { aliasDeclarations, paramsType }
}

export function graphqlActionParamsTypeString(
  schema: GraphQLSchema,
  documentSource: string,
): string | undefined {
  const parts = graphqlActionParamsTypeParts(schema, documentSource)
  if (!parts) {
    return undefined
  }

  if (parts.aliasDeclarations.length === 0) {
    return parts.paramsType
  }
  return `${parts.aliasDeclarations.join('; ')}; ${parts.paramsType}`
}

export function graphqlActionOutputTypeString(
  schema: GraphQLSchema,
  documentSource: string,
): string | undefined {
  const parsed = parseGraphqlActionOperation(schema, documentSource)
  if (!parsed) {
    return undefined
  }

  const rootSelection = parsed.operation.selectionSet.selections[0]
  if (!rootSelection || rootSelection.kind !== 'Field') {
    return undefined
  }

  if (rootSelection.selectionSet) {
    return selectionSetToTs(
      schema,
      parsed.returnType,
      rootSelection.selectionSet,
      !isNonNullType(parsed.returnType),
    )
  }

  return outputTypeToTs(parsed.returnType, !isNonNullType(parsed.returnType))
}
