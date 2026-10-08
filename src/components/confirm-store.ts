import { create } from 'zustand'

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmState = {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: ((value: boolean) => void) | null
  ask: (options: ConfirmOptions) => Promise<boolean>
  close: (value: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: 'YIZoo',
  message: '',
  confirmLabel: 'OK',
  cancelLabel: 'Cancel',
  danger: false,
  resolve: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      const prev = get().resolve
      prev?.(false)
      set({
        open: true,
        title: options.title ?? 'YIZoo',
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'OK',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        danger: options.danger ?? false,
        resolve,
      })
    }),
  close: (value) => {
    const { resolve } = get()
    set({ open: false, resolve: null })
    resolve?.(value)
  },
}))

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options)
}
