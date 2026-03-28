function extractNaviElements() {
    const interactive = document.querySelectorAll('button, input, select, textarea, a')
    const elements = []
  
    interactive.forEach((el, index) => {
      el.setAttribute('data-navi-id', index)
  
      function getNearestContext(element) {
        let node = element.parentElement
        while (node && node !== document.body) {
          const heading = node.querySelector('h1, h2, h3, h4, label, legend')
          if (heading && heading.innerText.trim()) {
            return heading.innerText.trim().slice(0, 60)
          }
          node = node.parentElement
        }
        return ""
      }
  
      const entry = {
        navi_id: index,
        tag: el.tagName,
        id: el.id || "",
        text: el.innerText?.trim() || el.placeholder || el.value || "",
        context: getNearestContext(el)
      }
  
      if (entry.text || entry.id) elements.push(entry)
    })
  
    const pageContext = {
      title: document.title || "",
      url: window.location.href,
      path: window.location.pathname,
      pageText: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 2000)
    }
  
    return { elements, pageContext }
  }
  
  // --- test ---


  
  const result = extractNaviElements()
  console.log("PAGE CONTEXT:", JSON.stringify(result.pageContext, null, 2))
  console.log("ELEMENTS:", JSON.stringify(result.elements, null, 2))