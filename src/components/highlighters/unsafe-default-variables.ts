import * as vscode from 'vscode'
import { ConfiguruEventType } from '../event'
import { Highlight, HighlighterPort } from './highlighter.port'
import { helpers } from '../helpers'

const isDefaultValueSafe = (value: any, key: string) =>
  value === '' || value === `__${key}__`

const getTsFileDiagnostics = (
  tsConfigFile: vscode.TextDocument,
  tsConfigText: string,
  envs: Array<{
    uri: vscode.Uri
    parsed: Record<string, any>
  }>
): Highlight => {
  const hiddenPattern = /hidden\((\s)*['"].*['"](\s)*\)/g
  const hiddenTsKeys =
    tsConfigText
      .match(hiddenPattern)
      ?.map(x => x.slice(7, -1).trim().slice(1, -1)) ?? []

  const diagnostics: vscode.Diagnostic[] = []

  for (const hiddenKey of hiddenTsKeys) {
    const env = envs.find(({ parsed }) => hiddenKey in parsed)

    if (!env || isDefaultValueSafe(env.parsed[hiddenKey], hiddenKey)) {
      continue
    }

    const startPos = tsConfigFile.getText().indexOf(`'${hiddenKey}'`)
    const endPos = startPos + hiddenKey.length + 2
    const keyRange = new vscode.Range(
      tsConfigFile.positionAt(startPos),
      tsConfigFile.positionAt(endPos)
    )
    const warningMessage = new vscode.Diagnostic(
      keyRange,
      `Key '${hiddenKey}' should have a safe default value. Use empty string or '__${hiddenKey}__' in ${tsConfigFile.uri.path}`,
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

export const unsafeDefaultVariablesHighlighter: HighlighterPort<
  | ConfiguruEventType.TS_CONFIG_FILE_CHANGED
  | ConfiguruEventType.TS_CONFIG_FILE_OPENED
  | ConfiguruEventType.ENV_FILE_OPENED
  | ConfiguruEventType.ENV_FILE_CHANGED
  | ConfiguruEventType.EXTENSION_LOADED
> = {
  name: 'unsafe-default-variables',
  flag: 'highlightUnsafeDefaultValues',
  triggers: [
    ConfiguruEventType.TS_CONFIG_FILE_CHANGED,
    ConfiguruEventType.TS_CONFIG_FILE_OPENED,
    ConfiguruEventType.ENV_FILE_OPENED,
    ConfiguruEventType.ENV_FILE_CHANGED,
    ConfiguruEventType.EXTENSION_LOADED,
  ],
  highlight: async event => {
    const { relatedPaths } = event

    const allFilesDiagnostics: Highlight[] = []

    await Promise.all(
      relatedPaths.map(async ({ loader, envs }) => {
        const [tsConfigFile] = await helpers.events.getFiles(event, [loader])
        const [tsConfigText] = await helpers.events.getFileTexts(event, [
          loader,
        ])
        const envUris = await helpers.events.getFileUris(event, envs)
        const envsParsed = await helpers.events.getEnvFilesParsed(event, envs)

        allFilesDiagnostics.push(
          getTsFileDiagnostics(
            tsConfigFile,
            tsConfigText,
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
}
