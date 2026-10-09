package zk

import (
	"fmt"
	"io"
	"net"
	"os"
	"sync"

	"golang.org/x/crypto/ssh"

	"yizoo/internal/model"
)

type Tunnel struct {
	listener net.Listener
	client   *ssh.Client
	localPort int
	once     sync.Once
}

func (t *Tunnel) LocalPort() int { return t.localPort }

func (t *Tunnel) Close() error {
	var err error
	t.once.Do(func() {
		if t.listener != nil {
			err = t.listener.Close()
		}
		if t.client != nil {
			_ = t.client.Close()
		}
	})
	return err
}

func openSSHTunnel(cfg *model.SshConfig, remoteHost string, remotePort int) (*Tunnel, error) {
	if cfg == nil || !cfg.Enabled {
		return nil, fmt.Errorf("ssh disabled")
	}
	auth, err := sshAuthMethods(cfg)
	if err != nil {
		return nil, err
	}
	client, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", cfg.Host, cfg.Port), &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // local desktop tool; tighten later
	})
	if err != nil {
		return nil, fmt.Errorf("ssh dial: %w", err)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		_ = client.Close()
		return nil, err
	}
	t := &Tunnel{listener: ln, client: client, localPort: ln.Addr().(*net.TCPAddr).Port}
	go func() {
		for {
			local, err := ln.Accept()
			if err != nil {
				return
			}
			go func(l net.Conn) {
				defer l.Close()
				remote, err := client.Dial("tcp", fmt.Sprintf("%s:%d", remoteHost, remotePort))
				if err != nil {
					return
				}
				defer remote.Close()
				pipe(l, remote)
			}(local)
		}
	}()
	return t, nil
}

func sshAuthMethods(cfg *model.SshConfig) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	if cfg.PrivateKeyPath != "" {
		raw, err := os.ReadFile(cfg.PrivateKeyPath)
		if err != nil {
			return nil, err
		}
		var signer ssh.Signer
		if cfg.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(raw, []byte(cfg.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(raw)
		}
		if err != nil {
			return nil, err
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if cfg.Password != "" {
		methods = append(methods, ssh.Password(cfg.Password))
	}
	if len(methods) == 0 {
		return nil, fmt.Errorf("ssh requires password or private key")
	}
	return methods, nil
}

func pipe(a, b net.Conn) {
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(a, b); done <- struct{}{} }()
	go func() { _, _ = io.Copy(b, a); done <- struct{}{} }()
	<-done
}
