const interactive = document.querySelectorAll('button, input, select, textarea, a')

interactive.forEach((el, index) => {
  el.setAttribute('data-navi-id', index)
})

console.log(`Stamped ${interactive.length} elements`)