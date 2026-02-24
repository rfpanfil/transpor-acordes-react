// src/scaleLogic.js

export const gerarEscalas = (equipa, datasEscala, indisponibilidades, regras, vagasPorDia) => {
  const formatDataKey = (d) => `${d.getDate()}-${d.getMonth()}-${d.getFullYear()}`;
  let resultadosUnicos = new Set();
  let resultadosObj = [];

  const contarParticipacoes = (membroId, escalaAtual) => {
    let count = 0;
    for (let dia in escalaAtual) {
      if (escalaAtual[dia].some(a => a.membro && a.membro.id === membroId)) count++;
    }
    return count;
  };

  let tentativasTotais = 0;

  while (resultadosObj.length < 10 && tentativasTotais < 50) {
    tentativasTotais++;
    let encontrouNestaTentativa = false;

    const backtrack = (diaIndex, escalaAtual) => {
      if (encontrouNestaTentativa) return; 
      
      if (diaIndex === datasEscala.length) {
        const jsonStr = JSON.stringify(escalaAtual);
        if (!resultadosUnicos.has(jsonStr)) {
          resultadosUnicos.add(jsonStr);
          resultadosObj.push(JSON.parse(jsonStr));
          encontrouNestaTentativa = true;
        }
        return;
      }

      const dataAtual = datasEscala[diaIndex];
      const dataKey = formatDataKey(dataAtual);
      
      // FORÇA A ORDEM: Resolve as funções normais PRIMEIRO, e as de Crianças POR ÚLTIMO.
      // Isso garante que a pessoa já esteja na função de Adulto quando a vaga de Criança for avaliada.
      const vagas = (vagasPorDia[dataKey] || []).slice().sort((a, b) => {
        if (a.label.includes('Crianças') && !b.label.includes('Crianças')) return 1;
        if (!a.label.includes('Crianças') && b.label.includes('Crianças')) return -1;
        return 0;
      });

      const tentarPreencherDia = (vagaIndex, alocadosNesteDia) => {
        if (encontrouNestaTentativa) return;

        if (vagaIndex === vagas.length) {
          if (!validarRegrasDoDia(alocadosNesteDia, dataKey, regras, equipa)) return;
          escalaAtual[dataKey] = [...alocadosNesteDia];
          backtrack(diaIndex + 1, escalaAtual);
          return;
        }

        const vaga = vagas[vagaIndex];
        
        const isCandidatoValido = (membro, vagaAtual, alocados) => {
          if (indisponibilidades[`${membro.id}_${dataKey}`]) return false;

          // 1. OBRIGATÓRIO: O membro tem que ter a função exata (ignorando maiúsculas/minúsculas para evitar bugs)
          const temFuncaoExata = membro.funcoes.some(f => vagaAtual.aceita.some(a => a.toLowerCase() === f.toLowerCase()));
          if (!temFuncaoExata) return false;

          // 2. Pega as funções que o membro já pegou NESTE dia
          const alocacoesDoMembro = alocados.filter(a => a.membro && a.membro.id === membro.id);
          
          if (alocacoesDoMembro.length >= 2) return false; // Ninguém faz 3 coisas

          // 3. Se já tem 1 função hoje, a troca só é permitida se for pro par Criança + Adulto Musical
          if (alocacoesDoMembro.length === 1) {
            const vagaExistente = alocacoesDoMembro[0].vaga.label;
            const labelAtual = vagaAtual.label;

            const isMidiaOuSom = (label) => label.toLowerCase().includes('mídia') || label.toLowerCase().includes('som') || label.toLowerCase().includes('live');
            const isCrianca = (label) => label.includes('Crianças');
            const isAdultoMusical = (label) => !isCrianca(label) && !isMidiaOuSom(label);

            const ehDobraValida = (isAdultoMusical(vagaExistente) && isCrianca(labelAtual)) || 
                                  (isCrianca(vagaExistente) && isAdultoMusical(labelAtual));

            if (!ehDobraValida) {
              return false; // Bloqueia Mídia+Musical, Mídia+Crianças, ou Duas de Adulto
            }
          }

          return true;
        };

        // AGORA VERIFICA AS FUNÇÕES E A PERMISSÃO DE DOBRA NAS CRIANÇAS
        let candidatos = equipa.filter(m => isCandidatoValido(m, vaga, alocadosNesteDia));

        candidatos.sort((a, b) => {
          // NOVA REGRA: Prioriza quem já está tocando no culto hoje (faz a dobra)
          const aFazDobra = alocadosNesteDia.some(aloc => aloc.membro && aloc.membro.id === a.id);
          const bFazDobra = alocadosNesteDia.some(aloc => aloc.membro && aloc.membro.id === b.id);
          
          if (aFazDobra && !bFazDobra) return -1; // A vai pro topo
          if (!aFazDobra && bFazDobra) return 1;  // B vai pro topo

          // Se empatar (ambos fazem dobra, ou nenhum faz), desempata por quem tocou menos no mês
          const usoA = contarParticipacoes(a.id, escalaAtual);
          const usoB = contarParticipacoes(b.id, escalaAtual);
          if (usoA === usoB) return Math.random() - 0.5;
          return usoA - usoB; 
        });

        candidatos.push(null); // Opção de ficar vazio

        for (let candidato of candidatos) {
          if (candidato) {
            alocadosNesteDia.push({ vaga: vaga, membro: candidato });
            tentarPreencherDia(vagaIndex + 1, alocadosNesteDia);
            alocadosNesteDia.pop();
          } else {
            alocadosNesteDia.push({ vaga: vaga, membro: { nome: '---' } });
            tentarPreencherDia(vagaIndex + 1, alocadosNesteDia);
            alocadosNesteDia.pop();
          }
        }
      };

      tentarPreencherDia(0, []);
    };

    backtrack(0, {});
  }

  return resultadosObj;
};

const validarRegrasDoDia = (alocadosNesteDia, dataKey, regras, equipa) => {
  const idsNesteDia = alocadosNesteDia.map(a => a.membro && a.membro.id?.toString());
  for (let regra of regras) {
    if (regra.tipo === 'tocar_com') {
      const temMembro1 = idsNesteDia.includes(regra.membro1);
      const temAlvo = idsNesteDia.includes(regra.alvo);
      if ((temMembro1 && !temAlvo) || (!temMembro1 && temAlvo)) return false;
    }
    if (regra.tipo === 'dia_especifico' && regra.alvo === dataKey) {
      if (!idsNesteDia.includes(regra.membro1)) return false;
    }
    if (regra.tipo === 'tocar_com_no_dia' && regra.alvoData === dataKey) {
      const temMembro1 = idsNesteDia.includes(regra.membro1);
      const temAlvo = idsNesteDia.includes(regra.alvo);
      if ((temMembro1 && !temAlvo) || (!temMembro1 && temAlvo)) return false;
    }
  }
  return true;
};