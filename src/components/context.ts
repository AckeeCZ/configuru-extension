import * as vscode from 'vscode'
import type { ConfigTsKey } from './config-ts-parser'
import { ConfiguruEvent, ConfiguruEventType } from './event'
import { EnvFileKeyMatch, helpers } from './helpers'
import { ui } from './ui'
import {
  disableExtensionForWorkspace,
  openSettingsAtKey,
} from './settings-helper'

export interface ConfiguruContext {
  state: {
    isConfigLoaded?: boolean
  }
  cache: ContextCache
  clean: (event?: ConfiguruEvent) => void
  config: {
    load: () => Promise<ConfiguruExtConfig>
    get: () => Promise<ConfiguruExtConfig>
  }
}

export interface ContextCache {
  files: Map<string, vscode.TextDocument>
  fileTexts: Map<string, string>
  fileParsed: Map<string, Record<string, any>>
  fileUris: Map<string, vscode.Uri>
  configTsKeys: Map<string, ConfigTsKey[]>
  envFileKeys: Map<string, Map<string, EnvFileKeyMatch[]>>
}

export const Features = [
  'suggestEnvVariables',
  'highlightInvalidVariables',
  'highlightSecretsMissingDescription',
  'highlightUnsafeDefaultValues',
  'highlightLoaderTypeMismatch',
  'goToVariableDefinition',
] as const

export type ConfiguruFeatureFlags = Partial<
  Record<(typeof Features)[number], boolean>
>

export type ConfigPaths = Array<{ loader: string; envs: string[] }>

enum NotificationButton {
  FixPaths = 'Fix Paths',
  DisableForWorkspace = 'Disable for This Workspace',
  GoToSettings = 'Go to Settings',
}

const cache: ContextCache = {
  files: new Map(),
  fileTexts: new Map(),
  fileParsed: new Map(),
  fileUris: new Map(),
  configTsKeys: new Map(),
  envFileKeys: new Map(),
}
export interface ConfiguruExtConfig {
  features: ConfiguruFeatureFlags
  configPaths: ConfigPaths
}

const validatePaths = async (paths: any): Promise<ConfigPaths> => {
  if (
    !Array.isArray(paths) ||
    paths.some(
      path =>
        typeof path !== 'object' ||
        !path.loader ||
        !path.envs ||
        !Array.isArray(path.envs) ||
        typeof path.loader !== 'string' ||
        path.envs.some((env: any) => typeof env !== 'string')
    )
  ) {
    throw new Error(
      'Paths must be array of { loader: string[], envs: string[] }'
    )
  }

  let missingFile: string | undefined
  for (const { loader, envs } of paths) {
    for (const path of [loader, ...envs]) {
      if (!(await helpers.fileExistsInWorkspace(path))) {
        missingFile = path
        break
      }
    }
    if (missingFile) {
      throw new Error(`File ${missingFile} does not exist`)
    }
  }
  return paths
}

const DEFAULT_ENV_CONFIG_PATH = '.env.jsonc'
const DEFAULT_TS_CONFIG_PATH = 'src/config.ts'

let loadedConfig: ConfiguruExtConfig | undefined
const state: ConfiguruContext['state'] = {}

// Prevents stacking error notifications. VS Code has no API to dismiss a
// notification programmatically, so while one is on screen we suppress new
// ones, then clear the flag once the user dismisses or acts on it - so the
// next problem still re-notifies with an up-to-date message.
let isErrorNotificationOpen = false

const load = async (): Promise<ConfiguruExtConfig> => {
  const vsCodeConfig = vscode.workspace.getConfiguration('configuru')
  const defaultPaths = [
    {
      loader: DEFAULT_TS_CONFIG_PATH,
      envs: [DEFAULT_ENV_CONFIG_PATH],
    },
  ]

  const featureFlags = Features.reduce<ConfiguruFeatureFlags>(
    (acc, feature) => {
      acc[feature] = vsCodeConfig.get(`features.${feature}`, true)
      return acc
    },
    {}
  )

  loadedConfig = {
    configPaths: defaultPaths,
    features: featureFlags,
  }

  try {
    const isAnyFeatureEnabled = Object.values(featureFlags).some(
      enabled => enabled
    )
    if (isAnyFeatureEnabled) {
      loadedConfig.configPaths = await validatePaths(
        vsCodeConfig.get('paths', defaultPaths)
      )
      if (state.isConfigLoaded === false) {
        ui.notifications.info('Configuru Extension loaded successfully now')
      }
      state.isConfigLoaded = true
    }
  } catch (error) {
    state.isConfigLoaded = false
    if (!isErrorNotificationOpen) {
      isErrorNotificationOpen = true
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      void ui.notifications
        .errorWithActions(
          `Configuru Extension Error - Invalid Config Paths: ${errorMessage}`,
          [
            {
              title: NotificationButton.FixPaths,
              action: async () => {
                await openSettingsAtKey('configuru.paths')
              },
            },
            {
              title: NotificationButton.DisableForWorkspace,
              action: async () => {
                await disableExtensionForWorkspace()
                const action = await vscode.window.showInformationMessage(
                  'Configuru has been disabled for this workspace. Re-enable in Settings.',
                  NotificationButton.GoToSettings
                )

                if (action === NotificationButton.GoToSettings) {
                  await openSettingsAtKey('configuru')
                }
              },
            },
          ]
        )
        .catch(() => undefined)
        .finally(() => {
          isErrorNotificationOpen = false
        })
    }
  }
  return loadedConfig
}

const get = async (): Promise<ConfiguruExtConfig> => {
  return loadedConfig ?? (await load())
}

const deleteFileCache = (event: ConfiguruEvent, fileName: string) => {
  event.context.cache.files.delete(fileName)
  event.context.cache.fileTexts.delete(fileName)
  event.context.cache.fileParsed.delete(fileName)
  event.context.cache.configTsKeys.delete(fileName)
  event.context.cache.envFileKeys.delete(fileName)
}

const clean = (event?: ConfiguruEvent) => {
  if (!event || event.type === ConfiguruEventType.ExtensionLoaded) {
    const contextCache = event?.context.cache ?? cache
    contextCache.files.clear()
    contextCache.fileTexts.clear()
    contextCache.fileParsed.clear()
    contextCache.fileUris.clear()
    contextCache.configTsKeys.clear()
    contextCache.envFileKeys.clear()
    return
  }
  if (
    [
      ConfiguruEventType.TsConfigFileChanged,
      ConfiguruEventType.EnvFileChanged,
    ].includes(event.type)
  ) {
    deleteFileCache(event, vscode.workspace.asRelativePath(event.document.uri))
  }
}

export type ConfiguruCacheValue<Key extends keyof ContextCache> =
  ContextCache[Key] extends Map<any, infer I> ? I : never

export const context: ConfiguruContext = {
  state,
  cache,
  clean,
  config: {
    load,
    get,
  },
}
