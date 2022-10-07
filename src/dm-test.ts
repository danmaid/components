customElements.define(
  'dm-test',
  class extends HTMLElement {
    constructor() {
      super()

      const span = document.createElement('span')
      span.textContent = 'SPAN!!'

      this.attachShadow({ mode: 'open' })
      this.shadowRoot?.append(span)
    }
  }
)
