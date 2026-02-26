//GerenciarPerfil.jsx

import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function GerenciarPerfil() {
  const [perfil, setPerfil] = useState({ email: '', usar_banco_padrao: true, funcoes_padrao: [] });
  const [funcoesDisponiveis, setFuncoesDisponiveis] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mensagem, setMensagem] = useState({ texto: '', tipo: '' });

  const carregarDados = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setIsLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [resPerfil, resFuncoes] = await Promise.all([
        fetch(`${API_BASE_URL}/usuario/me`, { headers }),
        fetch(`${API_BASE_URL}/funcoes`, { headers })
      ]);

      if (resPerfil.ok && resFuncoes.ok) {
        const dataPerfil = await resPerfil.json();
        const dataFuncoes = await resFuncoes.json();
        
        // As funções padrão vêm como uma string separada por vírgula. Vamos transformar em array.
        const funcoesPadraoArray = dataPerfil.funcoes_padrao ? dataPerfil.funcoes_padrao.split(',') : [];
        
        setPerfil({ ...dataPerfil, funcoes_padrao: funcoesPadraoArray });
        setFuncoesDisponiveis(dataFuncoes.funcoes.map(f => f.nome));
      }
    } catch (error) {
      mostrarMensagem("Erro ao carregar o perfil.", "erro");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const mostrarMensagem = (texto, tipo) => {
    setMensagem({ texto, tipo });
    setTimeout(() => setMensagem({ texto: '', tipo: '' }), 3000);
  };

  const handleToggleBanco = async () => {
    const token = localStorage.getItem('token');
    const novoValor = !perfil.usar_banco_padrao;
    
    try {
      const res = await fetch(`${API_BASE_URL}/usuario/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ usar_banco_padrao: novoValor })
      });

      if (res.ok) {
        setPerfil(prev => ({ ...prev, usar_banco_padrao: novoValor }));
        mostrarMensagem(novoValor ? "A usar o Repertório Global do sistema!" : "A usar o seu Repertório Pessoal exclusivo!", "sucesso");
      }
    } catch (error) { mostrarMensagem("Erro ao alterar configuração.", "erro"); }
  };

  const handleToggleFuncaoPadrao = async (funcaoNome) => {
    const token = localStorage.getItem('token');
    
    // Adiciona se não existe, remove se já existe
    const novoArray = perfil.funcoes_padrao.includes(funcaoNome)
      ? perfil.funcoes_padrao.filter(f => f !== funcaoNome)
      : [...perfil.funcoes_padrao, funcaoNome];
      
    // Transforma o array numa string para enviar ao backend
    const stringPadrao = novoArray.join(',');

    try {
      const res = await fetch(`${API_BASE_URL}/usuario/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ funcoes_padrao: stringPadrao })
      });

      if (res.ok) {
        setPerfil(prev => ({ ...prev, funcoes_padrao: novoArray }));
      }
    } catch (error) { mostrarMensagem("Erro ao salvar padrão de escala.", "erro"); }
  };

  return (
    <div className="gerador-escala-container">
      <h2>⚙️ Configurações da Conta</h2>

      {mensagem.texto && (
        <div style={{ marginBottom: '20px', padding: '10px', textAlign: 'center', borderRadius: '5px', backgroundColor: mensagem.tipo === 'sucesso' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: mensagem.tipo === 'sucesso' ? '#2ecc71' : '#ff4b4b', fontWeight: 'bold' }}>
          {mensagem.texto}
        </div>
      )}

      {isLoading ? <p>A carregar o perfil...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          <div className="input-area" style={{ backgroundColor: '#1e2229', border: '1px solid #4a505c' }}>
            <h3 style={{ color: '#61dafb', marginTop: 0 }}>👤 Os Seus Dados</h3>
            <p><strong>E-mail de Acesso:</strong> {perfil.email}</p>
            <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
              <button disabled style={{ padding: '8px 15px', backgroundColor: '#4a505c', color: '#9ab', border: 'none', borderRadius: '5px', cursor: 'not-allowed' }}>Alterar E-mail (Fase 5)</button>
              <button disabled style={{ padding: '8px 15px', backgroundColor: '#4a505c', color: '#9ab', border: 'none', borderRadius: '5px', cursor: 'not-allowed' }}>Alterar Senha (Fase 5)</button>
            </div>
          </div>

          <div className="input-area" style={{ backgroundColor: '#1e2229', border: '1px solid #4a505c' }}>
            <h3 style={{ color: '#61dafb', marginTop: 0 }}>🧠 Cérebro do LeviRoboto</h3>
            <p>Escolha de onde o LeviRoboto deve buscar as sugestões e sorteios de músicas.</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: '#282c34', borderRadius: '8px', marginTop: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0, fontSize: '1.1em', fontWeight: 'bold', color: 'white' }}>
                <input 
                  type="checkbox" 
                  checked={!perfil.usar_banco_padrao} 
                  onChange={handleToggleBanco} 
                  style={{ width: '20px', height: '20px', marginRight: '10px' }} 
                />
                Usar Meu Próprio Repertório
              </label>
              <span style={{ fontSize: '0.9em', color: '#9ab' }}>
                {perfil.usar_banco_padrao ? "(A usar o banco de dados gigante de todos)" : "(O robô só vai sortear as músicas que você adicionar na aba Meu Repertório)"}
              </span>
            </div>
          </div>

          <div className="input-area" style={{ backgroundColor: '#1e2229', border: '1px solid #f39c12' }}>
            <h3 style={{ color: '#f39c12', marginTop: 0 }}>📅 Funções Padrão da Escala</h3>
            <p>Selecione as funções/instrumentos que devem aparecer automaticamente em todos os dias quando você gerar uma nova escala.</p>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px', padding: '15px', backgroundColor: '#282c34', borderRadius: '8px', border: '1px solid #4a505c' }}>
              {funcoesDisponiveis.length === 0 ? (
                <p style={{ color: '#9ab', fontStyle: 'italic', margin: 0 }}>Nenhuma função cadastrada. Vá em Gestão de Membros para criar!</p>
              ) : (
                funcoesDisponiveis.map((f, idx) => {
                  const isActive = perfil.funcoes_padrao.includes(f);
                  return (
                    <label key={idx} style={{ 
                      display: 'flex', alignItems: 'center', cursor: 'pointer', 
                      backgroundColor: isActive ? 'rgba(243, 156, 18, 0.2)' : '#3c414d', 
                      border: isActive ? '1px solid #f39c12' : '1px solid transparent',
                      color: isActive ? '#f39c12' : 'white',
                      padding: '8px 12px', borderRadius: '15px', fontSize: '0.95em', fontWeight: isActive ? 'bold' : 'normal', transition: 'all 0.2s ease'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={isActive} 
                        onChange={() => handleToggleFuncaoPadrao(f)} 
                        style={{ marginRight: '8px', cursor: 'pointer' }} 
                      />
                      {f}
                    </label>
                  )
                })
              )}
            </div>
            <p style={{ fontSize: '0.85em', color: '#9ab', marginTop: '10px', fontStyle: 'italic' }}>
              Nota: Alterações aqui serão refletidas na próxima vez que abrir o Gerador de Escalas. (Salvo automaticamente ao clicar).
            </p>
          </div>

        </div>
      )}
    </div>
  );
}

export default GerenciarPerfil;