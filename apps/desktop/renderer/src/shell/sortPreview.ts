// 纵向拖排的几何计算 (纯函数)。坐标统一用"滚动容器内容坐标" (viewport top + scrollTop),
// 拖动中滚动列表时快照仍然有效。

/** 拖动开始时对每个列表项的快照。pitch = 本项到下一项 top 的距离 (含 margin)。 */
export interface SortSlot {
  readonly top: number;
  readonly pitch: number;
}

/** 指针位于 y 时,源项落下后的最终 index:越过多少个其它项的中线就排在多少位。 */
export function insertIndexFor(slots: readonly SortSlot[], srcIndex: number, y: number): number {
  let index = 0;
  slots.forEach((slot, i) => {
    if (i !== srcIndex && slot.top + slot.pitch / 2 < y) index += 1;
  });
  return index;
}

/** 预览中第 i 项需要让位的位移:源项和目标之间的项朝源项原位置挪一个源项高度。 */
export function siblingShift(
  i: number,
  srcIndex: number,
  toIndex: number,
  srcPitch: number,
): number {
  if (srcIndex < toIndex && i > srcIndex && i <= toIndex) return -srcPitch;
  if (toIndex < srcIndex && i >= toIndex && i < srcIndex) return srcPitch;
  return 0;
}

/** 源项从原位置到预览位置的位移 (松手后的落位动画终点)。 */
export function settleOffset(
  slots: readonly SortSlot[],
  srcIndex: number,
  toIndex: number,
): number {
  const lo = Math.min(srcIndex, toIndex);
  const hi = Math.max(srcIndex, toIndex);
  const between = slots.slice(srcIndex < toIndex ? lo + 1 : lo, srcIndex < toIndex ? hi + 1 : hi);
  const distance = between.reduce((sum, slot) => sum + slot.pitch, 0);
  return srcIndex <= toIndex ? distance : -distance;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.filter((_, i) => i !== from);
  next.splice(to, 0, items[from] as T);
  return next;
}
