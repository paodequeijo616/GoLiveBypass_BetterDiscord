# Go Live De Queijo

> BetterDiscord plugin para **Go Live, compartilhamento de tela e câmera**, com conexão **DIRECT-FIRST** e fallback automático de rede.

**Versão atual: `2.0.9`**

---

## Visão geral

O **Go Live De Queijo** mantém o Discord usando a conexão direta sempre que possível.

Se houver necessidade de fallback, o plugin pode avaliar rotas alternativas e preparar uma rota por **SOCKS5 + sing-box/TUN**.

A prioridade é:

```text
1. DIRECT
2. melhor rota já conhecida
3. routes.json / routes.txt
4. Media Route Race
5. fallback TUN/SOCKS5
```

A ideia não é colocar uma VPN/proxy em tudo o tempo todo.

Se o DIRECT estiver funcionando bem, ele continua sendo usado.

---

## Recursos

- Go Live / compartilhamento de tela.
- Câmera.
- DIRECT-FIRST.
- Media Route Race.
- Testes de UDP.
- Medição de RTT.
- Medição de jitter.
- Detecção de perda de pacotes.
- Comparação entre DIRECT e rotas alternativas.
- `best-routes.json` com rotas conhecidas.
- `routes.json` central.
- `routes.txt` como fallback.
- sing-box/TUN quando necessário.
- atualização automática opcional.
- diagnóstico integrado.
- logs separados:
  - Native;
  - Renderer;
  - Sing-box;
  - Runner.
- tutorial de ativação.
- opção de pausar a integração.
- opção de limpar a integração.

---

# Instalação

## 1. Requisitos

Antes de instalar, você precisa ter:

- Discord Desktop para Windows;
- BetterDiscord instalado;
- acesso à pasta de plugins do BetterDiscord;
- conexão com a internet.

Em algumas situações, o Windows poderá solicitar permissão administrativa para configurar componentes de rede.

---

## 2. Baixe o plugin

Baixe:

```text
GoLiveDeQueijo.plugin.js
```

do repositório:

```text
https://github.com/paodequeijo616/GoLiveBypass_BetterDiscord
```

Os arquivos:

```text
routes.json
routes.txt
```

ficam no GitHub e são utilizados pelo plugin como dataset remoto.

Você não precisa colocar `routes.json` e `routes.txt` dentro da pasta de plugins do BetterDiscord.

---

## 3. Abra a pasta de plugins

No Discord:

```text
Configurações
→ BetterDiscord
→ Plugins
→ Abrir pasta de plugins
```

Ou abra diretamente pelo Windows:

```text
%APPDATA%\BetterDiscord\plugins
```

---

## 4. Instale o arquivo

Coloque:

```text
GoLiveDeQueijo.plugin.js
```

dentro de:

```text
%APPDATA%\BetterDiscord\plugins
```

Exemplo:

```text
C:\Users\SEU_USUARIO\AppData\Roaming\BetterDiscord\plugins\GoLiveDeQueijo.plugin.js
```

---

## 5. Ative o plugin no BetterDiscord

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

### Importante

Ativar o plugin no BetterDiscord **não ativa imediatamente a integração de rede/vídeo**.

Na primeira utilização, o Go Live De Queijo fica aguardando sua confirmação.

---

# Primeira ativação

Abra as configurações do plugin.

Você verá:

```text
Configuração necessária

[ Ativar Go Live De Queijo ]
```

Clique em:

```text
Ativar Go Live De Queijo
```

---

## Tutorial obrigatório

O plugin mostra um tutorial em **4 etapas**.

Cada etapa possui um tempo mínimo de leitura de aproximadamente **7 segundos** antes de liberar o botão:

```text
Próximo
```

### Etapa 1 — O que será ativado

Explica:

- patch local de vídeo;
- main-hook;
- DIRECT-FIRST;
- integração com Go Live e câmera.

### Etapa 2 — Como as rotas são avaliadas

Explica:

