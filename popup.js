document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startCapture');
  const stopButton = document.getElementById('stopCapture');
  const statusText = document.getElementById('status');
  const oscilloscopeCanvas = document.getElementById('oscilloscope');
  const oscilloscopeCtx = oscilloscopeCanvas.getContext('2d');
  const spectrogram3dCanvas = document.getElementById('spectrogram3d');
  const spectrogram3dCtx = spectrogram3dCanvas.getContext('2d');
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
  
  // Variáveis para o espectrograma 3D
  let barsArray = [];
  let barCount = 64;
  let angle = 0;
  
  // Configuração para o osciloscópio
  oscilloscopeCtx.strokeStyle = '#00ff00';
  oscilloscopeCtx.lineWidth = 2;
  oscilloscopeCtx.shadowBlur = 4;
  oscilloscopeCtx.shadowColor = '#00ff00';
  
  // Configuração para o espectrograma 3D
  // Inicializar o array de barras
  for (let i = 0; i < barCount; i++) {
    barsArray.push({
      value: 0,
      targetValue: 0
    });
  }
  
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
    const oscilloscopeData = new Float32Array(analyser.fftSize);
    
    isCapturing = true;
    
    if (!statusText.classList.contains('warning')) {
      statusText.textContent = 'Status: Analisando áudio...';
      statusText.className = 'status success';
    }
    
    // Função de atualização
    function updateVisualization() {
      if (!isCapturing) return;
      
      // Dados de frequência para visualizações
      analyser.getByteFrequencyData(frequencyData);
      
      // Dados temporais para osciloscópio
      analyser.getFloatTimeDomainData(oscilloscopeData);
      
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
      updateOscilloscope(oscilloscopeData);
      updateSpectrogram3D(frequencyData);
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
    
    // Limpar osciloscópio
    oscilloscopeCtx.clearRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
    
    // Limpar espectrograma 3D
    spectrogram3dCtx.clearRect(0, 0, spectrogram3dCanvas.width, spectrogram3dCanvas.height);
  }
  
  // Função para atualizar o osciloscópio
  function updateOscilloscope(audioData) {
    const canvasWidth = oscilloscopeCanvas.width;
    const canvasHeight = oscilloscopeCanvas.height;
    
    // Limpar canvas
    oscilloscopeCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Desenhar linha base (eixo X)
    oscilloscopeCtx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
    oscilloscopeCtx.lineWidth = 1;
    oscilloscopeCtx.beginPath();
    oscilloscopeCtx.moveTo(0, canvasHeight / 2);
    oscilloscopeCtx.lineTo(canvasWidth, canvasHeight / 2);
    oscilloscopeCtx.stroke();
    
    // Desenhar grades horizontais
    for (let i = 0; i < canvasHeight; i += 20) {
      oscilloscopeCtx.beginPath();
      oscilloscopeCtx.moveTo(0, i);
      oscilloscopeCtx.lineTo(canvasWidth, i);
      oscilloscopeCtx.strokeStyle = 'rgba(50, 50, 50, 0.2)';
      oscilloscopeCtx.stroke();
    }
    
    // Desenhar grades verticais
    for (let i = 0; i < canvasWidth; i += 20) {
      oscilloscopeCtx.beginPath();
      oscilloscopeCtx.moveTo(i, 0);
      oscilloscopeCtx.lineTo(i, canvasHeight);
      oscilloscopeCtx.strokeStyle = 'rgba(50, 50, 50, 0.2)';
      oscilloscopeCtx.stroke();
    }
    
    // Verificar se estamos no modo escuro
    const isDarkTheme = document.body.classList.contains('dark-theme');
    
    // Definir cor da onda com base no tema
    oscilloscopeCtx.strokeStyle = isDarkTheme ? '#a78bfa' : '#4285f4';
    oscilloscopeCtx.shadowColor = isDarkTheme ? '#8b5cf6' : '#3367d6';
    oscilloscopeCtx.lineWidth = 2;
    oscilloscopeCtx.shadowBlur = 5;
    
    // Desenhar a forma de onda
    oscilloscopeCtx.beginPath();
    
    const sliceWidth = canvasWidth / audioData.length;
    let x = 0;
    
    for (let i = 0; i < audioData.length; i++) {
      const v = audioData[i];
      const y = (v * canvasHeight / 2) + (canvasHeight / 2);
      
      if (i === 0) {
        oscilloscopeCtx.moveTo(x, y);
      } else {
        oscilloscopeCtx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    oscilloscopeCtx.stroke();
  }
  
  // Função para atualizar o espectrograma 3D
  function updateSpectrogram3D(frequencyData) {
    const canvasWidth = spectrogram3dCanvas.width;
    const canvasHeight = spectrogram3dCanvas.height;
    const barWidth = canvasWidth / barCount;
    const centerY = canvasHeight * 0.65;
    
    // Limpar canvas com um gradiente de fundo
    const isDarkTheme = document.body.classList.contains('dark-theme');
    const gradient = spectrogram3dCtx.createLinearGradient(0, 0, 0, canvasHeight);
    
    if (isDarkTheme) {
      gradient.addColorStop(0, '#0a1931');
      gradient.addColorStop(1, '#16213e');
    } else {
      gradient.addColorStop(0, '#e6f3ff');
      gradient.addColorStop(1, '#f8f9fa');
    }
    
    spectrogram3dCtx.fillStyle = gradient;
    spectrogram3dCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Atualizar valores alvo das barras
    for (let i = 0; i < barCount; i++) {
      const index = Math.floor(i * frequencyData.length / barCount);
      barsArray[i].targetValue = frequencyData[index] / 255;
      
      // Interpolação suave para animação
      barsArray[i].value += (barsArray[i].targetValue - barsArray[i].value) * 0.3;
    }
    
    // Animar a rotação
    angle += 0.01;
    
    // Desenhar barras em perspectiva
    for (let i = 0; i < barCount; i++) {
      const normalizedI = i / barCount;
      
      // Calcular coordenadas 3D
      const x3d = (normalizedI - 0.5) * 2;
      const y3d = barsArray[i].value * 0.8;
      const z3d = 0;
      
      // Aplicar rotação
      const rotatedX = x3d * Math.cos(angle) - z3d * Math.sin(angle);
      const rotatedZ = x3d * Math.sin(angle) + z3d * Math.cos(angle);
      
      // Projetar para 2D
      const scale = 1 / (rotatedZ + 3); // Distância da câmera
      const x2d = rotatedX * scale * canvasWidth * 0.4 + canvasWidth / 2;
      const height = y3d * canvasHeight * 0.6;
      
      // Calcular cor baseada no valor
      let hue = (240 - (normalizedI * 240)) % 360; // Azul a vermelho
      const saturation = 80 + barsArray[i].value * 20; // Mais saturado quando mais alto
      const lightness = 40 + barsArray[i].value * 20; // Mais claro quando mais alto
      
      // Desenhar barra
      spectrogram3dCtx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      
      // Desenhar uma barra em perspectiva (trapézio)
      spectrogram3dCtx.beginPath();
      const perspective = 0.5 + 0.5 * scale; // Efeito de perspectiva para a largura
      const barHeightTop = centerY - height;
      
      // Topo do trapézio (mais estreito)
      spectrogram3dCtx.moveTo(x2d - (barWidth * perspective / 2), barHeightTop);
      spectrogram3dCtx.lineTo(x2d + (barWidth * perspective / 2), barHeightTop);
      
      // Base do trapézio (mais largo)
      spectrogram3dCtx.lineTo(x2d + (barWidth / 2), centerY);
      spectrogram3dCtx.lineTo(x2d - (barWidth / 2), centerY);
      
      spectrogram3dCtx.closePath();
      spectrogram3dCtx.fill();
      
      // Adicionar brilho no topo
      const gradient = spectrogram3dCtx.createLinearGradient(x2d, barHeightTop, x2d, barHeightTop + 10);
      gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 30}%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
      
      spectrogram3dCtx.fillStyle = gradient;
      spectrogram3dCtx.fillRect(
        x2d - (barWidth * perspective / 2),
        barHeightTop,
        barWidth * perspective,
        10
      );
    }
    
    // Desenhar grade de referência
    spectrogram3dCtx.strokeStyle = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    spectrogram3dCtx.lineWidth = 1;
    
    // Linhas horizontais da grade
    for (let y = centerY; y > centerY - canvasHeight * 0.6; y -= 20) {
      spectrogram3dCtx.beginPath();
      
      // Desenhar linha com perspectiva
      const leftX = canvasWidth / 2 - canvasWidth * 0.4 * Math.cos(angle);
      const rightX = canvasWidth / 2 + canvasWidth * 0.4 * Math.cos(angle);
      
      spectrogram3dCtx.moveTo(leftX, y);
      spectrogram3dCtx.lineTo(rightX, y);
      spectrogram3dCtx.stroke();
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
  
  // Lidar com redimensionamento da janela
  window.addEventListener('resize', function() {
    // Ajustar tamanho do canvas se necessário
  });
});