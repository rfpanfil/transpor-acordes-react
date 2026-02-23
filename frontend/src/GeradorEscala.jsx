// src/GeradorEscala.jsx
import React, { useState, useEffect } from 'react';
import { gerarEscalas } from './scaleLogic';
import html2canvas from 'html2canvas';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function GeradorEscala() {
  const [equipa, setEquipa] = useState([]);
  const [catalogoVagas, setCatalogoVagas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const dataAtual = new Date();
  const [mes, setMes] = useState(dataAtual.getMonth());
  const [ano, setAno] = useState(dataAtual.getFullYear());
  const [diaSemanaAlvo, setDiaSemanaAlvo] = useState(0); 
  const [datasEscala, setDatasEscala] = useState([]);

  const [incluirCriancas, setIncluirCriancas] = useState(false);
  const [vagasPorDia, setVagasPorDia] = useState({});
  const [indisponibilidades, setIndisponibilidades] = useState({});
  const [regras, setRegras] = useState([]);
  
  const [regraMembro1, setRegraMembro1] = useState('');
  const [regraTipo, setRegraTipo] = useState('tocar_com'); 
  const [regraAlvo, setRegraAlvo] = useState('');
  const [regraAlvoData, setRegraAlvoData] = useState('');
  const [regraError, setRegraError] = useState('');

  const [escalasGeradas, setEscalasGeradas] = useState([]);
  const [escalaAtualIndex, setEscalaAtualIndex] = useState(0);
  const [isGerando, setIsGerando] = useState(false);
  const [swapMessage, setSwapMessage] = useState('');

  const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const diasSemanaNomes = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/equipe`).then(res => res.json()),
      fetch(`${API_BASE_URL}/funcoes`).then(res => res.json())
    ]).then(([equipeData, funcoesData]) => {
      if (equipeData.equipe) setEquipa(equipeData.equipe);
      if (funcoesData.funcoes) {
        
        // 1. Cria o catálogo base a partir do banco (1:1)
        let catalogo = funcoesData.funcoes.map(f => ({
          id: f.id.toString(),
          label: f.nome,
          aceita: [f.nome] 
        }));

        // 2. Remove a "Voz" genérica para não aparecer no Dropdown
        catalogo = catalogo.filter(c => c.label !== 'Voz');

        // 3. Injeta Voz 1 até Voz 5 mapeadas para a função "Voz" do banco
        for (let i = 1; i <= 5; i++) {
          catalogo.push({
            id: `voz_hardcoded_${i}`,
            label: `Voz ${i}`,
            aceita: ['Voz'] // Aceita quem tem a função "Voz" (ID 12)
          });
        }

        setCatalogoVagas(catalogo);
      }
      setIsLoading(false);
    }).catch(err => { console.error(err); setIsLoading(false); });
  }, []);

  const formatDataKey = (d) => `${d.getDate()}-${d.getMonth()}-${d.getFullYear()}`;
  const formatDataDDMM = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    if (catalogoVagas.length === 0) return;

    const diasEncontrados = [];
    const dataIteracao = new Date(ano, mes, 1);
    while (dataIteracao.getMonth() === parseInt(mes)) {
      if (dataIteracao.getDay() === parseInt(diaSemanaAlvo)) diasEncontrados.push(new Date(dataIteracao));
      dataIteracao.setDate(dataIteracao.getDate() + 1);
    }
    setDatasEscala(diasEncontrados);
    
    const novasVagas = {};
    
    // NOVOS PADRÕES DEFINIDOS POR VOCÊ
    const padroes = ['Mídia', 'Voz e violão', 'Voz 1'];
    const padroesCriancas = ['Crianças - Voz/Violão'];

    diasEncontrados.forEach(d => {
      const key = formatDataKey(d);
      let vagasIniciais = catalogoVagas.filter(v => padroes.includes(v.label));
      
      if (incluirCriancas) {
        vagasIniciais = [...vagasIniciais, ...catalogoVagas.filter(v => padroesCriancas.includes(v.label))];
      }
      
      novasVagas[key] = vagasIniciais;
    });
    setVagasPorDia(novasVagas);
    setIndisponibilidades({});
    setRegras([]);
    setEscalasGeradas([]); 
  }, [mes, ano, diaSemanaAlvo, catalogoVagas, incluirCriancas]);

  const adicionarVaga = (diaKey, vagaId) => {
    const vaga = catalogoVagas.find(v => v.id === vagaId);
    setVagasPorDia(prev => {
      if(prev[diaKey].some(v => v.id === vagaId)) return prev; 
      return { ...prev, [diaKey]: [...prev[diaKey], vaga] };
    });
  };

  const removerVaga = (diaKey, vagaId) => {
    setVagasPorDia(prev => ({
      ...prev,
      [diaKey]: prev[diaKey].filter(v => v.id !== vagaId)
    }));
  };

  const toggleIndisponibilidade = (membroId, dataObj) => {
    const key = `${membroId}_${formatDataKey(dataObj)}`;
    setIndisponibilidades(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const adicionarRegra = () => {
    setRegraError(''); 
    if (!regraMembro1 || !regraAlvo) { setRegraError('Por favor, preencha todos os campos.'); return; }
    if (regraTipo === 'tocar_com_no_dia' && !regraAlvoData) { setRegraError('Por favor, selecione o dia.'); return; }
    if ((regraTipo === 'tocar_com' || regraTipo === 'tocar_com_no_dia') && regraMembro1 === regraAlvo) { setRegraError('Um membro não pode ter regra consigo mesmo.'); return; }

    const membroNome = equipa.find(m => m.id.toString() === regraMembro1)?.nome;
    let descricao = '';

    if (regraTipo === 'dia_especifico') {
      if (indisponibilidades[`${regraMembro1}_${regraAlvo}`]) { setRegraError(`Impossível: ${membroNome} está de Falta.`); return; }
      const [d, m] = regraAlvo.split('-');
      descricao = `${membroNome} PRECISA tocar no dia ${d.padStart(2, '0')}/${String(parseInt(m) + 1).padStart(2, '0')}`;
    } else if (regraTipo === 'tocar_com') {
      descricao = `${membroNome} PRECISA tocar com ${equipa.find(m => m.id.toString() === regraAlvo)?.nome}`;
    } else if (regraTipo === 'tocar_com_no_dia') {
      if (indisponibilidades[`${regraMembro1}_${regraAlvoData}`] || indisponibilidades[`${regraAlvo}_${regraAlvoData}`]) { setRegraError(`Impossível: Alguém está de Falta.`); return; }
      const [d, m] = regraAlvoData.split('-');
      descricao = `${membroNome} PRECISA tocar com ${equipa.find(m => m.id.toString() === regraAlvo)?.nome} no dia ${d.padStart(2, '0')}/${String(parseInt(m) + 1).padStart(2, '0')}`;
    }

    setRegras([...regras, { id: Date.now(), membro1: regraMembro1, tipo: regraTipo, alvo: regraAlvo, alvoData: regraAlvoData, descricao }]);
    setRegraMembro1(''); setRegraAlvo(''); setRegraAlvoData('');
  };

  const removerRegra = (id) => setRegras(regras.filter(r => r.id !== id));

  const handleGerarEscala = () => {
    setIsGerando(true);
    setTimeout(() => {
      const resultados = gerarEscalas(equipa, datasEscala, indisponibilidades, regras, vagasPorDia);
      setEscalasGeradas(resultados);
      setEscalaAtualIndex(0);
      setIsGerando(false);
      if (resultados.length > 0) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const handleTrocarMembro = (diaKey, vagaLabel) => {
    const escalaAtual = escalasGeradas[escalaAtualIndex];
    const alocadosNesteDia = escalaAtual[diaKey];
    
    const alocacaoIndex = alocadosNesteDia.findIndex(a => a.vaga.label === vagaLabel);
    if (alocacaoIndex === -1) return;

    const alocacaoAtual = alocadosNesteDia[alocacaoIndex];
    const membroAtualId = alocacaoAtual.membro.id || null;

    // Atualizado para usar o 'aceita'
    const candidatos = equipa.filter(m => 
      m.funcoes.some(f => alocacaoAtual.vaga.aceita.includes(f)) &&
      !indisponibilidades[`${m.id}_${diaKey}`] &&
      (!alocadosNesteDia.some(a => a.membro.id === m.id) || m.id === membroAtualId)
    );

    candidatos.push({ id: null, nome: '---' });

    const currentIndex = candidatos.findIndex(c => c.id === membroAtualId);
    const nextIndex = (currentIndex + 1) % candidatos.length;
    const proximoMembro = candidatos[nextIndex];

    if (candidatos.length <= 2 && membroAtualId !== null && proximoMembro.id === null) {
      setSwapMessage(`Apenas ${alocacaoAtual.membro.nome} está disponível para ${vagaLabel} neste dia.`);
      setTimeout(() => setSwapMessage(''), 3000);
    }

    const novasEscalas = [...escalasGeradas];
    novasEscalas[escalaAtualIndex] = {
      ...novasEscalas[escalaAtualIndex],
      [diaKey]: alocadosNesteDia.map((a, i) => i === alocacaoIndex ? { ...a, membro: proximoMembro } : a)
    };
    
    setEscalasGeradas(novasEscalas);
  };

  const handleImprimir = async () => {
    const elemento = document.getElementById('escala-resultado-matriz');
    if (!elemento) return;
    
    const canvas = await html2canvas(elemento, {
      backgroundColor: '#282c34', 
      scale: 2 
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `escala_${mesesNomes[mes]}_${ano}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleWhatsApp = () => {
    const mensagem = `Escala do mês ${mesesNomes[mes]}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`, '_blank');
  };

  return (
    <div className="gerador-escala-container" style={{ position: 'relative' }}>
      
      {swapMessage && (
        <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#e74c3c', color: 'white', padding: '10px 20px', borderRadius: '8px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
          ⚠️ {swapMessage}
        </div>
      )}

      {/* 1. CONFIGURAÇÃO DE DATAS */}
      <div className="controls" style={{ marginBottom: '30px' }}>
        <h2>📅 Configuração do Mês</h2>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label>Mês:</label>
            <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', backgroundColor: '#282c34', color: 'white', border: '1px solid #4a505c' }}>
              {mesesNomes.map((nome, index) => <option key={index} value={index}>{nome}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label>Ano:</label>
            <input type="number" value={ano} onChange={(e) => setAno(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', backgroundColor: '#282c34', color: 'white', border: '1px solid #4a505c' }} />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label>Dia dos Cultos:</label>
            <select value={diaSemanaAlvo} onChange={(e) => setDiaSemanaAlvo(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', backgroundColor: '#282c34', color: 'white', border: '1px solid #4a505c' }}>
              {diasSemanaNomes.map((nome, index) => <option key={index} value={index}>{nome}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#282c34', borderRadius: '8px', border: '1px dashed #61dafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <strong style={{ color: '#61dafb' }}>Dias da escala: </strong>
            {datasEscala.map((data, idx) => (
                <span key={idx} style={{ backgroundColor: '#4a505c', padding: '3px 10px', borderRadius: '15px', fontSize: '0.9em', whiteSpace: 'nowrap' }}>
                {formatDataDDMM(data)}
                </span>
            ))}
            </div>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0, fontWeight: 'bold' }}>
            <input type="checkbox" checked={incluirCriancas} onChange={(e) => setIncluirCriancas(e.target.checked)} style={{ width: '20px', height: '20px', marginRight: '10px' }}/>
            Incluir Escala das Crianças
          </label>
        </div>
      </div>

      {isLoading ? (
        <p>A carregar base de dados...</p>
      ) : (
        <>
          {/* 2. CONFIGURAÇÃO DE VAGAS DINÂMICAS POR DIA */}
          <div className="input-area" style={{ overflowX: 'auto' }}>
            <h2>⚙️ Vagas e Funções por Dia</h2>
            <p className="tab-description">Adicione ou remova instrumentos específicos para cada dia do mês.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
              {datasEscala.map(d => {
                const key = formatDataKey(d);
                const vagasAtuais = vagasPorDia[key] || [];
                
                return (
                  <div key={key} style={{ padding: '15px', backgroundColor: '#282c34', borderRadius: '8px', borderLeft: '4px solid #61dafb' }}>
                    <strong style={{ display: 'block', marginBottom: '10px', fontSize: '1.1em', color: 'white' }}>
                      Dia {formatDataDDMM(d)} - {diasSemanaNomes[d.getDay()]}
                    </strong>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '15px' }}>
                      {vagasAtuais.map(v => (
                        <span key={v.id} style={{ backgroundColor: '#4a505c', padding: '6px 12px', borderRadius: '20px', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {v.label}
                          <button onClick={() => removerVaga(key, v.id)} style={{ background: 'none', border: 'none', color: '#ff4b4b', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2em', lineHeight: '10px' }}>&times;</button>
                        </span>
                      ))}
                      {vagasAtuais.length === 0 && <span style={{ color: '#ff4b4b', fontStyle: 'italic' }}>Nenhuma função escalada (Folga)</span>}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <select id={`select_${key}`} style={{ flex: 1, minWidth: '200px', padding: '8px', borderRadius: '5px', backgroundColor: '#3c414d', color: 'white', border: '1px solid #4a505c' }}>
                        <option value="">➕ Adicionar mais instrumentos / vozes...</option>
                        {catalogoVagas.filter(cat => !vagasAtuais.some(va => va.id === cat.id)).map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>
                      <button onClick={() => {
                        const select = document.getElementById(`select_${key}`);
                        if(select.value) adicionarVaga(key, select.value);
                        select.value = '';
                      }} style={{ padding: '8px 20px', backgroundColor: '#61dafb', color: '#282c34', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Adicionar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 3. INDISPONIBILIDADES E REGRAS */}
          <div className="input-area" style={{ overflowX: 'auto' }}>
            <h2>❌ Indisponibilidades</h2>
            <table className="escala-matrix">
              <thead>
                <tr>
                  <th>Membro / Funções</th>
                  {datasEscala.map((d, i) => <th key={i}>{formatDataDDMM(d)}</th>)}
                </tr>
              </thead>
              <tbody>
                {equipa.map(membro => (
                  <tr key={membro.id}>
                    <td className="membro-celula">
                      <strong>{membro.nome}</strong>
                      <div className="funcoes-mini">{membro.funcoes.join(', ')}</div>
                    </td>
                    {datasEscala.map((d, i) => {
                      const key = `${membro.id}_${formatDataKey(d)}`;
                      const isIndisponivel = indisponibilidades[key];
                      return (
                        <td key={i} onClick={() => toggleIndisponibilidade(membro.id, d)} className={isIndisponivel ? 'celula-falta' : 'celula-ok'}>
                          {isIndisponivel ? '❌ Falta' : '✅ OK'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="input-area">
            <h2>🔗 Regras Específicas (Opcional)</h2>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label>Membro:</label>
                <select value={regraMembro1} onChange={e => { setRegraMembro1(e.target.value); setRegraError(''); }} style={{ padding: '8px', borderRadius: '5px' }}>
                  <option value="">Selecione...</option>
                  {equipa.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div>
                <label>Regra:</label>
                <select value={regraTipo} onChange={e => { setRegraTipo(e.target.value); setRegraAlvo(''); setRegraAlvoData(''); setRegraError(''); }} style={{ padding: '8px', borderRadius: '5px' }}>
                  <option value="tocar_com">PRECISA tocar com...</option>
                  <option value="dia_especifico">PRECISA tocar no dia...</option>
                  <option value="tocar_com_no_dia">PRECISA tocar com... no dia</option>
                </select>
              </div>
              <div>
                <label>{regraTipo === 'dia_especifico' ? 'Dia Alvo:' : 'Membro Alvo:'}</label>
                <select value={regraAlvo} onChange={e => { setRegraAlvo(e.target.value); setRegraError(''); }} style={{ padding: '8px', borderRadius: '5px' }}>
                  <option value="">Selecione...</option>
                  {regraTipo === 'dia_especifico' 
                    ? datasEscala.map((d, i) => <option key={i} value={formatDataKey(d)}>{formatDataDDMM(d)}</option>)
                    : equipa.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)
                  }
                </select>
              </div>
              {regraTipo === 'tocar_com_no_dia' && (
                <div>
                  <label>No Dia:</label>
                  <select value={regraAlvoData} onChange={e => { setRegraAlvoData(e.target.value); setRegraError(''); }} style={{ padding: '8px', borderRadius: '5px' }}>
                    <option value="">Selecione o Dia...</option>
                    {datasEscala.map((d, i) => <option key={i} value={formatDataKey(d)}>{formatDataDDMM(d)}</option>)}
                  </select>
                </div>
              )}
              <button onClick={adicionarRegra} style={{ padding: '8px 15px', backgroundColor: '#61dafb', color: '#282c34', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>+ Adicionar</button>
            </div>
            {regraError && <p style={{ color: '#ff4b4b', marginTop: '15px', fontWeight: 'bold' }}>⚠️ {regraError}</p>}
            {regras.length > 0 && (
              <ul style={{ marginTop: '20px', paddingLeft: '20px' }}>
                {regras.map(r => (
                  <li key={r.id} style={{ marginBottom: '8px', color: '#ffd700' }}>
                    {r.descricao} <button onClick={() => removerRegra(r.id)} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#ff4b4b', cursor: 'pointer' }}>[Remover]</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: '30px' }}>
            <button className="main-button" onClick={handleGerarEscala} disabled={isGerando} style={{ padding: '15px 40px', fontSize: '1.2em' }}>
              {isGerando ? 'Calculando rotas...' : '🎲 Gerar Escala Automática'}
            </button>
          </div>

          {/* 4. RESULTADO FINAL */}
          {escalasGeradas.length > 0 && (
            <div className="result-area" style={{ marginTop: '40px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #4a505c', paddingBottom: '15px', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <h2>✅ Escala de {mesesNomes[mes]}</h2>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#9ab' }}>Opção {escalaAtualIndex + 1} de {escalasGeradas.length}</span>
                  <button onClick={() => setEscalaAtualIndex((prev) => (prev + 1) % escalasGeradas.length)} style={{ padding: '8px 15px', backgroundColor: 'transparent', border: '1px solid #61dafb', color: '#61dafb', borderRadius: '5px', cursor: 'pointer' }}>
                    🔄 Ver outra
                  </button>
                </div>
              </div>

              {/* MATRIZ PARA IMPRESSÃO */}
              <div id="escala-resultado-matriz" style={{ padding: '20px', backgroundColor: '#282c34', borderRadius: '8px' }}>
                <h3 style={{ textAlign: 'center', color: 'white', marginTop: 0 }}>Escala de Louvor - {mesesNomes[mes]} / {ano}</h3>
                <table className="escala-matrix" style={{ backgroundColor: '#282c34', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ backgroundColor: '#3c414d' }}>Função</th>
                      {datasEscala.map((d, i) => <th key={i}>{formatDataDDMM(d)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {catalogoVagas.map(vagaCatalogo => {
                      const precisouNoMes = datasEscala.some(d => vagasPorDia[formatDataKey(d)]?.some(v => v.id === vagaCatalogo.id));
                      if (!precisouNoMes) return null;

                      return (
                        <tr key={vagaCatalogo.id}>
                          <td style={{ backgroundColor: '#3c414d', fontWeight: 'bold', color: '#61dafb' }}>
                            {vagaCatalogo.label}
                          </td>
                          {datasEscala.map((d, colIndex) => {
                            const diaKey = formatDataKey(d);
                            const alocacaoDia = escalasGeradas[escalaAtualIndex][diaKey];
                            const alocacao = alocacaoDia ? alocacaoDia.find(a => a.vaga.label === vagaCatalogo.label) : null;
                            
                            if (!alocacao) return <td key={colIndex} style={{ backgroundColor: '#2c3038', color: '#666', textAlign: 'center' }}>-</td>;
                            
                            const pessoa = alocacao.membro.nome;
                            
                            return (
                              <td key={colIndex} style={{ textAlign: 'center', color: pessoa === '---' ? '#ff4b4b' : 'white', fontWeight: pessoa !== '---' ? 'bold' : 'normal' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                  <span>{pessoa}</span>
                                  <button 
                                    onClick={() => handleTrocarMembro(diaKey, vagaCatalogo.label)} 
                                    title="Substituir pessoa"
                                    data-html2canvas-ignore="true" 
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: '1.1em', padding: 0 }}
                                  >
                                    🔄
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* BOTÕES DE IMPRIMIR E WHATSAPP */}
              <div style={{ display: 'flex', gap: '15px', marginTop: '25px', justifyContent: 'center' }}>
                <button onClick={handleImprimir} style={{ padding: '12px 25px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📸 Imprimir / Baixar Imagem
                </button>
                <button onClick={handleWhatsApp} style={{ padding: '12px 25px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  💬 Enviar via WhatsApp
                </button>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
}

export default GeradorEscala;