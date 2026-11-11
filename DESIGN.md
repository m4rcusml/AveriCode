---
name: AveriCode
description: Contexto de projetos para quem lidera um portfólio
colors:
  primary: "#225746"
  primary-strong: "#153c30"
  forest-shell: "#173e35"
  leaf-selection: "#c9e5aa"
  mineral-ground: "#f3f3ed"
  paper: "#fffefb"
  ink: "#24372f"
  muted-ink: "#606c62"
  line: "#d7ddd2"
  amber: "#825c21"
  failure: "#a53f35"
typography:
  headline:
    fontFamily: "Geist Sans, sans-serif"
    fontSize: "28px"
    fontWeight: 550
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.85em"
rounded:
  sm: "4px"
  control: "6px"
  panel: "7px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  page: "30px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
---

# Design System: AveriCode

## Overview

**Creative North Star: "Briefing executivo"**

Um ambiente de trabalho para ler o conjunto e investigar as partes. A superfície mineral clara é ancorada por uma navegação verde floresta. Tipografia precisa, filetes discretos e densidade controlada substituem a identidade anterior azul e magenta. A direção foi proposta pela equipe dentro do redesenho integral delegado pelo usuário, com apoio de proto-personas do AGY e da ideação do Claude Code.

**Key Characteristics:**

- Portfólio antes de detalhe individual.
- Cor como orientação e estado.
- Conteúdo real em listas alinhadas, sem decoração que simula dados.
- Participação mostrada por uma régua de pontos e rótulos explícitos.

## Colors

Verde floresta no shell, verde folha na seleção da navegação e verde petróleo nas ações. O fundo mineral e o papel aquecem o ambiente de leitura. Âmbar indica revisão ou ausência de commits; vermelho fica reservado à falha técnica e suspensão.

O tema escuro preserva a mesma linguagem: fundo `#141e19`, superfície `#1b2921`, texto `#e5eddf`, primário `#bbdca8` e borda `#3d5141`. Os valores normativos estão em `app/globals.css`.

**The Evidence Rule.** Cor nunca declara produtividade ou sucesso de entrega. O estado tem texto e ícone e corresponde à evidência salva.

## Typography

Geist Sans fornecida pela dependência local é a voz única da interface; Geist Mono fica em branches e hashes. Cabeçalhos da aplicação usam tamanhos fixos. O conteúdo do portfólio combina 14px para projetos, 12px para ações e 11px para metadados compactos no desktop. No celular, atualizações e notas de contexto usam 12px; rótulos compactos das linhas usam 11px. Corpo geral 14px. Números usam algarismos tabulares.

## Layout

Sidebar de 206px em desktop. Área de trabalho com padding de 30px, resumo horizontal e portfólio com uma coluna de atualizações de 278px; o feed largo tem rolagem contida em 750px para preservar o portfólio. Abaixo de 1250px as atualizações seguem o portfólio. Abaixo de 900px a navegação torna-se horizontal. Abaixo de 600px as linhas de projeto se reorganizam em duas colunas e as ações principais ocupam a largura disponível. Tabelas de configuração usam rolagem horizontal contida, sem alargar a página.

## Elevation & Depth

Separação por tons e filetes. Sombra suave apenas nos elementos transitórios, como o seletor de workspace e notificações. Conteúdo de projeto expandido usa o fundo mineral para indicar contexto subordinado.

## Shapes

Controles com raio de 6px; painéis 7px; chips 4px. Presença circular pequena com preenchimento, contorno ou tracejado, sempre acompanhada por legenda e texto acessível.

## Components

- Botão primário para sync global e conexão; secundário para alternativas; quiet para ajustes em contexto.
- Linhas expansíveis usam `details` e `summary` nativos. Não exigem modal ou estado client para consultar pessoas.
- Filtros são formulário GET, preservando navegação e compartilhamento da URL.
- Indicadores de sync distinguem dados atuais, antigos, falha, em andamento, nunca sincronizado, suspensão e equipe incompleta.
- Ações de pessoas ficam no detalhe; permissões determinam sua disponibilidade.
- Estados vazios ensinam o próximo passo sem simular projetos ou resultados.

## Do's and Don'ts

- Mostrar data, escopo e janela da evidência.
- Preservar atividade transversal entre projetos.
- Manter foco visível e semântica nativa.
- Não criar rankings de produtividade por commits.
- Não decorar a aplicação com gradientes ou gráficos sem dados.
- Não expor dados globais privados de Contributor em outro workspace.
