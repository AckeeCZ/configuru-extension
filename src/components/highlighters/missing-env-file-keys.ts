import * as vscode from 'vscode'
import { ConfiguruEventType } from '../event'
import { helpers } from '../helpers'
import { createHighlighter, Highlight } from './highlighter.port'

const getTsFileDiagnostics = (
  tsConfigFile: vscode.TextDocument,
  tsConfigKeys: Array<{
    key: string
    position: { start: number; end: number }
  }>,
  envs: Array<{
    uri: vscode.Uri
    parsed: Record<string, any>
  }>
): Highlight => {
  const diagnostics: vscode.Diagnostic[] = []
  const dotEnvKeys = envs.flatMap(({ parsed }) => Object.keys(parsed))

  // Find comment ranges to exclude keys that are in comments
  const tsConfigText = tsConfigFile.getText()
  const commentPattern = /\/\/.*\n/g
  const comments = tsConfigText.match(commentPattern)
  const commentRanges =
    comments?.map((x: string) => {
      const startPos = tsConfigText.indexOf(x)
      const endPos = startPos + x.length
      return new vscode.Range(
        tsConfigFile.positionAt(startPos),
        tsConfigFile.positionAt(endPos)
      )
    }) ?? []

  const missingKeysInDotEnv = tsConfigKeys.filter(
    configKey => !dotEnvKeys.includes(configKey.key)
  )

  for (const configKey of missingKeysInDotEnv) {
    const keyRange = new vscode.Range(
      tsConfigFile.positionAt(configKey.position.start),
      tsConfigFile.positionAt(configKey.position.end)
    )

    const isMissingKeyInTheComment =
      comments &&
      commentRanges.some(commentRange => commentRange.contains(keyRange))
    if (!isMissingKeyInTheComment) {
      // Underline missing key in config.ts file. Add a message to go to .env.jsonc file and link it
      const errorMessage = new vscode.Diagnostic(
        keyRange,
        `Key '${configKey.key}' is missing in ${envs.map(({ uri }) => uri.path).join(', ')}`,
        vscode.DiagnosticSeverity.Error
      )
      errorMessage.relatedInformation = [
        {
          location: new vscode.Location(tsConfigFile.uri, keyRange),
          message: 'Missing key',
        },
        ...envs.map(({ uri }) => ({
          location: new vscode.Location(uri, new vscode.Range(0, 0, 0, 0)),
          message: 'Env file where key is expected',
        })),
      ]
      errorMessage.code = {
        value: 'missing-key',
        target: tsConfigFile.uri,
      }
      errorMessage.source = 'configuru'

      diagnostics.push(errorMessage)
    }
  }
  return { target: tsConfigFile.uri, diagnostics }
}

export const missingEnvFileKeysHighlighter = createHighlighter({
  name: 'missing-env-file-keys',
  flag: 'highlightInvalidVariables',
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
        const envsParsed = await helpers.events.getEnvFilesParsed(event, envs)

        allFilesDiagnostics.push(
          getTsFileDiagnostics(
            tsConfigFile,
            tsConfigKeys,
            envUris.map((uri, i) => ({
              uri,
              parsed: envsParsed[i],
            }))
          )
        )
      })
    )
    return allFilesDiagnostics
  },
})
