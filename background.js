// Service worker — proxies Google autocomplete requests to bypass CSP on the extension page.
// The newtab page cannot fetch external URLs due to MV3 CSP; the background worker has no such restriction.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'SUGGEST') return false;

  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(message.query)}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      const suggestions = (data[1] || []).slice(0, 7);
      sendResponse({ ok: true, suggestions });
    })
    .catch(() => sendResponse({ ok: false, suggestions: [] }));

  // Return true to keep the message channel open for the async sendResponse
  return true;
});
