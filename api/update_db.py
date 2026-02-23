import asyncio
import libsql_client

# Usando as mesmas credenciais do seu init_db.py
url = "https://levi-roboto-db-rfpanfil.aws-us-east-2.turso.io"
token = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzE4NjIxODIsImlkIjoiMzZkMGNlYmItZDIwMS00NWU1LWI0ZTgtMDk5MmJhNWUzZTVlIiwicmlkIjoiMzZjYTljZjQtNmE0Ny00MDc4LTk5NWItYzY5YWJiY2FmMjA3In0.ctX09Go_KYD8wUFulZpRm8JSLHHRL1Ou44yualixomTUvSAx2x164BASeB-WfJRatV6JXcKRIF1U4wzCQwF9Cg"

async def update_database():
    try:
        client = libsql_client.create_client(url=url, auth_token=token)
        print("✅ Conectado ao Turso!")

        print("Adicionando novas colunas na tabela membros...")
        
        # O SQLite exige adicionar uma coluna por vez
        try:
            await client.execute("ALTER TABLE membros ADD COLUMN telefone TEXT DEFAULT ''")
            print("✅ Coluna 'telefone' adicionada.")
        except Exception as e:
            print("Aviso (telefone):", e) # Ignora se a coluna já existir

        try:
            await client.execute("ALTER TABLE membros ADD COLUMN email TEXT DEFAULT ''")
            print("✅ Coluna 'email' adicionada.")
        except Exception as e:
            print("Aviso (email):", e)

        try:
            await client.execute("ALTER TABLE membros ADD COLUMN status TEXT DEFAULT 'ativo'")
            print("✅ Coluna 'status' adicionada.")
        except Exception as e:
            print("Aviso (status):", e)

        print("🎉 Banco de dados atualizado com sucesso para suportar a Gestão Completa!")

    except Exception as e:
        print(f"❌ Ocorreu um erro geral: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(update_database())