import * as jsonParser from 'jsonc-parser'
import * as vscode from 'vscode'
import { context } from './context'
import {
  ConfigFileChangedEvent,
  ConfigFileOpenedEvent,
  ConfiguruEvent,
  ConfiguruEventType,
  EnvFileChangedEvent,
  EnvFileOpenedEvent,
  contextMethod,
} from './event'

const getFilePath = (relativePaths: string[] | string): vscode.Uri => {
  const pathFragments = Array.isArray(relativePaths)
    ? relativePaths
    : [relativePaths]

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    throw new Error('No workspace folder found')
  }
  const projectFolderUri = workspaceFolder.uri

  return vscode.Uri.joinPath(projectFolderUri, ...pathFragments)
}

const fileExistsInWorkspace = async (
  relativePaths: string[]
): Promise<boolean> => {
  try {
    await vscode.workspace.fs.stat(getFilePath(relativePaths))
    return true
  } catch {
    return false
  }
}

const getDocumentText = (event: ConfiguruEvent): string => {
  return event.document.getText()
}

const isTsConfigFileEvent = (
  event: ConfiguruEvent
): event is ConfigFileChangedEvent | ConfigFileOpenedEvent => {
  return (
    event.type === ConfiguruEventType.TS_CONFIG_FILE_CHANGED ||
    event.type === ConfiguruEventType.TS_CONFIG_FILE_OPENED
  )
}

const isEnvFileEvent = (
  event: ConfiguruEvent
): event is EnvFileChangedEvent | EnvFileOpenedEvent => {
  return (
    event.type === ConfiguruEventType.ENV_FILE_CHANGED ||
    event.type === ConfiguruEventType.ENV_FILE_OPENED
  )
}

const readFile = async (uri: vscode.Uri): Promise<string> => {
  const text = await vscode.workspace.fs.readFile(uri)
  return Buffer.from(text).toString('utf8')
}

const getTsConfigFileUri = (event: ConfiguruEvent): vscode.Uri => {
  if (isTsConfigFileEvent(event)) {
    return event.document.uri
  }

  return getFilePath(['src', 'config.ts']) // todo make configurable
}

const getEnvFileUri = async (event: ConfiguruEvent): Promise<vscode.Uri> => {
  if (isEnvFileEvent(event)) {
    return event.document.uri
  }
  const config = await context.config.get()

  const configUri = event.document.uri

  const configPaths = config.projectPaths
  const configPath = configPaths.find(p => p.loader === configUri.path)
  const envPath = configPath ? configPath.envs[0] : config.defaultConfigPath // todo multiple envs

  return getFilePath([envPath])
}

const getEnvFileText = async (event: ConfiguruEvent): Promise<string> => {
  if (isEnvFileEvent(event)) {
    return Promise.resolve(getDocumentText(event))
  }
  const uri = await getEnvFileUri(event)
  return readFile(uri)
}

const getTsConfigFileText = (event: ConfiguruEvent): Promise<string> => {
  if (isTsConfigFileEvent(event)) {
    return Promise.resolve(getDocumentText(event))
  }
  const uri = getTsConfigFileUri(event)
  return readFile(uri)
}

const getEnvFileParsed = async (
  event: ConfiguruEvent
): Promise<Record<string, any>> => {
  const errors: jsonParser.ParseError[] = []
  const text = await getEnvFileText(event)
  return jsonParser.parse(text, errors)
}

const getEnvFile = async (
  event: ConfiguruEvent
): Promise<vscode.TextDocument> => {
  if (isEnvFileEvent(event)) {
    return Promise.resolve(event.document)
  }

  const uri = await getEnvFileUri(event)
  return vscode.workspace.openTextDocument(uri)
}

const getTsConfigFile = async (
  event: ConfiguruEvent
): Promise<vscode.TextDocument> => {
  if (isTsConfigFileEvent(event)) {
    return Promise.resolve(event.document)
  }

  const uri = getTsConfigFileUri(event)
  return vscode.workspace.openTextDocument(uri)
}

export const helpers = {
  envFile: {
    getText: contextMethod(getEnvFileText, 'envFileText'),
    getUri: contextMethod(getEnvFileUri, 'envFileUri'),
    getParsed: contextMethod(getEnvFileParsed, 'envFileParsed'),
    getFile: contextMethod(getEnvFile, 'envFile'),
  },
  tsConfigFile: {
    getFile: contextMethod(getTsConfigFile, 'tsConfigFile'),
    getText: contextMethod(getTsConfigFileText, 'tsConfigFileText'),
    getUri: contextMethod(getTsConfigFileUri, 'tsConfigFileUri'),
  },
  isTsConfigFileEvent,
  isEnvFileEvent,
  fileExistsInWorkspace,
}
