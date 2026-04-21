import { Dialog } from "@opencode-ai/ui/dialog"
import { useLanguage } from "@/context/language"
import { paragraphDialog } from "./paragraphs-view"
import { writeClipboard } from "@/util/clipboard"
import { showParagraphCopyToast } from "./paragraph-copy-toast"

type Item = {
  title?: string | null
  content: string
  is_active?: boolean
}

export function DialogKnowledgeParagraph(props: {
  title: string
  item: Item
}) {
  const language = useLanguage()

  const copy = async () => {
    if (await writeClipboard(props.item.content)) {
      showParagraphCopyToast({
        title: language.t("session.share.copy.copied"),
        variant: "success",
      })
      return
    }

    showParagraphCopyToast({
      title: language.t("toast.session.share.copyFailed.title"),
      variant: "error",
    })
  }

  return (
    <Dialog
      title={props.title}
      description={language.t("knowledge.paragraphs.recordMeta", {
        chars: props.item.content.length,
        state: props.item.is_active ? "active" : "inactive",
      })}
      action={
        <button
          type="button"
          class="rounded-md border border-border-weak-base px-3 py-2 text-13-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors"
          onClick={copy}
        >
          {language.t("knowledge.paragraphs.copy")}
        </button>
      }
      size="large"
      transition
    >
      <div class={paragraphDialog.body}>
        {props.item.content}
      </div>
    </Dialog>
  )
}
