import { showToast, toaster, type ToastOptions } from "@opencode-ai/ui/toast"

let toast: number | undefined

export function showParagraphCopyToast(opts: ToastOptions) {
  if (toast !== undefined) toaster.dismiss(toast)
  toast = showToast({
    ...opts,
    duration: opts.duration ?? 1800,
  })
  return toast
}
