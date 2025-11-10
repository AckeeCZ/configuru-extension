import * as vscode from 'vscode'
import { ConfiguruExtConfig, ConfiguruFeatureFlags } from '../context'

export interface SuggestionPort {
  flag: keyof ConfiguruFeatureFlags
  register: (
    config: ConfiguruExtConfig,
    vsCodeContext: vscode.ExtensionContext
  ) => vscode.Disposable
}
