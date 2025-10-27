import * as vscode from 'vscode'
import { ConfiguruEventType } from '../event'
import { HighlighterPort } from './highlighter.port'
import { helpers } from '../helpers'

const isDefaultValueSafe = (value: any, key: string) =>
  value === '' || value === `__${key}__`

export const unsafeDefaultVariablesHighlighter: HighlighterPort<ConfiguruEventType.TS_CONFIG_FILE_CHANGED> =
  {
    name: 'unsafe-default-variables',
    flag: 'highlightUnsafeDefaultValues',
    triggers: [ConfiguruEventType.TS_CONFIG_FILE_CHANGED],
    highlight: async event => {
      const tsConfigFile = await helpers.tsConfigFile.getFile(event)
      const tsConfigText = await helpers.tsConfigFile.getText(event)
      const parsedDotEnv = await helpers.envFile.getParsed(event)

      const hiddenPattern = /hidden\((\s)*['"].*['"](\s)*\)/g
      const hiddenTsKeys =
        tsConfigText
          .match(hiddenPattern)
          ?.map(x => x.slice(7, -1).trim().slice(1, -1)) ?? []

      const diagnostics: vscode.Diagnostic[] = []

      for (const hiddenKey of hiddenTsKeys) {
        if (isDefaultValueSafe(parsedDotEnv[hiddenKey], hiddenKey)) {
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
      return [{ target: tsConfigFile.uri, diagnostics }]
    },
  }
