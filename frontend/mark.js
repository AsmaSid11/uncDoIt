// pick which element to highlight
const naviId = 2 // change this number

// find it
const target = document.querySelector(`[data-navi-id="${naviId}"]`)
console.log('targeting:', target)

// create shadow host
const host = document.createElement('div')
document.body.appendChild(host)
const shadow = host.attachShadow({ mode: 'open' })

// get position
const pos = target.getBoundingClientRect()

// draw the ring
const ring = document.createElement('div')
ring.style.cssText = `
  position: fixed;
  top: ${pos.top}px;
  left: ${pos.left}px;
  width: ${pos.width}px;
  height: ${pos.height}px;
  border: 3px solid #FFD700;
  border-radius: 8px;
  pointer-events: none;
  z-index: 999999;
  box-shadow: 0 0 0 4px rgba(255, 215, 0, 0.3);
  animation: pulse 1.5s ease-in-out infinite;
`

// add pulse animation
const style = document.createElement('style')
style.textContent = `
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 4px rgba(255, 215, 0, 0.4); }
    50%  { box-shadow: 0 0 0 10px rgba(255, 215, 0, 0.1); }
    100% { box-shadow: 0 0 0 4px rgba(255, 215, 0, 0.4); }
  }
`

shadow.appendChild(style)
shadow.appendChild(ring)