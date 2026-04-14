#!/usr/bin/env python3
"""
Cria arquivo .htpasswd para proteger o painel sqlite-web via nginx.
Uso: python3 scripts/create-db-password.py
"""
import getpass, hashlib, base64, os, secrets, string

HTPASSWD_FILE = '/etc/nginx/.htpasswd-dii'

def bcrypt_hash(password):
    """Usa passlib se disponível, senão SHA1 (compatível nginx)"""
    try:
        from passlib.hash import apr_md5_crypt
        return apr_md5_crypt.hash(password)
    except ImportError:
        pass
    # Fallback: SHA1 base64 (suportado pelo nginx)
    import hashlib, base64
    h = base64.b64encode(hashlib.sha1(password.encode()).digest()).decode()
    return f'{{SHA}}{h}'

print('\nDII — Criar senha para o painel SQLite Web')
print('==========================================')
username = input('Usuário (ex: admin): ').strip() or 'admin'
password = getpass.getpass('Senha: ')
confirm  = getpass.getpass('Confirmar senha: ')

if password != confirm:
    print('ERRO: Senhas não conferem.')
    exit(1)

hashed = bcrypt_hash(password)
line   = f'{username}:{hashed}\n'

try:
    os.makedirs(os.path.dirname(HTPASSWD_FILE), exist_ok=True)
    with open(HTPASSWD_FILE, 'w') as f:
        f.write(line)
    print(f'\nArquivo criado: {HTPASSWD_FILE}')
    print(f'Usuário: {username}')
    print('\nReinicie o nginx: systemctl reload nginx')
except PermissionError:
    # Tentar em path local
    local = os.path.join(os.path.dirname(__file__), '..', '.htpasswd-dii')
    with open(local, 'w') as f:
        f.write(line)
    print(f'\nSem permissão para /etc/nginx. Arquivo criado em: {os.path.abspath(local)}')
    print(f'Mova manualmente: sudo mv {os.path.abspath(local)} {HTPASSWD_FILE}')
