export async function writeClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    const copied = await navigator.clipboard.writeText(value).then(
      () => true,
      () => false,
    )
    if (copied) return true
  }

  if (typeof document !== "undefined") {
    const body = document.body
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    textarea.style.pointerEvents = "none"
    body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand("copy")
    body.removeChild(textarea)
    if (copied) return true
  }
  return false
}
