import * as vscode from 'vscode'
import { ConfiguruEventType } from '../event'
import { helpers } from '../helpers'
import { Highlight, HighlighterPort } from './highlighter.port'

const getTsFileDiagnostics = (
  tsConfigFile: vscode.TextDocument,
  tsConfigText: string,
  envs: Array<{
    uri: vscode.Uri
    parsed: Record<string, any>
  }>
): Highlight => {
  const diagnostics: vscode.Diagnostic[] = []
  const dotEnvKeys = envs.flatMap(({ parsed }) => Object.keys(parsed))

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

  const pattern = /\((\s)*['"].*["'](\s)*\)/g
  const configTsKeys =
    tsConfigText.match(pattern)?.map(x => x.slice(1, -1).trim().slice(1, -1)) ??
    []
  const missingKeysInDotEnv = configTsKeys.filter(
    tsKey => !dotEnvKeys.includes(tsKey)
  )

  for (const key of missingKeysInDotEnv) {
    const startPos = tsConfigFile.getText().indexOf(`'${key}'`)
    const endPos = startPos + key.length + 2
    const keyRange = new vscode.Range(
      tsConfigFile.positionAt(startPos),
      tsConfigFile.positionAt(endPos)
    )

    const isMissingKeyInTheComment =
      comments &&
      commentRanges.some(commentRange => commentRange.contains(keyRange))
    if (!isMissingKeyInTheComment) {
      // Underline missing key in config.ts file. Add a message to go to .env.jsonc file and link it
      const errorMessage = new vscode.Diagnostic(
        keyRange,
        `Key '${key}' is missing in ${envs.map(({ uri }) => uri.path).join(', ')}`,
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

export const missingEnvFileKeysHighlighter: HighlighterPort<
  | ConfiguruEventType.TS_CONFIG_FILE_CHANGED
  | ConfiguruEventType.TS_CONFIG_FILE_OPENED
  | ConfiguruEventType.ENV_FILE_OPENED
  | ConfiguruEventType.EXTENSION_LOADED
> = {
  name: 'missing-env-file-keys',
  flag: 'highlightInvalidVariables',
  triggers: [
    ConfiguruEventType.TS_CONFIG_FILE_CHANGED,
    ConfiguruEventType.TS_CONFIG_FILE_OPENED,
    ConfiguruEventType.ENV_FILE_OPENED,
    ConfiguruEventType.EXTENSION_LOADED,
  ],
  highlight: async event => {
    const allFilesDiagnostics: Highlight[] = []

    await Promise.all(
      event.relatedPaths.map(async ({ loader, envs }) => {
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
