import {
  Connect,
  CreateNode,
  DeleteNode,
  Disconnect,
  DuplicateConnection,
  GetData,
  GetStatus,
  ListChildren,
  ListConnections,
  RemoveConnection,
  RenameConnection,
  SaveConnection,
  SetData,
} from '../wailsjs/go/main/App'
import type { ConnectionProfile } from './types'

// Wails codegen uses class models; plain JSON objects are fine at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asModel = <T>(v: unknown) => v as T

export const api = {
  listConnections: () => ListConnections(),
  saveConnection: (p: ConnectionProfile) => SaveConnection(asModel(p)),
  removeConnection: (id: string) => RemoveConnection(id),
  duplicateConnection: (id: string) => DuplicateConnection(id),
  renameConnection: (id: string, name: string) => RenameConnection(id, name),
  connect: (id: string) => Connect(id),
  disconnect: (id: string) => Disconnect(id),
  getStatus: (id: string) => GetStatus(id),
  listChildren: (id: string, path: string) => ListChildren(id, path),
  getData: (id: string, path: string) => GetData(id, path),
  setData: (id: string, path: string, data: string, version: number) =>
    SetData(id, path, data, version),
  createNode: (id: string, path: string, data: string, ephemeral: boolean, sequential: boolean) =>
    CreateNode(id, path, data, ephemeral, sequential),
  deleteNode: (id: string, path: string, recursive: boolean) => DeleteNode(id, path, recursive),
}
