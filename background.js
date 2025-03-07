// Apenas registrar que o background está ativo
console.log('Audio Visualizer background script iniciado');

// Ouvir mensagens, mas não fazer muito
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('Mensagem recebida no background:', message);
  return true;
});