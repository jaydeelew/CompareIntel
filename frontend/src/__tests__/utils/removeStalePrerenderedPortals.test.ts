import { afterEach, describe, expect, it } from 'vitest'

import { removeStalePrerenderedPortals } from '../../utils/removeStalePrerenderedPortals'

describe('removeStalePrerenderedPortals', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('removes a prerendered welcome modal sitting next to #root', () => {
    document.body.innerHTML = `
      <div id="root"><h1>App</h1></div>
      <div class="tutorial-welcome-backdrop"><button>Skip for Now</button></div>
    `

    expect(removeStalePrerenderedPortals()).toBe(1)
    expect(document.querySelector('.tutorial-welcome-backdrop')).toBeNull()
    expect(document.getElementById('root')?.textContent).toBe('App')
  })

  it('leaves markup inside #root alone', () => {
    document.body.innerHTML = `
      <div id="root"><div class="tutorial-welcome-backdrop"></div></div>
    `

    expect(removeStalePrerenderedPortals()).toBe(0)
    expect(document.querySelectorAll('.tutorial-welcome-backdrop')).toHaveLength(1)
  })

  it('is a no-op on clean HTML', () => {
    document.body.innerHTML = '<div id="root"></div><script></script>'

    expect(removeStalePrerenderedPortals()).toBe(0)
    expect(document.body.children).toHaveLength(2)
  })
})
