# api.py
# VERSÃO ATUALIZADA (Transpositor + Banco de Dados da Escala no Turso)

from fastapi import FastAPI, File, UploadFile, Form
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import re
import docx
import io
from typing import List, Optional
import os
import libsql_client
import random
import difflib
import gspread

# --- Configuração do Banco de Dados Turso ---
TURSO_URL = os.getenv("TURSO_DATABASE_URL", "https://levi-roboto-db-rfpanfil.aws-us-east-2.turso.io")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzE4NjIxODIsImlkIjoiMzZkMGNlYmItZDIwMS00NWU1LWI0ZTgtMDk5MmJhNWUzZTVlIiwicmlkIjoiMzZjYTljZjQtNmE0Ny00MDc4LTk5NWItYzY5YWJiY2FmMjA3In0.ctX09Go_KYD8wUFulZpRm8JSLHHRL1Ou44yualixomTUvSAx2x164BASeB-WfJRatV6JXcKRIF1U4wzCQwF9Cg")

def get_db_client():
    return libsql_client.create_client(url=TURSO_URL, auth_token=TURSO_TOKEN)

# --- Modelos de Dados ---
class TransposeCifraRequest(BaseModel):
    cifra_text: str
    action: str
    interval: float

class TransposeCifraResponse(BaseModel):
    transposed_cifra: str

class TransposeSequenceRequest(BaseModel):
    chords: List[str]
    action: str
    interval: float

class TransposeSequenceResponse(BaseModel):
    original_chords: List[str]
    transposed_chords: List[str]
    explanations: List[str]

app = FastAPI()

# --- Configuração CORS (LIBERADO PARA ANDROID E FRONTEND) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================
# ROTAS NOVAS: ESCALA DE LOUVOR E GESTÃO DE MEMBROS
# ==========================================================

@app.get("/equipe")
async def get_equipe(apenas_ativos: bool = True):
    """Retorna os membros e suas funções. Se apenas_ativos=True, filtra inativos."""
    try:
        client = get_db_client()
        
        query = '''
            SELECT m.id, m.nome, m.telefone, m.email, m.status, GROUP_CONCAT(f.nome) as funcoes
            FROM membros m
            LEFT JOIN membro_funcoes mf ON m.id = mf.membro_id
            LEFT JOIN funcoes f ON mf.funcao_id = f.id
        '''
        
        if apenas_ativos:
            query += " WHERE m.status = 'ativo' "
            
        query += " GROUP BY m.id ORDER BY m.nome"
        
        result = await client.execute(query)
        
        equipe = []
        for row in result.rows:
            funcoes_lista = row[5].split(',') if row[5] else []
            equipe.append({
                "id": row[0],
                "nome": row[1],
                "telefone": row[2] or "",
                "email": row[3] or "",
                "status": row[4] or "ativo",
                "funcoes": funcoes_lista
            })
            
        await client.close()
        return {"equipe": equipe}
    except Exception as e:
        return {"error": str(e)}

# --- ROTAS DE FUNÇÕES (CRUD) ---
class FuncaoRequest(BaseModel):
    nome: str
    membros_ids: Optional[List[int]] = []

@app.get("/funcoes")
async def get_funcoes():
    """Retorna a lista de todas as funções (instrumentos/vozes)."""
    try:
        client = get_db_client()
        result = await client.execute("SELECT id, nome FROM funcoes ORDER BY nome")
        funcoes = [{"id": row[0], "nome": row[1]} for row in result.rows]
        await client.close()
        return {"funcoes": funcoes}
    except Exception as e:
        return {"error": str(e)}

@app.post("/funcoes")
async def add_funcao(funcao: FuncaoRequest):
    """Cria uma nova função e atrela aos membros selecionados."""
    try:
        client = get_db_client()
        # 1. Insere a função
        res = await client.execute("INSERT INTO funcoes (nome) VALUES (?)", [funcao.nome])
        funcao_id = res.last_insert_rowid
        
        # 2. Atrela os membros selecionados a esta nova função
        if funcao.membros_ids:
            for m_id in funcao.membros_ids:
                await client.execute("INSERT INTO membro_funcoes (membro_id, funcao_id) VALUES (?, ?)", [m_id, funcao_id])
                
        await client.close()
        return {"message": "Função criada com sucesso!"}
    except Exception as e:
        return {"error": str(e)}

