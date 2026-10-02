import React from 'react'

/**
 * Measured height of the canvas surface, tracked as the window changes. The
 * floor stack derives its perspective from this so a tilted sheet reads the
 * same in a short window and a tall one instead of scaling with a constant.
 */
export function useStageHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = React.useState(0)
  React.useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    setHeight(element.clientHeight)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setHeight(Math.round(entry.contentRect.height))
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return height
}
