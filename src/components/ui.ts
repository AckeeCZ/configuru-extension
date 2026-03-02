import * as vscode from 'vscode'

export const ui = {
  notifications: {
    info: (message: string) => {
      void vscode.window.showInformationMessage(message)
    },
    error: (message: string) => {
      void vscode.window.showErrorMessage(message)
    },
  },
}
