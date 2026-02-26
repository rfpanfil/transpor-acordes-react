import asyncio
import libsql_client
import os
from dotenv import load_dotenv

# Carrega as chaves do seu arquivo .env local
load_dotenv()

url = os.getenv("TURSO_DATABASE_URL")
token = os.getenv("TURSO_AUTH_TOKEN")

async def ver_banco():
    if not url or not token:
        print("❌ Erro: TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não encontrados no .env")
        return

    client = None
    try:
        # 1. PRIMEIRO conectamos ao banco (A ORDEM É ESSENCIAL)
        print(f"Conectando ao banco: {url}")
        client = libsql_client.create_client(url=url, auth_token=token)
        print("✅ Conectado com sucesso!\n")

        # 2. GARANTIR A ESTRUTURA (Reset para garantir que a coluna 'senha' exista)
        # Rodamos isso uma vez para sincronizar a tabela com o código da API
        print("Sincronizando estrutura da tabela 'usuarios'...")
        await client.execute("DROP TABLE IF EXISTS usuarios")
        await client.execute('''
            CREATE TABLE usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                usar_banco_padrao BOOLEAN DEFAULT 1
            )
        ''')
        print("✅ Tabela 'usuarios' pronta para a Fase 1!\n")

        # 3. CONSULTA: Funções
        print("--- 🎸 FUNÇÕES CADASTRADAS ---")
        res_funcoes = await client.execute("SELECT id, nome FROM funcoes ORDER BY nome")
        for row in res_funcoes.rows:
            print(f"ID: {row[0]} | Nome: '{row[1]}'")
        print("\n")

        # 4. CONSULTA: Usuários
        print("--- 🔐 USUÁRIOS DO SISTEMA ---")
        res_users = await client.execute("SELECT id, email FROM usuarios")
        if not res_users.rows:
            print("Nenhum usuário cadastrado ainda.")
        else:
            for row in res_users.rows:
                print(f"ID: {row[0]} | Email: {row[1]}")

    except Exception as e:
        print(f"❌ Ocorreu um erro: {e}")
    finally:
        if client:
            await client.close()
            print("\nConexão fechada.")

if __name__ == "__main__":
    asyncio.run(ver_banco())