- `routes.json`;
- `routes.txt`;
- SOCKS5;
- UDP;
- RTT;
- jitter;
- perda de pacotes;
- comparação com DIRECT.

### Etapa 3 — Componentes do Windows

Explica que o plugin pode precisar utilizar:

- PowerShell;
- UAC;
- sing-box;
- adaptador TUN;
- Scheduled Task;
- reinício do Discord.

### Etapa 4 — Confirmação

Explica:

- uso de serviços de terceiros;
- proxies públicas;
- como pausar;
- como limpar a integração;
- onde o aceite é salvo.

No final clique:

```text
Ativar e reiniciar
```

---

# Arquivo de configuração da ativação

Após aceitar o tutorial, o plugin cria:

```text
%LOCALAPPDATA%\GoLiveBypassBD\GoLiveBypassBD.config.json
```

Exemplo:

```json
{
  "version": 1,
  "tutorialVersion": 1,
  "setupAccepted": true,
  "enabled": true,
  "acceptedAt": "2026-09-04T18:00:00.000Z",
  "acceptedPluginVersion": "2.0.9"
}
```

Esse arquivo registra que o tutorial já foi concluído.

Você não precisa aceitar novamente a cada reinício.

---

# Settings

Depois da ativação, o painel mostra as principais informações da integração.

## Status da rede

Exemplo:

```text
Rota
DIRECT

Fallback
Em espera

Runtime
Carregado

Mídia
Em espera
```

Quando Go Live ou câmera estiverem ativos, o painel pode mostrar informações de mídia e RTT.

---

## Região RTC forçada

Por padrão:

```text
Automática
```

Recomendação:

**deixe em Automática**, a menos que você saiba exatamente qual região quer forçar.

---

## Atualização automática

Controla se o plugin procura novas versões automaticamente.

---

## Instalar updates automaticamente

Permite substituir o arquivo do plugin automaticamente quando uma atualização compatível for encontrada.

---

# Logs técnicos

Clique em:

```text
Logs técnicos
→ Abrir
```

As abas disponíveis são:

```text
Native
Renderer
Sing-box
Runner
```

Os logs continuam atualizando enquanto o painel permanece aberto.

Você também pode utilizar:

```text
Copiar aba
```

para copiar somente o log atual.

---

# DIRECT-FIRST

O Go Live De Queijo tenta evitar proxy/TUN desnecessário.

```text
Discord inicia
      ↓
DIRECT
      ↓
Go Live / câmera
      ↓
avalia qualidade
      ↓
DIRECT está bom?
   │
   ├─ SIM → continua DIRECT
   │
   └─ NÃO → procura fallback
```

Isso evita adicionar latência quando sua conexão normal já é a melhor opção.

---

# routes.json e routes.txt

O projeto utiliza:

```text
https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/routes.json
```

como fonte principal.

Fallback:

```text
https://raw.githubusercontent.com/paodequeijo616/GoLiveBypass_BetterDiscord/main/routes.txt
```

Também pode existir mirror por jsDelivr.

## routes.json

É o dataset preferido.

Pode conter:

```json
{
  "proxy": "socks5://IP:PORTA",
  "country": "AR",
  "latencyMs": 95
}
```

## routes.txt

Formato simples:

```text
socks5://IP:PORTA
socks5://IP:PORTA
socks5://IP:PORTA
```

---

# Media Route Race

O sistema pode testar várias rotas procurando as melhores opções.

```text
routes.json
    ↓
Fast Race
    ↓
melhores candidatos
    ↓
Quality Race
    ↓
RTT + jitter + loss + UDP
    ↓
melhor rota
```

Quanto menor o ping, melhor, mas estabilidade também importa.

Uma rota de:

```text
90ms
jitter 5ms
loss 0%
```

pode ser melhor do que uma que oscila:

```text
60ms
250ms
80ms
310ms
```

---

# best-routes.json

Rotas boas podem ser armazenadas em:

```text
%LOCALAPPDATA%\GoLiveBypassBD\best-routes.json
```

Isso permite tentar primeiro rotas conhecidas antes de fazer uma busca maior.

---

# Pausar a integração

Nas configurações:

```text
Pausar
```

Ao pausar:

```text
setupAccepted = true
enabled = false
```

O aceite continua salvo.

Depois você pode usar:

```text
Ativar e reiniciar
```

sem repetir o tutorial.

---

# Limpar integração

Nas configurações existe:

```text
Limpar integração
```

Essa opção remove componentes locais utilizados pela integração, como:

- hook do `discord_desktop_core`;
- Scheduled Task do GoLiveDeQueijo;
- sing-box/TUN;
- caches;
- logs;
- configurações locais em `%LOCALAPPDATA%\GoLiveBypassBD`.

O arquivo:

```text
GoLiveDeQueijo.plugin.js
```

**não é removido** da pasta do BetterDiscord.

---

# Diagnóstico

Use:

```text
Copiar diagnóstico
```

para gerar informações úteis sobre:

- estado do hook;
- DIRECT/TUN;
- sing-box;
- Media Route Race;
- rotas;
- câmera;
- Go Live;
- erros recentes.

Ao reportar um problema, envie o diagnóstico junto com uma descrição do que aconteceu.

---

# Atualização

Para atualizar manualmente:

1. baixe a nova versão de `GoLiveDeQueijo.plugin.js`;
2. substitua o arquivo antigo na pasta do BetterDiscord;
3. abra as configurações;
4. use `Instalar/atualizar` se necessário.

O painel também possui:

```text
Buscar atualização
```

---

# Estrutura local

Os arquivos auxiliares ficam principalmente em:

```text
%LOCALAPPDATA%\GoLiveBypassBD
```

Exemplo:

```text
GoLiveBypassBD/
├─ GoLiveBypassBD.config.json
├─ settings.json
├─ best-routes.json
├─ routes-data-cache.json
├─ routes-data-cache.txt
├─ native-status.json
├─ voice-status.json
├─ singbox/
└─ logs/
```

Alguns arquivos só existem quando aquela função já foi utilizada.

---

# Problemas comuns

## O plugin aparece, mas nada acontece

Abra as configurações e verifique se aparece:

```text
AGUARDANDO ATIVAÇÃO
```

Se aparecer, conclua o tutorial.

## Está PAUSADO

Clique:

```text
Ativar e reiniciar
```

## Go Live funciona em DIRECT

Isso é normal e desejado.

O plugin não precisa ativar TUN se a conexão direta já estiver funcionando.

## Ping ficou alto após fallback

Abra `Logs técnicos`, copie as abas `Native`, `Sing-box` e `Runner`, e use também:

```text
Copiar diagnóstico
```

## Quero voltar ao estado limpo

Use:

```text
Limpar integração
```

O arquivo do plugin continuará instalado.

---

# Segurança e privacidade

O plugin executa alterações locais no Discord e pode utilizar componentes de rede no Windows.

Ao utilizar rotas SOCKS5 públicas:

- o operador da proxy é um terceiro;
- a proxy pode observar metadados de conexão;
- desempenho e disponibilidade não são garantidos.

O plugin prioriza DIRECT para evitar encaminhamento desnecessário quando possível.

---

# Aviso

Go Live De Queijo é um projeto independente.

Não é oficial, afiliado ou aprovado por:

- Discord;
- BetterDiscord;
- sing-box;
- provedores de proxy utilizados pelas listas.

Modificações no cliente Discord podem deixar de funcionar após atualizações do próprio Discord.

Use por sua conta.

---

# Repositório

```text
https://github.com/paodequeijo616/GoLiveBypass_BetterDiscord
```

---

## GitHub About

Descrição curta recomendada:

```text
Go Live e câmera no Discord com DIRECT-FIRST, fallback TUN/SOCKS5, seleção automática de rotas e foco em baixa latência.
```
