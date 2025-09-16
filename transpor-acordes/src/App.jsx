import React, { useState } from 'react';
import NumberInput from './NumberInput';
import ToggleSwitch from './ToggleSwitch';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function App() {
  const [activeTab, setActiveTab] = useState('sequence');
  const [interval, setInterval] = useState(1.0);
  const [action, setAction] = useState('Aumentar');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sequenceText, setSequenceText] = useState('');
  const [sequenceResult, setSequenceResult] = useState(null);
  const [cifraText, setCifraText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [transposedCifra, setTransposedCifra] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const handleSequenceTranspose = async () => {
    setIsLoading(true);
    setError('');
    setSequenceResult(null);

    const chords = sequenceText.trim().split(/\s+/).filter(c => c);
    if (chords.length === 0) {
      setError('Por favor, insira uma sequência de acordes.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/transpose-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chords, action, interval }),
      });
      if (!response.ok) throw new Error('Falha na API de sequência');
      const data = await response.json();
      setSequenceResult(data);
    } catch (err) {
      setError('Falha ao se comunicar com a API. Verifique se o back-end Python está rodando.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCifraTranspose = async () => {
    setIsLoading(true);
    setError('');
    setTransposedCifra('');

    try {
      let response;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('action', action);
        formData.append('interval', interval);
        response = await fetch(`${API_BASE_URL}/transpose-file`, {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch(`${API_BASE_URL}/transpose-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cifra_text: cifraText, action, interval }),
        });
      }
      if (!response.ok) throw new Error('A resposta da API não foi bem-sucedida.');
      const data = await response.json();
      setTransposedCifra(data.transposed_cifra);
    } catch (err) {
      setError('Falha ao se comunicar com a API. Verifique se o back-end Python está rodando.');
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
    if (document.getElementById('file-upload')) {
      document.getElementById('file-upload').value = null;
    }
  };

  const actionOptions = [
    { label: 'Aumentar', value: 'Aumentar' },
    { label: 'Diminuir', value: 'Diminuir' }
  ];

  return (
    <div className="App">
      <h1>🎵 Transpositor Universal de Acordes</h1>

      <div className="controls">
        <h2>1. Escolha a Transposição</h2>
        <div className="controls-grid">
          {/* DIV COM A CLASSE CORRIGIDA */}
          <div className="action-control">
            <label>Ação</label>
            <ToggleSwitch
              options={actionOptions}
              selectedValue={action}
              onChange={setAction}
            />
          </div>
          <div className="interval-control">
            <label>Intervalo (em tons)</label>
            <NumberInput
              value={interval}
              onChange={setInterval}
              step={0.5}
              min={0.5}
            />
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
            {isLoading ? 'Transpondo...' : 'Transpor Sequência!'}
          </button>

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
                Originais:   {sequenceResult.original_chords.join(' ')}
                <br />
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
            <p className="tab-description">Cole o texto abaixo OU envie um arquivo.</p>
            <textarea
              className="cifra-textarea"
              placeholder="Ex:&#10;D G A&#10;Minha canção..."
              value={cifraText}
              onChange={(e) => {
                setCifraText(e.target.value);
                if (selectedFile) {
                  setSelectedFile(null);
                  if (document.getElementById('file-upload')) {
                    document.getElementById('file-upload').value = null;
                  }
                }
              }}
            />
            <div className="file-input-wrapper">
              <label htmlFor="file-upload" className="file-input-label">
                Selecionar Arquivo (.txt, .docx)
              </label>
              <input id="file-upload" type="file" onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  setSelectedFile(file);
                  setCifraText('');
                }
              }} accept=".txt,.docx" />
              {selectedFile && <p>Arquivo selecionado: {selectedFile.name}</p>}
            </div>
          </div>

          <button className="main-button" onClick={handleCifraTranspose} disabled={isLoading || (!cifraText && !selectedFile)}>
            {isLoading ? 'Transpondo...' : 'Transpor Cifra!'}
          </button>

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
    </div>
  );
}

export default App;