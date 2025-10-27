import * as vscode from 'vscode'
import { ConfiguruContext } from './context'

export enum ConfiguruEventType {
  ENV_FILE_CHANGED = 'envFileChanged',
  ENV_FILE_OPENED = 'envFileOpened',
  TS_CONFIG_FILE_CHANGED = 'tsConfigFileChanged',
  TS_CONFIG_FILE_OPENED = 'configFileOpened',
}

export interface BaseEvent {
  projectName: string
  workspaceFolders: readonly vscode.WorkspaceFolder[]
  context: ConfiguruContext
}

export interface FileEvent extends BaseEvent {
  filePath: string
  document: vscode.TextDocument
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

export type ConfiguruEventOf<T extends ConfiguruEventType> = Extract<
  ConfiguruEvent,
  { type: T }
>

// Given a union of event types (e.g. A | B), produce the union of corresponding events
export type ConfiguruEventsOf<TTypes extends ConfiguruEventType> = Extract<
  ConfiguruEvent,
  { type: TTypes }
>

export const createConfiguruFileChangedEvent = (
  file: vscode.TextDocument,
  context: ConfiguruContext,
  workspaceFolders: readonly vscode.WorkspaceFolder[]
) => {
  const projectName = workspaceFolders[0].name

  const baseEvent = {
    context,
    projectName,
    filePath: file.fileName,
    document: file,
    workspaceFolders,
  } satisfies FileEvent

  switch (true) {
    // TODO do filename configurable by user
    case file.fileName.endsWith('/config.ts'):
      return {
        type: ConfiguruEventType.TS_CONFIG_FILE_CHANGED,
        ...baseEvent,
      } satisfies ConfigFileChangedEvent
    // TODO do filename configurable by user
    case file.uri.path.endsWith('.env.jsonc'):
      return {
        type: ConfiguruEventType.ENV_FILE_CHANGED,
        ...baseEvent,
      } satisfies EnvFileChangedEvent
    default:
      return null
  }
}

type EventContext = ConfiguruContext['projects'][string]
type EventContextValue<K extends keyof EventContext> = Required<EventContext>[K]

export function contextMethod<
  K extends keyof EventContext,
  A extends unknown[],
>(
  method: (event: ConfiguruEvent, ...args: A) => Promise<EventContextValue<K>>,
  cacheKey: K
): (event: ConfiguruEvent, ...args: A) => Promise<EventContextValue<K>>

export function contextMethod<
  K extends keyof EventContext,
  A extends unknown[],
>(
  method: (event: ConfiguruEvent, ...args: A) => EventContextValue<K>,
  cacheKey: K
): (event: ConfiguruEvent, ...args: A) => EventContextValue<K>

export function contextMethod<
  K extends keyof EventContext,
  F extends (
    event: ConfiguruEvent,
    ...args: any[]
  ) => EventContextValue<K> | Promise<EventContextValue<K>>,
>(method: F, cacheKey: K): F {
  return ((event: ConfiguruEvent, ...args: any[]) => {
    const projectContext = event.context.projects[event.projectName] ?? {}
    if (event.projectName in event.context.projects) {
      event.context.projects[event.projectName] = projectContext
    }

    if (cacheKey in event.context) {
      return [cacheKey] as any
    }
    const result = method(event, ...args)

    if (result && typeof (result as any).then === 'function') {
      return (result as Promise<any>).then(res => {
        projectContext[cacheKey] = res
        return res
      })
    }
    projectContext[cacheKey] = result as EventContext[K]
    return result
  }) as F
}
