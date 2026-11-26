import '@testing-library/jest-dom'

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver || ResizeObserverMock

// Mock document.createRange and Range methods for CodeMirror
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => {},
})

if (!document.createRange) {
  document.createRange = () => new Range()
}

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = () => {}

// Mock window.confirm
window.confirm = () => true

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: () => Promise.resolve(),
  },
})



