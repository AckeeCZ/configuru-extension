import * as vscode from 'vscode'
import { ConfiguruFeatureFlags } from '../context'

export interface SuggestionPort {
  flag: keyof ConfiguruFeatureFlags
  register: (vsCodeContext: vscode.ExtensionContext) => vscode.Disposable
}