@app.put("/funcoes/{funcao_id}")
async def update_funcao(funcao_id: int, funcao: FuncaoRequest):
    """Atualiza o nome de uma função."""
    try:
        client = get_db_client()
        await client.execute("UPDATE funcoes SET nome = ? WHERE id = ?", [funcao.nome, funcao_id])
        await client.close()
        return {"message": "Função atualizada com sucesso!"}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/funcoes/{funcao_id}")
async def delete_funcao(funcao_id: int):
    """Exclui uma função (o ON DELETE CASCADE limpa as relações)."""
    try:
        client = get_db_client()
        await client.execute("DELETE FROM funcoes WHERE id = ?", [funcao_id])
        await client.close()
        return {"message": "Função excluída com sucesso!"}
    except Exception as e:
        return {"error": str(e)}

# --- Modelos de Dados para Gestão de Membros ---
class MembroRequest(BaseModel):
    nome: str
    telefone: Optional[str] = ""
    email: Optional[str] = ""
    status: Optional[str] = "ativo"
    funcoes: List[str] = []

# --- Rotas de Criação, Edição e Exclusão ---

@app.post("/equipe")
async def add_membro(membro: MembroRequest):
    try:
        client = get_db_client()
        # 1. Insere o membro e pega o ID gerado
        res = await client.execute(
            "INSERT INTO membros (nome, telefone, email, status) VALUES (?, ?, ?, ?)",
            [membro.nome, membro.telefone, membro.email, membro.status]
        )
        membro_id = res.last_insert_rowid
        
        # 2. Insere as funções (se houver)
        for f in membro.funcoes:
            f_res = await client.execute("SELECT id FROM funcoes WHERE nome = ?", [f])
            if f_res.rows:
                f_id = f_res.rows[0][0]
                await client.execute("INSERT INTO membro_funcoes (membro_id, funcao_id) VALUES (?, ?)", [membro_id, f_id])
                
        await client.close()
        return {"message": "Membro adicionado com sucesso!", "id": membro_id}
    except Exception as e:
        return {"error": str(e)}

@app.put("/equipe/{membro_id}")
async def update_membro(membro_id: int, membro: MembroRequest):
    try:
        client = get_db_client()
        # 1. Atualiza os dados principais
        await client.execute(
            "UPDATE membros SET nome = ?, telefone = ?, email = ?, status = ? WHERE id = ?",
            [membro.nome, membro.telefone, membro.email, membro.status, membro_id]
        )
        
        # 2. Atualiza as funções (apaga as antigas e insere as novas)
        await client.execute("DELETE FROM membro_funcoes WHERE membro_id = ?", [membro_id])
        for f in membro.funcoes:
            f_res = await client.execute("SELECT id FROM funcoes WHERE nome = ?", [f])
            if f_res.rows:
                f_id = f_res.rows[0][0]
                await client.execute("INSERT INTO membro_funcoes (membro_id, funcao_id) VALUES (?, ?)", [membro_id, f_id])
                
        await client.close()
        return {"message": "Membro atualizado com sucesso!"}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/equipe/{membro_id}")
async def delete_membro(membro_id: int):
    try:
        client = get_db_client()
        # O SQLite cuida de apagar os vínculos na tabela membro_funcoes graças ao "ON DELETE CASCADE" que configuramos no início!
        await client.execute("DELETE FROM membros WHERE id = ?", [membro_id])
        await client.close()
        return {"message": "Membro excluído com sucesso!"}
    except Exception as e:
        return {"error": str(e)}

# ==========================================================
# CÓDIGO DO TRANSPOSITOR (Mantido Intacto)
# ==========================================================

MAPA_NOTAS = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
    "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
    "E#": 5, "B#": 0, "Fb": 4, "Cb": 11
}
MAPA_VALORES_NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

EXPLICACAO_TEORICA = {
    "E#": "Mi sustenido (E#) é enarmônica de Fá (F).",
    "B#": "Si sustenido (B#) é enarmônica de Dó (C).",
    "Fb": "Fá bemol (Fb) é enarmônica de Mi (E).",
    "Cb": "Dó bemol (Cb) é enarmônica de Si (B)."
}

def transpor_nota_individual(nota_str, semitons):
    nota_key = next((key for key in MAPA_NOTAS if key.lower() == nota_str.lower()), None)
    if not nota_key: return nota_str
    
    valor_original = MAPA_NOTAS[nota_key]
    novo_valor = (valor_original + semitons + 12) % 12
    return MAPA_VALORES_NOTAS[novo_valor]

