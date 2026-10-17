export type Row = { name: string; tokens: number; kind: string; color: string }
export type Snapshot = { total: number; max: number; percent: number; rows: Row[]; mcp: Row[]; live?: { tokens: number; window: number; percent: number } }

declare module 'claude-code' {
  interface PluginState {
    'context-pane': { snap: Snapshot | null }
  }
}
