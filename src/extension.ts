import * as vscode from 'vscode'
import path = require('path')
import * as jsonParser from 'jsonc-parser'

// This method is called when extension is activated
// Extension is activated the very first time the command is executed
let diagnosticCollection: vscode.DiagnosticCollection
export function activate(context: vscode.ExtensionContext) {
  let parsedDotEnv: any = {}
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
      const diagnostics: vscode.Diagnostic[] = []
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

// This method is called when extension is deactivated
export function deactivate() {
  if (diagnosticCollection) {
    diagnosticCollection.clear()
  }
}