def normalizar_nota(nota_str, explicacoes_set=None):
    if nota_str.endswith("##"):
        base = nota_str.replace("##", "")
        base_key = next((k for k in MAPA_NOTAS if k.lower() == base.lower()), None)
        if base_key is not None:
            valor_base = MAPA_NOTAS[base_key]
            novo_valor = (valor_base + 2) % 12
            nova_nota = MAPA_VALORES_NOTAS[novo_valor]
            if explicacoes_set is not None:
                explicacoes_set.add(f"A nota {nota_str} é enarmônica de {nova_nota} (Duplo Sustenido).")
            return nova_nota

    if nota_str.endswith("bb"):
        base = nota_str.replace("bb", "")
        base_key = next((k for k in MAPA_NOTAS if k.lower() == base.lower()), None)
        if base_key is not None:
            valor_base = MAPA_NOTAS[base_key]
            novo_valor = (valor_base - 2 + 12) % 12
            nova_nota = MAPA_VALORES_NOTAS[novo_valor]
            if explicacoes_set is not None:
                explicacoes_set.add(f"A nota {nota_str} é enarmônica de {nova_nota} (Duplo Bemol).")
            return nova_nota
            
    return nota_str

def transpor_acordes_sequencia(acordes_originais, acao, intervalo):
    intervalo_semitons = int(intervalo * 2)
    semitons_ajuste = intervalo_semitons if acao == 'Aumentar' else -intervalo_semitons
    acordes_transpostos = []
    explicacoes_entrada = set()
    
    for acorde_original in acordes_originais:
        match = re.match(r"^([A-G](?:##|bb|#|b)?)(.*)", acorde_original, re.IGNORECASE)
        
        if not match:
            acordes_transpostos.append(f"{acorde_original}?")
            continue
        
        nota_bruta, resto = match.groups()
        nota_fundamental = normalizar_nota(nota_bruta, explicacoes_entrada)
        
        if nota_fundamental == nota_bruta:
            nota_key = next((k for k in EXPLICACAO_TEORICA if k.lower() == nota_fundamental.lower()), None)
            if nota_key:
                explicacoes_entrada.add(EXPLICACAO_TEORICA[nota_key])

        nova_fundamental = transpor_nota_individual(nota_fundamental, semitons_ajuste)
        
        if '/' in resto:
            partes = resto.split('/')
            qualidade = partes[0]
            baixo_bruto = partes[1]
            baixo_normalizado = normalizar_nota(baixo_bruto, explicacoes_entrada)
            novo_baixo = transpor_nota_individual(baixo_normalizado, semitons_ajuste)
            acorde_final = f"{nova_fundamental}{qualidade}/{novo_baixo}"
        else:
            acorde_final = f"{nova_fundamental}{resto}"
            
        acordes_transpostos.append(acorde_final)

    return acordes_transpostos, list(explicacoes_entrada)

def is_chord_line(line):
    line = line.strip()
    if not line: return False
    chord_pattern = re.compile(r'^[A-G](?:##|bb|#|b)?(m|M|dim|aug|sus|add|maj|º|°|/|[-+])?(\d+)?(\(?[^)\s]*\)?)?(/[A-G](?:##|bb|#|b)?)?$')
    words = line.replace('/:', '').replace('|', '').strip().split()
    if not words: return False
    chord_count = sum(1 for word in words if chord_pattern.match(word))
    return (chord_count / len(words)) >= 0.5

def processar_cifra(texto_cifra, acao, intervalo):
    semitons = int(intervalo * 2) * (1 if acao == 'Aumentar' else -1)
    
    padrao_acorde = r'(^|[^A-Ga-g#b])([A-G](?:##|bb|#|b)?)([^A-G\s,.\n\/]*)?(\/[A-G](?:##|bb|#|b)?)?'
    
    def replacer(match):
        prefixo, nota, qualidade, baixo = match.groups()
        prefixo = prefixo or ""
        qualidade = qualidade or ""
        
        nota_norm = normalizar_nota(nota)
        nova_nota = transpor_nota_individual(nota_norm, semitons)

        novo_baixo = ""
        if baixo:
            nota_baixo = baixo.replace('/', '')
            nota_baixo_norm = normalizar_nota(nota_baixo)
            novo_baixo = "/" + transpor_nota_individual(nota_baixo_norm, semitons)
        
        return f"{prefixo}{nova_nota}{qualidade}{novo_baixo}"

    linhas = texto_cifra.split('\n')
    linhas_finais = []
    
    for linha in linhas:
        if is_chord_line(linha):
            linhas_finais.append(re.sub(padrao_acorde, replacer, linha))
        else:
            linhas_finais.append(linha)
            
    return "\n".join(linhas_finais)

