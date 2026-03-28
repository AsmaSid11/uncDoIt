// Only grab elements that a user can actually interact with
const elements = document.querySelectorAll('button, a, input[type="submit"]');

let cleanContext = [];
elements.forEach(el => {
    // Get the visible text or screen-reader label
    let text = el.innerText || el.ariaLabel; 

    // Ignore empty buttons, invisible elements, or generic junk like "Menu"
    if (text && text.length > 2 && el.offsetParent !== null) {
        cleanContext.push({ tag: el.tagName, id: el.id, text: text.trim() });
    }
});
// Send ONLY this tiny array to the LLM