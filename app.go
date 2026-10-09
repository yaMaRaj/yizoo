package main

import (
	"context"
	"fmt"
	"regexp"
	"strconv"

	"yizoo/internal/model"
	"yizoo/internal/store"
	"yizoo/internal/zk"
)

// App is the Wails binding surface for the React frontend.
type App struct {
	ctx context.Context
	st  *store.Store
	zk  *zk.Manager
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	st, err := store.Open()
	if err != nil {
		panic(err)
	}
	a.st = st
	a.zk = zk.NewManager(st)
}

func (a *App) ListConnections() []model.ConnectionProfile {
	return a.st.ListConnections()
}

func (a *App) SaveConnection(profile model.ConnectionProfile) (model.ConnectionProfile, error) {
	return a.st.SaveConnection(profile)
}

func (a *App) RemoveConnection(id string) error {
	_ = a.zk.Disconnect(id)
	return a.st.RemoveConnection(id)
}

func (a *App) DuplicateConnection(id string) (model.ConnectionProfile, error) {
	src, ok := a.st.GetConnection(id)
	if !ok {
		return model.ConnectionProfile{}, fmt.Errorf("connection not found")
	}
	names := make([]string, 0)
	for _, p := range a.st.ListConnections() {
		names = append(names, p.Name)
	}
	copy := src
	copy.ID = ""
	copy.Name = nextCopyName(src.Name, names)
	copy.CreatedAt = 0
	copy.UpdatedAt = 0
	return a.st.SaveConnection(copy)
}

func (a *App) RenameConnection(id, name string) (model.ConnectionProfile, error) {
	src, ok := a.st.GetConnection(id)
	if !ok {
		return model.ConnectionProfile{}, fmt.Errorf("connection not found")
	}
	src.Name = name
	return a.st.SaveConnection(src)
}

func (a *App) Connect(id string) error {
	return a.zk.Connect(id)
}

func (a *App) Disconnect(id string) error {
	return a.zk.Disconnect(id)
}

func (a *App) GetStatus(id string) model.ConnectionStatus {
	return a.zk.Status(id)
}

func (a *App) ListChildren(id, path string) ([]model.ZkChildNode, error) {
	return a.zk.ListChildren(id, path)
}

func (a *App) GetData(id, path string) (*model.ZkNodeData, error) {
	return a.zk.GetData(id, path)
}

func (a *App) SetData(id, path, data string, version int32) (*model.ZkStat, error) {
	return a.zk.SetData(id, path, data, version)
}

func (a *App) CreateNode(id, path, data string, ephemeral, sequential bool) (string, error) {
	return a.zk.Create(id, path, data, ephemeral, sequential)
}

func (a *App) DeleteNode(id, path string, recursive bool) error {
	return a.zk.Delete(id, path, recursive)
}

func (a *App) GetSettings() model.AppSettings {
	return a.st.GetSettings()
}

func (a *App) SetSettings(settings model.AppSettings) (model.AppSettings, error) {
	return a.st.SetSettings(settings)
}

func nextCopyName(base string, existing []string) string {
	re := regexp.MustCompile("^" + regexp.QuoteMeta(base) + `-(\d+)$`)
	max := 0
	for _, name := range existing {
		m := re.FindStringSubmatch(name)
		if len(m) == 2 {
			n, _ := strconv.Atoi(m[1])
			if n > max {
				max = n
			}
		}
	}
	return fmt.Sprintf("%s-%d", base, max+1)
}