async def ler_conteudo_arquivo(file: UploadFile) -> str:
    content = await file.read()
    if file.filename.endswith('.docx'):
        try:
            doc = docx.Document(io.BytesIO(content))
            return "\n".join([p.text for p in doc.paragraphs])
        except Exception as e:
            return f"Erro ao ler arquivo .docx: {str(e)}"
    return content.decode("utf-8")

@app.post("/transpose-sequence", response_model=TransposeSequenceResponse)
async def transpose_sequence_endpoint(request: TransposeSequenceRequest):
    transposed, expl = transpor_acordes_sequencia(request.chords, request.action, request.interval)
    return {
        "original_chords": request.chords,
        "transposed_chords": transposed,
        "explanations": expl
    }

@app.post("/transpose-text", response_model=TransposeCifraResponse)
async def transpose_text_endpoint(request: TransposeCifraRequest):
    res = processar_cifra(request.cifra_text, request.action, request.interval)
    return {"transposed_cifra": res}

@app.post("/transpose-file", response_model=TransposeCifraResponse)
async def transpose_file_endpoint(file: UploadFile = File(...), action: str = Form(...), interval: float = Form(...)):
    texto = await ler_conteudo_arquivo(file)
    res = processar_cifra(texto, action, interval)
    return {"transposed_cifra": res}

# ==========================================================
# ROTAS DO LEVIROBOTO (REPERTÓRIO E BUSCA)
# ==========================================================

@app.get("/musicas/buscar")
async def buscar_musicas(q: str):
    """Opção 1: Busca músicas por palavra-chave (EXATAMENTE como o bot original)"""
    try:
        client = get_db_client()
        result = await client.execute("SELECT nome_musica, tags FROM biblioteca_busca")
        await client.close()
        
        q_lower = q.lower().strip()
        
        todas_tags = set()
        for row in result.rows:
            tags = [t.strip().lower() for t in row[1].split(',') if t.strip()]
            todas_tags.update(tags)
            
        closest_word = q_lower
        matches = difflib.get_close_matches(q_lower, list(todas_tags), n=1, cutoff=0.6)
        if matches:
            closest_word = matches[0]
            
        musicas_encontradas = []
        for row in result.rows:
            nome = row[0] 
            tags = [t.strip().lower() for t in row[1].split(',')]
            
            if closest_word in tags or closest_word in nome.lower():
                musicas_encontradas.append(nome)
                
        random.shuffle(musicas_encontradas)
        MAX_MUSICAS = 10 # Corrigido para 10 igual ao seu código raiz!
        
        return {
            "closest_word": closest_word,
            "resultados": musicas_encontradas[:MAX_MUSICAS]
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/musicas/sortear")
async def sortear_musica():
    """Opção 2: Consulta as 6 tabelas originais na nuvem"""
    try:
        client = get_db_client()
        
        async def pegar_aleatoria(tabela):
            try:
                res = await client.execute(f"SELECT conteudo FROM {tabela} ORDER BY RANDOM() LIMIT 1")
                return res.rows[0][0] if res.rows else "Nenhuma música cadastrada."
            except:
                return "Erro ao buscar."

        resultado = {
            "agitadas1": await pegar_aleatoria("agitadas1"),
            "agitadas2": await pegar_aleatoria("agitadas2"), 
            "lentas1": await pegar_aleatoria("lentas1"),
            "lentas2": await pegar_aleatoria("lentas2"),
            "ceia": await pegar_aleatoria("ceia"),
            "infantis": await pegar_aleatoria("infantis")
        }
        await client.close()
        return resultado
    except Exception as e:
        return {"error": str(e)}

class SugestaoRequest(BaseModel):
    usuario: str
    sugestao: str

@app.post("/musicas/sugerir")
async def sugerir_musica(req: SugestaoRequest):
    """Opção 3: Salva direto no Google Sheets"""
    try:
        # Usa o arquivo credentials.json que deve estar na mesma pasta do api.py
        gc = gspread.service_account(filename="credentials.json")
        sh = gc.open("Sugestões de músicas LeviRoboto")
        worksheet = sh.sheet1
        worksheet.append_row([req.usuario, req.sugestao])
        return {"message": "Sucesso"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)