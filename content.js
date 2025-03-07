// Este script é injetado em páginas da web
// Podemos usá-lo para comunicação com os elementos da página se necessário
console.log('Audio Visualizer content script inicializado');

// Podemos adicionar comunicação entre a página e a extensão aqui, se necessário
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'contentScriptAction') {
    // Realizar alguma ação na página
    sendResponse({ result: 'Ação realizada com sucesso' });
  }
});
