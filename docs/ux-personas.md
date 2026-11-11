# Personas e decisões de UX

O usuário confirmou em 11/11/2026 que o foco principal é a **diretoria que acompanha um portfólio de equipes e entregas**. As personas abaixo foram geradas pelo AGY via CLI e sintetizadas pela equipe. São hipóteses comportamentais, sem entrevistas ou validação empírica. O Claude Code foi consultado separadamente para propor a organização do frontend; a implementação aproveita suas sugestões de visão unificada, ações próximas ao projeto e uma régua discreta de participação.

## Roberto — diretor de engenharia

Hipótese principal: acompanha muitas frentes e consulta o produto antes das reuniões de portfólio. Precisa distinguir projetos sem atualização registrada de projetos cujos dados não são confiáveis. Quer saber o que mudou sem abrir cada repositório e entender a participação de pessoas que trabalham em mais de um projeto.

Perguntas de entrada:

- Quais projetos estão conectados, e quais precisam de revisão do acesso ou dos dados?
- Quais mudanças de código aconteceram recentemente e em que branches?
- Quais pessoas tiveram atividade em pelo menos um projeto do escopo?
- Quais dados estão antigos, incompletos ou ainda não foram sincronizados?

Necessidades: visão completa por padrão, síntese com escopo e data, atualizações com mensagem e autoria, detalhe progressivo e ações claras. Evitar listas nominais extensas na primeira tela e indicadores que confundam commits com resultados de negócio.

## Mariana — gestora de projetos

Hipótese secundária: organiza várias frentes, verifica o andamento entre reuniões e identifica diferenças entre o relato da equipe e os sinais disponíveis. Precisa de busca por projeto, agrupamento por conta GitHub, mudanças recentes e cobertura das branches. Tem dificuldade quando uma pessoa aparece como sem commits em um repositório, apesar de ter trabalhado em outro.

Necessidades: participação transversal, nomes neutros dos estados e evidência acessível sem navegação repetida. O produto informa atividade de código; não afirma que um commit conclui uma entrega.

## Lucas — líder técnico

Hipótese de apoio operacional: configura pessoas esperadas e branches, resolve acesso ao GitHub e atualiza dados antes das reuniões. Precisa corrigir listas incompletas ou pessoas fora da alocação sem perder a visão do portfólio.

Necessidades: sincronização por projeto em um clique, expandir detalhes na própria lista, ignorar ou retirar pessoas diretamente no contexto e acessar configurações específicas sem percorrer páginas intermediárias. Apenas OWNER e ADMIN podem executar essas alterações.

## Arquitetura implementada

- Navegação principal: portfólio, atualizações, pessoas e configurações.
- Portfólio inicial mostra todas as contas do workspace. Filtros por conta, projeto/pessoa e dados que precisam de revisão.
- Visão principal de projetos com situação do sync, participação na janela salva e última mudança persistida. Barras mostram a proporção de pessoas com commits, sem commits e sem dado atual; avatares reais ou iniciais e `+N` apresentam as identidades sem ocultar o restante. Expandir revela pessoas, cobertura de branches e ações de configuração.
- Atualizações recentes ficam ao lado dos projetos em telas largas e abaixo em telas estreitas. Cada item identifica projeto, mensagem, autor, branch, hash e data.
- Barras com três estados mostram participação, preservando dados desconhecidos. Avatares e iniciais identificam pessoas; a distribuição visual das sincronizações permite filtrar projetos pela legenda. Contagens de commits são agregadas no banco, independentemente do limite de itens do feed.
- Visão de pessoas agrega identidades por `contributorId`, sem duplicar a pessoa por repositório. Com atividade em qualquer projeto do escopo significa com commits; ausência em um projeto não a torna ausente do conjunto. Uma janela desconhecida impede afirmar ausência no conjunto.
- Configurações mantêm membros, solicitações de projetos e frequência de sincronização. O seletor conecta somente os repositórios escolhidos.
- A distribuição de sincronização no resumo filtra projetos com dados atuais, falhas/acesso ou dados a atualizar. Não há tendência ou comparação inventada.
- A contagem de commits por projeto consulta todos os registros persistidos da janela móvel de sete dias; ela não é derivada do limite de itens do feed. O feed usa prefixos apenas quando declarados na própria mensagem e exibe autoria e branch.
- A lista automática de pessoas vem dos autores de commits reconhecidos pelo GitHub. Ter permissão de acesso não inclui alguém automaticamente. A inclusão manual continua disponível e a origem aparece na configuração.

## Orçamento de cliques

| Tarefa | Caminho implementado |
| --- | --- |
| Sincronizar todo o workspace | Um clique na ação principal |
| Sincronizar um projeto | Um clique na linha do projeto |
| Ver pessoas e branches monitoradas | Expandir o projeto, um clique |
| Ignorar ou retirar alguém dos esperados | Expandir e usar a ação inline, dois cliques |
| Abrir configuração de pessoas/branches | Expandir e usar o link direto, dois cliques |
| Ver o commit original | Um clique na atualização |
| Revisar pedidos de conexão | Atalho de pendências para a seção de solicitações |

## Confiança e limites

Os estados descrevem os dados, não o desempenho de pessoas. Falhas e suspensão usam vermelho; ausência de commits usa âmbar. Capturas com mais de 36 horas aparecem como antigas e as pessoas passam para sem dado atual, mesmo quando a rotina escolhida é semanal ou mensal. A janela salva continua explícita no detalhe. Isto evita representar uma captura antiga como uma janela móvel atual.

Uma configuração inicial incompleta recebe Revisar equipe e participação desconhecida. Pessoas ignoradas ficam fora dos indicadores. A tela não expõe o e-mail nem o nome de autor privado armazenado globalmente em Contributor. O nome de usuário público é o identificador exibido.

Releases, issues, PRs, trabalho de revisão, objetivos de negócio, datas de entrega e agrupamento de repositórios em equipes não são medidos por esta integração. O portfólio oferece sinais para investigar com o time. As personas devem ser confrontadas com diretores e gestores reais antes de orientar métricas de entrega.

## Critérios de aceitação

1. O portfólio abre com todas as contas e sem chamadas ao GitHub no render.
2. Os números de pessoas contam identidades únicas; atividade em outro projeto é preservada.
3. Nunca sincronizado, falha, suspensão, configuração incompleta e captura antiga têm estados explícitos.
4. Configurações e sync respeitam o papel no workspace; MEMBER pode solicitar projetos.
5. Desktop e celular mantêm navegação, ações e conteúdo sem overflow horizontal da página.
6. Estados usam texto e ícone, além de cor; controles têm foco visível e detalhes funcionam por teclado.
7. Não há rankings por volume de commits ou afirmações inventadas sobre entrega e produtividade.
