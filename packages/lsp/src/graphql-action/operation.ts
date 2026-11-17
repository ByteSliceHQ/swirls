import {
  type DocumentNode,
  type GraphQLField,
  type GraphQLObjectType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type GraphQLType,
  getNamedType,
  isObjectType,
  type OperationDefinitionNode,
  parse,
  visit,
} from 'graphql'

export type ParsedGraphqlOperation = {
  document: DocumentNode
  operation: OperationDefinitionNode
  rootField: GraphQLField<unknown, unknown>
  rootFieldName: string
  returnType: GraphQLOutputType
}

function operationFromDocument(
  schema: GraphQLSchema,
  documentSource: string,
): ParsedGraphqlOperation | undefined {
  let document: DocumentNode
  try {
    document = parse(documentSource)
  } catch {
    return undefined
  }

  let operation: OperationDefinitionNode | undefined
  visit(document, {
    OperationDefinition(node) {
      if (!operation) {
        operation = node
      }
    },
  })
  if (!operation || operation.selectionSet.selections.length !== 1) {
    return undefined
  }

  const selection = operation.selectionSet.selections[0]
  if (!selection || selection.kind !== 'Field') {
    return undefined
  }

  const rootType =
    operation.operation === 'mutation'
      ? schema.getMutationType()
      : schema.getQueryType()
  if (!rootType || !isObjectType(rootType)) {
    return undefined
  }

  const rootField = rootType.getFields()[selection.name.value]
  if (!rootField) {
    return undefined
  }

  return {
    document,
    operation,
    rootField,
    rootFieldName: selection.name.value,
    returnType: rootField.type,
  }
}

export function parseGraphqlActionOperation(
  schema: GraphQLSchema,
  documentSource: string,
): ParsedGraphqlOperation | undefined {
  return operationFromDocument(schema, documentSource)
}

export function rootFieldOutputType(
  parsed: ParsedGraphqlOperation,
): GraphQLOutputType {
  return parsed.returnType
}

export function unwrapNamedType(type: GraphQLType) {
  return getNamedType(type)
}
