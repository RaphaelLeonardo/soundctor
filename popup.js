document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startCapture');
  const stopButton = document.getElementById('stopCapture');
  const statusText = document.getElementById('status');
  const spectrogramCanvas = document.getElementById('spectrogram');
  const spectrogramCtx = spectrogramCanvas.getContext('2d');
  const leftMeter = document.getElementById('leftMeter');
  const rightMeter = document.getElementById('rightMeter');
  const leftValue = document.getElementById('leftValue');
  const rightValue = document.getElementById('rightValue');
  
  // Variáveis para o áudio
  let audioContext = null;
  let mediaStreamSource = null;
  let analyser = null;
  let splitter = null;
  let analyserLeft = null;
  let analyserRight = null;
  let isCapturing = false;
  let animationFrameId = null;
  
  // Configuração do espectrograma
  let spectrogramData = [];
  const spectrogramWidth = spectrogramCanvas.width;
  const spectrogramHeight = spectrogramCanvas.height;
  
  // Limpar o canvas inicialmente
  spectrogramCtx.fillStyle = 'black';
  spectrogramCtx.fillRect(0, 0, spectrogramWidth, spectrogramHeight);
  
  // Função para iniciar a captura
  startButton.addEventListener('click', function() {
    startButton.disabled = true;
    stopButton.disabled = false;
    statusText.textContent = 'Status: Tentando capturar...';
    
    // Solicitar captura diretamente aqui
    startAudioCapture();
  });
  
  // Função para parar a captura
  stopButton.addEventListener('click', function() {
    stopAudioCapture();
    startButton.disabled = false;
    stopButton.disabled = true;
    statusText.textContent = 'Status: Captura interrompida';
  });
  
  // Função para capturar áudio
  async function startAudioCapture() {
    try {
      // Usar chrome.tabCapture - verificar se está disponível
      if (!chrome.tabCapture || typeof chrome.tabCapture.capture !== 'function') {
        throw new Error('A API tabCapture não está disponível. Verifique se você está usando uma versão compatível do Chrome.');
      }
      
      // Função helper para transformar callback em Promise
      function captureTab() {
        return new Promise((resolve, reject) => {
          chrome.tabCapture.capture({
            audio: true,
            video: false
          }, (stream) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!stream) {
              reject(new Error('Não foi possível capturar o áudio da aba. Tente abrir a extensão em uma nova aba.'));
            } else {
              resolve(stream);
            }
          });
        });
      }
      
      const stream = await captureTab();
      
      // Se chegou aqui, conseguiu capturar o stream
      statusText.textContent = 'Status: Áudio capturado com sucesso!';
      
      // Inicializar contexto de áudio
      audioContext = new AudioContext();
      mediaStreamSource = audioContext.createMediaStreamSource(stream);
      
      // Configurar analisadores
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      
      // Setup para áudio estéreo
      splitter = audioContext.createChannelSplitter(2);
      analyserLeft = audioContext.createAnalyser();
      analyserRight = audioContext.createAnalyser();
      
      analyserLeft.fftSize = 1024;
      analyserRight.fftSize = 1024;
      analyserLeft.smoothingTimeConstant = 0.3;
      analyserRight.smoothingTimeConstant = 0.3;
      
      // Conectar nós de áudio
      mediaStreamSource.connect(analyser);
      mediaStreamSource.connect(splitter);
      splitter.connect(analyserLeft, 0);
      splitter.connect(analyserRight, 1);
      
      // Arrays para dados
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const timeDataLeft = new Float32Array(analyserLeft.fftSize);
      const timeDataRight = new Float32Array(analyserRight.fftSize);
      
      isCapturing = true;
      statusText.textContent = 'Status: Analisando áudio...';
      
      // Função de atualização
      function updateVisualization() {
        if (!isCapturing) return;
        
        // Dados de frequência para espectrograma
        analyser.getByteFrequencyData(frequencyData);
        
        // Dados temporais para VU meters
        analyserLeft.getFloatTimeDomainData(timeDataLeft);
        analyserRight.getFloatTimeDomainData(timeDataRight);
        
        // Calcular RMS para cada canal
        let sumLeft = 0;
        let sumRight = 0;
        
        for (let i = 0; i < timeDataLeft.length; i++) {
          sumLeft += timeDataLeft[i] * timeDataLeft[i];
        }
        
        for (let i = 0; i < timeDataRight.length; i++) {
          sumRight += timeDataRight[i] * timeDataRight[i];
        }
        
        const rmsLeft = Math.sqrt(sumLeft / timeDataLeft.length);
        const rmsRight = Math.sqrt(sumRight / timeDataRight.length);
        
        // Atualizar visualizações
        updateSpectrogram(frequencyData);
        updateVUMeters(rmsLeft, rmsRight);
        
        // Continuar loop
        animationFrameId = requestAnimationFrame(updateVisualization);
      }
      
      // Iniciar loop de visualização
      updateVisualization();
      
    } catch (error) {
      console.error('Erro ao capturar áudio:', error);
      statusText.textContent = 'Status: Erro ao capturar - ' + error.message;
      startButton.disabled = false;
      stopButton.disabled = true;
    }
  }
  
  // Função para parar a captura de áudio
  function stopAudioCapture() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    if (mediaStreamSource && mediaStreamSource.mediaStream) {
      const tracks = mediaStreamSource.mediaStream.getTracks();
      tracks.forEach(track => track.stop());
    }
    
    if (audioContext) {
      audioContext.close().catch(console.error);
    }
    
    mediaStreamSource = null;
    analyser = null;
    splitter = null;
    analyserLeft = null;
    analyserRight = null;
    audioContext = null;
    isCapturing = false;
  }
  
  // Função para atualizar o espectrograma
  function updateSpectrogram(frequencyData) {
    // Deslocar os dados existentes para a esquerda
    spectrogramCtx.drawImage(spectrogramCanvas, 
      1, 0, spectrogramWidth - 1, spectrogramHeight, 
      0, 0, spectrogramWidth - 1, spectrogramHeight);
    
    // Adicionar nova coluna de dados
    const barHeight = spectrogramHeight / frequencyData.length;
    
    for (let i = 0; i < frequencyData.length; i++) {
      // Converter valor de frequência para cor
      const value = frequencyData[i];
      const intensity = value / 255;
      
      // Paleta de cores: azul -> ciano -> verde -> amarelo -> vermelho
      let r, g, b;
      
      if (intensity < 0.25) {
        r = 0;
        g = 0;
        b = Math.floor(255 * (intensity * 4));
      } else if (intensity < 0.5) {
        r = 0;
        g = Math.floor(255 * ((intensity - 0.25) * 4));
        b = 255;
      } else if (intensity < 0.75) {
        r = Math.floor(255 * ((intensity - 0.5) * 4));
        g = 255;
        b = Math.floor(255 * (1 - ((intensity - 0.5) * 4)));
      } else {
        r = 255;
        g = Math.floor(255 * (1 - ((intensity - 0.75) * 4)));
        b = 0;
      }
      
      // Desenhar pixel
      spectrogramCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      spectrogramCtx.fillRect(
        spectrogramWidth - 1,
        spectrogramHeight - (i + 1) * barHeight,
        1,
        barHeight
      );
    }
  }
  
  // Função para atualizar os VU meters
  function updateVUMeters(volumeLeft, volumeRight) {
    // Converter para escala de decibéis
    const dbLeft = volumeLeft > 0 ? 20 * Math.log10(volumeLeft) : -100;
    const dbRight = volumeRight > 0 ? 20 * Math.log10(volumeRight) : -100;
    
    // Escala de visualização (-60dB a 0dB)
    const minDB = -60;
    const maxDB = 0;
    
    // Calcular percentuais para os medidores
    const percentLeft = 100 * Math.max(0, (dbLeft - minDB) / (maxDB - minDB));
    const percentRight = 100 * Math.max(0, (dbRight - minDB) / (maxDB - minDB));
    
    // Atualizar barras
    leftMeter.style.width = percentLeft + '%';
    rightMeter.style.width = percentRight + '%';
    
    // Atualizar valores de texto
    leftValue.textContent = dbLeft > -100 ? dbLeft.toFixed(1) + ' dB' : '-∞ dB';
    rightValue.textContent = dbRight > -100 ? dbRight.toFixed(1) + ' dB' : '-∞ dB';
  }
});