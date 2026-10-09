package model

type ConnectionAuth struct {
	Scheme string `json:"scheme,omitempty"`
	Auth   string `json:"auth,omitempty"`
}

type SshConfig struct {
	Enabled        bool   `json:"enabled"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	Username       string `json:"username"`
	Password       string `json:"password,omitempty"`
	PrivateKeyPath string `json:"privateKeyPath,omitempty"`
	Passphrase     string `json:"passphrase,omitempty"`
}

type ConnectionProfile struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Host                 string          `json:"host"`
	Port                 int             `json:"port"`
	ConnectionTimeoutMs  int             `json:"connectionTimeoutMs"`
	SessionTimeoutMs     int             `json:"sessionTimeoutMs"`
	Auth                 *ConnectionAuth `json:"auth,omitempty"`
	SSH                  *SshConfig      `json:"ssh,omitempty"`
	CreatedAt            int64           `json:"createdAt"`
	UpdatedAt            int64           `json:"updatedAt"`
}

type ConnectionStatus string

const (
	StatusDisconnected ConnectionStatus = "disconnected"
	StatusConnecting   ConnectionStatus = "connecting"
	StatusConnected    ConnectionStatus = "connected"
	StatusReconnecting ConnectionStatus = "reconnecting"
	StatusError        ConnectionStatus = "error"
)

type ZkStat struct {
	Czxid          string `json:"czxid"`
	Mzxid          string `json:"mzxid"`
	Ctime          int64  `json:"ctime"`
	Mtime          int64  `json:"mtime"`
	Version        int32  `json:"version"`
	Cversion       int32  `json:"cversion"`
	Aversion       int32  `json:"aversion"`
	EphemeralOwner string `json:"ephemeralOwner"`
	DataLength     int32  `json:"dataLength"`
	NumChildren    int32  `json:"numChildren"`
	Pzxid          string `json:"pzxid"`
}

type ZkAcl struct {
	Scheme string `json:"scheme"`
	ID     string `json:"id"`
	Perms  int32  `json:"perms"`
}

type ZkNodeData struct {
	Path string `json:"path"`
	Data string `json:"data"`
	Stat ZkStat `json:"stat"`
	Acls []ZkAcl `json:"acls"`
}

type ZkChildNode struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type AppSettings struct {
	Locale             string `json:"locale"`
	FontSize           int    `json:"fontSize"`
	MonitorIntervalMs  int    `json:"monitorIntervalMs"`
	Theme              string `json:"theme"`
}
