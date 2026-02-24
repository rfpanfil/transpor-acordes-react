import sqlite3
import asyncio
import libsql_client

# Usando EXATAMENTE o mesmo formato de URL e Token do seu init_db.py
url = "https://levi-roboto-db-rfpanfil.aws-us-east-2.turso.io"
token = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzE4NjIxODIsImlkIjoiMzZkMGNlYmItZDIwMS00NWU1LWI0ZTgtMDk5MmJhNWUzZTVlIiwicmlkIjoiMzZjYTljZjQtNmE0Ny00MDc4LTk5NWItYzY5YWJiY2FmMjA3In0.ctX09Go_KYD8wUFulZpRm8JSLHHRL1Ou44yualixomTUvSAx2x164BASeB-WfJRatV6JXcKRIF1U4wzCQwF9Cg"

async def migrar_banco():
    print("Iniciando migração...")

    try:
        conn_local = sqlite3.connect('musicas.db')
        cursor = conn_local.cursor()
        cursor.execute("SELECT nome_musica, tags FROM biblioteca_busca")
        musicas = cursor.fetchall()
        print(f"✅ Encontradas {len(musicas)} músicas no banco local 'musicas.db'.")
    except Exception as e:
        print(f"❌ Erro ao ler banco local: {e}")
        return

    print("Conectando ao Turso via HTTPS...")
    client_turso = libsql_client.create_client(url=url, auth_token=token)

    try:
        # Cria a tabela caso não exista
        await client_turso.execute("""
            CREATE TABLE IF NOT EXISTS biblioteca_busca (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_musica TEXT NOT NULL,
                tags TEXT NOT NULL
            )
        """)
        
        # Limpa a tabela para não duplicar
        await client_turso.execute("DELETE FROM biblioteca_busca")

        print("A enviar músicas para a nuvem (pode levar alguns segundos)...")
        
        # Loop simples igual ao do init_db.py
        inseridas = 0
        for nome, tags in musicas:
            await client_turso.execute(
                "INSERT INTO biblioteca_busca (nome_musica, tags) VALUES (?, ?)",
                [nome, tags]
            )
            inseridas += 1

        print(f"🚀 SUCESSO! {inseridas} músicas foram migradas para o Turso.")
    except Exception as e:
        print(f"❌ Erro durante a comunicação com o Turso: {e}")
    finally:
        await client_turso.close()
        conn_local.close()

if __name__ == "__main__":
    asyncio.run(migrar_banco())