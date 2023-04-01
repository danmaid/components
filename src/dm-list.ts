class DmList<T = unknown> extends HTMLElement {
  items: T[] = []

  constructor() {
    super()
    this.addEventListener('added', () => this.onadded())
    this.addEventListener('updated', () => this.onupdated())
    this.addEventListener('removed', () => this.onremoved())
  }

  onadded() {}
  onupdated() {}
  onremoved() {}

  addItem(item: T) {
    type Event = { after: T }
    const detail = { after: item }
    this.dispatchEvent(new CustomEvent<Event>('added', { detail }))
  }
  updateItem(fn: (item: T) => boolean, item: T) {
    const before = this.items.find(fn)
    if (!before) return
    type Event = { before: T; after: T }
    const detail = { before, after: item }
    this.dispatchEvent(new CustomEvent<Event>('updated', { detail }))
  }
  removeItem(fn: (item: T) => boolean) {
    const before = this.items.find(fn)
    if (!before) return
    type Event = { before: T }
    const detail = { before }
    this.dispatchEvent(new CustomEvent<Event>('removed', { detail }))
  }
}

customElements.define('dm-list', DmList)
