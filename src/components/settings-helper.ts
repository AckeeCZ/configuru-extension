import * as vscode from 'vscode'
import { Features } from './context'

/**
 * Opens VS Code Workspace Settings UI filtered to a specific configuration key
 * @param key - The configuration key to filter to (e.g., 'configuru.paths')
 */
export async function openSettingsAtKey(key: string): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openWorkspaceSettings',
    `@ext:ackee.configuru ${key}`
  )
}

/**
 * Disables all Configuru features for the current workspace
 * This allows users to turn off the extension without uninstalling it
 */
export async function disableExtensionForWorkspace(): Promise<void> {
  const config = vscode.workspace.getConfiguration('configuru')

  for (const feature of Features) {
    await config.update(
      `features.${feature}`,
      false,
      vscode.ConfigurationTarget.Workspace
    )
  }
}
