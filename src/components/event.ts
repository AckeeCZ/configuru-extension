import * as vscode from 'vscode'
import { ConfiguruContext, ConfigPaths } from './context'

export enum ConfiguruEventType {
  ExtensionLoaded = 'extensionLoaded',
  EnvFileChanged = 'envFileChanged',
  EnvFileOpened = 'envFileOpened',
  TsConfigFileChanged = 'tsConfigFileChanged',
  TsConfigFileOpened = 'configFileOpened',
}

export enum ConfiguruFileAction {
  Changed = 'changed',
  Opened = 'opened',
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
  type: ConfiguruEventType.ExtensionLoaded
}

export interface EnvFileChangedEvent extends FileEvent {
  type: ConfiguruEventType.EnvFileChanged
}

export interface ConfigFileChangedEvent extends FileEvent {
  type: ConfiguruEventType.TsConfigFileChanged
}

export interface EnvFileOpenedEvent extends FileEvent {
  type: ConfiguruEventType.EnvFileOpened
}

export interface ConfigFileOpenedEvent extends FileEvent {
  type: ConfiguruEventType.TsConfigFileOpened
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
    event.type === ConfiguruEventType.TsConfigFileChanged ||
    event.type === ConfiguruEventType.TsConfigFileOpened
  )
}

export const isEnvFileEvent = (
  event: ConfiguruEventWithoutRelatedPaths
): event is EnvFileChangedEvent | EnvFileOpenedEvent => {
  return (
    event.type === ConfiguruEventType.EnvFileChanged ||
    event.type === ConfiguruEventType.EnvFileOpened
  )
}

const getEventRelatedTsFiles = async (
  event: ConfiguruEventWithoutRelatedPaths
) => {
  if (isTsConfigFileEvent(event)) {
    return [event.filePath]
  }
  const config = await event.context.config.get()
  const configPaths = config.configPaths

  if (isEnvFileEvent(event)) {
    const relatedPaths = configPaths.filter(p =>
      p.envs.some(env => env === event.filePath)
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
    type: ConfiguruEventType.ExtensionLoaded,
    ...createBaseEvent(context, workspaceFolders),
  } satisfies Omit<ExtensionLoadedEvent, 'relatedPaths'>)
}

export const createConfiguruFileEvent = async (
  file: vscode.TextDocument,
  context: ConfiguruContext,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  action: ConfiguruFileAction
) => {
  const relativePath = vscode.workspace.asRelativePath(file.uri)

  const baseEvent = {
    ...createBaseEvent(context, workspaceFolders),
    filePath: relativePath,
    document: file,
  } satisfies Omit<FileEvent, 'relatedPaths'>

  const config = await context.config.get()
  const configPaths = config.configPaths
  const isTsConfigFile = configPaths.some(p => p.loader === relativePath)
  const isEnvFile = configPaths.some(p =>
    p.envs.some(env => env === relativePath)
  )

  if (isTsConfigFile) {
    return addRelatedPaths({
      type:
        action === ConfiguruFileAction.Changed
          ? ConfiguruEventType.TsConfigFileChanged
          : ConfiguruEventType.TsConfigFileOpened,
      ...baseEvent,
    } satisfies Omit<
      ConfigFileChangedEvent | ConfigFileOpenedEvent,
      'relatedPaths'
    >)
  }
  if (isEnvFile) {
    return addRelatedPaths({
      type:
        action === ConfiguruFileAction.Changed
          ? ConfiguruEventType.EnvFileChanged
          : ConfiguruEventType.EnvFileOpened,
      ...baseEvent,
    } satisfies Omit<EnvFileChangedEvent | EnvFileOpenedEvent, 'relatedPaths'>)
  }
  return null
}
