declare module 'node-zookeeper-client' {
  import { EventEmitter } from 'events'

  export interface Id {
    scheme: string
    id: string
  }

  export interface ACL {
    id: Id
    perms: number
  }

  export interface Stat {
    czxid: number
    mzxid: number
    ctime: number
    mtime: number
    version: number
    cversion: number
    aversion: number
    ephemeralOwner: number
    dataLength: number
    numChildren: number
    pzxid: number
  }

  export class State {
    static DISCONNECTED: State
    static SYNC_CONNECTED: State
    static AUTH_FAILED: State
    static CONNECTED_READ_ONLY: State
    static SASL_AUTHENTICATED: State
    static EXPIRED: State
    name: string
  }

  export class CreateMode {
    static PERSISTENT: number
    static EPHEMERAL: number
    static PERSISTENT_SEQUENTIAL: number
    static EPHEMERAL_SEQUENTIAL: number
  }

  export class Permission {
    static READ: number
    static WRITE: number
    static CREATE: number
    static DELETE: number
    static ADMIN: number
    static ALL: number
  }

  export class Exception {
    static OK: number
    static NO_NODE: number
    code: number
  }

  export const ACL: {
    OPEN_ACL_UNSAFE: ACL[]
    CREATOR_ALL_ACL: ACL[]
    READ_ACL_UNSAFE: ACL[]
  }

  export interface Client extends EventEmitter {
    connect(): void
    close(): void
    addAuthInfo(scheme: string, auth: Buffer): void
    getChildren(
      path: string,
      watcher?: (...args: unknown[]) => void,
      callback?: (error: Error | null, children: string[], stat?: Stat) => void,
    ): void
    getChildren(
      path: string,
      callback: (error: Error | null, children: string[], stat?: Stat) => void,
    ): void
    getData(
      path: string,
      watcher?: (...args: unknown[]) => void,
      callback?: (error: Error | null, data: Buffer, stat: Stat) => void,
    ): void
    getData(
      path: string,
      callback: (error: Error | null, data: Buffer, stat: Stat) => void,
    ): void
    setData(
      path: string,
      data: Buffer,
      version: number,
      callback: (error: Error | null, stat: Stat) => void,
    ): void
    create(
      path: string,
      data: Buffer,
      acls: ACL[],
      mode: number,
      callback: (error: Error | null, path: string) => void,
    ): void
    mkdirp(
      path: string,
      data: Buffer,
      acls: ACL[],
      mode: number,
      callback: (error: Error | null, path: string) => void,
    ): void
    remove(path: string, version: number, callback: (error: Error | null) => void): void
    getACL(
      path: string,
      callback: (error: Error | null, acls: ACL[], stat: Stat) => void,
    ): void
    setACL(
      path: string,
      acls: ACL[],
      version: number,
      callback: (error: Error | null, stat: Stat) => void,
    ): void
  }

  export function createClient(
    connectionString: string,
    options?: { sessionTimeout?: number; spinDelay?: number; retries?: number },
  ): Client

  const zookeeper: {
    createClient: typeof createClient
    ACL: typeof ACL
    CreateMode: typeof CreateMode
    Permission: typeof Permission
    State: typeof State
    Exception: typeof Exception
  }
  export default zookeeper
}
