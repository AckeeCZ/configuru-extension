import * as vscode from 'vscode'
import { ConfiguruEventType } from '../event'
import { Highlight, HighlighterPort } from './highlighter.port'
import { helpers } from '../helpers'

const getEnvFileDiagnostics = (
  envFile: vscode.TextDocument,
  envText: string,
  envParsed: Record<string, any>
) => {
  const rootKeys = Object.keys(envParsed)

  const pattern = /".*":/g
  const matchedConfigKeys = envText.match(pattern) ?? []
  const diagnostics: vscode.Diagnostic[] = []

  for (const key of matchedConfigKeys) {
    const keyName = key.split('"', 3)[1]
    const keyStartPos = envText.indexOf(key)
    const keyLine = envFile.positionAt(keyStartPos).line
    const lineAbove = keyLine > 0
    const lineAboveKey = lineAbove
      ? envFile.lineAt(keyLine - 1).text.trim()
      : ''

    if (
      !rootKeys.includes(keyName) ||
      !lineAbove ||
      lineAboveKey.startsWith('//') ||
      lineAboveKey.endsWith('*/')
    ) {
      continue
    }
    const startPos = envText.indexOf(`"${keyName}"`)
    const endPos = startPos + keyName.length + 2
    const keyRange = new vscode.Range(
      envFile.positionAt(startPos),
      envFile.positionAt(endPos)
    )

    const warningMessage = new vscode.Diagnostic(
      keyRange,
      `Key '${keyName}' does not have a description. Add a comment describing its purpose.`,
      vscode.DiagnosticSeverity.Warning
    )
    warningMessage.relatedInformation = [
      {
        location: new vscode.Location(envFile.uri, keyRange),
        message: 'Config key without description.',
      },
    ]
    warningMessage.code = {
      value: 'key-without-description',
      target: envFile.uri,
    }
    warningMessage.source = 'configuru'
    diagnostics.push(warningMessage)
  }
  return { target: envFile.uri, diagnostics }
}

export const keysWithoutDescriptionHighlighter: HighlighterPort<
  | ConfiguruEventType.EnvFileChanged
  | ConfiguruEventType.EnvFileOpened
  | ConfiguruEventType.ExtensionLoaded
> = {
  name: 'keys-without-description',
  flag: 'highlightSecretsMissingDescription',
  triggers: [
    ConfiguruEventType.EnvFileChanged,
    ConfiguruEventType.EnvFileOpened,
    ConfiguruEventType.ExtensionLoaded,
  ],
  highlight: async event => {
    const relatedEnvs = event.relatedPaths.flatMap(p => p.envs)

    const envFiles = await helpers.events.getFiles(event, relatedEnvs)
    const envsText = await helpers.events.getFileTexts(event, relatedEnvs)
    const envsParsed = await helpers.events.getEnvFilesParsed(
      event,
      relatedEnvs
    )

    const allFilesDiagnostics: Highlight[] = []

    relatedEnvs.forEach((_, i) => {
      const envText = envsText[i]
      const envParsed = envsParsed[i]
      const envFile = envFiles[i]

      if (!envText || !envParsed) {
        throw new Error('Env file text or parsed not found')
      }
      const fileDiagnostics = getEnvFileDiagnostics(envFile, envText, envParsed)
      allFilesDiagnostics.push(fileDiagnostics)
    })

    return allFilesDiagnostics
  },
}
