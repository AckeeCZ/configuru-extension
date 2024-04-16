import * as vscode from "vscode";
import path = require("path");
import * as jsonParser from "jsonc-parser";
import * as ts from 'typescript';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
let diagnosticCollection: vscode.DiagnosticCollection;
export function activate(context: vscode.ExtensionContext) {
  // TODO read env file on file opening and compare to what is in file and give a warning in case of missing envs
  // TODO Refresh comparison on every change in file

  let parsedDotEnv: any = {};
  let parsedConfig: any = {};
  diagnosticCollection = vscode.languages.createDiagnosticCollection('typescript'); // for wave underline
  // vscode.window.onDidChangeActiveTextEditor(async (file) => {
    vscode.workspace.onDidChangeTextDocument(async (file) => {
    // TODO do filename configurable by user
    if (file?.document?.fileName.endsWith("/config.ts")) {
			vscode.window.showInformationMessage("config.ts file opened"); // TODO remove this line -- this is only for debugging

			// ============== Read .env.jsonc file ==============
      if (!vscode.workspace.workspaceFolders) {
        return;
      }
      const folderUri = vscode.workspace.workspaceFolders[0].uri;
      // TODO .env.jsonc/ .env.json/ -- make it configurable by user or read it from config.ts file (defaultConfigPath)
      const fileUri = folderUri.with({
        path: path.posix.join(folderUri.path, ".env.jsonc"),
      });

      const readData = await vscode.workspace.fs.readFile(fileUri);
      const readStr = Buffer.from(readData).toString("utf8");

      const errors: jsonParser.ParseError[] = [];
      parsedDotEnv = jsonParser.parse(readStr, errors);
      const parsedDotEnvKeys = Object.keys(parsedDotEnv);

			// ============== Read config.ts file ==============
      const text = file.document.getText();
      const pattern = /\([\n\r\s]*('|").*("|')[\n\r\s]*\)/g;
      // // get all keys from configStr by pattern 
      const configTsKeys = text.match(pattern)?.map(x => x.slice(1, -1).trim().slice(1, -1)) ?? [];

      // Update configTsKeys so that it contains only what's inside quotes
      console.log(configTsKeys);

      // find all differences between parsedDotEnvKeys and configTsKeys
      // const missingKeysInConfigTs = parsedDotEnvKeys.filter(x => !configTsKeys.includes());
      const missingKeysInDotEnv = configTsKeys.filter(x => !parsedDotEnvKeys.includes(x)); 

      // ============== Underline missing keys in config.ts file ==============
      // Get all comments in the file in order to not underline missing keys in comments
      const commentPattern = /\/\/.*\n/g;
      const comments = text.match(commentPattern);
      const commentRanges = comments?.map(x => {
        const startPos = text.indexOf(x);
        const endPos = startPos + x.length;
        return new vscode.Range(file.document.positionAt(startPos), file.document.positionAt(endPos));
      }) ?? [];

      // Underline missing keys in config.ts file
      let diagnostics: vscode.Diagnostic[] = [];
      for (const key of missingKeysInDotEnv) {
        const startPos = file.document.getText().indexOf(`'${key}'`);
        const endPos = startPos + key.length + 2;
        const keyRange = new vscode.Range(file.document.positionAt(startPos), file.document.positionAt(endPos));

        const isMissingKeyInTheComment = comments && commentRanges.some(commentRange => commentRange.contains(keyRange));
        if (!isMissingKeyInTheComment) {
          diagnostics.push(new vscode.Diagnostic(keyRange, `Key ${key} is missing in your .env`, vscode.DiagnosticSeverity.Error));
        }
      }
      diagnosticCollection.set(file.document.uri, diagnostics);
    }
  });

  // const patternCustom = vscode.workspace.workspaceFolders
  //     ? new vscode.RelativePattern(vscode.workspace.workspaceFolders?.[0], '*.ts') 
  //     : "**/config.ts"

  // ======================== Add suggestions to the editor ========================
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      // TODO do filename config.ts configurable by user
      { language: "typescript", pattern: "**/config.ts" },
      {
        async provideCompletionItems(
          document: vscode.TextDocument,
          position: vscode.Position
        ) {
          const linePrefix = document.lineAt(position).text.slice(0, position.character);

          // TODO better? /loader\.(((string|bool|number|json)\((?:"|'))|(custom\(.*\)\(('|")))$/g;
          // TODO loader.bool(''''''''''''''''' should not be matched
          const pattern = /\([\n\r\s]*('|")/g; // (' or ("
          if (!linePrefix.match(pattern)) {
            return undefined;
          }

          const completions = Object.keys(parsedDotEnv).map(
            (c) => new vscode.CompletionItem(c, vscode.CompletionItemKind.Text)
          );
          return completions;
        },
      },
      '"',
      "'"
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (diagnosticCollection) {
      diagnosticCollection.clear();
  }
}
