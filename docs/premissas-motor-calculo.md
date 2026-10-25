# Motor de cálculo — premissas e pontos a validar (v0.1, out/2026)

## Parâmetros 2026
- Salário mínimo R$ 1.621,00; teto INSS R$ 8.475,55
- INSS empregado (progressivo): 7,5% até 1.621,00 · 9% até 2.902,84 · 12% até 4.354,27 · 14% até 8.475,55
- Empregador (DAE): INSS 8% + RAT 0,8% + FGTS 8% + 3,2% (multa) = 20%
- IRRF: isento até R$ 5.000 (Lei 15.270/2025). Acima disso o app só avisa; cálculo NÃO implementado.

## Regras da LC 150/2015 aplicadas
- Jornada 8h/dia e 44h/sem; extra >= 50%; hora = salário/220; dia = salário/30 (art. 2)
- Domingo/feriado trabalhado sem compensação: em dobro (art. 2 §8)
- Noturno 22h–5h, hora de 52min30s, +20% (art. 14)
- Descontos por acordo limitados a 20% (art. 18 §1); vedado descontar moradia/alimentação/higiene
- Diarista: sem vínculo até 2 dias/semana (art. 1); alerta verde/atenção/vermelho (>=3 semanas com >2 dias = vermelho)

## A validar com contador/advogado
1. Arredondamento do INSS: trunca por faixa (reproduz R$ 121,57 e R$ 248,58 publicados). Confirmar no simulador do eSocial.
2. Perda do DSR na semana com falta injustificada (Lei 605/49 por analogia).
3. Hora noturna reduzida: fator 60/52,5 x 1,2, mas minutos contam reais para o limite de 8h.
4. Domingo trabalhado: 2x a hora, além do descanso já embutido no mensal (Súmula 146 TST por analogia).
5. Horas suplementares (acima da jornada contratual, abaixo de 8h): pagas a 100%, sem adicional.
6. Semanas que cruzam o mês: só os dias do mês entram.
7. Fora desta versão: banco de horas, férias, 13º, rescisão, IRRF.
