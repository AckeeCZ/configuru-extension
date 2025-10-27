import * as vscode from 'vscode'
import { ConfiguruEvent } from './event'
import { helpers } from './helpers'

export interface ConfiguruContext {
  projects: Record<string, ProjectContext>
  clean: (event: ConfiguruEvent) => void
  config: {
    load: () => ConfiguruExtConfig
    get: () => ConfiguruExtConfig
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

export interface ConfiguruExtConfig {
  features: ConfiguruFeatureFlags
  projectPaths: Array<{ path: string; projectName: string }>
  defaultConfigPath: string
}

const DEFAULT_CONFIG_PATH = '.env.jsonc'

let loadedConfig: ConfiguruExtConfig = {
  defaultConfigPath: DEFAULT_CONFIG_PATH,
  projectPaths: [],
  features: {
    suggestEnvVariables: true,
    highlightInvalidVariables: true,
    highlightSecretsMissingDescription: true,
    highlightUnsafeDefaultValues: true,
  },
}

const load = (): ConfiguruExtConfig => {
  const vsCodeConfig = vscode.workspace.getConfiguration('configuru')

  loadedConfig = {
    projectPaths: vsCodeConfig.get('paths') ?? [],
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

  return loadedConfig
}

const get = () => {
  return loadedConfig ?? load()
}

const clean = (event: ConfiguruEvent) => {
  if (!event.context.projects[event.projectName]) {
    return
  }

  if (helpers.isTsConfigFileEvent(event)) {
    event.context.projects[event.projectName].tsConfigFile = undefined
    event.context.projects[event.projectName].tsConfigFileText = undefined
    event.context.projects[event.projectName].tsConfigFileUri = undefined
  }
  if (helpers.isEnvFileEvent(event)) {
    event.context.projects[event.projectName].envFile = undefined
    event.context.projects[event.projectName].envFileParsed = undefined
    event.context.projects[event.projectName].envFileText = undefined
    event.context.projects[event.projectName].envFileUri = undefined
  }
}

export const context: ConfiguruContext = {
  projects: {},
  clean,
  config: {
    load,
    get,
  },
}
