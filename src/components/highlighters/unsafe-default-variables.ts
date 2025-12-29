import * as vscode from 'vscode'
import { ConfiguruEventType } from '../event'
import { createHighlighter, Highlight } from './highlighter.port'
import { helpers } from '../helpers'

const isDefaultValueSafe = (value: any, key: string) =>
  value === '' || value === `__${key}__`

const getTsFileDiagnostics = (
  tsConfigFile: vscode.TextDocument,
  tsConfigKeys: Array<{
    key: string
    position: { start: number; end: number }
    isHidden: boolean
  }>,
  envs: Array<{
    uri: vscode.Uri
    parsed: Record<string, any>
  }>
): Highlight => {
  const hiddenTsKeys = tsConfigKeys.filter(key => key.isHidden)

  const diagnostics: vscode.Diagnostic[] = []

  for (const hiddenKey of hiddenTsKeys) {
    const env = envs.find(({ parsed }) => hiddenKey.key in parsed)

    if (!env || isDefaultValueSafe(env.parsed[hiddenKey.key], hiddenKey.key)) {
      continue
    }

    const keyRange = new vscode.Range(
      tsConfigFile.positionAt(hiddenKey.position.start),
      tsConfigFile.positionAt(hiddenKey.position.end)
    )
    const warningMessage = new vscode.Diagnostic(
      keyRange,
      `Key '${hiddenKey.key}' should have a safe default value. Use empty string or '__${hiddenKey.key}__' in ${tsConfigFile.uri.path}`,
      vscode.DiagnosticSeverity.Warning
    )
    warningMessage.relatedInformation = [
      {
        location: new vscode.Location(tsConfigFile.uri, keyRange),
        message: 'Unsafe default value in .env',
      },
    ]
    warningMessage.code = {
      value: 'key-unsafe-default-value',
      target: tsConfigFile.uri,
    }
    warningMessage.source = 'configuru'

    diagnostics.push(warningMessage)
  }
  return { target: tsConfigFile.uri, diagnostics }
}

export const unsafeDefaultVariablesHighlighter = createHighlighter({
  name: 'unsafe-default-variables',
  flag: 'highlightUnsafeDefaultValues',
  triggers: [
    ConfiguruEventType.TsConfigFileChanged,
    ConfiguruEventType.TsConfigFileOpened,
    ConfiguruEventType.EnvFileOpened,
    ConfiguruEventType.EnvFileChanged,
    ConfiguruEventType.ExtensionLoaded,
  ],
  highlight: async event => {
    const { relatedPaths } = event

    const allFilesDiagnostics: Highlight[] = []

    await Promise.all(
      relatedPaths.map(async ({ loader, envs }) => {
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
