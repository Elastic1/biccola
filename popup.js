document.addEventListener('DOMContentLoaded', async () => {
  const progress = document.querySelector('.bc_progress')
  const btn = document.querySelector('.bc_download')
  const tabId = await new Promise(resolve => {
    chrome.tabs.query(
      { currentWindow: true, active: true },
      async function ([tab]) {
        resolve(tab.id)
      }
    )
  })
  await chrome.scripting
    .executeScript({
      target: { tabId },
      files: ["scripts/jszip.min.js", "scripts/content.js"],
    })

  chrome.runtime.onMessage.addListener(
    (message) => {
      switch (message.type) {
        case 'progress':
          progress.textContent = `${message.current}/${message.total}`
          break
        case 'download':
          progress.textContent = 'downloading...'
          chrome.downloads.download({ 
            url: message.zipUrl,
            filename: message.zipName,
          }, () => {
            btn.disabled = false
            progress.textContent = ''
            URL.revokeObjectURL(message.zipUrl)
          })
          break
        case 'error':
          btn.disabled = false
          progress.textContent = ''
          break
        default:
          break
      }
    });
  btn.addEventListener('click', () => {
    btn.disabled = true
    chrome.scripting
      .executeScript({
        target: { tabId },
        function: function () {
          downloadStart()
        }
      })
  })
})