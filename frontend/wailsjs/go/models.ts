export namespace model {
	
	export class AppSettings {
	    locale: string;
	    fontSize: number;
	    monitorIntervalMs: number;
	    theme: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.locale = source["locale"];
	        this.fontSize = source["fontSize"];
	        this.monitorIntervalMs = source["monitorIntervalMs"];
	        this.theme = source["theme"];
	    }
	}
	export class ConnectionAuth {
	    scheme?: string;
	    auth?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionAuth(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scheme = source["scheme"];
	        this.auth = source["auth"];
	    }
	}
	export class SshConfig {
	    enabled: boolean;
	    host: string;
	    port: number;
	    username: string;
	    password?: string;
	    privateKeyPath?: string;
	    passphrase?: string;
	
	    static createFrom(source: any = {}) {
	        return new SshConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.privateKeyPath = source["privateKeyPath"];
	        this.passphrase = source["passphrase"];
	    }
	}
	export class ConnectionProfile {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    connectionTimeoutMs: number;
	    sessionTimeoutMs: number;
	    auth?: ConnectionAuth;
	    ssh?: SshConfig;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.connectionTimeoutMs = source["connectionTimeoutMs"];
	        this.sessionTimeoutMs = source["sessionTimeoutMs"];
	        this.auth = this.convertValues(source["auth"], ConnectionAuth);
	        this.ssh = this.convertValues(source["ssh"], SshConfig);
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ZkAcl {
	    scheme: string;
	    id: string;
	    perms: number;
	
	    static createFrom(source: any = {}) {
	        return new ZkAcl(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scheme = source["scheme"];
	        this.id = source["id"];
	        this.perms = source["perms"];
	    }
	}
	export class ZkChildNode {
	    name: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new ZkChildNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	    }
	}
	export class ZkStat {
	    czxid: string;
	    mzxid: string;
	    ctime: number;
	    mtime: number;
	    version: number;
	    cversion: number;
	    aversion: number;
	    ephemeralOwner: string;
	    dataLength: number;
	    numChildren: number;
	    pzxid: string;
	
	    static createFrom(source: any = {}) {
	        return new ZkStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.czxid = source["czxid"];
	        this.mzxid = source["mzxid"];
	        this.ctime = source["ctime"];
	        this.mtime = source["mtime"];
	        this.version = source["version"];
	        this.cversion = source["cversion"];
	        this.aversion = source["aversion"];
	        this.ephemeralOwner = source["ephemeralOwner"];
	        this.dataLength = source["dataLength"];
	        this.numChildren = source["numChildren"];
	        this.pzxid = source["pzxid"];
	    }
	}
	export class ZkNodeData {
	    path: string;
	    data: string;
	    stat: ZkStat;
	    acls: ZkAcl[];
	
	    static createFrom(source: any = {}) {
	        return new ZkNodeData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.data = source["data"];
	        this.stat = this.convertValues(source["stat"], ZkStat);
	        this.acls = this.convertValues(source["acls"], ZkAcl);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

