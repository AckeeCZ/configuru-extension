import * as vscode from 'vscode'
import { ConfiguruExtConfig, context } from './components/context'
import {
  ConfiguruEvent,
  ConfiguruFileAction,
  createConfiguruExtensionLoadedEvent,
  createConfiguruFileEvent,
} from './components/event'
import {
  HighlighterPort,
  isTriggeredByEvent,
} from './components/highlighters/highlighter.port'
import { keysWithoutDescriptionHighlighter } from './components/highlighters/keys-without-description'
import { missingEnvFileKeysHighlighter } from './components/highlighters/missing-env-file-keys'
import { unsafeDefaultVariablesHighlighter } from './components/highlighters/unsafe-default-variables'
import { envVariablesSuggestion } from './components/suggestions/env-variables-suggestion'

const highlighters: HighlighterPort<any>[] = [
  missingEnvFileKeysHighlighter,
  keysWithoutDescriptionHighlighter,
  unsafeDefaultVariablesHighlighter,
]

const suggestions = [envVariablesSuggestion]

const diagnosticCollections: Record<string, vscode.DiagnosticCollection> = {}
const suggestionDisposables: Record<string, vscode.Disposable> = {}

const getWorkspaceFolders = () => {
  const workspaceFolders = vscode.workspace.workspaceFolders
  return !workspaceFolders || workspaceFolders.length === 0
    ? undefined
    : workspaceFolders
}

const triggerEvent = async (event: ConfiguruEvent) => {
  const config = await context.config.get()
  event.context.clean(event)

  for (const highlighter of highlighters) {
    if (
      !isTriggeredByEvent(highlighter, event.type) ||
      !config.features[highlighter.flag]
    ) {
      continue
    }
    const highlights = await highlighter.highlight(event, config)
    highlights.forEach(({ target, diagnostics }) =>
      diagnosticCollections[highlighter.name].set(target, diagnostics)
    )
  }
}

const triggerExtensionLoaded = async (config?: ConfiguruExtConfig) => {
  Object.values(diagnosticCollections).forEach(diagnostic => {
    diagnostic.clear()
  })
  if (!config) {
    await context.config.load()
  }
  const workspaceFolders = getWorkspaceFolders()
  if (!workspaceFolders) {
    return
  }
  const event = await createConfiguruExtensionLoadedEvent(
    context,
    workspaceFolders
  )

  await triggerEvent(event)
}

const triggerFileEvent = async (
  file: vscode.TextDocument,
  action: ConfiguruFileAction
) => {
  const workspaceFolders = getWorkspaceFolders()
  if (!workspaceFolders) {
    return
  }
  const event = await createConfiguruFileEvent(
    file,
    context,
    workspaceFolders,
    action
  )

  if (!event) {
    return
  }
  await triggerEvent(event)
}

const triggerFilesMovedEvent = async (deletedOrRenamedFiles: string[]) => {
  const config = await context.config.get()
  const paths = config.configPaths
  const fileNames = deletedOrRenamedFiles.map(file =>
    vscode.workspace.asRelativePath(file)
  )
  if (
    fileNames.some(file =>
      paths.some(path => path.envs.includes(file) || path.loader === file)
    )
  ) {
    await triggerExtensionLoaded()
  }
}

// This method is called when extension is activated
// Extension is activated the very first time the command is executed
export async function activate(vsCodeContext: vscode.ExtensionContext) {
  highlighters.forEach(highlighter => {
    diagnosticCollections[highlighter.name] =
      vscode.languages.createDiagnosticCollection(highlighter.name)
  })

  const config = await context.config.load()

  suggestions.forEach(suggestion => {
    if (config.features[suggestion.flag]) {
      suggestionDisposables[suggestion.flag] =
        suggestion.register(vsCodeContext)
    }
  })

  vscode.workspace.onDidChangeConfiguration(async event => {
    if (!event.affectsConfiguration('configuru')) {
      return
    }
    const config = await context.config.load()
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
    await triggerExtensionLoaded(config)
  })

  vscode.workspace.onDidChangeTextDocument(async event => {
    await triggerFileEvent(event.document, ConfiguruFileAction.Changed)
  })

  vscode.workspace.onDidOpenTextDocument(async file => {
    await triggerFileEvent(file, ConfiguruFileAction.Opened)
  })
  vscode.workspace.onDidRenameFiles(async event => {
    await triggerFilesMovedEvent([
      ...event.files.flatMap(file => [file.oldUri.path, file.newUri.path]),
    ])
  })
  vscode.workspace.onDidDeleteFiles(async event => {
    await triggerFilesMovedEvent(event.files.map(file => file.path))
  })
  vscode.workspace.onDidCreateFiles(async event => {
    await triggerFilesMovedEvent(event.files.map(file => file.path))
  })

  await triggerExtensionLoaded()
}

// This method is called when extension is deactivated
export function deactivate() {
  Object.values(diagnosticCollections).forEach(diagnostic => {
    diagnostic.clear()
  })
  Object.values(suggestionDisposables).forEach(disposable => {
    disposable.dispose()
  })
  context.clean()
}
