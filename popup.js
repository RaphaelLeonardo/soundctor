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
  const themeToggle = document.getElementById('themeToggle');
  
  // Configurar o alternador de tema
  // Verificar se há uma preferência de tema salva
  const savedTheme = localStorage.getItem('theme');
  
  // Se houver uma preferência salva, aplicá-la
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.checked = true;
  } else if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    themeToggle.checked = false;
  } else {
    // Se não houver preferência, verificar preferência do sistema
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDarkScheme) {
      document.body.classList.add('dark-theme');
      themeToggle.checked = true;
    }
  }
  
  // Adicionar evento ao alternador de tema
  themeToggle.addEventListener('change', function() {
    if (this.checked) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  });
  
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
  
  // Reiniciar o estado para garantir que comecemos corretamente
  statusText.textContent = 'Status: Pronto para capturar';
  statusText.className = 'status'; // Remover classes de estado
  document.body.classList.remove('capturing');
  startButton.disabled = false;
  stopButton.disabled = true;
  
  // Função para iniciar a captura
  startButton.addEventListener('click', function() {
    startButton.disabled = true;
    stopButton.disabled = false;
    statusText.textContent = 'Status: Tentando capturar...';
    statusText.className = 'status';
    
    // Solicitar captura
    startAudioCapture();
  });
  
  // Função para parar a captura
  stopButton.addEventListener('click', function() {
    stopAudioCapture();
    startButton.disabled = false;
    stopButton.disabled = true;
    statusText.textContent = 'Status: Captura interrompida';
    statusText.className = 'status';
    document.body.classList.remove('capturing');
  });
  
  // Função para capturar áudio
  async function startAudioCapture() {
    try {
      // Abordagem direta: usar getDisplayMedia para compartilhar tab/sistema
      statusText.textContent = 'Status: Solicitando compartilhamento de áudio...';
      statusText.className = 'status';
      
      // Usar o navigator.mediaDevices.getDisplayMedia para capturar áudio do sistema
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        audio: true,
        video: true  // getDisplayMedia requer video: true para funcionar
      });
      
      // Desativar e remover as faixas de vídeo - não precisamos delas
      stream.getVideoTracks().forEach(track => {
        track.enabled = false;
        track.stop();
        stream.removeTrack(track);
      });
      
      // Verificar se temos faixas de áudio
      if (stream.getAudioTracks().length === 0) {
        throw new Error('Nenhuma faixa de áudio disponível no stream capturado');
      }
      
      // Processar o stream capturado
      processAudioStream(stream);
      
    } catch (error) {
      console.error('Erro ao capturar áudio:', error);
      
      // Tentar um fallback para o microfone
      try {
        statusText.textContent = 'Status: Tentando usar microfone como fallback...';
        statusText.className = 'status';
        
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        statusText.textContent = 'Status: Usando microfone (não é o áudio do sistema)';
        statusText.className = 'status warning';
        
        processAudioStream(micStream);
      } catch (micError) {
        console.error('Erro ao usar microfone:', micError);
        statusText.textContent = 'Status: Erro ao capturar - ' + error.message;
        statusText.className = 'status error';
        startButton.disabled = false;
        stopButton.disabled = true;
      }
    }
  }
  
  // Processar stream de áudio capturado
  function processAudioStream(stream) {
    // Se chegou aqui, conseguiu capturar o stream
    if (!statusText.classList.contains('warning')) {
      statusText.textContent = 'Status: Áudio capturado com sucesso!';
      statusText.className = 'status success';
    }
    
    // Adicionar classe de captura ao body para efeitos visuais
    document.body.classList.add('capturing');
    
    // Inicializar contexto de áudio
    audioContext = new AudioContext();
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    mediaStreamSource.connect(audioContext.destination);
    
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
    
    if (!statusText.classList.contains('warning')) {
      statusText.textContent = 'Status: Analisando áudio...';
      statusText.className = 'status success';
    }
    
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
    
    // Resetar estado visual
    statusText.className = 'status';
    document.body.classList.remove('capturing');
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