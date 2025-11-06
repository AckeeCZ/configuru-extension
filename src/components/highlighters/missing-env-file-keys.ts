import { HighlighterPort } from './highlighter.port'
import { ConfiguruEventType } from '../event'
import * as vscode from 'vscode'
import { helpers } from '../helpers'

export const missingEnvFileKeysHighlighter: HighlighterPort<ConfiguruEventType.TS_CONFIG_FILE_CHANGED> =
  {
    name: 'missing-env-file-keys',
    flag: 'highlightInvalidVariables',
    triggers: [ConfiguruEventType.TS_CONFIG_FILE_CHANGED],
    highlight: async event => {
      const diagnostics: vscode.Diagnostic[] = []
      const { document: tsConfigFile } = event

      const envPath = helpers.envFile.getUri(event)
      const [tsConfigText, envParsed] = await Promise.all([
        helpers.tsConfigFile.getText(event),
        helpers.envFile.getParsed(event),
      ])

      const dotEnvKeys = Object.keys(envParsed)

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
        tsConfigText
          .match(pattern)
          ?.map(x => x.slice(1, -1).trim().slice(1, -1)) ?? []
      const missingKeysInDotEnv = configTsKeys.filter(
        x => !dotEnvKeys.includes(x)
      )

      // Underline missing keys in config.ts file
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
            `Key '${key}' is missing in ${envPath.path}`,
            vscode.DiagnosticSeverity.Error
          )
          errorMessage.relatedInformation = [
            {
              location: new vscode.Location(tsConfigFile.uri, keyRange),
              message: 'Missing key',
            },
            {
              location: new vscode.Location(
                envPath,
                new vscode.Range(0, 0, 0, 0)
              ),
              message: 'Env file where key is expected',
            },
          ]
          errorMessage.code = {
            value: 'missing-key',
            target: envPath,
          }
          errorMessage.source = 'configuru'

          diagnostics.push(errorMessage)
        }
      }
      return [{ target: tsConfigFile.uri, diagnostics: diagnostics }]
    },
  }
