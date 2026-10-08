import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import { askConfirm } from '../../components/confirm-store'

function TreeItem({ path, name, depth }: { path: string; name: string; depth: number }) {
  const { t } = useTranslation()
  const {
    activeId,
    tree,
    expanded,
    selectedPath,
    setExpanded,
    setChildren,
    setSelectedPath,
    setEditorLang,
    setError,
    editorDirty,
  } = useAppStore()

  const children = tree[path]
  const isOpen = !!expanded[path]
  const hasLoaded = children !== undefined

  const loadChildren = useCallback(async () => {
    if (!activeId) return
    const kids = await window.yizoo.zk.listChildren(activeId, path)
    setChildren(
      path,
      kids.map((k) => k.name),
    )
  }, [activeId, path, setChildren])

  async function select() {
    if (!activeId) return
    const id = activeId
    if (editorDirty) {
      const ok = await askConfirm({
        title: t('brand'),
        message: t('confirmUnsaved'),
        confirmLabel: t('ok'),
        cancelLabel: t('cancel'),
        danger: true,
      })
      if (!ok || useAppStore.getState().activeId !== id) return
    }
    setSelectedPath(path)
    setEditorLang('plaintext')
    try {
      const data = await window.yizoo.zk.getData(id, path)
      const latest = useAppStore.getState()
      if (latest.activeId !== id || latest.selectedPath !== path) return
      const text = typeof data?.data === 'string' ? data.data : ''
      latest.setNodeData(data)
      latest.setEditorDraft(text)
      latest.setEditorDirty(false)
      latest.setEditorLang('plaintext')
      latest.setError(null)
    } catch (err) {
      const latest = useAppStore.getState()
      if (latest.activeId !== id || latest.selectedPath !== path) return
      latest.setNodeData(null)
      latest.setEditorDraft('')
      latest.setEditorDirty(false)
      latest.setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function toggle() {
    const next = !isOpen
    setExpanded(path, next)
    if (next && !hasLoaded) {
      try {
        await loadChildren()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  return (
    <div>
      <div
        className={`tree-node ${selectedPath === path ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => void select()}
      >
        <button
          type="button"
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation()
            void toggle()
          }}
        >
          {isOpen ? '▾' : '▸'}
        </button>
        <span>{name || '/'}</span>
      </div>
      {isOpen &&
        (children ?? []).map((child) => {
          const childPath = path === '/' ? `/${child}` : `${path}/${child}`
          return <TreeItem key={childPath} path={childPath} name={child} depth={depth + 1} />
        })}
    </div>
  )
}

export function NodeTree() {
  const activeId = useAppStore((s) => s.activeId)
  const setExpanded = useAppStore((s) => s.setExpanded)
  const setSelectedPath = useAppStore((s) => s.setSelectedPath)
  const setEditorLang = useAppStore((s) => s.setEditorLang)

  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail
      void (async () => {
        const id = useAppStore.getState().activeId
        if (!id) return
        setSelectedPath(path)
        setEditorLang('plaintext')
        const parts = path.split('/').filter(Boolean)
        let cur = ''
        for (const part of parts) {
          cur = `${cur}/${part}`
          const parent = cur.slice(0, cur.lastIndexOf('/')) || '/'
          setExpanded(parent, true)
        }
        setExpanded('/', true)
        try {
          const data = await window.yizoo.zk.getData(id, path)
          const latest = useAppStore.getState()
          if (latest.activeId !== id || latest.selectedPath !== path) return
          const text = typeof data?.data === 'string' ? data.data : ''
          latest.setNodeData(data)
          latest.setEditorDraft(text)
          latest.setEditorDirty(false)
          latest.setEditorLang('plaintext')
          const parent = path === '/' ? '/' : path.slice(0, path.lastIndexOf('/')) || '/'
          const parentPath = parent === '' ? '/' : parent
          const kids = await window.yizoo.zk.listChildren(id, parentPath)
          const afterKids = useAppStore.getState()
          if (afterKids.activeId !== id) return
          afterKids.setChildren(
            parentPath,
            kids.map((k) => k.name),
          )
          afterKids.setError(null)
        } catch (err) {
          const latest = useAppStore.getState()
          if (latest.activeId !== id || latest.selectedPath !== path) return
          latest.setNodeData(null)
          latest.setEditorDraft('')
          latest.setEditorDirty(false)
          latest.setError(err instanceof Error ? err.message : String(err))
        }
      })()
    }
    window.addEventListener('yizoo:select-path', handler)
    return () => window.removeEventListener('yizoo:select-path', handler)
  }, [setEditorLang, setExpanded, setSelectedPath])

  if (!activeId) return null
  return <TreeItem path="/" name="/" depth={0} />
}
