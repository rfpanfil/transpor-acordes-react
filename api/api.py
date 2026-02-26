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
import json
from datetime import datetime, timedelta
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Isso faz o Python ler o arquivo .env invisível no seu computador
load_dotenv()

# --- Configuração do Banco de Dados Turso ---
TURSO_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

def get_db_client():
    return libsql_client.create_client(url=TURSO_URL, auth_token=TURSO_TOKEN)

# --- Configuração de Segurança (JWT e Senhas) ---
SECRET_KEY = os.getenv("SECRET_KEY", "uma_chave_secreta_super_segura_aqui_para_desenvolvimento")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # Token dura 7 dias logado

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    client = get_db_client()
    try:
        result = await client.execute("SELECT id, email, usar_banco_padrao FROM usuarios WHERE id = ?", [user_id])
        if not result.rows:
            raise credentials_exception
        user = result.rows[0]
        return {"id": user[0], "email": user[1], "usar_banco_padrao": user[2]}
    finally:
        await client.close()

# --- Modelos de Dados ---
class UserCreate(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class FuncaoRequest(BaseModel):
    nome: str
    membros_ids: Optional[List[int]] = []

class MembroRequest(BaseModel):
    nome: str
    telefone: Optional[str] = ""
    email: Optional[str] = ""
    status: Optional[str] = "ativo"
    funcoes: List[str] = []

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    client = get_db_client()
    await client.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            usar_banco_padrao BOOLEAN DEFAULT 1
        )
    ''')
    # --- NOVA TABELA DE CATEGORIAS FASE 4 ---
    await client.execute('''
        CREATE TABLE IF NOT EXISTS categorias_repertorio (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            usuario_id INTEGER
        )
    ''')
    
    # --- NOVA COLUNA FASE 5 (PADRÃO DE ESCALA) ---
    try: await client.execute("ALTER TABLE usuarios ADD COLUMN funcoes_padrao TEXT DEFAULT 'Mídia,Voz e violão,Voz 1,Voz 2,Voz 3'")
    except: pass
    
    tabelas = ["membros", "funcoes", "biblioteca_busca", "agitadas1", "agitadas2", "lentas1", "lentas2", "ceia", "infantis"]
    for tabela in tabelas:
        try: await client.execute(f"ALTER TABLE {tabela} ADD COLUMN usuario_id INTEGER")
        except Exception: pass 
        
    try: await client.execute("ALTER TABLE biblioteca_busca ADD COLUMN link TEXT DEFAULT ''")
    except: pass
    try: await client.execute("ALTER TABLE biblioteca_busca ADD COLUMN categoria TEXT DEFAULT 'agitadas1'")
    except: pass
    for t in ["agitadas1", "agitadas2", "lentas1", "lentas2", "ceia", "infantis"]:
        try: await client.execute(f"ALTER TABLE {t} ADD COLUMN link TEXT DEFAULT ''")
        except: pass

    await client.close()
    yield
app = FastAPI(lifespan=lifespan)

# --- Configuração CORS (LIBERADO PARA ANDROID E FRONTEND) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================
# ROTAS DE AUTENTICAÇÃO E USUÁRIOS
# ==========================================================

@app.post("/auth/register")
async def register_user(user: UserCreate):
    client = get_db_client()
    try:
        # Verifica se email já existe
        check = await client.execute("SELECT id FROM usuarios WHERE email = ?", [user.email])
        if check.rows:
            raise HTTPException(status_code=400, detail="Email já cadastrado.")
        
        hashed_pwd = get_password_hash(user.password)
        res = await client.execute(
            "INSERT INTO usuarios (email, senha, usar_banco_padrao) VALUES (?, ?, 1)",
            [user.email, hashed_pwd]
        )
        return {"message": "Usuário criado com sucesso", "id": res.last_insert_rowid}
    finally:
        await client.close()

@app.post("/auth/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    client = get_db_client()
    try:
        result = await client.execute("SELECT id, senha FROM usuarios WHERE email = ?", [form_data.username])
        if not result.rows:
            raise HTTPException(status_code=401, detail="Email ou senha incorretos", headers={"WWW-Authenticate": "Bearer"})
        
        user_db = result.rows[0]
        user_id = user_db[0]
        hashed_pwd = user_db[1]
        
        if not verify_password(form_data.password, hashed_pwd):
            raise HTTPException(status_code=401, detail="Email ou senha incorretos", headers={"WWW-Authenticate": "Bearer"})
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user_id)}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    finally:
        await client.close()

# ==========================================================
# ROTAS NOVAS: ESCALA DE LOUVOR E GESTÃO DE MEMBROS (MULTI-TENANT)
# ==========================================================

@app.get("/equipe")
async def get_equipe(apenas_ativos: bool = True, current_user: dict = Depends(get_current_user)):
    """Retorna apenas os membros vinculados ao usuário logado."""
    client = get_db_client()
    try:
        user_id = current_user["id"]
        query = '''
            SELECT m.id, m.nome, m.telefone, m.email, m.status, GROUP_CONCAT(TRIM(f.nome)) as funcoes
            FROM membros m
            LEFT JOIN membro_funcoes mf ON m.id = mf.membro_id
            LEFT JOIN funcoes f ON mf.funcao_id = f.id
            WHERE m.usuario_id = ?
        '''
        if apenas_ativos: query += " AND m.status = 'ativo' "
        query += " GROUP BY m.id ORDER BY m.nome"
        
        result = await client.execute(query, [user_id])
        equipe = []
        for row in result.rows:
            funcoes_lista = row[5].split(',') if row[5] else []
            equipe.append({
                "id": row[0], "nome": row[1], "telefone": row[2] or "",
                "email": row[3] or "", "status": row[4] or "ativo", "funcoes": funcoes_lista
            })
        return {"equipe": equipe}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

@app.post("/equipe")
async def add_membro(membro: MembroRequest, current_user: dict = Depends(get_current_user)):
    client = get_db_client()
    try:
        user_id = current_user["id"]
        res = await client.execute(
            "INSERT INTO membros (nome, telefone, email, status, usuario_id) VALUES (?, ?, ?, ?, ?)",
            [membro.nome, membro.telefone, membro.email, membro.status, user_id]
        )
        membro_id = res.last_insert_rowid
        
        for f in membro.funcoes:
            f_res = await client.execute("SELECT id FROM funcoes WHERE TRIM(nome) = ? AND usuario_id = ?", [f.strip(), user_id])
            if f_res.rows:
                await client.execute("INSERT INTO membro_funcoes (membro_id, funcao_id) VALUES (?, ?)", [membro_id, f_res.rows[0][0]])
        return {"message": "Membro adicionado com sucesso!", "id": membro_id}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

@app.put("/equipe/{membro_id}")
async def update_membro(membro_id: int, membro: MembroRequest, current_user: dict = Depends(get_current_user)):
    client = get_db_client()
    try:
        user_id = current_user["id"]
        check = await client.execute("SELECT id FROM membros WHERE id = ? AND usuario_id = ?", [membro_id, user_id])
        if not check.rows: raise HTTPException(status_code=403, detail="Você não tem permissão para editar este membro.")

        await client.execute(
            "UPDATE membros SET nome = ?, telefone = ?, email = ?, status = ? WHERE id = ?",
            [membro.nome, membro.telefone, membro.email, membro.status, membro_id]
        )
        
        await client.execute("DELETE FROM membro_funcoes WHERE membro_id = ?", [membro_id])
        for f in membro.funcoes:
            f_res = await client.execute("SELECT id FROM funcoes WHERE TRIM(nome) = ? AND usuario_id = ?", [f.strip(), user_id])
            if f_res.rows:
                await client.execute("INSERT INTO membro_funcoes (membro_id, funcao_id) VALUES (?, ?)", [membro_id, f_res.rows[0][0]])
        return {"message": "Membro atualizado com sucesso!"}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

@app.delete("/equipe/{membro_id}")
async def delete_membro(membro_id: int, current_user: dict = Depends(get_current_user)):
    client = get_db_client()
    try:
        await client.execute("DELETE FROM membros WHERE id = ? AND usuario_id = ?", [membro_id, current_user["id"]])
        return {"message": "Membro excluído com sucesso!"}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

# --- ROTAS DE FUNÇÕES (CRUD MULTI-TENANT INTELIGENTE) ---

@app.get("/funcoes")
async def get_funcoes(current_user: dict = Depends(get_current_user)):
    client = get_db_client()
    try:
        result = await client.execute("SELECT id, TRIM(nome) FROM funcoes WHERE usuario_id = ? ORDER BY TRIM(nome)", [current_user["id"]])
        funcoes = [{"id": row[0], "nome": row[1]} for row in result.rows]
        return {"funcoes": funcoes}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

@app.post("/funcoes")
async def add_funcao(funcao: FuncaoRequest, current_user: dict = Depends(get_current_user)):
    client = get_db_client()
    try:
        user_id = current_user["id"]
        nome_limpo = funcao.nome.strip()
        
        try:
            res = await client.execute("INSERT INTO funcoes (nome, usuario_id) VALUES (?, ?)", [nome_limpo, user_id])
            funcao_id = res.last_insert_rowid
        except Exception:
            # Trava UNIQUE atingida. A API toma uma decisão inteligente para contornar:
            check = await client.execute("SELECT id, usuario_id FROM funcoes WHERE nome = ?", [nome_limpo])
            if check.rows:
                existente_id = check.rows[0][0]
                existente_uid = check.rows[0][1]
                
                if existente_uid is None:
                    # Função global antiga. O usuário atual "adota" a posse.
                    await client.execute("UPDATE funcoes SET usuario_id = ? WHERE id = ?", [user_id, existente_id])
                    funcao_id = existente_id
                elif existente_uid == user_id:
                    # Já pertence a este usuário. Apenas reutiliza.
                    funcao_id = existente_id
                else:
                    # Pertence a outro usuário. Burlar a trava UNIQUE com um espaço invisível.
                    res_bypass = await client.execute("INSERT INTO funcoes (nome, usuario_id) VALUES (?, ?)", [nome_limpo + " ", user_id])
                    funcao_id = res_bypass.last_insert_rowid
            else:
                return {"error": "Falha de restrição de banco."}
        
        if funcao.membros_ids:
            for m_id in funcao.membros_ids:
                check_mf = await client.execute("SELECT * FROM membro_funcoes WHERE membro_id = ? AND funcao_id = ?", [m_id, funcao_id])
                if not check_mf.rows:
                    await client.execute("INSERT INTO membro_funcoes (membro_id, funcao_id) VALUES (?, ?)", [m_id, funcao_id])
        return {"message": "Função processada com sucesso!", "id": funcao_id}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

@app.put("/funcoes/{funcao_id}")
async def update_funcao(funcao_id: int, funcao: FuncaoRequest, current_user: dict = Depends(get_current_user)):
    client = get_db_client()
    try:
        nome_limpo = funcao.nome.strip()
        try:
            await client.execute("UPDATE funcoes SET nome = ? WHERE id = ? AND usuario_id = ?", [nome_limpo, funcao_id, current_user["id"]])
        except Exception:
            # Se bater no UNIQUE ao renomear, burla com o espaço
            await client.execute("UPDATE funcoes SET nome = ? WHERE id = ? AND usuario_id = ?", [nome_limpo + " ", funcao_id, current_user["id"]])
        return {"message": "Função atualizada!"}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

@app.delete("/funcoes/{funcao_id}")
async def delete_funcao(funcao_id: int, current_user: dict = Depends(get_current_user)):
    client = get_db_client()
    try:
        await client.execute("DELETE FROM funcoes WHERE id = ? AND usuario_id = ?", [funcao_id, current_user["id"]])
        return {"message": "Função excluída!"}
    except Exception as e: return {"error": str(e)}
    finally: await client.close()

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
# ROTAS DO LEVIROBOTO (REPERTÓRIO E BUSCA MULTI-TENANT)
# ==========================================================

oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

async def get_optional_user(token: Optional[str] = Depends(oauth2_scheme_optional)):
    """Permite que visitantes usem o bot sem token, mas identifica quem está logado."""
    if not token: return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None: return None
        
        client = get_db_client()
        result = await client.execute("SELECT id, email, usar_banco_padrao FROM usuarios WHERE id = ?", [user_id])
        await client.close()
        
        if not result.rows: return None
        user = result.rows[0]
        return {"id": user[0], "email": user[1], "usar_banco_padrao": user[2]}
    except:
        return None

@app.get("/musicas/buscar")
async def buscar_musicas(q: str, current_user: Optional[dict] = Depends(get_optional_user)):
    try:
        client = get_db_client()
        if not current_user or current_user["usar_banco_padrao"] == 1:
            result = await client.execute("SELECT nome_musica, tags, link FROM biblioteca_busca WHERE usuario_id IS NULL")
        else:
            result = await client.execute("SELECT nome_musica, tags, link FROM biblioteca_busca WHERE usuario_id = ?", [current_user["id"]])
        await client.close()
        
        q_lower = q.lower().strip()
        todas_tags = set()
        for row in result.rows:
            tags = [t.strip().lower() for t in row[1].split(',') if t.strip()]
            todas_tags.update(tags)
            
        closest_word = q_lower
        matches = difflib.get_close_matches(q_lower, list(todas_tags), n=1, cutoff=0.6)
        if matches: closest_word = matches[0]
            
        musicas_encontradas = []
        for row in result.rows:
            nome, tags_str, link = row[0], row[1], row[2]
            tags = [t.strip().lower() for t in tags_str.split(',')]
            if closest_word in tags or closest_word in nome.lower():
                resultado_str = f"{nome}: {link}" if link else nome
                musicas_encontradas.append(resultado_str)
                
        random.shuffle(musicas_encontradas)
        return {"closest_word": closest_word, "resultados": musicas_encontradas[:10]}
    except Exception as e:
        return {"error": str(e)}

@app.get("/musicas/sortear")
async def sortear_musica(current_user: Optional[dict] = Depends(get_optional_user)):
    try:
        client = get_db_client()
        
        # Se for visitante ou usar o banco padrão (Lógica Antiga Fixa)
        if not current_user or current_user["usar_banco_padrao"] == 1:
            async def pegar_aleatoria(tabela):
                try:
                    res = await client.execute(f"SELECT conteudo, link FROM {tabela} WHERE usuario_id IS NULL ORDER BY RANDOM() LIMIT 1")
                    if res.rows:
                        nome, link = res.rows[0][0], res.rows[0][1]
                        return f"{nome}: {link}" if link else nome
                    return "Nenhuma música cadastrada."
                except: return "Erro ao buscar."

            resultado = {
                "is_custom": False,
                "agitadas1": await pegar_aleatoria("agitadas1"),
                "agitadas2": await pegar_aleatoria("agitadas2"), 
                "lentas1": await pegar_aleatoria("lentas1"),
                "lentas2": await pegar_aleatoria("lentas2"),
                "ceia": await pegar_aleatoria("ceia"),
                "infantis": await pegar_aleatoria("infantis")
            }
            await client.close()
            return resultado
            
        # Se usar o Repertório Pessoal (Lógica Dinâmica)
        else:
            user_id = current_user["id"]
            # 1. Pega todas as categorias únicas que o usuário criou
            res_cats = await client.execute("SELECT DISTINCT categoria FROM biblioteca_busca WHERE usuario_id = ? AND categoria IS NOT NULL", [user_id])
            categorias = [row[0] for row in res_cats.rows if row[0].strip() != ""]
            
            sorteio = {}
            # 2. Sorteia 1 música de cada categoria do usuário
            for cat in categorias:
                res_musica = await client.execute(
                    "SELECT nome_musica, link FROM biblioteca_busca WHERE usuario_id = ? AND categoria = ? ORDER BY RANDOM() LIMIT 1", 
                    [user_id, cat]
                )
                if res_musica.rows:
                    nome, link = res_musica.rows[0][0], res_musica.rows[0][1]
                    sorteio[cat] = f"{nome}: {link}" if link else nome
                    
            await client.close()
            return {"is_custom": True, "sorteio": sorteio}
            
    except Exception as e:
        return {"error": str(e)}

# --- ROTAS PARA GERENCIAR O PRÓPRIO REPERTÓRIO E PERFIL ---
class ConfigRequest(BaseModel):
    usar_banco_padrao: Optional[bool] = None
    funcoes_padrao: Optional[str] = None

@app.put("/usuario/config")
async def update_config(config: ConfigRequest, current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        
        if config.usar_banco_padrao is not None:
            val = 1 if config.usar_banco_padrao else 0
            await client.execute("UPDATE usuarios SET usar_banco_padrao = ? WHERE id = ?", [val, current_user["id"]])
            
        if config.funcoes_padrao is not None:
            await client.execute("UPDATE usuarios SET funcoes_padrao = ? WHERE id = ?", [config.funcoes_padrao, current_user["id"]])
            
        await client.close()
        return {"message": "Configuração atualizada!"}
    except Exception as e: return {"error": str(e)}

@app.get("/usuario/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        res = await client.execute("SELECT funcoes_padrao FROM usuarios WHERE id = ?", [current_user["id"]])
        padrao = res.rows[0][0] if res.rows and res.rows[0][0] else "Mídia,Voz e violão,Voz 1,Voz 2,Voz 3"
        await client.close()
        
        return {
            "email": current_user["email"], 
            "usar_banco_padrao": bool(current_user["usar_banco_padrao"]),
            "funcoes_padrao": padrao
        }
    except Exception as e: return {"error": str(e)}

# ==========================================================
# CRUD DE CATEGORIAS DO REPERTÓRIO
# ==========================================================
class CategoriaRequest(BaseModel):
    nome: str

@app.get("/categorias")
async def get_categorias(current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        result = await client.execute("SELECT id, nome FROM categorias_repertorio WHERE usuario_id = ? ORDER BY nome", [current_user["id"]])
        categorias = [{"id": row[0], "nome": row[1]} for row in result.rows]
        await client.close()
        return {"categorias": categorias}
    except Exception as e: return {"error": str(e)}

@app.post("/categorias")
async def add_categoria(req: CategoriaRequest, current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        await client.execute("INSERT INTO categorias_repertorio (nome, usuario_id) VALUES (?, ?)", [req.nome, current_user["id"]])
        await client.close()
        return {"message": "Categoria criada!"}
    except Exception as e: return {"error": str(e)}

@app.put("/categorias/{cat_id}")
async def update_categoria(cat_id: int, req: CategoriaRequest, current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        user_id = current_user["id"]
        
        # Pega o nome antigo para atualizar nas músicas que já usam essa categoria
        old_res = await client.execute("SELECT nome FROM categorias_repertorio WHERE id = ? AND usuario_id = ?", [cat_id, user_id])
        if old_res.rows:
            old_nome = old_res.rows[0][0]
            await client.execute("UPDATE biblioteca_busca SET categoria = ? WHERE categoria = ? AND usuario_id = ?", [req.nome, old_nome, user_id])
        
        # Atualiza a categoria em si
        await client.execute("UPDATE categorias_repertorio SET nome = ? WHERE id = ? AND usuario_id = ?", [req.nome, cat_id, user_id])
        await client.close()
        return {"message": "Categoria atualizada!"}
    except Exception as e: return {"error": str(e)}

@app.delete("/categorias/{cat_id}")
async def delete_categoria(cat_id: int, current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        user_id = current_user["id"]
        
        # Pega o nome antigo para tirar das músicas que usavam ela
        old_res = await client.execute("SELECT nome FROM categorias_repertorio WHERE id = ? AND usuario_id = ?", [cat_id, user_id])
        if old_res.rows:
            old_nome = old_res.rows[0][0]
            await client.execute("UPDATE biblioteca_busca SET categoria = 'Sem Categoria' WHERE categoria = ? AND usuario_id = ?", [old_nome, user_id])

        # Exclui a categoria
        await client.execute("DELETE FROM categorias_repertorio WHERE id = ? AND usuario_id = ?", [cat_id, user_id])
        await client.close()
        return {"message": "Categoria excluída!"}
    except Exception as e: return {"error": str(e)}


class NovaMusicaRequest(BaseModel):
    nome_musica: str
    tags: str
    categoria: str 
    link: Optional[str] = ""

class EditaMusicaRequest(BaseModel):
    nome_musica: str
    tags: str
    categoria: str
    link: Optional[str] = ""

@app.get("/musicas/custom")
async def get_custom_musicas(current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        result = await client.execute("SELECT id, nome_musica, tags, categoria, link FROM biblioteca_busca WHERE usuario_id = ? ORDER BY nome_musica", [current_user["id"]])
        musicas = [{"id": r[0], "nome_musica": r[1], "tags": r[2], "categoria": r[3] or "Sem Categoria", "link": r[4] or ""} for r in result.rows]
        await client.close()
        return {"musicas": musicas}
    except Exception as e: return {"error": str(e)}

@app.post("/musicas/custom")
async def add_custom_musica(musica: NovaMusicaRequest, current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        await client.execute(
            "INSERT INTO biblioteca_busca (nome_musica, tags, usuario_id, link, categoria) VALUES (?, ?, ?, ?, ?)",
            [musica.nome_musica, musica.tags, current_user["id"], musica.link, musica.categoria]
        )
        await client.close()
        return {"message": "Música adicionada ao seu repertório!"}
    except Exception as e: return {"error": str(e)}

@app.put("/musicas/custom/{musica_id}")
async def update_custom_musica(musica_id: int, req: EditaMusicaRequest, current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        await client.execute(
            "UPDATE biblioteca_busca SET nome_musica = ?, tags = ?, categoria = ?, link = ? WHERE id = ? AND usuario_id = ?",
            [req.nome_musica, req.tags, req.categoria, req.link, musica_id, current_user["id"]]
        )
        await client.close()
        return {"message": "Música atualizada!"}
    except Exception as e: return {"error": str(e)}

@app.delete("/musicas/custom/{musica_id}")
async def delete_custom_musica(musica_id: int, current_user: dict = Depends(get_current_user)):
    try:
        client = get_db_client()
        await client.execute("DELETE FROM biblioteca_busca WHERE id = ? AND usuario_id = ?", [musica_id, current_user["id"]])
        await client.close()
        return {"message": "Música removida!"}
    except Exception as e: return {"error": str(e)}

class SugestaoRequest(BaseModel):
    usuario: str
    sugestao: str

@app.post("/musicas/sugerir")
async def sugerir_musica(req: SugestaoRequest):
    try:
        google_creds_env = os.getenv("GOOGLE_CREDENTIALS")
        if google_creds_env:
            creds_dict = json.loads(google_creds_env)
            gc = gspread.service_account_from_dict(creds_dict)
        else:
            gc = gspread.service_account(filename="credentials.json")
        sh = gc.open("Sugestões de músicas LeviRoboto")
        sh.sheet1.append_row([req.usuario, req.sugestao])
        return {"message": "Sucesso"}
    except Exception as e: return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)