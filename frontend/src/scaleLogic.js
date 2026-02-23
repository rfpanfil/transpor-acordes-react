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
      const vagas = vagasPorDia[dataKey] || [];

      const tentarPreencherDia = (vagaIndex, alocadosNesteDia) => {
        if (encontrouNestaTentativa) return;

        if (vagaIndex === vagas.length) {
          if (!validarRegrasDoDia(alocadosNesteDia, dataKey, regras, equipa)) return;
          escalaAtual[dataKey] = [...alocadosNesteDia];
          backtrack(diaIndex + 1, escalaAtual);
          return;
        }

        const vaga = vagas[vagaIndex];
        
        // AGORA VERIFICA SE O MEMBRO TEM ALGUMA DAS FUNÇÕES QUE A VAGA ACEITA
        let candidatos = equipa.filter(m => 
          m.funcoes.some(f => vaga.aceita.includes(f)) &&
          !indisponibilidades[`${m.id}_${dataKey}`] &&
          !alocadosNesteDia.some(a => a.membro && a.membro.id === m.id)
        );

        candidatos.sort((a, b) => {
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