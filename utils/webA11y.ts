// react-native-web's <Modal> sets aria-hidden + display:none on its
// container as soon as `visible` flips to false — if a TextInput inside it
// still has DOM focus at that instant (e.g. the user just hit Save/Cancel
// without the click first stealing focus), the browser blocks aria-hidden
// and logs an accessibility warning: assistive tech must never be told to
// ignore an element that still holds focus. Call this right before closing
// any Modal that contains a TextInput, so focus is already cleared by the
// time the container gets hidden.
export function blurActiveElement() {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}
