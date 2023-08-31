// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import path = require('path');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with registerCommand
	// // The commandId parameter must match the command field in package.json
	// let disposable = vscode.commands.registerCommand('configuruhelper.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from ConfiguruHelper!');
	// });

	let a = vscode.commands.registerCommand('fs/readWriteFile', async () => {
		vscode.window.showInformationMessage('Hello World from ConfiguruHelper!');
		if (!vscode.workspace.workspaceFolders) {
			return vscode.window.showInformationMessage('No folder or workspace opened');
		}
		console.log('aaaa');

		const writeStr = '1€ is 1.12$ is 0.9£';
		const writeData = Buffer.from(writeStr, 'utf8');

		const folderUri = vscode.workspace.workspaceFolders[0].uri;
		const fileUri = folderUri.with({ path: path.posix.join(folderUri.path, 'test.txt') });

		await vscode.workspace.fs.writeFile(fileUri, writeData);

		const readData = await vscode.workspace.fs.readFile(fileUri);
		const readStr = Buffer.from(readData).toString('utf8');

		vscode.window.showInformationMessage(readStr);
		vscode.window.showTextDocument(fileUri);
	});

	context.subscriptions.push(a);
	

	// Read the code from the file .env.json and add suggestions to the editor 
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
		{ pattern: '**' }, // todo only in config.ts TODO do configurable by user
		{
			async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
				const linePrefix = document.lineAt(position).text.slice(0, position.character);
				if (!linePrefix.endsWith('loader.string("') && !linePrefix.endsWith("loader.string('")) {
					return undefined;
				}

				// TODO suggestions from env file
				if (!vscode.workspace.workspaceFolders) {
					// todo show error message
					return undefined;
				}
				const folderUri = vscode.workspace.workspaceFolders[0].uri;

				// TODO .env.jsonc/.env.json/make it configurable by user
				const fileUri = folderUri.with({ path: path.posix.join(folderUri.path, '.env.jsonc') });
				
				const readData = await vscode.workspace.fs.readFile(fileUri);
				const readStr = Buffer.from(readData).toString('utf8');

				/**
				 * // TODO ERROR use JSONC https://github.com/AckeeCZ/configuru/blob/master/src/lib/helpers.ts ('jsonc-parser') 
				 * return JSONC.parse(readFileSync(resolvedPath, 'utf-8'))
				 */
				const readJson = JSON.parse(readStr); 
				const jsonKeys = Object.keys(readJson);

				const simpleCompletion = new vscode.CompletionItem('Hello World!');
				return [simpleCompletion];
			}
		},
		'"', "'"
	));
}


// This method is called when your extension is deactivated
export function deactivate() {}
