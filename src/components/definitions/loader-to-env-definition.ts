import * as vscode from 'vscode'
import { context } from '../context'
import { ConfiguruFileAction, createConfiguruFileEvent } from '../event'
import { helpers, EnvFileKeyMatch } from '../helpers'
import { DefinitionPort } from './definition.port'

const getKeyAtPosition = (
  document: vscode.TextDocument,
  position: vscode.Position
) => {
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_.-]+/)
  return wordRange
    ? { key: document.getText(wordRange), range: wordRange }
    : undefined
}

const findKeyMatchesInEnvFiles = async (
  document: vscode.TextDocument,
  key: string
): Promise<EnvFileKeyMatch[]> => {
  const { workspaceFolders } = vscode.workspace
  if (!workspaceFolders?.length) return []

  const event = await createConfiguruFileEvent(
    document,
    context,
    workspaceFolders,
    ConfiguruFileAction.Inspected
  )
  if (!event) return []
  const envs = event.relatedPaths.flatMap(p => p.envs)
  const envKeys = await helpers.events.getEnvFilesKeys(event, envs)
  const matches = envKeys.flatMap(keys => keys.get(key) ?? [])
  return matches
}

const provideDefinitions = async (
  document: vscode.TextDocument,
  position: vscode.Position,
  _token: vscode.CancellationToken
): Promise<vscode.LocationLink[]> => {
  const word = getKeyAtPosition(document, position)
  if (!word) return []

  const matches = await findKeyMatchesInEnvFiles(document, word.key)
  return matches.map(m => ({
    originSelectionRange: word.range,
    targetUri: m.uri,
    targetRange: new vscode.Range(m.position, m.position),
    targetSelectionRange: new vscode.Range(m.position, m.position),
  }))
}

const provideHover = async (
  document: vscode.TextDocument,
  position: vscode.Position,
  _token: vscode.CancellationToken
): Promise<vscode.Hover | undefined> => {
  const word = getKeyAtPosition(document, position)
  if (!word) return undefined

  const matches = await findKeyMatchesInEnvFiles(document, word.key)
  if (matches.length === 0) return undefined

  const md = new vscode.MarkdownString()
  md.appendMarkdown(`**Env values for** \`${word.key}\`\n\n`)
  for (const m of matches.slice(0, 10)) {
    const rel = vscode.workspace.asRelativePath(m.uri)
    md.appendMarkdown(`(*${rel}:${m.position.line + 1}*)\n`)
    md.appendCodeblock(m.lineText, 'json')
  }

  md.isTrusted = true
  return new vscode.Hover(md, word.range)
}

export const variableDefinitionProvider: DefinitionPort = {
  name: 'env-variable-navigation',
  flag: 'goToVariableDefinition',
  register: (vsCodeContext: vscode.ExtensionContext) => {
    const definitionDisposable = vscode.languages.registerDefinitionProvider(
      { language: 'typescript' },
      { provideDefinition: provideDefinitions }
    )

    const hoverDisposable = vscode.languages.registerHoverProvider(
      { language: 'typescript' },
      { provideHover }
    )

    vsCodeContext.subscriptions.push(definitionDisposable, hoverDisposable)

    return new vscode.Disposable(() => {
      definitionDisposable.dispose()
      hoverDisposable.dispose()
    })
  },
}
