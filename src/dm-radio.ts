customElements.define(
  'dm-status-radio',
  class extends HTMLElement {
    value: string = this.getAttribute('value') || ''

    constructor() {
      super()
      const root = this.attachShadow({ mode: 'open' })
      root.innerHTML = `
        <input type="radio" name="status" value="do" id="do" />
        <label for="do">do</label>
        <input type="radio" name="status" value="done" id="done" />
        <label for="done">done</label>
        <input type="radio" name="status" value="pause" id="pause" />
        <label for="pause">pause</label>
        `
      root
        .querySelectorAll<HTMLInputElement>('input[type=radio]')
        .forEach((v) => v.addEventListener('change', (ev) => this.change(ev)))
      console.debug('constructor', this.value)
    }

    connectedCallback() {
      console.debug('>>connected', this.value)
      this.value = this.getAttribute('value') || ''
      this.shadowRoot
        ?.querySelectorAll<HTMLInputElement>('input[type=radio]')
        .forEach((v) => {
          if (v.value === this.value) v.checked = true
        })
      console.debug('<<connected', this.value)
    }

    change(ev: Event) {
      console.log(this)
      const value = (ev.target as HTMLInputElement).value
      console.log('change', value, ev)
      this.setAttribute('value', value)
      this.value = value
      this.dispatchEvent(new Event('change'))
    }
  }
)
