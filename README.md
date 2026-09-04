# Go Live De Queijo

Plugin para **BetterDiscord** focado em **Go Live, compartilhamento de tela e câmera**.

O plugin usa **DIRECT-FIRST**: mantém a conexão normal do Discord sempre que ela estiver boa e só procura uma rota alternativa quando necessário.

Quando precisa de fallback, ele pode testar rotas usando **SOCKS5 + sing-box/TUN**, comparando ping, jitter e perda de pacotes.

**Versão atual: `2.0.9`**

---

# Instalação

## 1. Instale o BetterDiscord

Primeiro você precisa instalar o BetterDiscord:

https://betterdiscord.app/

Baixe e instale normalmente no seu Discord.

Depois abra:

```text
Configurações
→ BetterDiscord
→ Plugins
```

---

## 2. Baixe o plugin

Baixe o arquivo:

```text
GoLiveDeQueijo.plugin.js
```

do repositório:

```text
https://github.com/paodequeijo616/GoLiveBypass_BetterDiscord
```

---

## 3. Coloque na pasta de plugins

No BetterDiscord clique em:

```text
Configurações
→ BetterDiscord
→ Plugins
→ Abrir pasta de plugins
```

Ou abra diretamente:

```text
%APPDATA%\BetterDiscord\plugins
```

Coloque dentro dela:

```text
GoLiveDeQueijo.plugin.js
```

---

## 4. Ative o plugin

Volte para:

```text
Configurações
→ BetterDiscord
→ Plugins
```

e ative:

```text
Go Live De Queijo
```

---

## 5. Faça a primeira configuração

Abra as configurações do plugin.

Na primeira vez ele ficará desativado até você concluir o tutorial.

Clique em:

```text
Ativar Go Live De Queijo
```

O tutorial possui **4 etapas** e cada etapa libera o botão `Próximo` depois de alguns segundos.

Ele explica:

- o que o plugin altera;
- como as rotas são testadas;
- quando PowerShell/UAC podem aparecer;
- uso do sing-box/TUN;
- como pausar ou limpar a integração.

Na última etapa clique em:

```text
Ativar e reiniciar
```

O Discord será reiniciado.

---

# Como funciona

Fluxo principal:

```text
Discord
  ↓
DIRECT
  ↓
se estiver bom
  └─ continua DIRECT

se precisar de fallback
  ↓
best-routes.json
  ↓
routes.json / routes.txt
  ↓
Media Route Race
  ↓
SOCKS5 / sing-box / TUN
```

O plugin tenta evitar proxy/TUN quando a conexão direta já estiver funcionando bem.

---

# Configurações

Depois de ativado, o painel mostra:

```text
Rota
Fallback
Runtime
Mídia
```

Também possui:

```text
Região RTC
Atualização automática
Instalar updates automaticamente
Logs técnicos
Copiar diagnóstico
Buscar atualização
Limpar integração
```

---

# Logs

Em:

```text
Logs técnicos
```

existem as abas:

```text
Native
Renderer
Sing-box
Runner
```

---

# Pausar

Você pode usar:

```text
Pausar
```

Isso desativa a integração, mas mantém o aceite salvo.

Depois basta usar:

```text
Ativar e reiniciar
```

---

# Limpar integração

Use:

```text
Limpar integração
```

para remover:

- hook do Discord;
- sing-box/TUN;
- Scheduled Task;
- caches;
- logs;
- configurações locais.

O arquivo:

```text
GoLiveDeQueijo.plugin.js
```

continua na pasta do BetterDiscord.

---

# Arquivos de rotas

O plugin usa:

```text
routes.json
routes.txt
```

do próprio repositório para encontrar possíveis rotas de fallback.

---

# Aviso

Este projeto é independente e não é oficial do Discord ou BetterDiscord.

Rotas SOCKS5 públicas são serviços de terceiros e podem ficar lentas, offline ou instáveis.

O plugin prioriza a conexão DIRECT sempre que possível.

---

# Repositório

```text
https://github.com/paodequeijo616/GoLiveBypass_BetterDiscord
```
