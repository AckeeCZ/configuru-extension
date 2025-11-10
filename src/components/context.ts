import * as vscode from 'vscode'
import { ConfiguruEvent } from './event'
import { helpers } from './helpers'
import { ui } from './ui'

export interface ConfiguruContext {
  state: {
    isConfigLoaded?: boolean
  }
  projects: Record<string, ProjectContext>
  clean: (event: ConfiguruEvent) => void
  config: {
    load: () => Promise<ConfiguruExtConfig>
    get: () => Promise<ConfiguruExtConfig>
  }
}

export interface ProjectContext {
  envFile?: vscode.TextDocument
  envFileParsed?: Record<string, any>
  envFileText?: string
  envFileUri?: vscode.Uri
  tsConfigFile?: vscode.TextDocument
  tsConfigFileText?: string
  tsConfigFileUri?: vscode.Uri
}

export type ConfiguruFeatureFlags = Partial<{
  suggestEnvVariables: boolean
  highlightInvalidVariables: boolean
  highlightSecretsMissingDescription: boolean
  highlightUnsafeDefaultValues: boolean
}>

export type ProjectPaths = Array<{ loader: string; envs: string[] }>

export interface ConfiguruExtConfig {
  features: ConfiguruFeatureFlags
  projectPaths: ProjectPaths
  defaultConfigPath: string
}

const validatePaths = async (paths: any): Promise<ProjectPaths> => {
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
      'Invalid config - paths must be array of { loader: string[], envs: string[] }'
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
      throw new Error(`Invalid config - file ${missingFile} does not exist`)
    }
  }
  return paths
}

const DEFAULT_CONFIG_PATH = '.env.jsonc'

let loadedConfig: ConfiguruExtConfig | undefined
const state: ConfiguruContext['state'] = {}

const load = async (): Promise<ConfiguruExtConfig> => {
  const vsCodeConfig = vscode.workspace.getConfiguration('configuru')

  loadedConfig = {
    projectPaths: [],
    defaultConfigPath: DEFAULT_CONFIG_PATH,
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
    loadedConfig.projectPaths = await validatePaths(
      vsCodeConfig.get('paths') ?? []
    )

    if (state.isConfigLoaded === false) {
      ui.notifications.info(`Configuru extension now successfully loaded`)
      state.isConfigLoaded = true
    }
  } catch (error) {
    state.isConfigLoaded = false
    ui.notifications.error(
      `Failed to load Configuru extension config: ${error.message}`
    )
  }

  return loadedConfig
}

const get = async (): Promise<ConfiguruExtConfig> => {
  return loadedConfig ?? (await load())
}

const clean = (event: ConfiguruEvent) => {
  if (!event.context.projects[event.projectName]) {
    return
  }

  if (helpers.isTsConfigFileEvent(event)) {
    delete event.context.projects[event.projectName].tsConfigFile
    delete event.context.projects[event.projectName].tsConfigFileText
    delete event.context.projects[event.projectName].tsConfigFileUri
  }
  if (helpers.isEnvFileEvent(event)) {
    delete event.context.projects[event.projectName].envFile
    delete event.context.projects[event.projectName].envFileParsed
    delete event.context.projects[event.projectName].envFileText
    delete event.context.projects[event.projectName].envFileUri
  }
}

export const context: ConfiguruContext = {
  state,
  projects: {},
  clean,
  config: {
    load,
    get,
  },
}
