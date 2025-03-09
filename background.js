// Inicializar o script de background
console.log('Audio Visualizer background script iniciado');

// Variável para armazenar o ID da janela popup
let popupWindowId = null;

// Variável para armazenar o stream de áudio capturado
let capturedStream = null;

// Abrir a página do visualizador em uma janela flutuante quando o ícone da extensão for clicado
chrome.action.onClicked.addListener(async (tab) => {
  // Verificar se já existe uma janela aberta
  if (popupWindowId !== null) {
    try {
      // Tentar focar na janela existente
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch (e) {
      // Janela não existe mais, resetar o ID
      popupWindowId = null;
    }
  }

  // Criar a janela popup diretamente - com tamanho maior para melhor experiência
  const popupWindow = await chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 650,
    height: 700,
    focused: true
  });
  
  popupWindowId = popupWindow.id;
  
  // Monitorar quando a janela é fechada para resetar o ID e parar a captura
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === popupWindowId) {
      popupWindowId = null;
      
      // Parar qualquer captura ativa
      if (capturedStream) {
        capturedStream.getTracks().forEach(track => track.stop());
        capturedStream = null;
      }
    }
  });
});

// Ouvir mensagens
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('Mensagem recebida no background:', message);
  
  // Responder a solicitações de captura de áudio
  if (message.action === 'captureTab') {
    // Capturar áudio da aba atual
    chrome.tabCapture.capture({
      audio: true,
      video: false
    }, (stream) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else if (!stream) {
        sendResponse({ error: 'Não foi possível capturar o áudio da aba.' });
      } else {
        // Armazenar stream
        capturedStream = stream;
        
        // Criar MediaStream com a mesma faixa de áudio
        const audioTrack = stream.getAudioTracks()[0];
        
        if (audioTrack) {
          // Indicar sucesso
          sendResponse({ success: true });
        } else {
          sendResponse({ error: 'Nenhuma faixa de áudio disponível.' });
        }
      }
    });
    return true; // Indica que a resposta será assíncrona
  }
  
  return true;
});