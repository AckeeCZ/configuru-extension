import * as ts from 'typescript'

export type ConfigTsKeyType = 'string' | 'number' | 'bool' | 'json' | 'custom'

export interface ConfigTsKey {
  key: string
  position: {
    start: number
    end: number
  }
  type: ConfigTsKeyType
  isNullable: boolean
  isHidden: boolean
}

const isCreateLoaderCall = (node: ts.Node): node is ts.CallExpression => {
  if (!ts.isCallExpression(node)) {
    return false
  }
  if (!ts.isIdentifier(node.expression)) {
    return false
  }
  return node.expression.text === 'createLoader'
}

export const traverseTree = (
  sourceFile: ts.SourceFile,
  eachFn: (node: ts.Node) => void
) => {
  const stack: ts.Node[] = [sourceFile]

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) {
      continue
    }
    eachFn(node)
    ts.forEachChild(node, child => {
      stack.push(child)
    })
  }
}

const getLoaderTypeAndFlags = (
  expr: ts.Expression
): {
  type: ConfigTsKeyType | null
  isHidden: boolean
  isNullable: boolean
} => {
  const propertyNames: string[] = []

  const collectPropertyNames = (node: ts.Expression): void => {
    if (ts.isPropertyAccessExpression(node)) {
      propertyNames.push(node.name.text)
      collectPropertyNames(node.expression)
    } else if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        collectPropertyNames(node.expression)
      }
    }
  }
  collectPropertyNames(expr)

  const reversed = [...propertyNames].reverse()
  let type: ConfigTsKeyType | null = null
  for (const propName of reversed) {
    if (
      propName === 'string' ||
      propName === 'number' ||
      propName === 'bool' ||
      propName === 'json' ||
      propName === 'custom'
    ) {
      type = propName as ConfigTsKeyType
      break
    }
  }

  const isHidden = propertyNames.includes('hidden')
  const isNullable = propertyNames.includes('nullable')

  return { type, isHidden, isNullable }
}

const extractKeyFromCallExpression = (
  callExpr: ts.CallExpression,
  sourceFile: ts.SourceFile,
  type: ConfigTsKeyType,
  isHidden: boolean,
  isNullable: boolean
): ConfigTsKey | null => {
  if (callExpr.arguments.length === 0) {
    return null
  }
  const firstArg = callExpr.arguments[0]
  if (!ts.isStringLiteral(firstArg)) {
    return null
  }
  const start = firstArg.getStart(sourceFile)
  const end = firstArg.getEnd()
  return {
    key: firstArg.text,
    position: {
      start,
      end,
    },
    type,
    isHidden,
    isNullable,
  }
}

const extractVariableName = (node: ts.VariableDeclaration): string | null => {
  if (!node.initializer || !isCreateLoaderCall(node.initializer)) {
    return null
  }
  if (!node.name || !ts.isIdentifier(node.name)) {
    return null
  }
  return node.name.text
}

const extractAssignmentName = (node: ts.BinaryExpression): string | null => {
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return null
  }
  if (!isCreateLoaderCall(node.right)) {
    return null
  }
  if (!ts.isIdentifier(node.left)) {
    return null
  }
  return node.left.text
}

const findLoaderVariables = (sourceFile: ts.SourceFile): Set<string> => {
  const loaderVariables = new Set<string>()
  traverseTree(sourceFile, node => {
    // Checks variable declarations: const loader = createLoader(...)
    if (ts.isVariableDeclaration(node)) {
      const name = extractVariableName(node)
      if (name) {
        loaderVariables.add(name)
      }
    }
    // Check expressions: loader = createLoader(...)
    if (ts.isBinaryExpression(node)) {
      const name = extractAssignmentName(node)
      if (name) {
        loaderVariables.add(name)
      }
    }
  })
  return loaderVariables
}

const isLoaderIdentifier = (
  expr: ts.Expression,
  loaderIdentifiers: Set<string>
): boolean => {
  if (ts.isIdentifier(expr)) {
    return loaderIdentifiers.has(expr.text)
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return isLoaderIdentifier(expr.expression, loaderIdentifiers)
  }
  return false
}

const extractFromSimpleCall = (
  callExpr: ts.CallExpression,
  loaderIdentifiers: Set<string>,
  sourceFile: ts.SourceFile
): ConfigTsKey | null => {
  if (!ts.isPropertyAccessExpression(callExpr.expression)) {
    return null
  }
  if (!isLoaderIdentifier(callExpr.expression.expression, loaderIdentifiers)) {
    return null
  }

  const { type, isHidden, isNullable } = getLoaderTypeAndFlags(
    callExpr.expression
  )
  if (!type) {
    return null
  }

  return extractKeyFromCallExpression(
    callExpr,
    sourceFile,
    type,
    isHidden,
    isNullable
  )
}

const extractFromChainedCall = (
  callExpr: ts.CallExpression,
  loaderIdentifiers: Set<string>,
  sourceFile: ts.SourceFile
): ConfigTsKey | null => {
  if (!ts.isCallExpression(callExpr.expression)) {
    return null
  }
  if (!ts.isPropertyAccessExpression(callExpr.expression.expression)) {
    return null
  }

  const propAccess = callExpr.expression.expression
  const isChained = ts.isPropertyAccessExpression(propAccess.expression)
  const loaderExpr = isChained
    ? propAccess.expression.expression
    : propAccess.expression

  if (!isLoaderIdentifier(loaderExpr, loaderIdentifiers)) {
    return null
  }

  // For loader.custom(...)(), we need to check the property access before the inner call
  const { type, isHidden, isNullable } = getLoaderTypeAndFlags(
    callExpr.expression.expression
  )
  if (!type) {
    return null
  }

  return extractKeyFromCallExpression(
    callExpr,
    sourceFile,
    type,
    isHidden,
    isNullable
  )
}

const tryExtractKey = (
  callExpr: ts.CallExpression,
  loaderIdentifiers: Set<string>,
  sourceFile: ts.SourceFile
): ConfigTsKey | null => {
  const simpleKey = extractFromSimpleCall(
    callExpr,
    loaderIdentifiers,
    sourceFile
  )
  if (simpleKey) {
    return simpleKey
  }
  return extractFromChainedCall(callExpr, loaderIdentifiers, sourceFile)
}

export const extractConfiguruKeys = (sourceText: string): ConfigTsKey[] => {
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true
  )
  const loaderIdentifiers = findLoaderVariables(sourceFile)
  const keys: ConfigTsKey[] = []
  const seenKeys = new Set<string>()

  traverseTree(sourceFile, node => {
    if (ts.isCallExpression(node)) {
      const keyData = tryExtractKey(node, loaderIdentifiers, sourceFile)
      if (keyData && !seenKeys.has(keyData.key)) {
        keys.push(keyData)
        seenKeys.add(keyData.key)
      }
    }
  })
  return keys
}
