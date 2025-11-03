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

let loadedConfig: ConfiguruExtConfig | undefined

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
  projects: {},
  clean,
  config: {
    load,
    get,
  },
}
