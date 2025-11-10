import * as vscode from 'vscode'
import { ConfiguruContext, ConfigPaths } from './context'

export enum ConfiguruEventType {
  EXTENSION_LOADED = 'extensionLoaded',
  ENV_FILE_CHANGED = 'envFileChanged',
  ENV_FILE_OPENED = 'envFileOpened',
  TS_CONFIG_FILE_CHANGED = 'tsConfigFileChanged',
  TS_CONFIG_FILE_OPENED = 'configFileOpened',
}

export interface BaseEvent {
  workspaceFolders: readonly vscode.WorkspaceFolder[]
  relatedPaths: ConfigPaths
  context: ConfiguruContext
}

export interface FileEvent extends BaseEvent {
  filePath: string
  document: vscode.TextDocument
}

export interface ExtensionLoadedEvent extends BaseEvent {
  type: ConfiguruEventType.EXTENSION_LOADED
}

export interface EnvFileChangedEvent extends FileEvent {
  type: ConfiguruEventType.ENV_FILE_CHANGED
}

export interface ConfigFileChangedEvent extends FileEvent {
  type: ConfiguruEventType.TS_CONFIG_FILE_CHANGED
}

export interface EnvFileOpenedEvent extends FileEvent {
  type: ConfiguruEventType.ENV_FILE_OPENED
}

export interface ConfigFileOpenedEvent extends FileEvent {
  type: ConfiguruEventType.TS_CONFIG_FILE_OPENED
}

export type ConfiguruEvent =
  | EnvFileChangedEvent
  | ConfigFileChangedEvent
  | EnvFileOpenedEvent
  | ConfigFileOpenedEvent
  | ExtensionLoadedEvent

export type ConfiguruEventOf<T extends ConfiguruEventType> = Extract<
  ConfiguruEvent,
  { type: T }
>

export type ConfiguruEventWithoutRelatedPaths = Omit<
  ConfiguruEvent,
  'relatedPaths'
>

export const isTsConfigFileEvent = (
  event: ConfiguruEventWithoutRelatedPaths
): event is ConfigFileChangedEvent | ConfigFileOpenedEvent => {
  return (
    event.type === ConfiguruEventType.TS_CONFIG_FILE_CHANGED ||
    event.type === ConfiguruEventType.TS_CONFIG_FILE_OPENED
  )
}

export const isEnvFileEvent = (
  event: ConfiguruEventWithoutRelatedPaths
): event is EnvFileChangedEvent | EnvFileOpenedEvent => {
  return (
    event.type === ConfiguruEventType.ENV_FILE_CHANGED ||
    event.type === ConfiguruEventType.ENV_FILE_OPENED
  )
}

const getEventRelatedTsFiles = async (
  event: ConfiguruEventWithoutRelatedPaths
) => {
  if (isTsConfigFileEvent(event)) {
    return [vscode.workspace.asRelativePath(event.document.uri)]
  }
  const config = await event.context.config.get()
  const configPaths = config.configPaths

  if (isEnvFileEvent(event)) {
    const relativePath = vscode.workspace.asRelativePath(event.document.uri)
    const relatedPaths = configPaths.filter(p =>
      p.envs.some(env => env === relativePath)
    )
    return relatedPaths.map(p => p.loader)
  }

  // No specified file meaning all files are related to this event
  return configPaths.map(p => p.loader)
}

export const getEventRelatedPaths = async (
  event: ConfiguruEventWithoutRelatedPaths
) => {
  const config = await event.context.config.get()
  const configPaths = config.configPaths
  const tsConfigPaths = await getEventRelatedTsFiles(event)
  return configPaths.filter(p => tsConfigPaths.includes(p.loader))
}

const addRelatedPaths = async <Event extends ConfiguruEventWithoutRelatedPaths>(
  event: Event
): Promise<Event & Pick<ConfiguruEvent, 'relatedPaths'>> => {
  return {
    ...event,
    relatedPaths: await getEventRelatedPaths(event),
  }
}

export type ConfiguruEventsOf<TTypes extends ConfiguruEventType> = Extract<
  ConfiguruEvent,
  { type: TTypes }
>

const createBaseEvent = (
  context: ConfiguruContext,
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): Omit<BaseEvent, 'relatedPaths'> => {
  return {
    context,
    workspaceFolders,
  }
}

export const createConfiguruExtensionLoadedEvent = (
  context: ConfiguruContext,
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): Promise<ExtensionLoadedEvent> => {
  return addRelatedPaths({
    type: ConfiguruEventType.EXTENSION_LOADED,
    ...createBaseEvent(context, workspaceFolders),
  } satisfies Omit<ExtensionLoadedEvent, 'relatedPaths'>)
}

export const createConfiguruFileEvent = async (
  file: vscode.TextDocument,
  context: ConfiguruContext,
  workspaceFolders: readonly vscode.WorkspaceFolder[]
) => {
  const baseEvent = {
    ...createBaseEvent(context, workspaceFolders),
    filePath: file.fileName,
    document: file,
  } satisfies Omit<FileEvent, 'relatedPaths'>

  switch (true) {
    // TODO do filename configurable by user
    case file.fileName.endsWith('/config.ts'):
      return addRelatedPaths({
        type: ConfiguruEventType.TS_CONFIG_FILE_CHANGED,
        ...baseEvent,
      } satisfies Omit<ConfigFileChangedEvent, 'relatedPaths'>)
    // TODO do filename configurable by user
    case file.uri.path.endsWith('.env.jsonc'):
      return addRelatedPaths({
        type: ConfiguruEventType.ENV_FILE_CHANGED,
        ...baseEvent,
      } satisfies Omit<EnvFileChangedEvent, 'relatedPaths'>)
    default:
      return null
  }
}
