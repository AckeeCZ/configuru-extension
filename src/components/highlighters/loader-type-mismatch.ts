import * as vscode from 'vscode'
import * as jsonParser from 'jsonc-parser'
import { ConfiguruEventType } from '../event'
import { createHighlighter, Highlight } from './highlighter.port'
import { helpers } from '../helpers'
import { ConfigTsKey, ConfigTsKeyType } from '../config-ts-parser'

const inferValueType = (value: any): ConfigTsKeyType | null => {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'bool'
  if (value === null) return null
  if (typeof value === 'object') return 'json'
  return null
}

const isStringCoercibleTo = (
  value: string,
  targetType: ConfigTsKeyType
): boolean => {
  switch (targetType) {
    case 'number':
      return value !== '' && !isNaN(Number(value))
    case 'bool':
      return ['true', 'false'].includes(value.toLowerCase())
    case 'json':
      try {
        JSON.parse(value)
        return true
      } catch {
        return false
      }
    default:
      return false
  }
}

const isPlaceholderValue = (key: string, value: any): boolean => {
  if (value === '') return true
  return value === `__${key}__`
}

const isLoaderTypeCompatible = ({
  key,
  loaderType,
  value,
}: {
  key: string
  loaderType: ConfigTsKeyType
  value: any
}): boolean => {
  const valueType = inferValueType(value)
  if (!valueType) return true
  if (loaderType === 'custom') return true
  if (isPlaceholderValue(key, value)) return true
  if (loaderType === valueType) return true
  return valueType === 'string' && isStringCoercibleTo(value, loaderType)
}

const findKeyRangeInEnvFile = (
  envFileTree: jsonParser.Node | undefined,
  envFile: vscode.TextDocument,
  key: string
): vscode.Range => {
  if (envFileTree?.type === 'object' && envFileTree.children) {
    for (const prop of envFileTree.children) {
      if (prop.type === 'property' && prop.children?.[0]?.value === key) {
        const keyNode = prop.children[0]
        return new vscode.Range(
          envFile.positionAt(keyNode.offset),
          envFile.positionAt(keyNode.offset + keyNode.length)
        )
      }
    }
  }
  return new vscode.Range(0, 0, 0, 0)
}

const getTsFileDiagnostics = (
  tsConfigFile: vscode.TextDocument,
  tsConfigKeys: ConfigTsKey[],
  envs: Array<{
    uri: vscode.Uri
    file: vscode.TextDocument
    parsed: Record<string, any>
  }>
): Highlight => {
  const diagnostics: vscode.Diagnostic[] = []

  // Parse env file trees ONCE before the loop
  const envTrees = envs.map(env => ({
    ...env,
    tree: jsonParser.parseTree(env.file.getText()),
  }))

  for (const configKey of tsConfigKeys) {
    const envWithTree = envTrees.find(({ parsed }) => configKey.key in parsed)
    if (!envWithTree?.tree) continue
    const defaultValue = envWithTree.parsed[configKey.key]

    if (
      !isLoaderTypeCompatible({
        key: configKey.key,
        loaderType: configKey.type,
        value: defaultValue,
      })
    ) {
      const valueType = inferValueType(defaultValue)
      const keyRange = new vscode.Range(
        tsConfigFile.positionAt(configKey.position.start),
        tsConfigFile.positionAt(configKey.position.end)
      )

      const diagnostic = new vscode.Diagnostic(
        keyRange,
        `Loader type '${configKey.type}' doesn't match default value type '${valueType ?? 'unknown'}' for key '${configKey.key}'`,
        vscode.DiagnosticSeverity.Error
      )
      diagnostic.relatedInformation = [
        {
          location: new vscode.Location(tsConfigFile.uri, keyRange),
          message: `Loader type is '${configKey.type}'`,
        },
        {
          location: new vscode.Location(
            envWithTree.uri,
            findKeyRangeInEnvFile(
              envWithTree.tree,
              envWithTree.file,
              configKey.key
            )
          ),
          message: `Default value type is '${valueType ?? 'unknown'}' in env file`,
        },
      ]
      diagnostic.code = {
        value: 'loader-type-mismatch',
        target: tsConfigFile.uri,
      }
      diagnostic.source = 'configuru'

      diagnostics.push(diagnostic)
    }
  }

  return { target: tsConfigFile.uri, diagnostics }
}

export const loaderTypeMismatchHighlighter = createHighlighter({
  name: 'loader-type-mismatch',
  flag: 'highlightLoaderTypeMismatch',
  triggers: [
    ConfiguruEventType.TsConfigFileChanged,
    ConfiguruEventType.TsConfigFileOpened,
    ConfiguruEventType.EnvFileOpened,
    ConfiguruEventType.EnvFileChanged,
    ConfiguruEventType.ExtensionLoaded,
  ],
  highlight: async event => {
    const allFilesDiagnostics: Highlight[] = []

    await Promise.all(
      event.relatedPaths.map(async ({ loader, envs }) => {
        const [tsConfigFile] = await helpers.events.getFiles(event, [loader])
        const [tsConfigKeys] = await helpers.events.getConfigTsKeys(event, [
          loader,
        ])
        const envUris = await helpers.events.getFileUris(event, envs)
        const envFiles = await helpers.events.getFiles(event, envs)
        const envsParsed = await helpers.events.getEnvFilesParsed(event, envs)

        allFilesDiagnostics.push(
          getTsFileDiagnostics(
            tsConfigFile,
            tsConfigKeys,
            envUris.map((uri, i) => ({
              uri,
              file: envFiles[i],
              parsed: envsParsed[i],
            }))
          )
        )
      })
    )
    return allFilesDiagnostics
  },
})
