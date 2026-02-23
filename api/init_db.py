import asyncio
import libsql_client

# Valores colados diretamente (sem usar os.getenv ou .env)
url = "https://levi-roboto-db-rfpanfil.aws-us-east-2.turso.io"
token = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzE4NjIxODIsImlkIjoiMzZkMGNlYmItZDIwMS00NWU1LWI0ZTgtMDk5MmJhNWUzZTVlIiwicmlkIjoiMzZjYTljZjQtNmE0Ny00MDc4LTk5NWItYzY5YWJiY2FmMjA3In0.ctX09Go_KYD8wUFulZpRm8JSLHHRL1Ou44yualixomTUvSAx2x164BASeB-WfJRatV6JXcKRIF1U4wzCQwF9Cg"

# Dados iniciais da equipe
EQUIPA = {
    "Angelino": ["Voz"],
    "Beto": ["Mídia", "Som", "Live", "Mídia e Som", "Mídia e Live", "Som e Live"],
    "Claudia": ["Voz", "Voz e violão", "Violão"],
    "Ester": ["Voz"],
    "Jonathan": ["Baixo"],
    "Lucas": ["Voz", "Voz e violão", "Violão", "Guitarra", "Baixo", "Bateria", "Teclado", "Cajon", "Mídia", "Som", "Live", "Mídia e Som", "Mídia e Live", "Som e Live"],
    "Leonardo": ["Mídia", "Som", "Live", "Mídia e Som", "Mídia e Live", "Som e Live"],
    "Micheli": ["Voz"],
    "Mireli": ["Voz"],
    "Rafael": ["Cajon", "Mídia", "Som", "Live", "Mídia e Som", "Mídia e Live", "Som e Live", "Voz", "Voz e violão", "Violão", "Guitarra"],
    "Silvanir": ["Voz"],
    "Davi": ["Voz e violão", "Violão", "Guitarra"],
    "Rebeca": ["Mídia"]
}

async def setup_database():
    try:
        if not url or not token:
            print("ERRO: Credenciais ausentes.")
            return

        # Conecta ao Turso
        client = libsql_client.create_client(url=url, auth_token=token)
        print("✅ Conectado ao Turso com sucesso!")

        # 1. Criar as Tabelas
        print("A criar tabelas...")
        await client.execute("""
            CREATE TABLE IF NOT EXISTS membros (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT UNIQUE NOT NULL
            )
        """)
        
        await client.execute("""
            CREATE TABLE IF NOT EXISTS funcoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT UNIQUE NOT NULL
            )
        """)
        
        await client.execute("""
            CREATE TABLE IF NOT EXISTS membro_funcoes (
                membro_id INTEGER,
                funcao_id INTEGER,
                PRIMARY KEY (membro_id, funcao_id),
                FOREIGN KEY (membro_id) REFERENCES membros(id) ON DELETE CASCADE,
                FOREIGN KEY (funcao_id) REFERENCES funcoes(id) ON DELETE CASCADE
            )
        """)

        # 2. Extrair todas as funções únicas e inserir
        todas_funcoes = set()
        for funcoes in EQUIPA.values():
            todas_funcoes.update(funcoes)
            
        print("A inserir funções...")
        for f in todas_funcoes:
            await client.execute("INSERT OR IGNORE INTO funcoes (nome) VALUES (?)", [f])

        # 3. Inserir membros e fazer a ligação com as funções
        print("A inserir membros e as suas funções...")
        for nome, funcoes in EQUIPA.items():
            # Insere o membro
            await client.execute("INSERT OR IGNORE INTO membros (nome) VALUES (?)", [nome])
            
            # Vai buscar o ID do membro recém-inserido (ou já existente)
            result_membro = await client.execute("SELECT id FROM membros WHERE nome = ?", [nome])
            membro_id = result_membro.rows[0][0]
            
            # Faz a ligação na tabela membro_funcoes
            for f in funcoes:
                result_funcao = await client.execute("SELECT id FROM funcoes WHERE nome = ?", [f])
                funcao_id = result_funcao.rows[0][0]
                
                await client.execute(
                    "INSERT OR IGNORE INTO membro_funcoes (membro_id, funcao_id) VALUES (?, ?)", 
                    [membro_id, funcao_id]
                )

        print("🎉 Base de dados inicializada e populada com sucesso!")

    except Exception as e:
        print(f"❌ Ocorreu um erro: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(setup_database())