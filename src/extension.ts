import * as vscode from 'vscode'
import { createConfiguruFileChangedEvent } from './components/event'
import { isTriggeredByEvent } from './components/highlighters/highlighter.port'
import { keysWithoutDescriptionHighlighter } from './components/highlighters/keys-without-description'
import { missingEnvFileKeysHighlighter } from './components/highlighters/missing-env-file-keys'
import { unsafeDefaultVariablesHighlighter } from './components/highlighters/unsafe-default-variables'
import { context } from './components/context'
import { envVariablesSuggestion } from './components/suggestions/env-variables-suggestion'

const highlighters = [
  missingEnvFileKeysHighlighter,
  keysWithoutDescriptionHighlighter,
  unsafeDefaultVariablesHighlighter,
]

const suggestions = [envVariablesSuggestion]

const diagnosticCollections: Record<string, vscode.DiagnosticCollection> = {}
const suggestionDisposables: Record<string, vscode.Disposable> = {}

// This method is called when extension is activated
// Extension is activated the very first time the command is executed
export async function activate(vsCodeContext: vscode.ExtensionContext) {
  highlighters.forEach(highlighter => {
    diagnosticCollections[highlighter.name] =
      vscode.languages.createDiagnosticCollection(highlighter.name)
  })

  context.config.load()
  suggestions.forEach(suggestion => {
    suggestionDisposables[suggestion.flag] = suggestion.register(vsCodeContext)
  })

  vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('configuru')) {
      return
    }
    const config = context.config.load()

    highlighters.forEach(highlighter => {
      if (
        event.affectsConfiguration(`configuru.features.${highlighter.flag}`) &&
        config.features[highlighter.flag]
      ) {
        diagnosticCollections[highlighter.name].clear()
      }
    })

    suggestions.forEach(suggestion => {
      if (
        event.affectsConfiguration(`configuru.features.${suggestion.flag}`) &&
        config.features[suggestion.flag]
      ) {
        suggestionDisposables[suggestion.flag].dispose()
      }
      if (config.features[suggestion.flag]) {
        suggestionDisposables[suggestion.flag] =
          suggestion.register(vsCodeContext)
      }
    })
  })

  vscode.workspace.onDidChangeTextDocument(async file => {
    const config = context.config.get()
    const { workspaceFolders } = vscode.workspace

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return // Nothing to detect in files
    }

    const event = createConfiguruFileChangedEvent(
      file.document,
      context,
      workspaceFolders
    )
    if (!event) {
      return
    }

    for (const highlighter of highlighters) {
      if (!isTriggeredByEvent(highlighter, event.type)) {
        continue
      }

      const highlights = await highlighter.highlight(event, config)
      highlights.forEach(({ target, diagnostics }) =>
        diagnosticCollections[highlighter.name].set(target, diagnostics)
      )
    }
  })
}

// This method is called when extension is deactivated
export function deactivate() {
  Object.values(diagnosticCollections).forEach(diagnostic => {
    diagnostic.clear()
  })
  Object.values(suggestionDisposables).forEach(disposable => {
    disposable.dispose()
  })
}
