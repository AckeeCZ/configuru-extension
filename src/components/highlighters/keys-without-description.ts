import * as vscode from 'vscode'
import { ConfiguruEventType } from '../event'
import { HighlighterPort } from './highlighter.port'
import { helpers } from '../helpers'

export const keysWithoutDescriptionHighlighter: HighlighterPort<ConfiguruEventType.ENV_FILE_CHANGED> =
  {
    name: 'keys-without-description',
    flag: 'highlightSecretsMissingDescription',
    triggers: [ConfiguruEventType.ENV_FILE_CHANGED],
    highlight: async event => {
      const { document: envFile } = event

      const envText = await helpers.envFile.getText(event)
      const envParsed = await helpers.envFile.getParsed(event)
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
      return [{ target: envFile.uri, diagnostics }]
    },
  }
