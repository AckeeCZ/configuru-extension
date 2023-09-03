import * as vscode from 'vscode';
import path = require('path');
import * as jsonParser from 'jsonc-parser';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// TODO read env file on file opening and compare to what is in file and give a warning in case of missing envs 
	// TODO Refresh comparment on every change in file  

	// Read the code from the file .env.json and add suggestions to the editor 
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
		// TODO do filename configurable by user
		{ language: 'typescript', pattern: '**/config.ts' },
		{
			async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
				const linePrefix = document.lineAt(position).text.slice(0, position.character);

				const pattern = /loader\.(((string|bool|number|json)\((?:"|'))|(custom\(.*\)\(('|")))$/g;
				if (!linePrefix.match(pattern)) {
					return undefined;
				}

				if (!vscode.workspace.workspaceFolders) {
					// TODO show error message
					return undefined;
				}
				const folderUri = vscode.workspace.workspaceFolders[0].uri;
				// TODO .env.jsonc/.env.json/make it configurable by user or read it from config.ts file (defaultConfigPath)
				const fileUri = folderUri.with({ path: path.posix.join(folderUri.path, '.env.jsonc') });

				const readData = await vscode.workspace.fs.readFile(fileUri);
				const readStr = Buffer.from(readData).toString('utf8');

				const errors: jsonParser.ParseError[] = [];
    		const parsed = jsonParser.parse(readStr, errors);

				const completions = Object.keys(parsed).map(c => new vscode.CompletionItem(c));
				return completions;
			}
		},
		'"', "'"
	));
}


// This method is called when your extension is deactivated
export function deactivate() {}
