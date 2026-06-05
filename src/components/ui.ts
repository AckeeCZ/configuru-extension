import * as vscode from 'vscode'

interface NotificationAction {
  title: string
  action: () => Promise<void> | void
}

export const ui = {
  notifications: {
    info: (message: string) => {
      void vscode.window.showInformationMessage(message)
    },
    error: (message: string) => {
      void vscode.window.showErrorMessage(message)
    },
    errorWithActions: async (
      message: string,
      actions: NotificationAction[]
    ): Promise<void> => {
      const selection = await vscode.window.showErrorMessage(
        message,
        ...actions.map(a => a.title)
      )

      if (selection) {
        const selectedAction = actions.find(a => a.title === selection)
        if (selectedAction) {
          await selectedAction.action()
        }
      }
    },
  },
}
