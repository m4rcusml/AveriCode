# Portfólio da liderança

Mode: operate. Route: /dashboard. Audience: diretoria com vários projetos.

O primeiro viewport deve permitir reconhecer o tamanho do portfólio, a participação única e a confiança dos dados. Projetos de todas as contas são o padrão; uma seleção restringe o escopo explicitamente. O detalhe de pessoas e branches se abre na mesma linha. Ações de rotina ficam no contexto. Atualizações de código aparecem ao lado em desktop e abaixo no celular.

Assinatura: barras proporcionais de participação por projeto e no conjunto de pessoas únicas. Verde indica com commits, âmbar sem commits e hachura neutra sem dado atual. Contagens acompanham as barras. Grupos de avatares e `+N` tornam as identidades reconhecíveis sem truncar silenciosamente o total.

O resumo visual de sincronização permite filtrar projetos atuais, com falha/acesso e a atualizar em um clique. O total de commits por projeto vem de uma agregação de todos os registros persistidos na janela móvel de sete dias, sem usar a quantidade limitada de itens do feed. Capturas antigas ou ausentes não mostram zero como resultado confirmado.

Fonte de dados: PostgreSQL, snapshots e commits persistidos no sync. Nenhum fetch GitHub durante o render deste painel. Estados antigos ou incompletos nunca viram ausência confirmada no portfólio. Redesenho integral delegado; direção de briefing executivo, code-first, sem ativos raster necessários.
