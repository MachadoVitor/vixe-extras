# Vixe Extras

PWA para controle de pagamentos de funcionários **extras** e **fixos** do Vixe Bar. Calcula automaticamente o valor a pagar com base nas horas trabalhadas, gera um resumo formatado pronto para enviar no WhatsApp e arquiva sessões no histórico.

## Funcionalidades

- **Inserir** — registra entrada/saída de funcionários, calcula horas e valor automaticamente.
- **Descontos** — adiciona descontos por funcionário (consumação, vale, adiantamento etc.) com motivo opcional.
- **Cadastros** — gerencia funcionários (nome, tipo, chave PIX, setor e valor da dobra para fixos).
- **Histórico** — sessões finalizadas ficam arquivadas, com cópia rápida do texto e exclusão.
- **Finalizar e copiar** — gera mensagem formatada (negrito, totais por pessoa, PIX, total geral) pronta para WhatsApp.
- **PWA offline-first** — funciona instalado no celular, sem necessidade de internet após o primeiro carregamento.

## Como funciona o cálculo

### Extras (por horas trabalhadas)

| Horas | Valor  | Horas | Valor  |
|------:|-------:|------:|-------:|
| 1h    | $25    | 4h    | $70    |
| 1h30  | $30    | 4h30  | $75    |
| 2h    | $40    | 5h    | $85    |
| 2h30  | $45    | 5h30  | $90    |
| 3h    | $55    | 6h    | $100   |
| 3h30  | $60    | 12h   | $200   |

- De **6h a 12h**: $100 + $5 a cada 30 min adicionais.
- Acima de **12h**: $200 + $5 a cada 30 min adicionais.
- Saída antes da entrada é interpretada como virada de dia (madrugada).

### Fixos

Recebem o **valor da dobra** definido no cadastro, independente das horas.

## Stack

- HTML + CSS + JavaScript puro (sem build, sem dependências).
- `localStorage` para cadastros e histórico, `sessionStorage` para a sessão em andamento.
- Service Worker com cache-first para uso offline.
- Visual em glassmorphism estilo iOS (gradiente pastel, cards translúcidos, segmented tabs).

## Estrutura

```
.
├── index.html           # markup principal e tabs
├── styles.css           # estilos (glassmorphism, gradientes, responsivo)
├── app.js               # toda a lógica (state, views, cálculo, persistência)
├── manifest.json        # PWA manifest
├── service-worker.js    # cache offline
└── icons/               # logo e ícones do PWA
```

## Rodando localmente

Como é estático, basta servir a pasta:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Abrir `http://localhost:8000` no navegador. Para instalar como PWA, usar a opção "Adicionar à tela de início" no celular.

## Deploy

Qualquer hospedagem estática serve: GitHub Pages, Netlify, Vercel, Cloudflare Pages. Não há etapa de build.

## Licença

Projeto interno do Vixe Bar. Criado por Vitor Machado.
