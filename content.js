// Este script é injetado em páginas da web
console.log('Audio Visualizer content script inicializado');

// Comunicação entre a página e a extensão
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Responder a verificações de permissão
  if (message.action === 'checkPermission') {
    sendResponse({ success: true });
  }
  
  // Qualquer outra ação que precisarmos realizar na página
  if (message.action === 'contentScriptAction') {
    // Realizar alguma ação na página
    sendResponse({ result: 'Ação realizada com sucesso' });
  }
  
  return true; // Indica que a resposta pode ser assíncrona
});