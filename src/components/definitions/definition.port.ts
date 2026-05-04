import * as vscode from 'vscode'
import { ConfiguruFeatureFlags } from '../context'

export interface DefinitionPort {
  name: string
  flag: keyof ConfiguruFeatureFlags
  register(vsCodeContext: vscode.ExtensionContext): vscode.Disposable
}
