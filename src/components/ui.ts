import * as vscode from 'vscode'

export const ui = {
  notifications: {
    info: (message: string) => {
      vscode.window.showInformationMessage(message)
    },
    error: (message: string) => {
      vscode.window.showErrorMessage(message)
    },
  },
}
