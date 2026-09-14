export const OPEN_PARTNER_MATERIAL_PICKER_EVENT = 'kodax-space.partner-material-picker.open';

/** Open Partner's authoritative project-material catalog from the composer. */
export function openPartnerMaterialPicker(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_PARTNER_MATERIAL_PICKER_EVENT));
}
