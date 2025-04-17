import * as vscode from 'vscode'
import path = require('path')
import * as jsonParser from 'jsonc-parser'

// This method is called when extension is activated
// Extension is activated the very first time the command is executed
let diagnosticCollection: vscode.DiagnosticCollection
export async function activate(context: vscode.ExtensionContext) {
  let parsedDotEnv: Record<string, any> = {}
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection('typescript') // for wave underline
  vscode.workspace.onDidChangeTextDocument(async file => {
    // TODO do filename configurable by user
    if (file?.document?.fileName.endsWith('/config.ts')) {
      // ============== Read .env.jsonc file ==============
      if (!vscode.workspace.workspaceFolders) {
        return
      }
      const folderUri = vscode.workspace.workspaceFolders[0].uri
      // TODO .env.jsonc/ .env.json/ -- make it configurable by user or read it from config.ts file (defaultConfigPath)
      const fileUri = folderUri.with({
        path: path.posix.join(folderUri.path, '.env.jsonc'),
      })
      parsedDotEnv = await getParsedDotEnv(fileUri)
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

      const diagnostics: vscode.Diagnostic[] = []

      // ============== Underline keys with unsafe default values in config.ts file ==============
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
            `Key '${hiddenKey}' should have a safe default value. Use empty string or '__${hiddenKey}__' in .env.jsonc.`,
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

          diagnostics.push(warningMessage)
        }
      }

      // ============== Underline missing keys in config.ts file ==============
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
            `Key '${key}' is missing in .env.jsonc`,
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

          diagnostics.push(errorMessage)
        }
      }
      diagnosticCollection.set(file.document.uri, diagnostics)
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
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
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
  )
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
    diagnosticCollection.set(document.uri, diagnostics)
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
  if (diagnosticCollection) {
    diagnosticCollection.clear()
  }
}
