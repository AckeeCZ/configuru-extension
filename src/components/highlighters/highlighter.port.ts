import * as vscode from 'vscode'
import { ConfiguruEventType, ConfiguruEventsOf } from '../event'
import { ConfiguruExtConfig, ConfiguruFeatureFlags } from '../context'

export interface Highlight {
  target: vscode.Uri
  diagnostics: vscode.Diagnostic[]
}

export interface HighlighterPort<Triggers extends ConfiguruEventType> {
  name: string
  triggers: ReadonlyArray<Triggers>
  flag: keyof ConfiguruFeatureFlags
  highlight: (
    event: ConfiguruEventsOf<Triggers>,
    config: ConfiguruExtConfig
  ) => Promise<Highlight[]>
}

export const isTriggeredByEvent = <Event extends ConfiguruEventType>(
  highlighter: HighlighterPort<any>,
  event: Event
): highlighter is HighlighterPort<Event> => {
  return highlighter.triggers.includes(event)
}
