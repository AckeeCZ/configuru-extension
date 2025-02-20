import * as vscode from 'vscode'
import path = require('path')
import * as jsonParser from 'jsonc-parser'

interface ConfiguruFeatureFlags {
  suggestEnvVariables: boolean
  highlightInvalidVariables: boolean
  highlightSecretsMissingDescription: boolean
  highlightUnsafeDefaultValues: boolean
}

function loadConfiguration(): { features: ConfiguruFeatureFlags } {
  const config = vscode.workspace.getConfiguration('configuru')
  return {
    features: {
      suggestEnvVariables: config.get('features.suggestEnvVariables', true),
      highlightInvalidVariables: config.get(
        'features.highlightInvalidVariables',
        true
      ),
      highlightSecretsMissingDescription: config.get(
        'features.highlightSecretsMissingDescription',
        true
      ),
      highlightUnsafeDefaultValues: config.get(
        'features.highlightUnsafeDefaultValues',
        true
      ),
    },
  }
}

function featureEnabled(feature: keyof ConfiguruFeatureFlags) {
  return features[feature]
}

let diagnosticCollections: Record<string, vscode.DiagnosticCollection>
let features: ConfiguruFeatureFlags
const DEFAULT_CONFIG_PATH = '.env.jsonc'

// This method is called when extension is activated
// Extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  let parsedDotEnv: Record<string, any> = {}
  diagnosticCollections = {
    invalidVariables:
      vscode.languages.createDiagnosticCollection('invalid-variables'),
    secretsMissingDescription: vscode.languages.createDiagnosticCollection(
      'missing-descriptions'
    ),
    unsafeDefaultValues:
      vscode.languages.createDiagnosticCollection('unsafe-defaults'),
  }
  features = loadConfiguration().features

  let suggestionDisposable: vscode.Disposable | undefined

  registerSuggestions()

  vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('configuru.features')) {
      features = loadConfiguration().features
      if (!features.highlightInvalidVariables) {
        diagnosticCollections.invalidVariables.clear()
      }
      if (!features.highlightSecretsMissingDescription) {
        diagnosticCollections.secretsMissingDescription.clear()
      }
      if (!features.highlightUnsafeDefaultValues) {
        diagnosticCollections.unsafeDefaultValues.clear()
      }
      if (
        event.affectsConfiguration('configuru.features.suggestEnvVariables')
      ) {
        registerSuggestions()
      }
    }
  })

  vscode.workspace.onDidChangeTextDocument(async file => {
    // TODO do filename configurable by user
    if (file?.document?.fileName.endsWith('/config.ts')) {
      // ============== Read .env.jsonc file ==============
      if (!vscode.workspace.workspaceFolders) {
        return
      }
      const folderUri = vscode.workspace.workspaceFolders[0].uri
      vscode.window.showInformationMessage('Configuru is activated')
      const configPaths = vscode.workspace.getConfiguration('configuru.env').get<{ path: string, projectName: string }[]>('paths')
      const currentFolder = vscode.workspace.workspaceFolders[0].name
      let envPath = DEFAULT_CONFIG_PATH
      if (configPaths) {
        envPath = configPaths.find(p => p.projectName === currentFolder)?.path ?? DEFAULT_CONFIG_PATH
      }
      const fileUri = vscode.Uri.joinPath(folderUri, envPath)
      vscode.workspace.getConfiguration()
      const readData = await vscode.workspace.fs.readFile(fileUri)
      const readStr = Buffer.from(readData).toString('utf8')

      const errors: jsonParser.ParseError[] = []
      parsedDotEnv = jsonParser.parse(readStr, errors)
      const parsedDotEnvKeys = Object.keys(parsedDotEnv)

      // ============== Read config.ts file ==============
      const text = file.document.getText()
      const pattern = /\([\n\r\s]*('|").*("|')[\n\r\s]*\)/g
      const configTsKeys =
        text.match(pattern)?.map(x => x.slice(1, -1).trim().slice(1, -1)) ?? []
      const missingKeysInDotEnv = configTsKeys.filter(
        x => !parsedDotEnvKeys.includes(x)
      )
      const hiddenPattern = /hidden\([\n\r\s]*('|").*("|')[\n\r\s]*\)/g
      const hiddenTsKeys =
        text
          .match(hiddenPattern)
          ?.map(x => x.slice(7, -1).trim().slice(1, -1)) ?? []

      // ============== Underline keys with unsafe default values in config.ts file ==============
      if (featureEnabled('highlightUnsafeDefaultValues')) {
        const diagnosticsUnsafeDefaultValues: vscode.Diagnostic[] = []
        for (const hiddenKey of hiddenTsKeys) {
          const safeDefaultValue =
            parsedDotEnv[hiddenKey] === '' ||
            parsedDotEnv[hiddenKey] === `__${hiddenKey}__`
          if (!safeDefaultValue) {
            const startPos = file.document.getText().indexOf(`'${hiddenKey}'`)
            const endPos = startPos + hiddenKey.length + 2
            const keyRange = new vscode.Range(
              file.document.positionAt(startPos),
              file.document.positionAt(endPos)
            )
            const warningMessage = new vscode.Diagnostic(
              keyRange,
              `Key '${hiddenKey}' should have a safe default value. Use empty string or '__${hiddenKey}__' in ${envPath}`,
              vscode.DiagnosticSeverity.Warning
            )
            warningMessage.relatedInformation = [
              {
                location: new vscode.Location(file.document.uri, keyRange),
                message: 'Unsafe default value in .env',
              },
            ]
            warningMessage.code = {
              value: 'key-unsafe-default-value',
              target: fileUri,
            }
            warningMessage.source = 'configuru'

            diagnosticsUnsafeDefaultValues.push(warningMessage)
          }
          diagnosticCollections.unsafeDefaultValues.set(
            file.document.uri,
            diagnosticsUnsafeDefaultValues
          )
        }
      }

      // ============== Underline missing keys in config.ts file ==============
      if (featureEnabled('highlightInvalidVariables')) {
        const diagnosticsMissingKeys: vscode.Diagnostic[] = []
        // Get all comments in the file in order to not underline missing keys in comments
        const commentPattern = /\/\/.*\n/g
        const comments = text.match(commentPattern)
        const commentRanges =
          comments?.map(x => {
            const startPos = text.indexOf(x)
            const endPos = startPos + x.length
            return new vscode.Range(
              file.document.positionAt(startPos),
              file.document.positionAt(endPos)
            )
          }) ?? []

        // Underline missing keys in config.ts file
        for (const key of missingKeysInDotEnv) {
          const startPos = file.document.getText().indexOf(`'${key}'`)
          const endPos = startPos + key.length + 2
          const keyRange = new vscode.Range(
            file.document.positionAt(startPos),
            file.document.positionAt(endPos)
          )

          const isMissingKeyInTheComment =
            comments &&
            commentRanges.some(commentRange => commentRange.contains(keyRange))
          if (!isMissingKeyInTheComment) {
            // Underline missing key in config.ts file. Add a message to go to .env.jsonc file and link it
            const errorMessage = new vscode.Diagnostic(
              keyRange,
              `Key '${key}' is missing in ${envPath}`,
              vscode.DiagnosticSeverity.Error
            )
            errorMessage.relatedInformation = [
              {
                location: new vscode.Location(file.document.uri, keyRange),
                message: 'Missing key in .env',
              },
              {
                location: new vscode.Location(
                  fileUri,
                  new vscode.Range(0, 0, 0, 0)
                ),
                message: 'This file is missing the key',
              },
            ]
            errorMessage.code = {
              value: 'missing-key',
              target: fileUri,
            }
            errorMessage.source = 'configuru'

            diagnosticsMissingKeys.push(errorMessage)
          }
        }
        diagnosticCollections.invalidVariables.set(
          file.document.uri,
          diagnosticsMissingKeys
        )
      }
    }

    // ======= Highlight keys without description when .env.jsonc file is changed =======
    await highlightKeysWithoutDescription(file.document)
  })

  vscode.workspace.onDidOpenTextDocument(async _ => {
    await highlightKeysWithoutDescription(
      vscode.window.activeTextEditor?.document
    )
  })

  // ======================== Add suggestions to the editor ========================
  function registerSuggestions() {
    if (suggestionDisposable) {
      suggestionDisposable.dispose()
      const index = context.subscriptions.indexOf(suggestionDisposable)
      if (index > -1) {
        context.subscriptions.splice(index, 1)
      }
    }
    if (featureEnabled('suggestEnvVariables')) {
      suggestionDisposable = vscode.languages.registerCompletionItemProvider(
        // TODO do filename config.ts configurable by user
        { language: 'typescript', pattern: '**/config.ts' },
        {
          async provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position
          ) {
            const linePrefix = document
              .lineAt(position)
              .text.slice(0, position.character)

            // TODO better? /loader\.(((string|bool|number|json)\((?:"|'))|(custom\(.*\)\(('|")))$/g;
            // TODO besides \n\r\s also consider comments
            const pattern = /\([\n\r\s]*('|")/g // (' or (" or divided with spaces/newlines
            if (
              !linePrefix.match(pattern) &&
              !matchMultipleLines(document, position, 5, linePrefix, pattern)
            ) {
              return undefined
            }

            return Object.keys(parsedDotEnv).map(c => {
              return new vscode.CompletionItem(
                {
                  label: c,
                  description: 'configuru',
                },
                vscode.CompletionItemKind.Value
              )
            })
          },
        },
        '"',
        "'"
      )
      context.subscriptions.push(suggestionDisposable)
    }
  }
}

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
    isMatching = linePrefix.match(pattern) !== null
    lastLine--
  }
  return isMatching
}

