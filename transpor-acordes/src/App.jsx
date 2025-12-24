// src/App.jsx

import React, { useState, useRef, useEffect } from 'react';
import mammoth from 'mammoth';
import NumberInput from './NumberInput';
import ToggleSwitch from './ToggleSwitch';
import DragDropOverlay from './DragDropOverlay';
// Importamos a lógica local para usar APENAS se a API falhar
import { calcularSequenciaLocal, processarCifraCompleta } from './musicLogic';
import './App.css';

// URL da sua API no Render
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://1111transpor-acordes-react-api.onrender.com';

function App() {
  const [activeTab, setActiveTab] = useState('sequence');
  const [interval, setInterval] = useState(1.0);
  const [action, setAction] = useState('Aumentar');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Estados da Sequência
  const [sequenceText, setSequenceText] = useState('');
  const [sequenceResult, setSequenceResult] = useState(null);

  // Estados da Cifra
  const [cifraText, setCifraText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [transposedCifra, setTransposedCifra] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Indicador visual se estamos usando o modo offline (backup)
  const [usingOfflineMode, setUsingOfflineMode] = useState(false);

  const dragCounter = useRef(0);
  const fileStatusRef = useRef(null);

  useEffect(() => {
    if (selectedFile && fileStatusRef.current) {
      fileStatusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedFile]);

  // Função auxiliar para ler arquivos localmente (usada no Fallback)
  const lerArquivoLocal = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (file.name.endsWith('.docx')) {
            const arrayBuffer = e.target.result;
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            resolve(result.value);
          } else {
            resolve(e.target.result);
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      if (file.name.endsWith('.docx')) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  // --- 1. SEQUÊNCIA (HÍBRIDO) ---
  const handleSequenceTranspose = async () => {
    setIsLoading(true);
    setError('');
    setSequenceResult(null);
    setUsingOfflineMode(false); // Reseta o aviso

    const chords = sequenceText.trim().split(/\s+/).filter(c => c);
    if (chords.length === 0) {
      setError('Por favor, insira uma sequência de acordes.');
      setIsLoading(false);
      return;
    }

    try {
      // TENTA A API (PLAN A)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos max

      const response = await fetch(`${API_BASE_URL}/transpose-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chords, action, interval }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Falha na API');

      const data = await response.json();
      setSequenceResult(data);

    } catch (err) {
      // SE FALHAR, USA LOCAL (PLAN B)
      console.log("API indisponível ou lenta. Usando modo offline.", err);
      setUsingOfflineMode(true);

      const data = calcularSequenciaLocal(chords, action, interval);
      setSequenceResult(data);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 2. CIFRA COMPLETA E ARQUIVOS (HÍBRIDO) ---
  const handleCifraTranspose = async () => {
    setIsLoading(true);
    setError('');
    setTransposedCifra('');
    setUsingOfflineMode(false);

    // Validação básica
    if (!cifraText && !selectedFile) {
      setError('O texto ou arquivo está vazio.');
      setIsLoading(false);
      return;
    }

    try {
      // TENTA A API (PLAN A)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s para arquivos (pode demorar mais)

      let response;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', action);
        formData.append('interval', interval);

        response = await fetch(`${API_BASE_URL}/transpose-file`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
      } else {
        response = await fetch(`${API_BASE_URL}/transpose-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cifra_text: cifraText, action, interval }),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Falha na API');
      const data = await response.json();
      setTransposedCifra(data.transposed_cifra);

    } catch (err) {
      // SE FALHAR, USA LOCAL (PLAN B)
      console.log("API falhou. Ativando processamento local de arquivo/texto.", err);
      setUsingOfflineMode(true);

      try {
        let textToProcess = cifraText;

        // Se for arquivo, precisamos ler ele localmente agora
        if (selectedFile) {
          textToProcess = await lerArquivoLocal(selectedFile);
        }

        if (!textToProcess || !textToProcess.trim()) {
          throw new Error("Conteúdo vazio para processamento offline.");
        }

        const resultado = processarCifraCompleta(textToProcess, action, interval);
        setTransposedCifra(resultado);

      } catch (localErr) {
        console.error(localErr);
        setError("Erro fatal: API indisponível e falha ao processar localmente.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(transposedCifra);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([transposedCifra], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cifra_transposta.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearCifra = () => {
    setCifraText('');
    setSelectedFile(null);
    setTransposedCifra('');
    setError('');
    setUsingOfflineMode(false);
    if (document.getElementById('file-upload')) {
      document.getElementById('file-upload').value = null;
    }
  };

  // Drag and Drop Logic
  const handleDragEnter = (e) => {
    e.preventDefault(); e.stopPropagation(); dragCounter.current++;
    if (activeTab === 'cifra') setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault(); e.stopPropagation(); dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0;
    if (activeTab === 'cifra') {
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.txt') || file.name.endsWith('.docx'))) {
        setSelectedFile(file);
        setCifraText('');
      } else {
        setError('Por favor, solte apenas arquivos .txt ou .docx');
      }
    }
  };

  const actionOptions = [
    { label: 'Aumentar', value: 'Aumentar' },
    { label: 'Diminuir', value: 'Diminuir' }
  ];

  return (
    <div className="App" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {isDragging && <DragDropOverlay />}

      <h1>🎵 Transpositor Universal de Acordes</h1>

      <div className="controls">
        <h2>1. Escolha a Transposição</h2>
        <div className="controls-grid">
          <div className="action-control">
            <label>Ação</label>
            <ToggleSwitch options={actionOptions} selectedValue={action} onChange={setAction} />
          </div>
          <div className="interval-control">
            <label>Intervalo (em tons)</label>
            <NumberInput value={interval} onChange={setInterval} step={0.5} min={0.5} />
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-button ${activeTab === 'sequence' ? 'active' : ''}`} onClick={() => setActiveTab('sequence')}>
          Transpor Sequência
        </button>
        <button className={`tab-button ${activeTab === 'cifra' ? 'active' : ''}`} onClick={() => setActiveTab('cifra')}>
          Transpor Cifra Completa
        </button>
      </div>

      {activeTab === 'sequence' && (
        <div className="input-area">
          <h2>2. Insira a Sequência de Acordes</h2>
          <p className="tab-description">Use esta aba para transpor uma lista simples de acordes separados por espaço.</p>
          <input
            type="text"
            className="sequence-input"
            placeholder="Ex: G D/F# Em C"
            value={sequenceText}
            onChange={(e) => setSequenceText(e.target.value)}
          />
          <button className="main-button" style={{ marginTop: '15px' }} onClick={handleSequenceTranspose} disabled={isLoading}>
            {isLoading ? 'Processando...' : 'Transpor Sequência!'}
          </button>

          {/* AVISO DE MODO OFFLINE */}
          {usingOfflineMode && sequenceResult && (
            <p style={{ fontSize: '0.9em', color: '#ffd700', textAlign: 'center', marginTop: '10px', backgroundColor: 'rgba(255, 215, 0, 0.1)', padding: '5px', borderRadius: '4px', border: '1px solid #ffd700' }}>
              ⚠️ API Render indisponível. Cálculo realizado offline.
            </p>
          )}

          {sequenceResult && (
            <div className="result-area">
              <h2>🎸 Resultado da Sequência</h2>
              <div className="sequence-results-grid">
                {sequenceResult.original_chords.map((original, index) => (
                  <div key={index} className="chord-card">
                    <div className="original">{original}</div>
                    <div className="transposed">{sequenceResult.transposed_chords[index]}</div>
                  </div>
                ))}
              </div>
              <div className="copy-block">
                Originais:   {sequenceResult.original_chords.join(' ')}<br />
                Transpostos: {sequenceResult.transposed_chords.join(' ')}
              </div>
              {sequenceResult.explanations.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <h4>ℹ️ Informações Adicionais</h4>
                  {sequenceResult.explanations.map((exp, i) => <p key={i} className="explanation-text">{exp}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cifra' && (
        <>
          <div className="input-area">
            <h2>2. Insira a Cifra</h2>
            <p className="tab-description">Cole o texto abaixo OU arraste e solte um arquivo em qualquer lugar da tela.</p>
            <textarea
              className="cifra-textarea"
              placeholder="Ex:&#10;D G A&#10;Minha canção..."
              value={cifraText}
              onChange={(e) => {
                setCifraText(e.target.value);
                if (selectedFile) {
                  setSelectedFile(null);
                  if (document.getElementById('file-upload')) document.getElementById('file-upload').value = null;
                }
              }}
            />
            <div className="file-input-wrapper">
              <label htmlFor="file-upload" className="file-input-label">
                Ou Selecione um Arquivo (.txt, .docx)
              </label>
              <input id="file-upload" type="file" onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  if (file.name.endsWith('.txt') || file.name.endsWith('.docx')) {
                    setSelectedFile(file);
                    setCifraText('');
                    setError('');
                  } else {
                    setError('Formato inválido. Use .txt ou .docx');
                  }
                }
              }} accept=".txt,.docx" />
              {selectedFile &&
                <p ref={fileStatusRef} className="file-selected-feedback">
                  Arquivo selecionado: {selectedFile.name}
                </p>
              }
            </div>
          </div>

          <button className="main-button" onClick={handleCifraTranspose} disabled={isLoading || (!cifraText && !selectedFile)}>
            {isLoading ? 'Processando...' : 'Transpor Cifra!'}
          </button>

          {/* AVISO DE MODO OFFLINE NA CIFRA */}
          {usingOfflineMode && transposedCifra && (
            <p style={{ fontSize: '0.9em', color: '#ffd700', textAlign: 'center', marginTop: '10px', backgroundColor: 'rgba(255, 215, 0, 0.1)', padding: '5px', borderRadius: '4px', border: '1px solid #ffd700' }}>
              ⚠️ API Render indisponível. Arquivo processado localmente.
            </p>
          )}

          {transposedCifra && (
            <div className="result-area">
              <h2>🎸 Cifra Transposta</h2>
              <pre>{transposedCifra}</pre>
              <div className="result-actions">
                <button onClick={handleCopy}>{isCopied ? 'Copiado!' : 'Copiar'}</button>
                <button onClick={handleDownload}>Baixar (.txt)</button>
                <button onClick={handleClearCifra}>Limpar</button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p style={{ color: '#ff4b4b', textAlign: 'center', marginTop: '15px' }}>{error}</p>}

      <footer className="app-footer">
        <p>Desenvolvido para a Glória de Deus.<br />Copyright &copy; Rafael Panfil</p>
      </footer>
    </div>
  );
}

export default App;