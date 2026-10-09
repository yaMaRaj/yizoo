package zk

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-zookeeper/zk"

	"yizoo/internal/model"
	"yizoo/internal/store"
)

type Session struct {
	ID     string
	Status model.ConnectionStatus
	conn   *zk.Conn
	tunnel *Tunnel
}

type Manager struct {
	mu       sync.Mutex
	store    *store.Store
	sessions map[string]*Session
}

func NewManager(st *store.Store) *Manager {
	return &Manager{
		store:    st,
		sessions: map[string]*Session{},
	}
}

func (m *Manager) Status(id string) model.ConnectionStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[id]; ok {
		return s.Status
	}
	return model.StatusDisconnected
}

func (m *Manager) Connect(id string) error {
	m.mu.Lock()
	if s, ok := m.sessions[id]; ok && (s.Status == model.StatusConnected || s.Status == model.StatusConnecting) {
		m.mu.Unlock()
		return nil
	}
	if s, ok := m.sessions[id]; ok {
		m.closeLocked(s)
		delete(m.sessions, id)
	}
	m.mu.Unlock()

	profile, ok := m.store.GetConnection(id)
	if !ok {
		return fmt.Errorf("connection profile not found")
	}

	host := strings.Split(strings.Split(profile.Host, ",")[0], ":")[0]
	port := profile.Port
	var tunnel *Tunnel
	if profile.SSH != nil && profile.SSH.Enabled {
		t, err := openSSHTunnel(profile.SSH, host, port)
		if err != nil {
			return err
		}
		tunnel = t
		host = "127.0.0.1"
		port = t.LocalPort()
	}

	timeout := time.Duration(profile.SessionTimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	connTimeout := time.Duration(profile.ConnectionTimeoutMs) * time.Millisecond
	if connTimeout <= 0 {
		connTimeout = 15 * time.Second
	}

	conn, events, err := zk.Connect([]string{fmt.Sprintf("%s:%d", host, port)}, timeout)
	if err != nil {
		if tunnel != nil {
			_ = tunnel.Close()
		}
		return err
	}
	if profile.Auth != nil && profile.Auth.Scheme != "" && profile.Auth.Auth != "" {
		if err := conn.AddAuth(profile.Auth.Scheme, []byte(profile.Auth.Auth)); err != nil {
			conn.Close()
			if tunnel != nil {
				_ = tunnel.Close()
			}
			return fmt.Errorf("auth failed: %w", err)
		}
	}

	deadline := time.After(connTimeout)
	for {
		select {
		case ev := <-events:
			if ev.State == zk.StateHasSession || ev.State == zk.StateConnected {
				m.mu.Lock()
				m.sessions[id] = &Session{
					ID:     id,
					Status: model.StatusConnected,
					conn:   conn,
					tunnel: tunnel,
				}
				m.mu.Unlock()
				go m.watchEvents(id, events)
				return nil
			}
		case <-deadline:
			conn.Close()
			if tunnel != nil {
				_ = tunnel.Close()
			}
			return fmt.Errorf("connection timeout")
		}
	}
}

func (m *Manager) watchEvents(id string, events <-chan zk.Event) {
	for ev := range events {
		m.mu.Lock()
		s, ok := m.sessions[id]
		if !ok {
			m.mu.Unlock()
			return
		}
		switch ev.State {
		case zk.StateHasSession, zk.StateConnected:
			s.Status = model.StatusConnected
		case zk.StateDisconnected, zk.StateExpired:
			s.Status = model.StatusReconnecting
		case zk.StateAuthFailed:
			s.Status = model.StatusError
		}
		m.mu.Unlock()
	}
}

func (m *Manager) Disconnect(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[id]; ok {
		m.closeLocked(s)
		delete(m.sessions, id)
	}
	return nil
}

func (m *Manager) closeLocked(s *Session) {
	if s.conn != nil {
		s.conn.Close()
	}
	if s.tunnel != nil {
		_ = s.tunnel.Close()
	}
	s.Status = model.StatusDisconnected
}

func (m *Manager) session(id string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if !ok || s.conn == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s, nil
}

func (m *Manager) ListChildren(id, path string) ([]model.ZkChildNode, error) {
	s, err := m.session(id)
	if err != nil {
		return nil, err
	}
	if path == "" {
		path = "/"
	}
	children, _, err := s.conn.Children(path)
	if err != nil {
		return nil, err
	}
	sort.Strings(children)
	out := make([]model.ZkChildNode, 0, len(children))
	for _, name := range children {
		childPath := path
		if path == "/" {
			childPath = "/" + name
		} else {
			childPath = path + "/" + name
		}
		out = append(out, model.ZkChildNode{Name: name, Path: childPath})
	}
	return out, nil
}

func (m *Manager) GetData(id, path string) (*model.ZkNodeData, error) {
	s, err := m.session(id)
	if err != nil {
		return nil, err
	}
	if path == "" {
		path = "/"
	}
	data, stat, err := s.conn.Get(path)
	if err != nil {
		return nil, err
	}
	acls, _, err := s.conn.GetACL(path)
	if err != nil {
		acls = nil
	}
	return &model.ZkNodeData{
		Path: path,
		Data: string(data),
		Stat: toStat(stat),
		Acls: toAcls(acls),
	}, nil
}

func (m *Manager) SetData(id, path, data string, version int32) (*model.ZkStat, error) {
	s, err := m.session(id)
	if err != nil {
		return nil, err
	}
	if path == "" {
		path = "/"
	}
	stat, err := s.conn.Set(path, []byte(data), version)
	if err != nil {
		return nil, err
	}
	st := toStat(stat)
	return &st, nil
}

func (m *Manager) Create(id, path, data string, ephemeral, sequential bool) (string, error) {
	s, err := m.session(id)
	if err != nil {
		return "", err
	}
	flags := int32(0)
	if ephemeral {
		flags |= zk.FlagEphemeral
	}
	if sequential {
		flags |= zk.FlagSequence
	}
	created, err := s.conn.Create(path, []byte(data), flags, zk.WorldACL(zk.PermAll))
	return created, err
}

func (m *Manager) Delete(id, path string, recursive bool) error {
	s, err := m.session(id)
	if err != nil {
		return err
	}
	if recursive {
		return deleteRecursive(s.conn, path)
	}
	return s.conn.Delete(path, -1)
}

func deleteRecursive(conn *zk.Conn, path string) error {
	children, _, err := conn.Children(path)
	if err != nil {
		return err
	}
	for _, name := range children {
		child := path
		if path == "/" {
			child = "/" + name
		} else {
			child = path + "/" + name
		}
		if err := deleteRecursive(conn, child); err != nil {
			return err
		}
	}
	if path == "/" {
		return nil
	}
	return conn.Delete(path, -1)
}

func toStat(st *zk.Stat) model.ZkStat {
	if st == nil {
		return model.ZkStat{}
	}
	return model.ZkStat{
		Czxid:          strconv.FormatInt(st.Czxid, 10),
		Mzxid:          strconv.FormatInt(st.Mzxid, 10),
		Ctime:          st.Ctime,
		Mtime:          st.Mtime,
		Version:        st.Version,
		Cversion:       st.Cversion,
		Aversion:       st.Aversion,
		EphemeralOwner: strconv.FormatInt(st.EphemeralOwner, 10),
		DataLength:     st.DataLength,
		NumChildren:    st.NumChildren,
		Pzxid:          strconv.FormatInt(st.Pzxid, 10),
	}
}

func toAcls(acls []zk.ACL) []model.ZkAcl {
	out := make([]model.ZkAcl, 0, len(acls))
	for _, a := range acls {
		out = append(out, model.ZkAcl{Scheme: a.Scheme, ID: a.ID, Perms: a.Perms})
	}
	return out
}