const highlightKeysWithoutDescription = async (
  document?: vscode.TextDocument
) => {
  if (!featureEnabled('highlightSecretsMissingDescription')) {
    return
  }
  if (!vscode.workspace.workspaceFolders) {
    return
  }
  if (document?.fileName.endsWith('.env.jsonc')) {
    const folderUri = vscode.workspace.workspaceFolders[0].uri
    const fileUri = folderUri.with({
      path: path.posix.join(folderUri.path, '.env.jsonc'),
    })
    const parsedDotEnv = await getParsedDotEnv(fileUri)
    const rootKeys = Object.keys(parsedDotEnv)
    const text = document.getText()
    const pattern = /\".*":/g
    const matchedConfigKeys = text.match(pattern) ?? []
    const diagnostics: vscode.Diagnostic[] = []

    for (const key of matchedConfigKeys) {
      const keyStartPos = text.indexOf(key)
      const keyLine = document.positionAt(keyStartPos).line
      const lineAbove = keyLine > 0
      const lineAboveKey = lineAbove
        ? document.lineAt(keyLine - 1).text.trim()
        : ''
      if (
        lineAbove &&
        !lineAboveKey.startsWith('//') &&
        !lineAboveKey.endsWith('*/')
      ) {
        const keyName = key.split('"')[1]
        const rootKey = rootKeys.includes(keyName)
        if (rootKey) {
          const startPos = text.indexOf(`"${keyName}"`)
          const endPos = startPos + keyName.length + 2
          const keyRange = new vscode.Range(
            document.positionAt(startPos),
            document.positionAt(endPos)
          )

          const warningMessage = new vscode.Diagnostic(
            keyRange,
            `Key '${keyName}' does not have a description. Add a comment describing its purpose.`,
            vscode.DiagnosticSeverity.Warning
          )
          warningMessage.relatedInformation = [
            {
              location: new vscode.Location(document.uri, keyRange),
              message: 'Missing description for this key.',
            },
          ]
          warningMessage.code = {
            value: 'key-without-description',
            target: fileUri,
          }
          warningMessage.source = 'configuru'
          diagnostics.push(warningMessage)
        }
      }
    }
    diagnosticCollections.secretsMissingDescription.set(
      document.uri,
      diagnostics
    )
  }
}
const getParsedDotEnv = async (fileUri: vscode.Uri) => {
  let parsedDotEnv: Record<string, any> = {}
  const readData = await vscode.workspace.fs.readFile(fileUri)
  const readStr = Buffer.from(readData).toString('utf8')
  const errors: jsonParser.ParseError[] = []
  parsedDotEnv = jsonParser.parse(readStr, errors)
  return parsedDotEnv ?? {}
}

// This method is called when extension is deactivated
export function deactivate() {
  Object.values(diagnosticCollections).forEach(diagnostic => {
    diagnostic.clear()
  })
}
