package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"

	"yizoo/internal/model"
)

type fileData struct {
	Connections []model.ConnectionProfile `json:"connections"`
	Settings    model.AppSettings         `json:"settings"`
}

type Store struct {
	mu   sync.Mutex
	path string
	data fileData
}

func DefaultSettings() model.AppSettings {
	return model.AppSettings{
		Locale:            "zh",
		FontSize:          14,
		MonitorIntervalMs: 5000,
		Theme:             "light",
	}
}

func Open() (*Store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	root := filepath.Join(dir, "yizoo")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	s := &Store{path: filepath.Join(root, "config.json")}
	s.data.Settings = DefaultSettings()
	s.data.Connections = []model.ConnectionProfile{}
	if raw, err := os.ReadFile(s.path); err == nil {
		_ = json.Unmarshal(raw, &s.data)
		if s.data.Settings.Locale == "" {
			s.data.Settings = DefaultSettings()
		}
	}
	return s, nil
}

func (s *Store) persist() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, raw, 0o600)
}

func (s *Store) ListConnections() []model.ConnectionProfile {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]model.ConnectionProfile, len(s.data.Connections))
	copy(out, s.data.Connections)
	return out
}

func (s *Store) GetConnection(id string) (model.ConnectionProfile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, c := range s.data.Connections {
		if c.ID == id {
			return c, true
		}
	}
	return model.ConnectionProfile{}, false
}

func (s *Store) SaveConnection(input model.ConnectionProfile) (model.ConnectionProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UnixMilli()
	if input.ID == "" {
		input.ID = uuid.NewString()
		input.CreatedAt = now
	}
	input.UpdatedAt = now
	if input.ConnectionTimeoutMs <= 0 {
		input.ConnectionTimeoutMs = 15000
	}
	if input.SessionTimeoutMs <= 0 {
		input.SessionTimeoutMs = 30000
	}
	found := false
	for i, c := range s.data.Connections {
		if c.ID == input.ID {
			if input.CreatedAt == 0 {
				input.CreatedAt = c.CreatedAt
			}
			s.data.Connections[i] = input
			found = true
			break
		}
	}
	if !found {
		if input.CreatedAt == 0 {
			input.CreatedAt = now
		}
		s.data.Connections = append(s.data.Connections, input)
	}
	return input, s.persist()
}

func (s *Store) RemoveConnection(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := s.data.Connections[:0]
	for _, c := range s.data.Connections {
		if c.ID != id {
			next = append(next, c)
		}
	}
	s.data.Connections = next
	return s.persist()
}

func (s *Store) GetSettings() model.AppSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.Settings
}

func (s *Store) SetSettings(patch model.AppSettings) (model.AppSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cur := s.data.Settings
	if patch.Locale != "" {
		cur.Locale = patch.Locale
	}
	if patch.FontSize > 0 {
		cur.FontSize = patch.FontSize
	}
	if patch.MonitorIntervalMs > 0 {
		cur.MonitorIntervalMs = patch.MonitorIntervalMs
	}
	if patch.Theme != "" {
		cur.Theme = patch.Theme
	}
	s.data.Settings = cur
	return cur, s.persist()
}
