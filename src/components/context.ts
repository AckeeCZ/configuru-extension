import * as vscode from 'vscode'
import { ConfiguruEvent, ConfiguruEventType } from './event'
import { helpers } from './helpers'
import { ui } from './ui'

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
}

export type ConfiguruFeatureFlags = Partial<{
  suggestEnvVariables: boolean
  highlightInvalidVariables: boolean
  highlightSecretsMissingDescription: boolean
  highlightUnsafeDefaultValues: boolean
}>

export type ConfigPaths = Array<{ loader: string; envs: string[] }>

const cache: ContextCache = {
  files: new Map(),
  fileTexts: new Map(),
  fileParsed: new Map(),
  fileUris: new Map(),
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

  let missingFile: string | undefined = undefined
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

const load = async (): Promise<ConfiguruExtConfig> => {
  const vsCodeConfig = vscode.workspace.getConfiguration('configuru')
  const defaultPaths = [
    {
      loader: DEFAULT_TS_CONFIG_PATH,
      envs: [DEFAULT_ENV_CONFIG_PATH],
    },
  ]

  loadedConfig = {
    configPaths: defaultPaths,
    features: {
      suggestEnvVariables: vsCodeConfig.get(
        'features.suggestEnvVariables',
        true
      ),
      highlightInvalidVariables: vsCodeConfig.get(
        'features.highlightInvalidVariables',
        true
      ),
      highlightSecretsMissingDescription: vsCodeConfig.get(
        'features.highlightSecretsMissingDescription',
        true
      ),
      highlightUnsafeDefaultValues: vsCodeConfig.get(
        'features.highlightUnsafeDefaultValues',
        true
      ),
    },
  }

  try {
    loadedConfig.configPaths = await validatePaths(
      vsCodeConfig.get('paths', defaultPaths)
    )

    if (state.isConfigLoaded === false) {
      ui.notifications.info(`Configuru Ext now successfully loaded`)
      state.isConfigLoaded = true
    }
  } catch (error) {
    if (state.isConfigLoaded === true) {
      state.isConfigLoaded = false
      ui.notifications.error(
        `Error loading Configuru Ext config: ${error.message}`
      )
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
}

const clean = (event?: ConfiguruEvent) => {
  if (!event || event.type === ConfiguruEventType.ExtensionLoaded) {
    const contextCache = event?.context.cache ?? cache
    contextCache.files.clear()
    contextCache.fileTexts.clear()
    contextCache.fileParsed.clear()
    contextCache.fileUris.clear()
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
