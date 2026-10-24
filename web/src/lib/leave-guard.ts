// One flag for "there are unsaved edits on screen", so every way out of a page
// (the tab bar, the sidebar, the month strip) can ask before throwing them away.
let unsaved = false;

export function setUnsaved(value: boolean): void {
  unsaved = value;
}

/** True when it's fine to leave: nothing unsaved, or the person said so. */
export function confirmLeave(): boolean {
  return !unsaved || window.confirm("Leave without saving your changes?");
}
