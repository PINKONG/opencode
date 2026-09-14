import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { useSDK } from "@/context/sdk"
import { createHomeScrollController } from "@/pages/home/home-scroll-controller"
import KnowledgePage from "."

export function NewKnowledgePage() {
  const scroll = createHomeScrollController(() => [])

  return (
    <div
      class={`
        m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ScrollView
        class="h-full [container-type:size]"
        thumbContainer={scroll.viewport.thumbTrack}
        thumbHoverTarget={scroll.viewport.hoverTarget}
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
        onWheel={scroll.viewport.containOuterWheel}
      >
        <div
          class="mx-auto min-h-full w-full max-w-[1440px] px-3 lg:px-6"
        >
          <section class="min-h-0 min-w-0 py-6 lg:py-12">
            <KnowledgePage newLayout />
          </section>
        </div>
      </ScrollView>
    </div>
  )
}
