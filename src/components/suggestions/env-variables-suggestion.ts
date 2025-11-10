import * as vscode from 'vscode'
import { SuggestionPort } from './suggestion.port'
import { ConfiguruFileAction, createConfiguruFileEvent } from '../event'
import { context } from '../context'
import { helpers } from '../helpers'

const matchMultipleLines = (
  document: vscode.TextDocument,
  position: vscode.Position,
  maxLines: number,
  linePrefix: string,
  pattern: RegExp
) => {
  let isMatching = false
  let lastLine = position.line - 1
  while (!isMatching && lastLine > position.line - maxLines && lastLine >= 0) {
    const line = document.lineAt(lastLine)
    linePrefix = line.text + linePrefix
    isMatching = pattern.exec(linePrefix) !== null
    lastLine--
  }
  return isMatching
}

export const envVariablesSuggestion: SuggestionPort = {
  flag: 'suggestEnvVariables',
  register: (_vsCodeContext: vscode.ExtensionContext) => {
    return vscode.languages.registerCompletionItemProvider(
      {
        language: 'typescript',
      },
      {
        async provideCompletionItems(
          document: vscode.TextDocument,
          position: vscode.Position
        ) {
          const { workspaceFolders } = vscode.workspace
          if (!workspaceFolders || workspaceFolders.length === 0) {
            return // No env config
          }

          const config = await context.config.get()
          const loaderPaths = config.configPaths.map(p => p.loader)
          const relativePath = vscode.workspace.asRelativePath(document.uri)

          if (!loaderPaths.includes(relativePath)) {
            return
          }

          const event = await createConfiguruFileEvent(
            document,
            context,
            workspaceFolders,
            ConfiguruFileAction.Changed
          )
          if (!event) {
            // Not a valid file edited
            return
          }
          context.clean(event)

          const envs = event.relatedPaths.flatMap(p => p.envs)
          const envsParsed = await helpers.events.getEnvFilesParsed(event, envs)
          const keys = envsParsed.map(p => Object.keys(p))

          const linePrefix = document
            .lineAt(position)
            .text.slice(0, position.character)

          // TODO better? /loader\.(((string|bool|number|json)\((?:"|'))|(custom\(.*\)\(('|")))$/g;
          // TODO besides \n\r\s also consider comments
          // eslint-disable-next-line sonarjs/single-character-alternation, sonarjs/duplicates-in-character-class
          const pattern = /\([\n\r\s]*['|"]/g // (' or (" or divided with spaces/newlines
          if (
            !linePrefix.match(pattern) &&
            !matchMultipleLines(document, position, 5, linePrefix, pattern)
          ) {
            return undefined
          }

          return keys.flatMap((configKeys, i) =>
            configKeys.map(c => {
              return new vscode.CompletionItem(
                {
                  label: c,
                  description: 'Configuru',
                  detail: ` ${envs[i]}`,
                },
                vscode.CompletionItemKind.Value
              )
            })
          )
        },
      },
      '"',
      "'"
    )
  },
}
