import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

const g = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (moduleId: string, label: string) => Worker
  }
}

g.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'html' || label === 'xml' || label === 'handlebars') return new htmlWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })

export { monaco }
