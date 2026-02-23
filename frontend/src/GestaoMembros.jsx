// src/GestaoMembros.jsx
import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function GestaoMembros() {
  const [membros, setMembros] = useState([]);
  const [funcoesObjetos, setFuncoesObjetos] = useState([]);
  const [funcoesDisponiveis, setFuncoesDisponiveis] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados do Formulário de Membros
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('ativo');
  const [funcoesSelecionadas, setFuncoesSelecionadas] = useState([]);
  
  const [mensagem, setMensagem] = useState({ texto: '', tipo: '' });

  // Estados do Modal de Funções (CRUD)
  const [isFuncoesModalOpen, setIsFuncoesModalOpen] = useState(false);
  const [novaFuncaoNome, setNovaFuncaoNome] = useState('');
  const [novaFuncaoMembrosSelecionados, setNovaFuncaoMembrosSelecionados] = useState([]);
  const [editandoFuncaoId, setEditandoFuncaoId] = useState(null);
  const [editandoFuncaoNome, setEditandoFuncaoNome] = useState('');

  const carregarDados = async () => {
    setIsLoading(true);
    try {
      const [resEquipe, resFuncoes] = await Promise.all([
        fetch(`${API_BASE_URL}/equipe?apenas_ativos=false`), 
        fetch(`${API_BASE_URL}/funcoes`)
      ]);
      
      const dataEquipe = await resEquipe.json();
      const dataFuncoes = await resFuncoes.json();

      if (dataEquipe.equipe) setMembros(dataEquipe.equipe);
      if (dataFuncoes.funcoes) {
        setFuncoesObjetos(dataFuncoes.funcoes);
        setFuncoesDisponiveis(dataFuncoes.funcoes.map(f => f.nome));
      }
      
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      mostrarMensagem("Erro ao conectar com a API.", "erro");
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

  // --- LÓGICA DE MEMBROS ---
  const abrirModalNovo = () => {
    setNome(''); setTelefone(''); setEmail(''); setStatus('ativo'); setFuncoesSelecionadas([]);
    setIsEditing(false); setEditId(null); setIsModalOpen(true);
  };

  const handleToggleFuncao = (funcaoNome) => {
    setFuncoesSelecionadas(prev => prev.includes(funcaoNome) ? prev.filter(f => f !== funcaoNome) : [...prev, funcaoNome]);
  };

  const handleSalvar = async (e) => {
    e.preventDefault();
    if (!nome.trim()) { mostrarMensagem("O nome é obrigatório!", "erro"); return; }

    const payload = { nome, telefone, email, status, funcoes: funcoesSelecionadas };

    try {
      const url = isEditing ? `${API_BASE_URL}/equipe/${editId}` : `${API_BASE_URL}/equipe`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Falha ao salvar");

      mostrarMensagem(isEditing ? "Membro atualizado!" : "Membro adicionado!", "sucesso");
      setIsModalOpen(false);
      carregarDados(); 
    } catch (error) {
      mostrarMensagem("Erro ao salvar membro.", "erro");
    }
  };

  const handleEditar = (membro) => {
    setNome(membro.nome); setTelefone(membro.telefone || ''); setEmail(membro.email || '');
    setStatus(membro.status || 'ativo'); setFuncoesSelecionadas(membro.funcoes || []);
    setEditId(membro.id); setIsEditing(true); setIsModalOpen(true);
  };

  const handleExcluir = async (id) => {
    if (!window.confirm("Tem a certeza que deseja excluir este membro permanentemente?")) return;
    try {
      await fetch(`${API_BASE_URL}/equipe/${id}`, { method: 'DELETE' });
      mostrarMensagem("Membro excluído com sucesso!", "sucesso");
      carregarDados();
    } catch (error) { mostrarMensagem("Erro ao excluir membro.", "erro"); }
  };

  // --- LÓGICA DE FUNÇÕES (CRUD) ---
  const handleToggleMembroNovaFuncao = (membroId) => {
    setNovaFuncaoMembrosSelecionados(prev => prev.includes(membroId) ? prev.filter(id => id !== membroId) : [...prev, membroId]);
  };

  const handleSalvarNovaFuncao = async () => {
    if (!novaFuncaoNome.trim()) { mostrarMensagem("O nome da função não pode estar vazio.", "erro"); return; }
    try {
      await fetch(`${API_BASE_URL}/funcoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novaFuncaoNome.trim(), membros_ids: novaFuncaoMembrosSelecionados })
      });
      setNovaFuncaoNome('');
      setNovaFuncaoMembrosSelecionados([]);
      mostrarMensagem("Função criada com sucesso!", "sucesso");
      carregarDados();
    } catch (error) { mostrarMensagem("Erro ao criar função.", "erro"); }
  };

  const handleExcluirFuncao = async (id) => {
    if (!window.confirm("Excluir esta função vai removê-la de todos os membros e das escalas geradas. Continuar?")) return;
    try {
      await fetch(`${API_BASE_URL}/funcoes/${id}`, { method: 'DELETE' });
      carregarDados();
    } catch (error) { mostrarMensagem("Erro ao excluir função.", "erro"); }
  };

  const handleSalvarEdicaoFuncao = async (id) => {
    if (!editandoFuncaoNome.trim()) return;
    try {
      await fetch(`${API_BASE_URL}/funcoes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: editandoFuncaoNome.trim() })
      });
      setEditandoFuncaoId(null);
      carregarDados();
    } catch (error) { mostrarMensagem("Erro ao editar função.", "erro"); }
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '5px', backgroundColor: '#282c34', color: 'white', border: '1px solid #4a505c', marginTop: '5px' };

  return (
    <div className="gerador-escala-container">
      
      {/* --- CABEÇALHO COM BOTÕES --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <h2>👥 Gestão de Membros</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setIsFuncoesModalOpen(true)} style={{ padding: '12px 20px', backgroundColor: 'transparent', border: '2px solid #61dafb', color: '#61dafb', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            ⚙️ Gerenciar Funções
          </button>
          <button onClick={abrirModalNovo} className="main-button" style={{ margin: 0, width: 'auto' }}>
            ➕ Adicionar Membro
          </button>
        </div>
      </div>

      {mensagem.texto && !isModalOpen && !isFuncoesModalOpen && (
        <div style={{ marginBottom: '20px', padding: '10px', textAlign: 'center', borderRadius: '5px', backgroundColor: mensagem.tipo === 'sucesso' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: mensagem.tipo === 'sucesso' ? '#2ecc71' : '#ff4b4b', fontWeight: 'bold' }}>
          {mensagem.texto}
        </div>
      )}

      {/* --- LISTA DE MEMBROS (MANTIDA IGUAL) --- */}
      <div className="input-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '1.1em', fontWeight: 'bold' }}>Total: {membros.length} cadastrados</span>
          <span style={{ fontSize: '0.9em', color: '#9ab' }}>{membros.filter(m => m.status === 'ativo').length} Ativos | {membros.filter(m => m.status === 'inativo').length} Inativos</span>
        </div>

        {isLoading ? ( <p>A carregar base de dados...</p> ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {membros.map(membro => (
              <div key={membro.id} style={{ backgroundColor: '#282c34', padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${membro.status === 'ativo' ? '#2ecc71' : '#ff4b4b'}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <strong style={{ fontSize: '1.2em', color: 'white' }}>{membro.nome}</strong>
                    <span style={{ fontSize: '0.7em', padding: '3px 8px', borderRadius: '10px', backgroundColor: membro.status === 'ativo' ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', color: membro.status === 'ativo' ? '#2ecc71' : '#ff4b4b' }}>
                      {membro.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85em', color: '#9ab', marginTop: '10px' }}>
                    <div>📞 {membro.telefone || 'Sem contacto'}</div>
                    <div>✉️ {membro.email || 'Sem e-mail'}</div>
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#61dafb', marginTop: '10px', fontStyle: 'italic' }}>
                    {membro.funcoes.length > 0 ? membro.funcoes.join(' • ') : 'Nenhuma função atribuída'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #4a505c' }}>
                  <button onClick={() => handleEditar(membro)} style={{ flex: 1, padding: '5px', backgroundColor: 'transparent', border: '1px solid #61dafb', color: '#61dafb', borderRadius: '4px', cursor: 'pointer' }}>✏️ Editar</button>
                  <button onClick={() => handleExcluir(membro.id)} style={{ flex: 1, padding: '5px', backgroundColor: 'transparent', border: '1px solid #ff4b4b', color: '#ff4b4b', borderRadius: '4px', cursor: 'pointer' }}>🗑️ Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- MODAL (POP-UP) DE MEMBROS --- */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #4a505c', paddingBottom: '10px' }}>
              <h2 style={{ margin: 0 }}>{isEditing ? '✏️ Editar Membro' : '➕ Adicionar Novo Membro'}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9ab', fontSize: '1.5em', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <form onSubmit={handleSalvar}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
                <div><label>Nome Completo *</label><input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Lucas Silva" style={inputStyle} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div><label>Telefone / WhatsApp</label><input type="text" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(DD) 99999-9999" style={inputStyle} /></div>
                  <div><label>E-mail</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={inputStyle} /></div>
                </div>
                <div>
                  <label>Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, backgroundColor: status === 'ativo' ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)', color: status === 'ativo' ? '#2ecc71' : '#e74c3c', fontWeight: 'bold' }}>
                    <option value="ativo">✅ Ativo na Escala</option>
                    <option value="inativo">⏸️ Inativo (Pausa)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <label>Funções / Instrumentos na Banda</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px', padding: '15px', backgroundColor: '#282c34', borderRadius: '8px', border: '1px solid #4a505c' }}>
                  {funcoesDisponiveis.map((f, idx) => (
                    <label key={idx} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', backgroundColor: '#3c414d', padding: '5px 10px', borderRadius: '15px', fontSize: '0.9em' }}>
                      <input type="checkbox" checked={funcoesSelecionadas.includes(f)} onChange={() => handleToggleFuncao(f)} style={{ marginRight: '8px' }} />
                      {f}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '25px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid #ff4b4b', color: '#ff4b4b', borderRadius: '5px', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" className="main-button" style={{ margin: 0, width: 'auto' }}>{isEditing ? '💾 Guardar Alterações' : '➕ Salvar Membro'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- NOVO MODAL: GERENCIAR FUNÇÕES --- */}
      {isFuncoesModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #4a505c', paddingBottom: '10px' }}>
              <h2 style={{ margin: 0 }}>⚙️ Gerenciar Funções / Instrumentos</h2>
              <button onClick={() => setIsFuncoesModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9ab', fontSize: '1.5em', cursor: 'pointer' }}>&times;</button>
            </div>

            {mensagem.texto && isFuncoesModalOpen && (
              <div style={{ marginBottom: '15px', padding: '10px', textAlign: 'center', borderRadius: '5px', backgroundColor: mensagem.tipo === 'sucesso' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', color: mensagem.tipo === 'sucesso' ? '#2ecc71' : '#ff4b4b', fontWeight: 'bold' }}>
                {mensagem.texto}
              </div>
            )}

            <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
              {/* Coluna 1: Lista de Funções */}
              <div style={{ flex: 1, minWidth: '300px' }}>
                <h3>Funções Existentes</h3>
                <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                  {funcoesObjetos.map(f => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#282c34', padding: '10px', marginBottom: '8px', borderRadius: '5px', border: '1px solid #4a505c' }}>
                      {editandoFuncaoId === f.id ? (
                        <div style={{ display: 'flex', gap: '5px', width: '100%' }}>
                          <input type="text" value={editandoFuncaoNome} onChange={e => setEditandoFuncaoNome(e.target.value)} style={{ flex: 1, padding: '5px', borderRadius: '3px', border: '1px solid #61dafb', backgroundColor: '#1e2229', color: 'white' }} />
                          <button onClick={() => handleSalvarEdicaoFuncao(f.id)} style={{ backgroundColor: '#2ecc71', border: 'none', borderRadius: '3px', padding: '5px 10px', cursor: 'pointer', color: 'white' }}>OK</button>
                          <button onClick={() => setEditandoFuncaoId(null)} style={{ backgroundColor: '#e74c3c', border: 'none', borderRadius: '3px', padding: '5px 10px', cursor: 'pointer', color: 'white' }}>X</button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontWeight: 'bold' }}>{f.nome}</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => { setEditandoFuncaoId(f.id); setEditandoFuncaoNome(f.nome); }} style={{ background: 'none', border: 'none', color: '#61dafb', cursor: 'pointer', fontSize: '1.2em' }} title="Editar">✏️</button>
                            <button onClick={() => handleExcluirFuncao(f.id)} style={{ background: 'none', border: 'none', color: '#ff4b4b', cursor: 'pointer', fontSize: '1.2em' }} title="Excluir">🗑️</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna 2: Criar Nova Função */}
              <div style={{ flex: 1, minWidth: '300px', backgroundColor: '#282c34', padding: '20px', borderRadius: '8px', border: '1px solid #4a505c' }}>
                <h3>Criar Nova Função</h3>
                <label>Nome do Instrumento/Voz</label>
                <input type="text" value={novaFuncaoNome} onChange={e => setNovaFuncaoNome(e.target.value)} placeholder="Ex: Violino, Voz 1..." style={inputStyle} />
                
                <div style={{ marginTop: '20px' }}>
                  <label>Atrelar Membros a esta Função (Opcional)</label>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#1e2229', padding: '10px', borderRadius: '5px', border: '1px solid #4a505c', marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {membros.map(m => (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9em' }}>
                        <input type="checkbox" checked={novaFuncaoMembrosSelecionados.includes(m.id)} onChange={() => handleToggleMembroNovaFuncao(m.id)} style={{ marginRight: '10px' }} />
                        {m.nome}
                      </label>
                    ))}
                  </div>
                </div>

                <button onClick={handleSalvarNovaFuncao} className="main-button" style={{ marginTop: '20px' }}>
                  ➕ Salvar Nova Função
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default GestaoMembros;