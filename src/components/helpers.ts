import * as jsonParser from 'jsonc-parser'
import * as vscode from 'vscode'
import type { ConfiguruCacheValue, ContextCache } from './context'
import { extractConfiguruKeys, type ConfigTsKey } from './config-ts-parser'
import {
  ConfiguruEvent,
  FileEvent,
  isEnvFileEvent,
  isTsConfigFileEvent,
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

const getDocumentText = (event: FileEvent): string => {
  return event.document.getText()
}

const readFile = async (uri: vscode.Uri): Promise<string> => {
  const text = await vscode.workspace.fs.readFile(uri)
  return Buffer.from(text).toString('utf8')
}

const getFileUri = (event: ConfiguruEvent, fileName: string): vscode.Uri => {
  if (isTsConfigFileEvent(event) && fileName === event.filePath) {
    return event.document.uri
  }
  if (isEnvFileEvent(event) && fileName === event.filePath) {
    return event.document.uri
  }
  return getFilePath(fileName)
}

const getFileText = async (
  event: ConfiguruEvent,
  fileName: string
): Promise<string> => {
  if (isEnvFileEvent(event) && fileName === event.filePath) {
    return Promise.resolve(getDocumentText(event))
  }
  if (isTsConfigFileEvent(event) && fileName === event.filePath) {
    return Promise.resolve(getDocumentText(event))
  }
  const uri = getFileUri(event, fileName)
  return readFile(uri)
}

const getEnvFileParsed = async (
  event: ConfiguruEvent,
  fileName: string
): Promise<Record<string, any>> => {
  const errors: jsonParser.ParseError[] = []
  const texts = await getFileText(event, fileName)
  return jsonParser.parse(texts, errors)
}

const getFiles = async (
  event: ConfiguruEvent,
  fileName: string
): Promise<vscode.TextDocument> => {
  if (isTsConfigFileEvent(event) && event.filePath === fileName) {
    return Promise.resolve(event.document)
  }
  if (isEnvFileEvent(event) && event.filePath === fileName) {
    return Promise.resolve(event.document)
  }
  const uri = getFileUri(event, fileName)
  return vscode.workspace.openTextDocument(uri)
}

const getConfigTsKeys = async (
  event: ConfiguruEvent,
  fileName: string
): Promise<ConfigTsKey[]> => {
  const fileText = await getFileText(event, fileName)
  return extractConfiguruKeys(fileText)
}

const contextDataloader =
  <
    Key extends keyof ContextCache,
    Fn extends (
      event: ConfiguruEvent,
      fileName: string
    ) => Promise<ConfiguruCacheValue<Key>> | ConfiguruCacheValue<Key>,
  >(
    fn: Fn,
    key: Key
  ): ((
    event: ConfiguruEvent,
    fileNames: string[]
  ) => Promise<ConfiguruCacheValue<Key>[]>) =>
  async (event: ConfiguruEvent, fileNames: string[]) => {
    const cache = event.context.cache[key] as Map<
      string,
      ConfiguruCacheValue<Key>
    >
    return Promise.all(
      fileNames.map(fileName => {
        const data = cache.get(fileName)
        if (data) {
          return Promise.resolve(data)
        }
        return (async () => {
          const data = await fn(event, fileName)
          cache.set(fileName, data)
          return data
        })()
      })
    )
  }

export const helpers = {
  fileExistsInWorkspace,
  events: {
    getFileTexts: contextDataloader(getFileText, 'fileTexts'),
    getFileUris: contextDataloader(getFileUri, 'fileUris'),
    getFiles: contextDataloader(getFiles, 'files'),
    getEnvFilesParsed: contextDataloader(getEnvFileParsed, 'fileParsed'),
    getConfigTsKeys: contextDataloader(getConfigTsKeys, 'configTsKeys'),
  },
}
